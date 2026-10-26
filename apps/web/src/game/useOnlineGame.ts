import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action, GameEvent } from '@pal/engine';
import type { SessionInfo } from '@pal/server';
import { gameApi, GameApiError, subscribeToGame } from './online';
import type { EventBatch } from './useLocalGame';

const POLL_MS = 15_000;

/**
 * An online game seen from one seat. Fetches the redacted view, refetches on Realtime
 * pings (and every 15s as a backup), and turns new server events into batches for the
 * board's animations and log.
 */
export function useOnlineGame(code: string, seatToken: string) {
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [batches, setBatches] = useState<EventBatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const versionRef = useRef<number | null>(null);
  const busy = useRef(false);

  const lastEventVersion = useRef(0);

  const absorb = useCallback((next: SessionInfo) => {
    // A refresh and an action response can both carry the same versions; keep each once.
    const fresh = next.events.filter((e) => e.version > lastEventVersion.current);
    if (next.view && fresh.length > 0) {
      lastEventVersion.current = fresh.at(-1)!.version;
      setBatches((b) => [
        ...b.slice(-200),
        ...fresh.map((e) => ({ id: e.version, events: e.events as GameEvent[], view: next.view! })),
      ]);
    }
    // Ignore responses older than what we already show (they can arrive out of order).
    if (versionRef.current !== null && next.version < versionRef.current) return;
    versionRef.current = next.version;
    setInfo(next);
  }, []);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      absorb(await gameApi.view(code, seatToken, versionRef.current ?? 0));
      setError(null);
    } catch (e) {
      if (e instanceof GameApiError && (e.status === 404 || e.status === 401)) setGone(true);
      else setError(e instanceof Error ? e.message : 'Connection problem.');
    } finally {
      busy.current = false;
    }
  }, [absorb, code, seatToken]);

  useEffect(() => {
    void refresh();
    const unsubscribe = subscribeToGame(code, () => void refresh());
    const timer = setInterval(() => void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      unsubscribe();
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [code, refresh]);

  const dispatch = useCallback(
    async (action: Action) => {
      if (versionRef.current === null) return;
      try {
        absorb(await gameApi.action(code, seatToken, action, versionRef.current));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not send that move.');
        if (e instanceof GameApiError && e.status === 409) void refresh();
      }
    },
    [absorb, code, refresh, seatToken],
  );

  const leave = useCallback(() => gameApi.leave(code, seatToken), [code, seatToken]);

  return { info, batches, error, gone, dispatch, leave, clearError: () => setError(null) };
}
