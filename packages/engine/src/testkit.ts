/** Shared test helpers. */
import './scripts/index.ts';
import { getCard } from '@pal/cards';
import { apply, createGame } from './engine.ts';
import { TRIAL_DECKS } from './decks.ts';
import type { Action, GameEvent, GameState, Seat } from './types.ts';

/**
 * Applies an action, then passes any quick step the defender is offered, so tests about
 * other rules don't have to. Quick-step tests call apply() directly instead.
 */
export function actThrough(s: GameState, seat: Seat, action: Action): { s: GameState; events: GameEvent[] } {
  const r = apply(s, seat, action);
  if (!r.ok) throw new Error(`${action.type} rejected: ${r.error}`);
  let state = r.state;
  const events = [...r.events];
  while (state.pending?.kind === 'quickStep') {
    const pass = apply(state, state.pending.seat, { type: 'passQuick' });
    if (!pass.ok) throw new Error(pass.error);
    state = pass.state;
    events.push(...pass.events);
  }
  return { s: state, events };
}

export function toMain(seed = 1): GameState {
  let s = createGame(seed, [
    { name: 'Alice', deck: [...TRIAL_DECKS.ETD01.cards] },
    { name: 'Bob', deck: [...TRIAL_DECKS.ETD02.cards] },
  ]).state;
  s = raw(s, s.pending!.seat, { type: 'chooseFirstPlayer', first: 0 });
  s = raw(s, 0, { type: 'mulligan', redraw: false });
  s = raw(s, 1, { type: 'mulligan', redraw: false });
  s.players[0].soulsStanding = 10;
  s.players[0].soulDeck = 0;
  return s;
}

/** apply() that throws on rejection and does not auto-pass quick steps. */
export function raw(s: GameState, seat: Seat, action: Action): GameState {
  return rawWithEvents(s, seat, action).s;
}
export function rawWithEvents(s: GameState, seat: Seat, action: Action): { s: GameState; events: GameEvent[] } {
  const r = apply(s, seat, action);
  if (!r.ok) throw new Error(`${action.type} rejected: ${r.error}`);
  return { s: r.state, events: r.events };
}
export const act = (s: GameState, seat: Seat, action: Action) => actThrough(s, seat, action).s;

let n = 0;
/** Creates a card straight into a zone (test setup only). */
export function put(
  s: GameState,
  seat: Seat,
  zone: 'base' | 'hand' | 'graveyard' | 'deckTop',
  cardId: string,
  rested = false,
) {
  if (!getCard(cardId)) throw new Error(`Unknown card ${cardId}`);
  const id = `t${n++}`;
  s.cards[id] = { id, cardId, owner: seat, rested, damage: 0, modifiers: [], placedAt: 0, assignedTo: null };
  if (zone === 'deckTop') s.players[seat].deck.unshift(id);
  else s.players[seat][zone].push(id);
  return id;
}

export const play = (s: GameState, seat: Seat, cardId: string) => {
  const id = put(s, seat, 'hand', cardId);
  return { id, s: raw(s, seat, { type: 'playCard', cardId: id }) };
};

export const answer = (s: GameState, seat: Seat, choice: string[]) => raw(s, seat, { type: 'answer', choice });
export const activate = (s: GameState, seat: Seat, sourceId: string, index = 0, cost = {}) =>
  raw(s, seat, { type: 'activate', sourceId, index, cost });
