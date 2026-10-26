import { getCard } from '@pal/cards';

export const MAIN_DECK_SIZE = 50;
export const MAX_COPIES = 4;
export const MAX_LUCKY = 8;
export const SOUL_COUNT = 10;

/** §6.1 deck construction. Returns a list of problems; empty means valid. */
export function validateDeck(cardIds: string[]): string[] {
  const problems: string[] = [];
  if (cardIds.length !== MAIN_DECK_SIZE) {
    problems.push(`Main deck must be exactly ${MAIN_DECK_SIZE} cards (has ${cardIds.length}).`);
  }

  const byName = new Map<string, number>();
  let lucky = 0;
  for (const id of cardIds) {
    const def = getCard(id);
    if (!def) {
      problems.push(`Unknown card ${id}.`);
      continue;
    }
    if (def.kind === 'Soul') problems.push('Soul cards go in the soul deck, not the main deck.');
    byName.set(def.name, (byName.get(def.name) ?? 0) + 1);
    if (def.subKind === 'Lucky Pal') lucky++;
  }
  for (const [name, n] of byName) {
    if (n > MAX_COPIES) problems.push(`At most ${MAX_COPIES} copies of "${name}" (has ${n}).`);
  }
  if (lucky > MAX_LUCKY) problems.push(`At most ${MAX_LUCKY} Lucky Pals (has ${lucky}).`);
  return problems;
}
