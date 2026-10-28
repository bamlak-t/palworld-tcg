import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action, GameEvent } from '@pal/engine';
import { HEARTBEAT_SECONDS, type SessionInfo } from '@pal/server';
import { gameApi, GameApiError, subscribeToGame } from './online';
import type { EventBatch } from './useLocalGame';

/** While the connection is down, try again this often. */
const RETRY_MS = 3_000;

/** Network failures and server errors mean "try again"; other errors are real answers. */
const isConnectionProblem = (e: unknown) => !(e instanceof GameApiError) || e.status === 0 || e.status >= 500;

/**
 * An online game seen from one seat. Fetches the redacted view, refetches on Realtime
 * pings, and checks in every HEARTBEAT_SECONDS (which also tells the server you're still
 * here). After a dropped connection it keeps retrying and catches up as soon as it can,
 * including when the browser comes back online or the tab becomes visible again.
 */
export function useOnlineGame(code: string, seatToken: string) {
  const [info, setInfo] = useState<SessionInfo | null>(null);
  /** When `info` arrived (ms), so "seconds away" can keep counting between fetches. */
  const [receivedAt, setReceivedAt] = useState(0);
  const [batches, setBatches] = useState<EventBatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [gone, setGone] = useState(false);
  const versionRef = useRef<number | null>(null);
  const busy = useRef(false);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setReceivedAt(Date.now());
  }, []);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    if (retry.current) clearTimeout(retry.current);
    retry.current = null;
    try {
      absorb(await gameApi.view(code, seatToken, versionRef.current ?? 0));
      setError(null);
      setReconnecting(false);
    } catch (e) {
      if (e instanceof GameApiError && (e.status === 404 || e.status === 401)) setGone(true);
      else if (isConnectionProblem(e)) {
        setReconnecting(true);
        retry.current = setTimeout(() => void refresh(), RETRY_MS);
      } else setError(e instanceof Error ? e.message : 'Connection problem.');
    } finally {
      busy.current = false;
    }
  }, [absorb, code, seatToken]);

  useEffect(() => {
    void refresh();
    // Realtime also reports when its channel (re)connects: catch up on anything missed.
    const unsubscribe = subscribeToGame(code, () => void refresh());
    const timer = setInterval(() => void refresh(), HEARTBEAT_SECONDS * 1000);
    const onWake = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', onWake);
    window.addEventListener('online', onWake);
    document.addEventListener('visibilitychange', onWake);
    return () => {
      unsubscribe();
      clearInterval(timer);
      if (retry.current) clearTimeout(retry.current);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onWake);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, [code, refresh]);

  const dispatch = useCallback(
    async (action: Action) => {
      if (versionRef.current === null) return;
      try {
        absorb(await gameApi.action(code, seatToken, action, versionRef.current));
        setError(null);
      } catch (e) {
        if (isConnectionProblem(e)) {
          setError("Couldn't send that move: you're offline. Try again once you're reconnected.");
          void refresh();
          return;
        }
        setError(e instanceof Error ? e.message : 'Could not send that move.');
        if (e instanceof GameApiError && e.status === 409) void refresh();
      }
    },
    [absorb, code, refresh, seatToken],
  );

  const claimWin = useCallback(async () => {
    try {
      absorb(await gameApi.claimWin(code, seatToken));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not claim the win.');
      void refresh();
    }
  }, [absorb, code, refresh, seatToken]);

  // Timed games: when the clock runs out, ask the server to move for whoever is up. It
  // checks the time itself; if we're early (clocks differ) it says so and we refetch.
  const clock =
    info?.clock && info.status === 'playing'
      ? { seat: info.clock.seat, deadline: receivedAt + info.clock.msLeft }
      : null;
  const due = clock?.deadline ?? null;
  useEffect(() => {
    if (due === null) return;
    const t = setTimeout(
      () => {
        gameApi
          .timeout(code, seatToken)
          .then(absorb)
          .catch(() => void refresh());
      },
      Math.max(0, due - Date.now()) + 500,
    );
    return () => clearTimeout(t);
  }, [due, code, seatToken, absorb, refresh]);

  const leave = useCallback(() => gameApi.leave(code, seatToken), [code, seatToken]);

  return {
    info,
    receivedAt,
    clock,
    batches,
    error,
    reconnecting,
    gone,
    dispatch,
    claimWin,
    leave,
    clearError: () => setError(null),
  };
}
