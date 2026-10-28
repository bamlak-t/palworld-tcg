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
 * How long the board keeps showing the old seat after a move hands play to the other
 * player, so its effects (FxLayer) finish before the board flips.
 */
const HOLD_MS: Partial<Record<GameEvent['type'], number>> = {
  attackDeclared: 650,
  battleDamage: 1000,
  damageDealt: 1000,
  destroyed: 1000,
  playerDamage: 900,
};
const holdFor = (batch: EventBatch | undefined) =>
  Math.max(0, ...(batch?.events ?? []).map((e) => HOLD_MS[e.type] ?? 0));

/**
 * Hot-seat game: both players share this browser. The board shows whichever seat must
 * act next, so each player only sees their own hand when it's their move. With `hold`,
 * it switches seats only once the move's effects have played.
 */
export function useLocalGame(
  players: [{ name: string; deck: DeckChoice }, { name: string; deck: DeckChoice }],
  rules?: GameRules,
  { hold = true }: { hold?: boolean } = {},
) {
  const [state, setState] = useState<GameState>(() => newGame(players, rules));
  const timed = rules?.turnSeconds ?? null;
  const [clock, setClock] = useState<Clock | null>(() => (timed ? advanceClock(null, state, Date.now()) : null));
  const [batches, setBatches] = useState<EventBatch[]>([]);
  const [error, setError] = useState<string | null>(null);

  const acting: Seat = state.pending ? state.pending.seat : state.activeSeat;
  const [seat, setSeat] = useState<Seat>(acting);
  const holdMs = hold ? holdFor(batches.at(-1)) : 0;
  useEffect(() => {
    if (seat === acting) return;
    const t = setTimeout(() => setSeat(acting), holdMs);
    return () => clearTimeout(t);
  }, [seat, acting, holdMs]);
  const view = useMemo(() => viewFor(state, seat), [state, seat]);
  // While the old seat is still shown, nobody can act.
  const legal = useMemo(() => (seat === acting ? getLegalActions(state, seat) : []), [state, seat, acting]);

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
      const r = apply(state, acting, action);
      if (!r.ok) setError(r.error);
      else accept(r);
    },
    [state, acting, accept],
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
    setSeat(fresh.pending ? fresh.pending.seat : fresh.activeSeat);
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
