/**
 * Saved decks plus the built-in trial decks. Signed out, decks live in this browser;
 * signed in, they belong to your account (stored by the palworld-game function) and sync
 * between devices, with a local copy so they show at once and changes work offline.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { getCard, getCardByName, isLuckyPal } from '@pal/cards';
import { MAX_COPIES, MAX_LUCKY, MAIN_DECK_SIZE, TRIAL_DECKS, validateDeck } from '@pal/engine';
import { call, GameApiError } from '@/game/online';
import { getAccount, setAccount, subscribeAccount, type Account } from '@/lib/accountStore';

export interface DeckList {
  id: string;
  name: string;
  /** Card id → copies. */
  cards: Record<string, number>;
  /** Trial decks ship with the app and can't be edited (copy them instead). */
  builtIn?: boolean;
  updatedAt: number;
}

const GUEST_KEY = 'pal-decks';
const CHANGE_EVENT = 'pal-decks-changed';
/** A signed-in account's decks as last synced, with unsynced changes applied. */
const cacheKey = (username: string) => `pal-decks@${username}`;
/** Changes the server hasn't confirmed yet, oldest first. */
const queueKey = (username: string) => `pal-deck-queue@${username}`;

type PendingOp = { op: 'save'; deck: DeckList } | { op: 'delete'; id: string };

const counts = (ids: readonly string[]) =>
  ids.reduce<Record<string, number>>((acc, id) => ({ ...acc, [id]: (acc[id] ?? 0) + 1 }), {});

export const BUILT_IN_DECKS: DeckList[] = Object.entries(TRIAL_DECKS).map(([key, d]) => ({
  id: `trial:${key}`,
  name: d.name,
  cards: counts(d.cards),
  builtIn: true,
  updatedAt: 0,
}));

// Parsed lists per storage key, so snapshots stay identical until the stored text changes.
const parsed = new Map<string, { raw: string | null; value: unknown[] }>();

function readList<T>(key: string): T[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    // Storage unavailable: nothing saved.
  }
  const hit = parsed.get(key);
  if (hit && hit.raw === raw) return hit.value as T[];
  let value: T[] = [];
  try {
    value = raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    value = [];
  }
  parsed.set(key, { raw, value });
  return value;
}

/** null removes the key. */
function writeList(key: string, list: unknown[] | null) {
  try {
    if (list) localStorage.setItem(key, JSON.stringify(list));
    else localStorage.removeItem(key);
  } catch {
    // Non-fatal: the change just won't persist.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** The decks you see: this browser's when signed out, your account's when signed in. */
function readSaved(): DeckList[] {
  const account = getAccount();
  return readList<DeckList>(account ? cacheKey(account.username) : GUEST_KEY);
}

const subscribe = (onChange: () => void) => {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  const offAccount = subscribeAccount(onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
    offAccount();
  };
};

function applyOps(decks: DeckList[], ops: PendingOp[]): DeckList[] {
  let list = decks;
  for (const o of ops) {
    list = o.op === 'save' ? [o.deck, ...list.filter((d) => d.id !== o.deck.id)] : list.filter((d) => d.id !== o.id);
  }
  return list;
}

/** A change for the signed-in account: shown at once, uploaded by syncDecks. */
function enqueue(account: Account, op: PendingOp) {
  writeList(queueKey(account.username), [...readList<PendingOp>(queueKey(account.username)), op]);
  writeList(cacheKey(account.username), applyOps(readList<DeckList>(cacheKey(account.username)), [op]));
  void syncDecks();
}

// ---------------------------------------------------------------------------
// Syncing with the account
// ---------------------------------------------------------------------------

export type DeckSync =
  | { state: 'local' | 'syncing' | 'synced' }
  /** Changes are kept on this device and upload once the connection is back. */
  | { state: 'offline' }
  | { state: 'error'; message: string };

const SYNC_EVENT = 'pal-deck-sync';
let sync: DeckSync = { state: 'syncing' };
const setSync = (next: DeckSync) => {
  sync = next;
  window.dispatchEvent(new Event(SYNC_EVENT));
};

let running: Promise<void> | null = null;
let again = false;
let lastSync = 0;

const isConnectionProblem = (e: unknown) => !(e instanceof GameApiError) || e.status === 0 || e.status >= 500;

/**
 * Uploads queued changes, then fetches the account's decks. Safe to call any time: a call
 * during a sync runs one more pass after it.
 */
export function syncDecks(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await syncOnce();
    } while (again);
  })().finally(() => {
    running = null;
    lastSync = Date.now();
  });
  return running;
}

async function syncOnce() {
  const account = getAccount();
  if (!account) return;
  const queue = queueKey(account.username);
  setSync({ state: 'syncing' });
  let rejected: string | null = null;
  try {
    for (let op = readList<PendingOp>(queue)[0]; op; op = readList<PendingOp>(queue)[0]) {
      try {
        if (op.op === 'save') {
          const { id, name, cards } = op.deck;
          await call({ op: 'saveDeck', token: account.token, deck: { id, name, cards } });
        } else await call({ op: 'deleteDeck', token: account.token, id: op.id });
      } catch (e) {
        // The server refused this change (rather than being unreachable): drop it and go on.
        if (isConnectionProblem(e) || (e as GameApiError).status === 401) throw e;
        rejected = (e as GameApiError).message;
      }
      writeList(queue, readList<PendingOp>(queue).slice(1));
    }
    const { decks } = await call<{ decks: DeckList[] }>({ op: 'decks', token: account.token });
    if (getAccount()?.token !== account.token) return;
    // Changes made while the list was loading still count.
    writeList(cacheKey(account.username), applyOps(decks, readList<PendingOp>(queue)));
    setSync(rejected ? { state: 'error', message: `A change wasn't saved: ${rejected}` } : { state: 'synced' });
  } catch (e) {
    if (e instanceof GameApiError && e.status === 401) {
      signedOutByServer(account);
      setSync({ state: 'error', message: 'You were signed out. Sign in again to sync your decks.' });
    } else if (isConnectionProblem(e)) setSync({ state: 'offline' });
    else setSync({ state: 'error', message: (e as Error).message });
  }
}

/** The sign-in expired: keep its decks on this device; they move back on the next sign-in. */
function signedOutByServer(account: Account) {
  const mine = readList<DeckList>(cacheKey(account.username));
  const guest = readList<DeckList>(GUEST_KEY);
  writeList(GUEST_KEY, [...mine, ...guest.filter((g) => !mine.some((d) => d.id === g.id))]);
  forgetAccountDecks(account.username);
  setAccount(null);
}

/** After signing in: decks made on this device while signed out move into the account. */
export function adoptGuestDecks(account: Account): number {
  const guest = readList<DeckList>(GUEST_KEY);
  if (guest.length === 0) return 0;
  writeList(queueKey(account.username), [
    ...readList<PendingOp>(queueKey(account.username)),
    ...guest.map((deck): PendingOp => ({ op: 'save', deck })),
  ]);
  writeList(
    cacheKey(account.username),
    applyOps(
      readList<DeckList>(cacheKey(account.username)),
      guest.map((deck) => ({ op: 'save', deck })),
    ),
  );
  writeList(GUEST_KEY, null);
  return guest.length;
}

/** How many changes haven't reached the server yet. */
export const unsyncedChanges = (username: string) => readList<PendingOp>(queueKey(username)).length;

export function forgetAccountDecks(username: string) {
  writeList(cacheKey(username), null);
  writeList(queueKey(username), null);
}

const subscribeSync = (onChange: () => void) => {
  window.addEventListener(SYNC_EVENT, onChange);
  return () => window.removeEventListener(SYNC_EVENT, onChange);
};

/** Where your decks are kept and whether they're up to date. */
export function useDeckSync(): DeckSync {
  const account = useSyncExternalStore(subscribeAccount, getAccount, () => null);
  const status = useSyncExternalStore(
    subscribeSync,
    () => sync,
    () => sync,
  );
  return account ? status : { state: 'local' };
}

/** Coming back to the tab syncs again (decks may have changed on another device), at most this often. */
const RESYNC_AFTER_MS = 10_000;

export function useDecks() {
  const saved = useSyncExternalStore(subscribe, readSaved, () => []);
  const account = useSyncExternalStore(subscribeAccount, getAccount, () => null);
  const token = account?.token;
  useEffect(() => {
    if (!token) return;
    const resync = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastSync > RESYNC_AFTER_MS) void syncDecks();
    };
    resync();
    window.addEventListener('focus', resync);
    window.addEventListener('online', resync);
    return () => {
      window.removeEventListener('focus', resync);
      window.removeEventListener('online', resync);
    };
  }, [token]);
  return {
    saved,
    all: [...BUILT_IN_DECKS, ...saved],
    save(deck: DeckList) {
      const next = { ...deck, builtIn: undefined, updatedAt: Date.now() };
      const current = getAccount();
      if (current) enqueue(current, { op: 'save', deck: next });
      else writeList(GUEST_KEY, [next, ...readList<DeckList>(GUEST_KEY).filter((d) => d.id !== deck.id)]);
      return next;
    },
    remove(id: string) {
      const current = getAccount();
      if (current) enqueue(current, { op: 'delete', id });
      else
        writeList(
          GUEST_KEY,
          readList<DeckList>(GUEST_KEY).filter((d) => d.id !== id),
        );
    },
  };
}

export const newDeckId = () => `deck:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** The deck as a flat list of card ids, as games and the server expect. */
export const expandDeck = (deck: DeckList): string[] =>
  Object.entries(deck.cards).flatMap(([id, n]) => Array<string>(n).fill(id));

export const deckSize = (deck: DeckList) => Object.values(deck.cards).reduce((a, b) => a + b, 0);
export const luckyCount = (deck: DeckList) =>
  Object.entries(deck.cards).reduce((n, [id, c]) => n + (getCard(id) && isLuckyPal(getCard(id)!) ? c : 0), 0);

export interface DeckCheck {
  /** Rule problems: the deck can't be played until these are fixed. */
  problems: string[];
  legal: boolean;
}

export function checkDeck(deck: DeckList): DeckCheck {
  const problems = validateDeck(expandDeck(deck));
  return { problems, legal: problems.length === 0 };
}

export const DECK_RULES = { size: MAIN_DECK_SIZE, copies: MAX_COPIES, lucky: MAX_LUCKY };

// ---------------------------------------------------------------------------
// Text import/export: one line per card, "4 ETD01-002 Jolthog – Shocking Yet Innocent".
// ---------------------------------------------------------------------------

export function deckToText(deck: DeckList): string {
  return Object.entries(deck.cards)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, n]) => `${n} ${id} ${getCard(id)?.name ?? ''}`.trim())
    .join('\n');
}

/** Parses "4 ETD01-002 …", "4x ETD01-002" or "4 Jolthog – Shocking Yet Innocent". */
export function deckFromText(text: string): { cards: Record<string, number>; unknown: string[] } {
  const cards: Record<string, number> = {};
  const unknown: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(\d+)\s*x?\s+(.+)$/i.exec(line);
    if (!m) {
      unknown.push(line);
      continue;
    }
    const n = Number(m[1]);
    const rest = m[2]!.trim();
    const byId = getCard(rest.split(/\s+/)[0]!.toUpperCase());
    const card = byId ?? getCardByName(rest);
    if (!card || card.kind === 'Soul') {
      unknown.push(line);
      continue;
    }
    cards[card.id] = (cards[card.id] ?? 0) + n;
  }
  return { cards, unknown };
}
