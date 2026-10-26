/** Shared test helpers. */
import { apply } from './engine.ts';
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
