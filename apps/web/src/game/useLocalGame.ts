import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  advanceClock,
  apply,
  createGame,
  deadline,
  expire,
  getLegalActions,
  viewFor,
  type Action,
  type ApplyResult,
  type Clock,
  type GameEvent,
  type GameRules,
  type GameState,
  type GameView,
  type Seat,
} from '@pal/engine';

export interface DeckChoice {
  name: string;
  cards: readonly string[];
}

/** A batch of events from one action, numbered so animations can re-trigger. */
export interface EventBatch {
  id: number;
  events: GameEvent[];
  /** The view right after the action, for describing events whose cards have moved. */
  view: GameView;
}

/**
 * Hot-seat game: both players share this browser. The board shows whichever seat must
 * act next, so each player only sees their own hand when it's their move.
 */
export function useLocalGame(
  players: [{ name: string; deck: DeckChoice }, { name: string; deck: DeckChoice }],
  rules?: GameRules,
) {
  const [state, setState] = useState<GameState>(() => newGame(players, rules));
  const timed = rules?.turnSeconds ?? null;
  const [clock, setClock] = useState<Clock | null>(() => (timed ? advanceClock(null, state, Date.now()) : null));
  const [batches, setBatches] = useState<EventBatch[]>([]);
  const [error, setError] = useState<string | null>(null);

  const seat: Seat = state.pending ? state.pending.seat : state.activeSeat;
  const view = useMemo(() => viewFor(state, seat), [state, seat]);
  const legal = useMemo(() => getLegalActions(state, seat), [state, seat]);

  const accept = useCallback(
    (r: Extract<ApplyResult, { ok: true }>) => {
      setError(null);
      setState(r.state);
      if (timed) setClock((c) => advanceClock(c, r.state, Date.now()));
      const nextSeat: Seat = r.state.pending ? r.state.pending.seat : r.state.activeSeat;
      setBatches((b) => [
        ...b.slice(-200),
        { id: (b.at(-1)?.id ?? 0) + 1, events: r.events, view: viewFor(r.state, nextSeat) },
      ]);
    },
    [timed],
  );

  const dispatch = useCallback(
    (action: Action) => {
      const r = apply(state, seat, action);
      if (!r.ok) setError(r.error);
      else accept(r);
    },
    [state, seat, accept],
  );

  // Out of time: the game makes the default move for whoever is up.
  const due = timed && clock ? deadline(clock, state, timed) : null;
  useEffect(() => {
    if (due === null) return;
    const t = setTimeout(
      () => {
        const r = expire(state);
        if (r.ok) accept(r);
      },
      Math.max(0, due - Date.now()),
    );
    return () => clearTimeout(t);
  }, [due, state, accept]);

  const restart = useCallback(() => {
    const fresh = newGame(players, rules);
    setState(fresh);
    setClock(timed ? advanceClock(null, fresh, Date.now()) : null);
    setBatches([]);
    setError(null);
  }, [players, rules, timed]);

  const moveClock = due !== null && clock && !state.result ? { seat: clock.seat, deadline: due } : null;
  return { view, seat, legal, dispatch, batches, error, clearError: () => setError(null), restart, clock: moveClock };
}

function newGame(players: [{ name: string; deck: DeckChoice }, { name: string; deck: DeckChoice }], rules?: GameRules) {
  const seed = Math.floor(Math.random() * 2 ** 31);
  return createGame(
    seed,
    [
      { name: players[0].name, deck: [...players[0].deck.cards] },
      { name: players[1].name, deck: [...players[1].deck.cards] },
    ],
    rules,
  ).state;
}
