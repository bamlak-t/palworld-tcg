/**
 * Online sessions: create/join by code, two players and up to three spectators, actions
 * applied by the rules engine with an optimistic version check, and per-seat redacted views.
 * Runs inside the palworld-game Edge Function; storage and broadcast are injected.
 */
import {
  apply,
  createGame,
  getLegalActions,
  validateDeck,
  viewFor,
  type Action,
  type GameView,
  type Seat,
} from '@pal/engine';
import type { MemberRow, Role, SessionRow, SessionStatus, Store, Tx } from './store.ts';

export const MAX_SPECTATORS = 3;
const STALE_HOURS = 24;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I
const CODE_LENGTH = 6;

export type Request =
  | { op: 'create'; name: string; avatarId: string; deck: string[] }
  /** deck is only needed (and checked) if you get a player seat. */
  | { op: 'join'; code: string; name: string; avatarId: string; deck?: string[] }
  | { op: 'view'; code: string; seatToken: string; sinceVersion?: number }
  | { op: 'action'; code: string; seatToken: string; action: Action; expectedVersion: number }
  | { op: 'leave'; code: string; seatToken: string };

export interface MemberInfo {
  role: Role;
  name: string;
  avatarId: string;
}

/** What a client sees. Only its own hand; the opponent's hand and both decks are counts. */
export interface SessionInfo {
  code: string;
  status: SessionStatus;
  role: Role;
  /** Your seat in the engine (p1 = 0, p2 = 1), or null when spectating. */
  seat: Seat | null;
  members: MemberInfo[];
  version: number;
  view: GameView | null;
  legal: Action[];
  /** Event batches after the version the client last saw, for animation and the log. */
  events: { version: number; events: unknown[] }[];
  /** Returned once, when you create or join. Keep it to reconnect. */
  seatToken?: string;
}

export type Response = { status: number; body: SessionInfo | { error: string } | { ok: true } };

export interface Deps {
  store: Store;
  /** Called after a commit that changed the session, so clients refetch. */
  broadcast: (code: string, version: number) => Promise<void>;
  random: () => number;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
const bad = (msg: string, status = 400): never => {
  throw new HttpError(status, msg);
};

export async function handle(req: Request, deps: Deps): Promise<Response> {
  try {
    const result = await route(req, deps);
    return { status: 200, body: result };
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, body: { error: e.message } };
    throw e;
  }
}

async function route(req: Request, deps: Deps): Promise<SessionInfo | { ok: true }> {
  if (!req || typeof req !== 'object') bad('Invalid request.');
  switch (req.op) {
    case 'create':
      return create(req, deps);
    case 'join':
      return join(req, deps);
    case 'view':
      return deps.store.transaction(async (tx) => {
        const { session, member } = await seated(tx, req.code, req.seatToken);
        await tx.touchMember(member.id);
        return info(tx, session, member, req.sinceVersion);
      });
    case 'action':
      return act(req, deps);
    case 'leave':
      return leave(req, deps);
    default:
      return bad('Unknown operation.');
  }
}

// ---------------------------------------------------------------------------

function checkProfile(name: unknown, avatarId: unknown) {
  if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 24)
    bad('Name must be 1–24 characters.');
  if (typeof avatarId !== 'string' || !/^[a-z]{1,16}$/.test(avatarId)) bad('Invalid avatar.');
}

/** Decks come from the client, so the server enforces the deck rules itself (§6.1). */
function checkDeck(deck: unknown): asserts deck is string[] {
  if (!Array.isArray(deck) || deck.length > 100 || !deck.every((id) => typeof id === 'string')) bad('Invalid deck.');
  const problems = validateDeck(deck as string[]);
  if (problems.length > 0) bad(`Illegal deck: ${problems[0]}`);
}

function newCode(random: () => number) {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]).join('');
}

const normaliseCode = (code: unknown) => {
  if (typeof code !== 'string') bad('Invalid code.');
  return (code as string).trim().toUpperCase();
};

async function create(req: Extract<Request, { op: 'create' }>, deps: Deps): Promise<SessionInfo> {
  checkProfile(req.name, req.avatarId);
  checkDeck(req.deck);
  return deps.store.transaction(async (tx) => {
    await tx.deleteStaleSessions(STALE_HOURS);
    let session: SessionRow | null = null;
    for (let attempt = 0; attempt < 5 && !session; attempt++) {
      const code = newCode(deps.random);
      if (!(await tx.sessionByCode(code))) session = await tx.insertSession(code);
    }
    if (!session) bad('Could not create a game, try again.', 503);
    const member = await tx.insertMember({
      sessionId: session!.id,
      role: 'p1',
      displayName: req.name.trim(),
      avatarId: req.avatarId,
      deck: req.deck,
    });
    return { ...(await info(tx, session!, member)), seatToken: member.seatToken };
  });
}

async function join(req: Extract<Request, { op: 'join' }>, deps: Deps): Promise<SessionInfo> {
  checkProfile(req.name, req.avatarId);
  const code = normaliseCode(req.code);
  const result = await deps.store.transaction(async (tx) => {
    const session = (await tx.sessionByCode(code)) ?? bad('No game with that code.', 404);
    const members = await tx.members(session.id);
    const p1 = members.find((m) => m.role === 'p1');
    const hasP2 = members.some((m) => m.role === 'p2');

    let role: Role;
    if (!hasP2 && session.status === 'waiting') {
      checkDeck(req.deck);
      role = 'p2';
    } else if (members.filter((m) => m.role === 'spectator').length < MAX_SPECTATORS) {
      role = 'spectator';
    } else {
      return bad('This game is full.', 409);
    }

    const member = await tx.insertMember({
      sessionId: session.id,
      role,
      displayName: req.name.trim(),
      avatarId: req.avatarId,
      deck: role === 'p2' ? req.deck! : null,
    });

    if (role === 'p2' && p1) {
      // Both seats filled: deal the game.
      const seed = Math.floor(deps.random() * 2 ** 31);
      const { state } = createGame(seed, [
        { name: p1.displayName, deck: p1.deck! },
        { name: member.displayName, deck: member.deck! },
      ]);
      await tx.updateSession(session.id, { status: 'playing', state, version: state.version });
      Object.assign(session, { status: 'playing', state, version: state.version });
    }
    return { ...(await info(tx, session, member)), seatToken: member.seatToken };
  });
  // Everyone refetches so the lobby shows the newcomer (and the dealt game).
  await deps.broadcast(code, result.version);
  return result;
}

async function act(req: Extract<Request, { op: 'action' }>, deps: Deps): Promise<SessionInfo> {
  const result = await deps.store.transaction(async (tx) => {
    const { session, member } = await seated(tx, req.code, req.seatToken);
    if (member.role === 'spectator') bad('Spectators can only watch.', 403);
    if (session.status === 'waiting' || !session.state) bad('The game has not started yet.', 409);
    if (req.expectedVersion !== session.version) bad('The game has moved on; refresh and try again.', 409);

    const seat: Seat = member.role === 'p1' ? 0 : 1;
    const r = apply(session.state!, seat, req.action);
    if (!r.ok) bad(r.error, 422);
    const ok = r as Extract<typeof r, { ok: true }>;
    const status: SessionStatus = ok.state.result ? 'finished' : 'playing';
    await tx.updateSession(session.id, { state: ok.state, version: ok.state.version, status });
    await tx.insertEvents(session.id, ok.state.version, ok.events);
    await tx.touchMember(member.id);
    Object.assign(session, { state: ok.state, version: ok.state.version, status });
    return info(tx, session, member, req.expectedVersion);
  });
  await deps.broadcast(result.code, result.version);
  return result;
}

async function leave(req: Extract<Request, { op: 'leave' }>, deps: Deps): Promise<{ ok: true }> {
  let version: number | null = null;
  const code = normaliseCode(req.code);
  await deps.store.transaction(async (tx) => {
    const { session, member } = await seated(tx, code, req.seatToken);
    if (member.role === 'spectator') {
      await tx.deleteMember(member.id);
      version = session.version;
      return;
    }
    if (session.status === 'waiting') {
      // The host left before anyone joined: close the game.
      await tx.deleteSession(session.id);
      version = session.version;
      return;
    }
    if (session.status === 'playing' && session.state) {
      // Leaving a game in progress concedes it.
      const r = apply(session.state, member.role === 'p1' ? 0 : 1, { type: 'concede' });
      if (r.ok) {
        await tx.updateSession(session.id, { state: r.state, version: r.state.version, status: 'finished' });
        await tx.insertEvents(session.id, r.state.version, r.events);
        version = r.state.version;
      }
    }
  });
  if (version !== null) await deps.broadcast(code, version);
  return { ok: true };
}

async function seated(tx: Tx, rawCode: string, seatToken: unknown) {
  const code = normaliseCode(rawCode);
  if (typeof seatToken !== 'string' || !/^[0-9a-f-]{36}$/i.test(seatToken)) bad('Invalid seat.', 401);
  const session = (await tx.sessionByCode(code)) ?? bad('No game with that code.', 404);
  const member = (await tx.memberByToken(session.id, seatToken as string)) ?? bad('You are not in this game.', 401);
  return { session, member };
}

async function info(tx: Tx, session: SessionRow, member: MemberRow, sinceVersion?: number): Promise<SessionInfo> {
  const members = await tx.members(session.id);
  const seat: Seat | null = member.role === 'p1' ? 0 : member.role === 'p2' ? 1 : null;
  const state = session.state;
  return {
    code: session.code,
    status: session.status,
    role: member.role,
    seat,
    members: members.map((m) => ({ role: m.role, name: m.displayName, avatarId: m.avatarId })),
    version: session.version,
    view: state ? viewFor(state, seat ?? 'spectator') : null,
    legal: state && seat !== null ? getLegalActions(state, seat) : [],
    events: sinceVersion === undefined ? [] : await tx.eventsSince(session.id, sinceVersion),
  };
}
