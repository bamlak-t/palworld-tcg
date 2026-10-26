/** Current card stats: printed value + modifiers + continuous abilities (§10.10). */
import { defOf } from './cards.ts';
import { getScript, printedKeywordValues } from './abilities.ts';
import type { CardInstance, GameState, Keyword } from './types.ts';

const NOCTURNAL_BONUS = 300;

const sumMods = (c: CardInstance, stat: 'power' | 'strike') =>
  c.modifiers.filter((m) => m.stat === stat).reduce((n, m) => n + m.amount, 0);

const inBase = (s: GameState, c: CardInstance) => s.players[c.owner].base.includes(c.id);

export const isNight = (s: GameState) => s.nightUntilTurn !== null;

/** Power, or durability for structures. Continuous abilities only apply in the base. */
export function powerOf(s: GameState, c: CardInstance): number {
  let power = (defOf(c).power ?? 0) + sumMods(c, 'power');
  if (inBase(s, c)) {
    power += getScript(c.cardId).powerBonus?.(s, c) ?? 0;
    if (isNight(s) && hasKeyword(s, c, 'nocturnal')) power += NOCTURNAL_BONUS;
  }
  return power;
}

export const strikeOf = (s: GameState, c: CardInstance): number => (defOf(c).strike ?? 0) + sumMods(c, 'strike');

export function hasKeyword(s: GameState, c: CardInstance, kw: Keyword): boolean {
  return printedKeywordValues(c.cardId).has(kw) || c.modifiers.some((m) => m.stat === 'keyword' && m.keyword === kw);
}

/** The number on Brave N / Serious N. */
export const keywordValue = (c: CardInstance, kw: Keyword): number => printedKeywordValues(c.cardId).get(kw) ?? 0;
