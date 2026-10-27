/** Shapes of card text that many cards share. */
import type { CardDef } from '@pal/cards';
import type { ActAbility, CardScript, Effect, EffectApi } from '../abilities.ts';
import { costOf, defOf, isStructure } from '../cards.ts';
import type { CardInstance, GameState } from '../types.ts';

export const RESOURCE_NAME = { material: 'Material', ingredient: 'Ingredient' } as const;

export const getResource =
  (resource: 'material' | 'ingredient', n: number): Effect =>
  (e) =>
    e.gain(resource, n);

/** "Choose up to 1 Pal [matching], and deal N Damage." */
export const damageUpTo1 =
  (amount: number, filter: (e: EffectApi, c: CardInstance) => boolean = () => true, what = 'Pal'): Effect =>
  (e) => {
    const options = e.pals((c) => filter(e, c));
    for (const c of e.chooseUpTo(1, `Choose up to 1 ${what} to deal ${amount} damage to.`, options))
      e.damage(c, amount);
  };

/**
 * "[Rest this card] Choose 1 Pal, and it gets Power +N until end of turn." Most gears;
 * `then` adds what follows ("…and you get 1 Material").
 */
export const restForPower = (
  amount: number,
  then?: (e: EffectApi, c: CardInstance) => void,
  label?: string,
): ActAbility[] => [
  {
    label: label ?? `Rest: a Pal gets +${amount} power`,
    zone: 'base',
    costs: [{ restSelf: true }],
    effect: (e) => {
      const c = e.chooseOne(`Choose 1 Pal to get +${amount} power.`, e.pals());
      if (!c) return;
      e.modify(c, 'power', amount);
      then?.(e, c);
    },
  },
];

/** "[Assign 1 Pal] Get 3 X, and draw 1 card." */
export const assignForResource = (resource: 'material' | 'ingredient'): ActAbility[] => [
  {
    label: `Assign: get 3 ${RESOURCE_NAME[resource]}, draw 1`,
    zone: 'base',
    oncePerTurn: true,
    costs: [{ assign: true }],
    effect: (e) => {
      e.gain(resource, 3);
      e.draw(1);
    },
  },
];

export const selfPowerFor = (resource: 'material' | 'ingredient'): ActAbility[] => [
  {
    label: '+500 power until end of turn',
    zone: 'base',
    costs: [{ [resource]: 2 }],
    effect: (e) => e.modify(e.self, 'power', 500),
  },
];

export const cannotBeAttackedBy =
  (test: (cost: number) => boolean): CardScript['canBeAttackedBy'] =>
  (_s, _self, attacker) =>
    !test(costOf(attacker));

/**
 * "Look at the top N cards of your deck, choose up to M [matching] from among them and
 * add it to hand / deploy it, and shuffle the rest with the deck." Returns what was chosen.
 */
export function searchTop(
  e: EffectApi,
  opts: { look: number; max: number; what: string; filter: (def: CardDef) => boolean; to: 'hand' | 'deploy' },
): CardInstance[] {
  const top = e.lookTop(opts.look);
  const options = top.filter((c) => opts.filter(e.def(c)) && (opts.to === 'hand' || e.canDeploy(c)));
  const verb = opts.to === 'hand' ? 'add to hand' : 'deploy';
  const chosen = e.chooseUpTo(opts.max, `Choose up to ${opts.max} ${opts.what} to ${verb}.`, options);
  for (const c of chosen) {
    if (opts.to === 'hand') {
      e.reveal([c]);
      e.addToHand(c);
    } else e.deploy(c);
  }
  e.shuffleDeck();
  return chosen;
}

/** "[Put the top 3 cards of the deck into the graveyard] It becomes night until the end of the opponent's next turn." */
export const millForNight: ActAbility = {
  label: 'Mill 3: it becomes night',
  zone: 'base',
  oncePerTurn: true,
  costs: [{ millTop: 3 }],
  effect: (e) => e.setNightUntilEndOfOpponentsNextTurn(),
};

// Card facts ----------------------------------------------------------------

export const isPalDef = (def: CardDef) => def.kind === 'Pal';
export const isNormalPal = (def: CardDef) => def.subKind === 'Normal Pal';
export const costAtMost = (n: number) => (def: CardDef) => (def.cost ?? 0) <= n;

/** Owner has a structure with this work suitability (「Farming」 etc.). */
export const hasStructureWith = (s: GameState, seat: 0 | 1, work: string) =>
  s.players[seat].base.some((id) => {
    const c = s.cards[id]!;
    return isStructure(c) && workOf(c).includes(work);
  });

export const workOf = (c: CardInstance) => defOf(c).workSuitability;
export const colorOf = (c: CardInstance) => defOf(c).color;
