/** Client for the palworld-game Edge Function and its Realtime pings. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Action } from '@pal/engine';
import type { SessionInfo } from '@pal/server';

const URL = import.meta.env.SUPABASE_PROJECT_URL;
const KEY = import.meta.env.SUPABASE_PUBLISHABLE_KEY;

export const onlineConfigured = Boolean(URL && KEY);

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
  create: (p: Profile, deckId: string) => call<SessionInfo>({ op: 'create', ...p, deckId }),
  join: (code: string, p: Profile, deckId: string) => call<SessionInfo>({ op: 'join', code, ...p, deckId }),
  view: (code: string, seatToken: string, sinceVersion?: number) =>
    call<SessionInfo>({ op: 'view', code, seatToken, sinceVersion }),
  action: (code: string, seatToken: string, action: Action, expectedVersion: number) =>
    call<SessionInfo>({ op: 'action', code, seatToken, action, expectedVersion }),
  leave: (code: string, seatToken: string) => call<{ ok: true }>({ op: 'leave', code, seatToken }),
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
 * Calls onPing whenever the game changes. The ping carries only a version number; the
 * page then fetches its own view, so a forged ping can't show anyone a fake state.
 */
export function subscribeToGame(code: string, onPing: () => void): () => void {
  if (!onlineConfigured) return () => {};
  client ??= createClient(URL, KEY, { auth: { persistSession: false } });
  const channel = client.channel(`palworld:${code}`).on('broadcast', { event: 'version' }, onPing).subscribe();
  return () => {
    void client!.removeChannel(channel);
  };
}

export const gameLink = (code: string) => `${window.location.origin}${window.location.pathname}#/play/${code}`;
