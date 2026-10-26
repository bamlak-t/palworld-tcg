/**
 * Trial Deck "Dawn of Palpagos Red・Blue" (ETD01) and "Green・Purple" (ETD02).
 * Cards whose text is only keywords (Assault, Taunt, Stealth, Vigilance, Interrupt) or
 * that have no text need no entry here.
 */
import type { CardScript, Effect } from '../abilities.ts';
import { costOf, isStructure } from '../cards.ts';

// Shared shapes ------------------------------------------------------------

const getResource =
  (resource: 'material' | 'ingredient', n: number): Effect =>
  (e) =>
    e.gain(resource, n);

const damageUpTo1 =
  (amount: number): Effect =>
  (e) => {
    for (const c of e.chooseUpTo(1, `Choose up to 1 Pal to deal ${amount} damage to.`, e.pals())) e.damage(c, amount);
  };

/** "[Rest this card] Choose 1 Pal, and it gets Power +N until end of turn." */
const restForPower = (amount: number): CardScript['acts'] => [
  {
    label: `Rest: a Pal gets +${amount} power`,
    zone: 'base',
    costs: [{ restSelf: true }],
    effect: (e) => {
      const c = e.chooseOne(`Choose 1 Pal to get +${amount} power.`, e.pals());
      if (c) e.modify(c, 'power', amount);
    },
  },
];

/** "[Assign 1 Pal] Get 3 X, and draw 1 card." */
const assignForResource = (resource: 'material' | 'ingredient'): CardScript['acts'] => [
  {
    label: `Assign: get 3 ${resource === 'material' ? 'Material' : 'Ingredient'}, draw 1`,
    zone: 'base',
    oncePerTurn: true,
    costs: [{ assign: true }],
    effect: (e) => {
      e.gain(resource, 3);
      e.draw(1);
    },
  },
];

const selfPowerFor = (resource: 'material' | 'ingredient'): CardScript['acts'] => [
  {
    label: '+500 power until end of turn',
    zone: 'base',
    costs: [{ [resource]: 2 }],
    effect: (e) => e.modify(e.self, 'power', 500),
  },
];

const cannotBeAttackedBy =
  (test: (cost: number) => boolean): CardScript['canBeAttackedBy'] =>
  (_s, _self, attacker) =>
    !test(costOf(attacker));

// ETD01 Red・Blue ----------------------------------------------------------

export const ETD01: Record<string, CardScript> = {
  // Arsox – Burning Spoils
  'ETD01-005': { onDeploy: getResource('material', 2) },

  // Mossanda Lux – Vanguard Captain
  'ETD01-006': { acts: selfPowerFor('material') },

  // Blazamut – Molten Sovereign
  'ETD01-007': { onDeploy: damageUpTo1(1000) },

  // Stone Pit
  'ETD01-008': { acts: assignForResource('material') },

  // Weapon Workbench
  'ETD01-009': {
    acts: [
      {
        label: 'Assign: 800 damage, your Pals get +1 strike',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ material: 1, assign: true }],
        effect: (e) => {
          damageUpTo1(800)(e);
          for (const c of e.palsOf(e.me)) e.modify(c, 'strike', 1);
        },
      },
    ],
  },

  // Single-Shot Rifle
  'ETD01-010': { onDeploy: damageUpTo1(1500), acts: restForPower(200) },

  // Ignis Breath
  'ETD01-011': {
    event: (e) => {
      const c = e.chooseOne('Choose 1 Pal to deal 500 damage to.', e.pals());
      if (c) e.damage(c, 500);
    },
  },

  // Elphidran Aqua – Gentle Ripples
  'ETD01-012': {
    onDeploy: (e) => {
      e.draw(2);
      const c = e.chooseOne('Choose 1 card from your hand to put on top of your deck.', e.hand(e.me));
      if (c) e.putOnTopOfDeck(c);
    },
  },

  // Hangyu Cryst – Frigid Wanderer
  'ETD01-015': {
    onDeploy: (e) => {
      const targets = e.pals((c) => costOf(c) <= 3);
      for (const c of e.chooseUpTo(1, 'Choose up to 1 ◇3 or less Pal to rest.', targets)) e.rest(c);
    },
  },

  // Mammorest Cryst – Roar of the Tundra
  'ETD01-018': {
    powerBonus: (s, self) => 200 * s.players[self.owner].base.filter((id) => isStructure(s.cards[id]!)).length,
    acts: [
      {
        label: 'Discard a structure: +1 strike',
        zone: 'base',
        costs: [{ discardFromHand: { count: 1, filter: (def) => def.kind === 'Structure', label: 'a structure' } }],
        effect: (e) => e.modify(e.self, 'strike', 1),
      },
    ],
  },

  // Antique Wooden Chair
  'ETD01-019': {
    onDeploy: (e) => {
      for (const c of e.chooseUpTo(1, 'Choose up to 1 Pal to get +1000 power.', e.pals())) e.modify(c, 'power', 1000);
    },
  },

  // Primitive Workbench
  'ETD01-020': {
    acts: [
      {
        label: 'Assign: reveal the top card',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ assign: true }],
        effect: (e) => {
          const top = e.revealTop();
          if (!top) return;
          const def = e.def(top);
          const deployable = (def.kind === 'Structure' || def.kind === 'Gear') && (def.cost ?? 0) <= 6;
          if (deployable && e.confirm(`Deploy ${def.name}?`)) e.deploy(top);
          else e.addToHand(top);
        },
      },
    ],
  },

  // Single-Shot Sphere Launcher
  'ETD01-021': { onDeploy: (e) => e.draw(1), acts: restForPower(200) },

  // Crystal Breath
  'ETD01-022': {
    event: (e) => {
      const c = e.chooseOne('Choose 1 Pal to get −3 strike.', e.pals());
      if (!c) return;
      e.modify(c, 'strike', -3);
      e.skipNextStand(c);
    },
  },

  // Lamball – My First Pal
  'ETD01-023': { canBeAttackedBy: cannotBeAttackedBy((cost) => cost >= 4) },

  // Ribbuny – Little Princess
  'ETD01-024': { onGraveyard: getResource('material', 1) },
};

// ETD02 Green・Purple -------------------------------------------------------

export const ETD02: Record<string, CardScript> = {
  // Flopie – Snack Lover
  'ETD02-003': { onDeploy: getResource('ingredient', 2) },

  // Eikthyrdeer Terra – Guardian of Nature (Taunt comes from its text)
  'ETD02-005': { acts: selfPowerFor('ingredient') },

  // Mammorest – Roar of the Wilds
  'ETD02-007': { onGraveyard: getResource('ingredient', 3) },

  // Berry Plantation
  'ETD02-008': { acts: assignForResource('ingredient') },

  // Campfire
  'ETD02-009': {
    acts: [
      {
        label: 'Assign: gain 1 life, your Pals get +1000',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ ingredient: 2, assign: true }],
        effect: (e) => {
          e.gainLife(1);
          for (const c of e.palsOf(e.me)) e.modify(c, 'power', 1000);
        },
      },
    ],
  },

  // Refined Metal Spear
  'ETD02-010': { acts: restForPower(900) },

  // Stone Blast
  'ETD02-011': {
    event: (e) => {
      const c = e.chooseOne('Choose 1 Pal to get +500 power.', e.pals());
      if (c) e.modify(c, 'power', 500);
    },
  },

  // Astegon – Aegis Wyvern of Death
  'ETD02-012': {
    onDeploy: (e) => {
      for (const c of e.chooseUpTo(1, 'Choose up to 1 Pal to get −1000 power.', e.pals())) e.modify(c, 'power', -1000);
    },
    onAttack: (e) => {
      for (const c of e.pals((c) => e.power(c) <= 300)) e.destroy(c);
    },
  },

  // Leezpunk – Treasure Bandit
  'ETD02-014': {
    onGraveyard: (e) => {
      const c = e.chooseOne('Choose 1 card from your hand to discard.', e.hand(e.opp), e.opp);
      if (c) e.discard(c);
    },
  },

  // Felbat – Lifestealer (Stealth comes from its text)
  'ETD02-018': { onAttack: (e) => e.gainLife(1) },

  // Hanging Trap
  'ETD02-019': {
    acts: [
      {
        label: 'Assign: exile a Pal',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ assign: true }],
        effect: (e) => {
          const holding = [0, 1].some((seat) =>
            e.s.players[seat as 0 | 1].exile.some((id) => e.s.cards[id]!.exiledBy === e.self.id),
          );
          if (holding) return;
          const c = e.chooseOne('Choose 1 Pal to exile.', e.pals());
          if (c) e.exile(c);
        },
      },
    ],
    onLeaveBase: (e) => {
      for (const seat of [0, 1] as const) {
        for (const id of [...e.s.players[seat].exile]) {
          const c = e.s.cards[id]!;
          if (c.exiledBy !== e.self.id) continue;
          c.exiledBy = null;
          e.deploy(c, { rested: true });
        }
      }
    },
  },

  // Cawgnito Hat
  'ETD02-020': {
    acts: [
      {
        label: 'Rest: a Pal gets +200 and Stealth',
        zone: 'base',
        costs: [{ restSelf: true }],
        effect: (e) => {
          const c = e.chooseOne('Choose 1 Pal to get +200 power and Stealth.', e.pals());
          if (!c) return;
          e.modify(c, 'power', 200);
          e.grant(c, 'stealth');
        },
      },
    ],
  },

  // Strike from the Darkness
  'ETD02-021': {
    event: (e) => {
      const c = e.chooseOne('Choose 1 Pal to put into the graveyard.', e.pals());
      if (c) e.destroy(c);
    },
  },

  // Medical Supplies
  'ETD02-022': {
    event: (e) => {
      const options = e.graveyard(e.me).filter((c) => e.def(c).kind === 'Pal' && costOf(c) <= 8);
      const c = e.chooseOne('Choose 1 ◇8 or less Pal from your graveyard to deploy.', options);
      if (c) e.deploy(c, { rested: true });
    },
  },

  // Cattiva – My First Pal
  'ETD02-023': { canBeAttackedBy: cannotBeAttackedBy((cost) => cost <= 3) },

  // Chikipi – My First Pal
  'ETD02-024': { onGraveyard: getResource('ingredient', 1) },
};
