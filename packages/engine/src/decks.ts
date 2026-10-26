/**
 * Trial deck lists. The official site doesn't publish card counts, so these are built
 * from each deck's 24 cards: 2 of each Lucky Pal (8 total), 3 of each 2-cost vanilla Pal
 * and 2 of everything else. Replace with the official lists if they become available.
 */
const build = (counts: Record<string, number>) =>
  Object.entries(counts).flatMap(([id, n]) => Array<string>(n).fill(id));

const ids = (prefix: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}-${String(from + i).padStart(3, '0')}`);

function trialDeck(prefix: string, triples: string[]): string[] {
  const counts: Record<string, number> = {};
  for (const id of ids(prefix, 1, 24)) counts[id] = triples.includes(id) ? 3 : 2;
  return build(counts);
}

export const TRIAL_DECKS = {
  ETD01: { name: 'Trial Deck: Red・Blue (approximate)', cards: trialDeck('ETD01', ['ETD01-002', 'ETD01-013']) },
  ETD02: { name: 'Trial Deck: Green・Purple (approximate)', cards: trialDeck('ETD02', ['ETD02-002', 'ETD02-013']) },
} as const;
