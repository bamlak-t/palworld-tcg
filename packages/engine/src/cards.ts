import { getCard, type CardDef } from '@pal/cards';
import type { CardInstance, GameState } from './types.ts';

export function defOf(card: CardInstance | string): CardDef {
  const id = typeof card === 'string' ? card : card.cardId;
  const def = getCard(id);
  if (!def) throw new Error(`Unknown card ${id}`);
  return def;
}

export const isPal = (c: CardInstance) => defOf(c).kind === 'Pal';
export const isStructure = (c: CardInstance) => defOf(c).kind === 'Structure';
export const isLucky = (c: CardInstance) => defOf(c).subKind === 'Lucky Pal';

const sumMods = (c: CardInstance, stat: 'power' | 'strike') =>
  c.modifiers.filter((m) => m.stat === stat).reduce((n, m) => n + m.amount, 0);

/** Current power (or durability for structures), including modifiers. */
export const powerOf = (c: CardInstance): number => (defOf(c).power ?? 0) + sumMods(c, 'power');

export const strikeOf = (c: CardInstance): number => (defOf(c).strike ?? 0) + sumMods(c, 'strike');

export const costOf = (c: CardInstance): number => defOf(c).cost ?? 0;

export function card(state: GameState, id: string): CardInstance {
  const c = state.cards[id];
  if (!c) throw new Error(`No card instance ${id}`);
  return c;
}
