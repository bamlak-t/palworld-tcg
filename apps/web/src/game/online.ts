/** Client for the palworld-game Edge Function and its Realtime pings. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Action, GameRules } from '@pal/engine';
import type { SessionInfo } from '@pal/server';

const URL = import.meta.env.SUPABASE_PROJECT_URL;
const KEY = import.meta.env.SUPABASE_PUBLISHABLE_KEY;

export const onlineConfigured = Boolean(URL && KEY);

const REQUEST_TIMEOUT_MS = 10_000;

export class GameApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(body: object): Promise<T> {
  if (!onlineConfigured) throw new GameApiError(0, 'Online play is not configured.');
  const res = await fetch(`${URL}/functions/v1/palworld-game`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    // A request stuck on a dead connection would block the retries behind it.
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new GameApiError(res.status, data.error ?? `Request failed (${res.status}).`);
  return data;
}

export interface Profile {
  name: string;
  avatarId: string;
}

export const gameApi = {
  /** deck: the 50 card ids. The server checks the deck rules. */
  create: (p: Profile, deck: string[], rules?: GameRules) => call<SessionInfo>({ op: 'create', ...p, deck, rules }),
  join: (code: string, p: Profile, deck: string[]) => call<SessionInfo>({ op: 'join', code, ...p, deck }),
  view: (code: string, seatToken: string, sinceVersion?: number) =>
    call<SessionInfo>({ op: 'view', code, seatToken, sinceVersion }),
  action: (code: string, seatToken: string, action: Action, expectedVersion: number) =>
    call<SessionInfo>({ op: 'action', code, seatToken, action, expectedVersion }),
  leave: (code: string, seatToken: string) => call<{ ok: true }>({ op: 'leave', code, seatToken }),
  claimWin: (code: string, seatToken: string) => call<SessionInfo>({ op: 'claimWin', code, seatToken }),
  timeout: (code: string, seatToken: string) => call<SessionInfo>({ op: 'timeout', code, seatToken }),
};

// Seat tokens, per game code, so a refresh puts you back in your seat.
const SEATS_KEY = 'pal-seats';

function readSeats(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SEATS_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

export const seats = {
  get: (code: string): string | undefined => readSeats()[code.toUpperCase()],
  set(code: string, token: string) {
    try {
      localStorage.setItem(SEATS_KEY, JSON.stringify({ ...readSeats(), [code.toUpperCase()]: token }));
    } catch {
      // Without storage you just can't rejoin after a refresh.
    }
  },
  remove(code: string) {
    const all = readSeats();
    delete all[code.toUpperCase()];
    try {
      localStorage.setItem(SEATS_KEY, JSON.stringify(all));
    } catch {
      // ignore
    }
  },
};

let client: SupabaseClient | null = null;

/**
 * Calls onPing whenever the game changes, and whenever the channel (re)connects so the
 * page can catch up on pings it missed. The ping carries only a version number; the page
 * then fetches its own view, so a forged ping can't show anyone a fake state.
 */
export function subscribeToGame(code: string, onPing: () => void): () => void {
  if (!onlineConfigured) return () => {};
  client ??= createClient(URL, KEY, { auth: { persistSession: false } });
  const channel = client
    .channel(`palworld:${code}`)
    .on('broadcast', { event: 'version' }, onPing)
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onPing();
    });
  return () => {
    void client!.removeChannel(channel);
  };
}

export const gameLink = (code: string) => `${window.location.origin}${window.location.pathname}#/play/${code}`;
