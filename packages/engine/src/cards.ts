import { getCard, type CardDef } from '@pal/cards';
import type { CardInstance } from './types.ts';

export function defOf(card: CardInstance | string): CardDef {
  const id = typeof card === 'string' ? card : card.cardId;
  const def = getCard(id);
  if (!def) throw new Error(`Unknown card ${id}`);
  return def;
}

export const isPal = (c: CardInstance) => defOf(c).kind === 'Pal';
export const isStructure = (c: CardInstance) => defOf(c).kind === 'Structure';
export const isLucky = (c: CardInstance) => defOf(c).subKind === 'Lucky Pal';

export const costOf = (c: CardInstance): number => defOf(c).cost ?? 0;
