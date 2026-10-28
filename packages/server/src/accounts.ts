/**
 * Accounts, kept simple: a username and a password, so saved decks follow you between
 * devices. Passwords are stored as salted PBKDF2 hashes and sign-in tokens as SHA-256
 * hashes, so the database never holds anything a browser could replay.
 */
import { getCard } from '@pal/cards';
import type { AccountRow, DeckRow, Tx } from './store.ts';

export const USERNAME_PATTERN = /^[a-z0-9_-]{3,20}$/;
export const MIN_PASSWORD = 6;
export const MAX_DECKS = 200;
const PBKDF2_ITERATIONS = 100_000;

export type AccountRequest =
  | { op: 'signUp'; username: string; password: string }
  | { op: 'signIn'; username: string; password: string }
  | { op: 'signOut'; token: string }
  | { op: 'decks'; token: string }
  /** Creates or replaces the deck with this id. */
  | { op: 'saveDeck'; token: string; deck: DeckInput }
  | { op: 'deleteDeck'; token: string; id: string };

export const ACCOUNT_OPS = new Set<string>(['signUp', 'signIn', 'signOut', 'decks', 'saveDeck', 'deleteDeck']);

export interface DeckInput {
  id: string;
  name: string;
  /** Card id → copies. */
  cards: Record<string, number>;
}

export type AccountResponse =
  { username: string; token: string } | { decks: DeckRow[] } | { deck: DeckRow } | { ok: true };

export class AccountError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
const bad = (msg: string, status = 400): never => {
  throw new AccountError(status, msg);
};

export async function handleAccount(req: AccountRequest, tx: Tx): Promise<AccountResponse> {
  switch (req.op) {
    case 'signUp': {
      const username = checkUsername(req.username);
      if (typeof req.password !== 'string' || req.password.length < MIN_PASSWORD || req.password.length > 200)
        bad(`Passwords need at least ${MIN_PASSWORD} characters.`);
      if (await tx.accountByUsername(username)) bad('That username is taken.', 409);
      const account = await tx.insertAccount(username, await hashPassword(req.password));
      return { username, token: await issueToken(tx, account) };
    }
    case 'signIn': {
      const username = typeof req.username === 'string' ? req.username.trim().toLowerCase() : '';
      const account = USERNAME_PATTERN.test(username) ? await tx.accountByUsername(username) : null;
      // Hash even for unknown users, so timing doesn't reveal which usernames exist.
      const valid = await verifyPassword(String(req.password ?? ''), account?.passwordHash ?? DUMMY_HASH);
      if (!account || !valid) bad('Wrong username or password.', 401);
      return { username: account!.username, token: await issueToken(tx, account!) };
    }
    case 'signOut':
      await tx.deleteToken(await sha256(String(req.token ?? '')));
      return { ok: true };
    case 'decks': {
      const account = await signedIn(tx, req.token);
      return { decks: await tx.decks(account.id) };
    }
    case 'saveDeck': {
      const account = await signedIn(tx, req.token);
      const deck = checkDeck(req.deck);
      const existing = await tx.decks(account.id);
      if (!existing.some((d) => d.id === deck.id) && existing.length >= MAX_DECKS)
        bad(`You can keep up to ${MAX_DECKS} decks.`);
      return { deck: await tx.upsertDeck(account.id, deck) };
    }
    case 'deleteDeck': {
      const account = await signedIn(tx, req.token);
      if (typeof req.id !== 'string') bad('Invalid deck.');
      await tx.deleteDeck(account.id, req.id);
      return { ok: true };
    }
    default:
      return bad('Unknown operation.');
  }
}

function checkUsername(raw: unknown): string {
  const username = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!USERNAME_PATTERN.test(username)) bad('Usernames are 3–20 characters: letters, numbers, - and _.');
  return username;
}

async function signedIn(tx: Tx, token: unknown): Promise<AccountRow> {
  const account = typeof token === 'string' && token ? await tx.accountByToken(await sha256(token)) : null;
  if (!account) bad('Please sign in again.', 401);
  return account!;
}

function checkDeck(raw: unknown): DeckInput {
  const d = raw as DeckInput;
  if (!d || typeof d !== 'object' || typeof d.id !== 'string' || !/^[\w:-]{1,64}$/.test(d.id)) bad('Invalid deck.');
  const name = typeof d.name === 'string' ? d.name.trim().slice(0, 60) : '';
  if (!d.cards || typeof d.cards !== 'object') bad('Invalid deck.');
  const entries = Object.entries(d.cards);
  let total = 0;
  for (const [id, n] of entries) {
    if (!getCard(id) || !Number.isInteger(n) || n < 1 || n > 50) bad('Invalid deck.');
    total += n;
  }
  if (total > 50) bad('A deck holds at most 50 cards.');
  return { id: d.id, name: name || 'Untitled deck', cards: Object.fromEntries(entries) };
}

// ---------------------------------------------------------------------------
// Hashing (WebCrypto, so it runs the same in Deno, Node and tests).
// ---------------------------------------------------------------------------

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

/** "pbkdf2$<iterations>$<salt>$<hash>", base64. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(await pbkdf2(password, salt, PBKDF2_ITERATIONS))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2' || !iterations || !salt || !hash) return false;
  const actual = await pbkdf2(password, unb64(salt), Number(iterations));
  const expected = unb64(hash);
  // Constant-time comparison.
  let diff = actual.length ^ expected.length;
  for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ (expected[i] ?? 0);
  return diff === 0;
}

const DUMMY_HASH = `pbkdf2$${PBKDF2_ITERATIONS}$${b64(new Uint8Array(16))}$${b64(new Uint8Array(32))}`;

async function sha256(text: string) {
  return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
}

/** A new sign-in token; only its hash is stored. */
async function issueToken(tx: Tx, account: AccountRow) {
  const token = b64(randomBytes(32)).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!);
  await tx.insertToken(account.id, await sha256(token));
  return token;
}
