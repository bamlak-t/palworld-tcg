import { costOf } from './cards.ts';
import { attackTargets, canAttack } from './engine.ts';
import type { Action, GameState, Seat } from './types.ts';

/** Every action the seat may take right now (concede is always allowed and not listed). */
export function getLegalActions(s: GameState, seat: Seat): Action[] {
  if (s.result) return [];
  const p = s.players[seat];

  if (s.pending) {
    if (s.pending.seat !== seat) return [];
    switch (s.pending.kind) {
      case 'chooseFirstPlayer':
        return [
          { type: 'chooseFirstPlayer', first: 0 },
          { type: 'chooseFirstPlayer', first: 1 },
        ];
      case 'mulligan':
        return [
          { type: 'mulligan', redraw: false },
          { type: 'mulligan', redraw: true },
        ];
      case 'block':
        return [{ type: 'block', blockerId: null }, ...s.pending.options.map((id) => ({ type: 'block' as const, blockerId: id }))];
      case 'overload':
        // Too many combinations to enumerate; the UI picks keepCount from candidates.
        return [];
    }
  }

  if (s.phase !== 'main' || s.activeSeat !== seat || s.battle) return [];

  const actions: Action[] = [];
  for (const id of p.hand) {
    if (costOf(s.cards[id]!) <= p.soulsStanding) actions.push({ type: 'playCard', cardId: id });
  }
  if (!p.soulDrawUsed && p.soulsStanding >= 3) actions.push({ type: 'soulDraw' });
  const targets = attackTargets(s, seat);
  for (const id of p.base) {
    if (canAttack(s, seat, id)) for (const target of targets) actions.push({ type: 'attack', attackerId: id, target });
  }
  actions.push({ type: 'endTurn' });
  return actions;
}
