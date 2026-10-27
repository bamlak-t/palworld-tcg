/**
 * Current card values: printed value + modifiers + continuous abilities (§10.10).
 * Continuous abilities only work while their card is in a base (§10.3.5), apart from
 * Hand-zone ones like cost reductions on the card itself.
 */
import { getCard } from '@pal/cards';
import { defOf } from './cards.ts';
import { getScript, printedKeywordValues, scriptSources, type Aura } from './abilities.ts';
import type { CardFlag, CardInstance, GameState, Keyword, Seat } from './types.ts';

const NOCTURNAL_BONUS = 300;

const sumMods = (c: CardInstance, stat: 'power' | 'strike') =>
  c.modifiers.filter((m) => m.stat === stat).reduce((n, m) => n + m.amount, 0);

export const inBase = (s: GameState, c: CardInstance) => s.players[c.owner].base.includes(c.id);

/** Every card in either base that has an aura, with that aura. */
function auras(s: GameState): { src: CardInstance; aura: Aura }[] {
  const out: { src: CardInstance; aura: Aura }[] = [];
  for (const p of s.players) {
    for (const id of p.base) {
      const src = s.cards[id]!;
      for (const { script } of scriptSources(src)) if (script.aura) out.push({ src, aura: script.aura });
    }
  }
  return out;
}

/** §5.3: night from an effect, or from a card that makes it night (e.g. while rested). */
export function isNight(s: GameState): boolean {
  if (s.nightUntilTurn !== null) return true;
  return auras(s).some(({ src, aura }) => aura.night?.(s, src) ?? false);
}

/** Power, or durability for structures. */
export function powerOf(s: GameState, c: CardInstance): number {
  let power = (defOf(c).power ?? 0) + sumMods(c, 'power');
  if (!inBase(s, c)) return power;
  for (const { script } of scriptSources(c)) power += script.powerBonus?.(s, c) ?? 0;
  for (const { src, aura } of auras(s)) power += aura.power?.(s, src, c) ?? 0;
  if (hasKeyword(s, c, 'nocturnal') && isNight(s)) power += NOCTURNAL_BONUS;
  return power;
}

export function strikeOf(s: GameState, c: CardInstance): number {
  let strike = (defOf(c).strike ?? 0) + sumMods(c, 'strike');
  if (!inBase(s, c)) return strike;
  for (const { script } of scriptSources(c)) strike += script.strikeBonus?.(s, c) ?? 0;
  for (const { src, aura } of auras(s)) strike += aura.strike?.(s, src, c) ?? 0;
  return strike;
}

export function hasKeyword(s: GameState, c: CardInstance, kw: Keyword): boolean {
  if (printedKeywordValues(c.cardId).has(kw)) return true;
  if (c.modifiers.some((m) => m.stat === 'keyword' && m.keyword === kw)) return true;
  if (!inBase(s, c)) return false;
  return auras(s).some(({ src, aura }) => aura.keywords?.(s, src, c).includes(kw) ?? false);
}

export const hasFlag = (c: CardInstance, flag: CardFlag) =>
  c.modifiers.some((m) => m.stat === 'flag' && m.flag === flag);

/** The number on Brave N / Serious N. */
export const keywordValue = (c: CardInstance, kw: Keyword): number => printedKeywordValues(c.cardId).get(kw) ?? 0;

/** The card's names: printed plus any added by effects (§2.1.5). */
export function namesOf(c: CardInstance): string[] {
  const added = c.modifiers.flatMap((m) => (m.stat === 'name' && m.name ? [m.name] : []));
  return [defOf(c).name, ...added];
}

/** "main name 《X》": the part before " – ", for printed and added names. */
export const hasMainName = (c: CardInstance, mainName: string) =>
  namesOf(c).some((n) => n === mainName || n.split(' – ')[0] === mainName);

/**
 * Cost to play a card from hand right now. Reductions never take a cost to 0 or below
 * ("It does not become ◇0 or less").
 */
export function costToPlay(s: GameState, seat: Seat, c: CardInstance, materialX = 0): number {
  const def = defOf(c);
  const printed = def.cost ?? 0;
  let reduction = materialX + (getScript(c.cardId).handCostReduction?.(s, c) ?? 0);
  for (const { src, aura } of auras(s)) if (src.owner === seat) reduction += aura.cost?.(s, src, c) ?? 0;
  if (def.kind === 'Gear') reduction += s.players[seat].nextGearDiscount ?? 0;
  if (reduction <= 0) return printed;
  return Math.max(1, printed - reduction);
}

/** Legendary (§): only 1 Legendary Pal with the same card name can be put into your base. */
export function canPutInBase(s: GameState, c: CardInstance): boolean {
  if (!printedKeywordValues(c.cardId).has('legendary')) return true;
  const name = defOf(c).name;
  return !s.players[c.owner].base.some((id) => id !== c.id && getCard(s.cards[id]!.cardId)?.name === name);
}

/** True if the source's effect may choose the target (protections like Hot Spring, Quivern Botan). */
export function canBeChosenBy(s: GameState, target: CardInstance, source: CardInstance): boolean {
  if (target.owner !== source.owner && hasFlag(target, 'untargetableByOpponent')) return false;
  return !auras(s).some(({ src, aura }) => aura.protects?.(s, src, target, source) ?? false);
}

/** Extra damage for non-battle damage from this source (e.g. Suzaku: +200 for red cards). */
export function damageBonus(s: GameState, source: CardInstance, target: CardInstance): number {
  return auras(s).reduce((n, { src, aura }) => n + (aura.damageBonus?.(s, src, source, target) ?? 0), 0);
}

/** Whether a player can gain life right now (Poison Arrow Crossbow stops the opponent). */
export function canGainLife(s: GameState, seat: Seat): boolean {
  return !auras(s).some(({ src, aura }) => aura.opponentCannotGainLife && src.owner !== seat);
}

/** Whether this player's Pals' automatic abilities activate twice (Shadowbeak at night). */
export function doublesAutoAbilities(s: GameState, seat: Seat): boolean {
  return auras(s).some(({ src, aura }) => aura.doubleAutoAtNight && src.owner === seat) && isNight(s);
}
