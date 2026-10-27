import { getScript } from './abilities.ts';
import { defOf } from './cards.ts';
import { activatableAbilities, attackTargets, canAttack, isQuickEvent, mustStillAttack } from './engine.ts';
import { canPutInBase, costToPlay } from './stats.ts';
import type { Action, GameState, Seat } from './types.ts';

/**
 * Every action the seat may take right now (concede is always allowed and not listed).
 * Effect choices with several picks list each single pick plus the empty answer when
 * allowed; the UI can build any other valid combination.
 */
export function getLegalActions(s: GameState, seat: Seat): Action[] {
  if (s.result) return [];
  const p = s.players[seat];

  const pending = s.pending;
  if (pending) {
    if (pending.seat !== seat) return [];
    switch (pending.kind) {
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
        return [
          { type: 'block', blockerId: null },
          ...pending.options.map((id) => ({ type: 'block' as const, blockerId: id })),
        ];
      case 'overload':
        return [
          {
            type: 'chooseOverload',
            keep: [...pending.mustKeep, ...pending.candidates.filter((id) => !pending.mustKeep.includes(id))].slice(
              0,
              pending.keepCount,
            ),
          },
        ];
      case 'effectChoice': {
        const answers: Action[] = [];
        if (pending.min === 0) answers.push({ type: 'answer', choice: [] });
        if (pending.min <= 1) for (const o of pending.options) answers.push({ type: 'answer', choice: [o.id] });
        if (pending.min > 1)
          answers.push({ type: 'answer', choice: pending.options.slice(0, pending.min).map((o) => o.id) });
        return answers;
      }
      case 'quickStep': {
        const actions: Action[] = [{ type: 'passQuick' }];
        for (const id of p.hand) if (isQuickEvent(s.cards[id]!.cardId)) actions.push(...playActions(s, seat, id));
        for (const a of activatableAbilities(s, seat, true)) {
          for (const cost of a.costs) actions.push({ type: 'activate', sourceId: a.sourceId, index: a.index, cost });
        }
        return actions;
      }
    }
  }

  if (s.phase !== 'main' || s.activeSeat !== seat || s.battle) return [];

  const actions: Action[] = [];
  for (const id of p.hand) actions.push(...playActions(s, seat, id));
  for (const a of activatableAbilities(s, seat, false)) {
    for (const cost of a.costs) actions.push({ type: 'activate', sourceId: a.sourceId, index: a.index, cost });
  }
  if (!p.soulDrawUsed && p.soulsStanding >= 3) actions.push({ type: 'soulDraw' });
  for (const id of p.base) {
    if (!canAttack(s, seat, id)) continue;
    for (const target of attackTargets(s, seat, id)) actions.push({ type: 'attack', attackerId: id, target });
  }
  if (!mustStillAttack(s)) actions.push({ type: 'endTurn' });
  return actions;
}

/** Ways to play a card from hand: normally one, or one per amount of Material it may consume. */
function playActions(s: GameState, seat: Seat, id: string): Action[] {
  const c = s.cards[id]!;
  const p = s.players[seat];
  if (defOf(c).kind !== 'Event' && !canPutInBase(s, c)) return [];
  const xs = getScript(c.cardId).materialReducesCost ? Array.from({ length: p.material + 1 }, (_, x) => x) : [0];
  return xs
    .filter((x) => costToPlay(s, seat, c, x) <= p.soulsStanding)
    .map((x): Action => (x === 0 ? { type: 'playCard', cardId: id } : { type: 'playCard', cardId: id, x }));
}
