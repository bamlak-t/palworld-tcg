import type { Clock, GameRules, GameState } from '@pal/engine';

export type Role = 'p1' | 'p2' | 'spectator';
export type SessionStatus = 'waiting' | 'playing' | 'finished';

export interface SessionRow {
  id: string;
  code: string;
  status: SessionStatus;
  state: GameState | null;
  version: number;
  /** House rules chosen by the host; null means standard. */
  rules: GameRules | null;
  /** The move clock, in games with a turn timer. */
  clock: Clock | null;
}

export interface MemberRow {
  id: string;
  sessionId: string;
  role: Role;
  seatToken: string;
  displayName: string;
  avatarId: string;
  /** The player's 50 card ids; null for spectators. */
  deck: string[] | null;
  /** Seconds since this member last talked to the server (by the database clock). */
  secondsAway: number;
}

export interface EventBatchRow {
  version: number;
  events: unknown[];
}

/** Storage used by the session handler. Postgres in the Edge Function, in-memory in tests. */
export interface Tx {
  /** Locks the row for the rest of the transaction. */
  sessionByCode(code: string): Promise<SessionRow | null>;
  insertSession(code: string, rules: GameRules | null): Promise<SessionRow>;
  updateSession(id: string, patch: Partial<Pick<SessionRow, 'status' | 'state' | 'version' | 'clock'>>): Promise<void>;
  deleteSession(id: string): Promise<void>;
  /** Deletes sessions not updated for this many hours. */
  deleteStaleSessions(hours: number): Promise<void>;

  members(sessionId: string): Promise<MemberRow[]>;
  memberByToken(sessionId: string, seatToken: string): Promise<MemberRow | null>;
  insertMember(m: Omit<MemberRow, 'id' | 'seatToken' | 'secondsAway'>): Promise<MemberRow>;
  deleteMember(id: string): Promise<void>;
  touchMember(id: string): Promise<void>;

  insertEvents(sessionId: string, version: number, events: unknown[]): Promise<void>;
  eventsSince(sessionId: string, version: number): Promise<EventBatchRow[]>;
}

export interface Store {
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}
