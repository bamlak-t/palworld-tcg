import { getCard } from '@pal/cards';
import type { GameRules } from './types.ts';

export const MAIN_DECK_SIZE = 50;
export const MAX_COPIES = 4;
export const MAX_LUCKY = 8;
export const SOUL_COUNT = 10;

export const STANDARD_RULES: GameRules = {
  startingLife: 10,
  souls: SOUL_COUNT,
  firstPlayer: 'choose',
  turnSeconds: null,
  spectators: true,
  claimWinSeconds: 180,
};
export const RULE_LIMITS = { startingLife: { min: 1, max: 20 }, souls: { min: 1, max: 20 } } as const;
export const RULE_OPTIONS = {
  firstPlayer: ['choose', 'random', 'host', 'guest'],
  turnSeconds: [60, 120, 300, null],
  claimWinSeconds: [60, 180, 300],
} as const;

/** Standard rules with the given changes. Returns an error message for invalid values. */
export function makeRules(changes: Partial<GameRules> = {}): GameRules | string {
  const r = { ...STANDARD_RULES, ...changes };
  for (const key of ['startingLife', 'souls'] as const) {
    const v = r[key];
    const { min, max } = RULE_LIMITS[key];
    const label = key === 'souls' ? 'Souls' : 'Starting life';
    if (!Number.isInteger(v) || v < min || v > max) return `${label} must be a whole number from ${min} to ${max}.`;
  }
  if (!(RULE_OPTIONS.firstPlayer as readonly unknown[]).includes(r.firstPlayer)) return 'Invalid first player.';
  if (!(RULE_OPTIONS.turnSeconds as readonly unknown[]).includes(r.turnSeconds)) return 'Invalid turn timer.';
  if (!(RULE_OPTIONS.claimWinSeconds as readonly unknown[]).includes(r.claimWinSeconds))
    return 'Invalid claim-win wait.';
  if (typeof r.spectators !== 'boolean') return 'Invalid spectators setting.';
  return {
    startingLife: r.startingLife,
    souls: r.souls,
    firstPlayer: r.firstPlayer,
    turnSeconds: r.turnSeconds,
    spectators: r.spectators,
    claimWinSeconds: r.claimWinSeconds,
  };
}

/** A game's rules, filling in settings added after it was created. */
export const rulesOf = (s: { rules?: Partial<GameRules> }): GameRules => ({ ...STANDARD_RULES, ...s.rules });

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
    const max = copyLimit(cardIds.find((id) => getCard(id)?.name === name)!);
    if (n > max) problems.push(`At most ${max} copies of "${name}" (has ${n}).`);
  }
  if (lucky > MAX_LUCKY) problems.push(`At most ${MAX_LUCKY} Lucky Pals (has ${lucky}).`);
  return problems;
}

/** How many copies of a card a deck may hold. Some cards say otherwise (Beegarde, Swee). */
export function copyLimit(cardId: string): number {
  const text = getCard(cardId)?.text ?? '';
  if (/put any number of cards with the same card name as this card into your deck/.test(text)) return Infinity;
  const m = /put up to (\d+) cards with the same card name as this card into your deck/.exec(text);
  return m ? Number(m[1]) : MAX_COPIES;
}
