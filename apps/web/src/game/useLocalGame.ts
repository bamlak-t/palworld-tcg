import { useCallback, useMemo, useState } from 'react';
import {
  apply,
  createGame,
  getLegalActions,
  viewFor,
  type Action,
  type GameEvent,
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
export function useLocalGame(players: [{ name: string; deck: DeckChoice }, { name: string; deck: DeckChoice }]) {
  const [state, setState] = useState<GameState>(() => newGame(players));
  const [batches, setBatches] = useState<EventBatch[]>([]);
  const [error, setError] = useState<string | null>(null);

  const seat: Seat = state.pending ? state.pending.seat : state.activeSeat;
  const view = useMemo(() => viewFor(state, seat), [state, seat]);
  const legal = useMemo(() => getLegalActions(state, seat), [state, seat]);

  const dispatch = useCallback(
    (action: Action) => {
      const r = apply(state, seat, action);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setError(null);
      setState(r.state);
      const nextSeat: Seat = r.state.pending ? r.state.pending.seat : r.state.activeSeat;
      setBatches((b) => [
        ...b.slice(-200),
        { id: (b.at(-1)?.id ?? 0) + 1, events: r.events, view: viewFor(r.state, nextSeat) },
      ]);
    },
    [state, seat],
  );

  const restart = useCallback(() => {
    setState(newGame(players));
    setBatches([]);
    setError(null);
  }, [players]);

  return { view, seat, legal, dispatch, batches, error, clearError: () => setError(null), restart };
}

function newGame(players: [{ name: string; deck: DeckChoice }, { name: string; deck: DeckChoice }]) {
  const seed = Math.floor(Math.random() * 2 ** 31);
  return createGame(seed, [
    { name: players[0].name, deck: [...players[0].deck.cards] },
    { name: players[1].name, deck: [...players[1].deck.cards] },
  ]).state;
}
