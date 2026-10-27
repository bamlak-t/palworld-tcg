/** Booster Pack 01 (EBP01). Keyword-only and textless cards need no entry. */
import { cardDb } from '@pal/cards';
import type { CardScript, Effect, EffectApi } from '../abilities.ts';
import { costOf, defOf, isPal, isStructure } from '../cards.ts';
import { hasKeyword, hasMainName, isNight } from '../stats.ts';
import type { CardInstance } from '../types.ts';
import {
  assignForResource,
  colorOf,
  costAtMost,
  damageUpTo1,
  getResource,
  hasStructureWith,
  isNormalPal,
  isPalDef,
  millForNight,
  restForPower,
  searchTop,
  workOf,
} from './shared.ts';

const isRed = (c: CardInstance) => colorOf(c) === 'Red';
const myPal = (self: CardInstance, c: CardInstance) => isPal(c) && c.owner === self.owner;
const gearCount = (e: EffectApi) => e.gearsOf(e.me).length;

/** "Reveal/look at the top N, choose up to 1 [match] to hand, put the rest into the graveyard." */
function revealTopToHand(e: EffectApi, n: number, what: string, match: (c: CardInstance) => boolean, min = 0) {
  const top = e.lookTop(n);
  e.reveal(top);
  const options = top.filter(match);
  const [chosen] = e.choose({ prompt: `Choose ${min ? 1 : 'up to 1'} ${what} to add to hand.`, options, min, max: 1 });
  if (chosen) e.addToHand(e.s.cards[chosen]!);
  e.millTop(top.length - (chosen ? 1 : 0));
}

/** Rest a Pal; it doesn't stand during its controller's next stand phase. */
const restAndSkip = (e: EffectApi, c: CardInstance) => {
  e.rest(c);
  e.skipNextStand(c);
};

const breakthroughAct = {
  label: '+500 power and Breakthrough',
  zone: 'base' as const,
  oncePerTurn: true,
  costs: [{ ingredient: 2 }],
  effect: ((e) => {
    e.modify(e.self, 'power', 500);
    e.grant(e.self, 'breakthrough');
  }) as Effect,
};

const ALL_CARD_NAMES = [...new Set(cardDb.cards.filter((c) => c.kind !== 'Soul').map((c) => c.name))].sort();

export const EBP01: Record<string, CardScript> = {
  // Jormuntide Ignis – Savage Lava Dragon
  'EBP01-001': {
    acts: [
      {
        label: 'Stand this card',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ souls: 3 }, { discardFromHand: { count: 2 } }],
        effect: (e) => e.stand(e.self),
      },
    ],
  },

  // Suzaku – Hellfire Wings
  'EBP01-002': {
    aura: {
      damageBonus: (_s, self, source, target) =>
        source.owner === self.owner && isRed(source) && isPal(target) ? 200 : 0,
    },
    onDeploy: damageUpTo1(700),
  },

  // Gobfin Ignis – Blazing Hothead
  'EBP01-003': {
    aura: { power: (_s, self, c) => (c.id !== self.id && myPal(self, c) && isRed(c) ? 300 : 0) },
  },

  // Bushi – Ephemeral Blade (Interrupt comes from its text)
  'EBP01-004': {
    onBattleEnd: (e) => {
      if (e.confirm('Return Bushi to your hand?')) e.addToHand(e.self);
    },
  },

  // Reptyro – Ore Gorger
  'EBP01-005': {
    onDeploy: getResource('material', 3),
    acts: [
      {
        label: 'Search the top 5 for a gear',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ material: 3 }],
        effect: (e) =>
          searchTop(e, {
            look: 5,
            max: 1,
            what: '◇8 or less gear',
            filter: (d) => d.kind === 'Gear' && (d.cost ?? 0) <= 8,
            to: 'deploy',
          }),
      },
    ],
  },

  // Kitsun – Wyrmbane Fangs
  'EBP01-007': { onDeploy: damageUpTo1(1200, (_e, c) => costOf(c) >= 7, '◇7 or greater Pal') },

  // Sparkit – Hazardous Contact
  'EBP01-008': { onDeploy: damageUpTo1(500, (_e, c) => !c.rested, 'standing Pal') },

  // Ragnahawk – Emberwing Striker
  'EBP01-010': {
    onAttack: (e) => {
      for (const c of e.palsOf(e.me).filter(isRed)) {
        e.modify(c, 'power', 500);
        e.modify(c, 'strike', 1);
      }
    },
  },

  // Flambelle – Scorching Tears
  'EBP01-012': { onDeploy: getResource('material', 2) },

  // Mounted Machine Gun
  'EBP01-015': {
    acts: [
      {
        label: 'Deal 500 damage X times',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ xMaterial: { min: 1 }, assign: true }],
        effect: (e) => {
          for (let i = 0; i < e.x; i++) {
            const c = e.chooseOne(`Choose 1 Pal to deal 500 damage to (${i + 1} of ${e.x}).`, e.pals());
            if (c) e.damage(c, 500);
          }
        },
      },
    ],
  },

  // Primitive Furnace
  'EBP01-016': {
    acts: [
      ...assignForResource('material'),
      {
        label: 'Your next gear costs X less',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ xMaterial: { min: 1 } }],
        effect: (e) => {
          const p = e.s.players[e.me];
          p.nextGearDiscount = (p.nextGearDiscount ?? 0) + e.x;
        },
      },
    ],
  },

  // Flame Cauldron
  'EBP01-017': {
    aura: { power: (_s, self, c) => (myPal(self, c) && isRed(c) ? 200 : 0) },
    watchers: [
      { on: 'palDeployed', whose: 'mine', filter: (_s, _self, c) => isRed(c), effect: getResource('material', 1) },
    ],
  },

  // Alarm Bell
  'EBP01-018': {
    acts: [
      {
        label: 'Stand Pals assigned this turn; they must attack',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ souls: 1, assign: true }],
        effect: (e) => {
          for (const c of e.assignedThisTurn().filter((c) => c.owner === e.me)) e.stand(c);
          e.setTurnFlag('noAssign');
          e.setTurnFlag('mustAttack');
        },
      },
    ],
  },

  // Foxparks' Harness
  'EBP01-019': {
    acts: restForPower(200, (e, c) => {
      if (e.isMainName(c, 'Foxparks')) e.grantSkill(c, 'flame');
    }),
    grants: { flame: { onAttack: damageUpTo1(700) } },
  },

  // Pump-Action Shotgun
  'EBP01-020': {
    onDeploy: (e) => {
      for (const c of e.targetable(e.palsOf(e.opp))) e.damage(c, 1200);
    },
    acts: restForPower(200),
  },

  // Makeshift Handgun
  'EBP01-021': { onDeploy: damageUpTo1(500), acts: restForPower(200) },

  // Stone Pickaxe
  'EBP01-022': { acts: restForPower(200, (e) => e.gain('material', 1), 'Rest: +200 power, get 1 Material') },

  // Axel's Strategy
  'EBP01-023': {
    event: (e) => {
      const mode = e.chooseMode('Choose 1:', [
        'Deal 1500 damage to 1 Pal',
        `Stand up to ${gearCount(e)} Pals`,
        "Opponent's ◇5+ Pals can't block",
      ]);
      if (mode === 0) {
        const c = e.chooseOne('Choose 1 Pal to deal 1500 damage to.', e.pals());
        if (c) e.damage(c, 1500);
      } else if (mode === 1) {
        for (const c of e.chooseUpTo(gearCount(e), 'Choose Pals to stand.', e.pals())) e.stand(c);
      } else {
        for (const c of e.targetable(e.palsOf(e.opp).filter((c) => costOf(c) >= 5))) e.addFlag(c, 'cannotBlock');
      }
    },
  },

  // Treasure Chest Found!
  'EBP01-024': {
    event: (e) => {
      const found = searchTop(e, {
        look: 5,
        max: 1,
        what: 'red structure or gear',
        filter: (d) => d.color === 'Red' && (d.kind === 'Structure' || d.kind === 'Gear'),
        to: 'hand',
      });
      if (found.length === 0) e.gain('material', 3);
    },
  },

  // Chillet – Dragon Whisperer
  'EBP01-025': {
    onDeploy: (e) => {
      const top = e.revealTop();
      if (!top) return;
      const def = e.def(top);
      const ok = def.kind === 'Pal' && def.elements.includes('Dragon') && (def.cost ?? 0) <= 8 && e.canDeploy(top);
      if (ok && e.confirm(`Deploy ${def.name}?`)) e.deploy(top);
      else e.addToHand(top);
    },
  },

  // Relaxaurus – Hungry Gunner
  'EBP01-026': {
    onDeploy: (e) => {
      for (const c of e.chooseUpTo(
        1,
        'Choose up to 1 ◇6 or less Pal to rest.',
        e.pals((c) => costOf(c) <= 6),
      )) {
        e.rest(c);
        e.freeze(c);
      }
    },
  },

  // Jormuntide – Surging Sea Serpent
  'EBP01-027': {
    onDeploy: (e) => {
      e.draw(1);
      for (const c of e.chooseUpTo(
        1,
        'Choose up to 1 ◇7 or less Pal to rest.',
        e.pals((c) => costOf(c) <= 7),
      ))
        restAndSkip(e, c);
    },
  },

  // Pengullet – Yearning for the Sky
  'EBP01-028': { onGraveyard: (e) => e.draw(1) },

  // Azurobe – Water Dragon Waltz
  'EBP01-029': {
    onDeploy: (e) => {
      e.draw(1);
      for (const c of e.chooseUpTo(1, 'Choose up to 1 Pal to rest.', e.pals())) e.rest(c);
    },
  },

  // Reptyro Cryst – Glacial Devourer
  'EBP01-030': {
    onDeploy: (e) => e.draw(1),
    acts: [
      {
        label: 'Search the top 5 for structures',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ discardFromHand: { count: 1 } }],
        effect: (e) =>
          searchTop(e, {
            look: 5,
            max: 2,
            what: '◇6 or less structures',
            filter: (d) => d.kind === 'Structure' && (d.cost ?? 0) <= 6,
            to: 'deploy',
          }),
      },
    ],
  },

  // Penking – Mighty Warrior of the Deep
  'EBP01-031': { aura: { power: (_s, self, c) => (myPal(self, c) && hasMainName(c, 'Pengullet') ? 700 : 0) } },

  // Fuack – Manic Wave Ripper
  'EBP01-032': { onAttacked: (e) => e.modify(e.self, 'power', 300) },

  // Wumpo – Frostpeak Sentinel
  'EBP01-033': { aura: { strike: (_s, self, c) => (self.rested && isPal(c) && c.owner !== self.owner ? -1 : 0) } },

  // Mau Cryst – Harbinger of Riches
  'EBP01-035': {
    onAssign: (e) => {
      if (e.subject && workOf(e.subject).includes('Farming')) e.draw(1);
    },
  },

  // Celaray – Loop De Loop
  'EBP01-036': {
    onAttack: (e) => {
      e.draw(1);
      const c = e.chooseOne('Choose 1 card from your hand to discard.', e.hand(e.me));
      if (c) e.discard(c);
    },
  },

  // Antique Curtain
  'EBP01-039': {
    onDeploy: (e) => {
      const names = new Set(e.structuresOf(e.me).flatMap((c) => e.names(c).filter((n) => n.includes('Antique'))));
      const x = names.size;
      for (const c of e.chooseUpTo(x, `Choose up to ${x} of your opponent's Pals to return to hand.`, e.palsOf(e.opp)))
        e.addToHand(c);
    },
  },

  // Antique Dresser
  'EBP01-040': {
    acts: [
      {
        label: 'Declare a card name for your cards',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ discardFromHand: { count: 1 } }],
        effect: (e) => {
          const [name] = e.choose({
            prompt: 'Declare 1 card name.',
            options: ALL_CARD_NAMES.map((n) => ({ id: n, label: n })),
            min: 1,
            max: 1,
          });
          if (!name) return;
          e.declareName(name);
          for (const c of e.baseOf(e.me)) e.addName(c, name);
        },
      },
      {
        label: 'X Pals get +1000/+1',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ discardFromHand: { count: 'X' } }],
        effect: (e) => {
          const picks = e.choose({
            prompt: `Choose ${e.x} of your Pals.`,
            options: e.targetable(e.palsOf(e.me)),
            min: e.x,
            max: e.x,
          });
          for (const id of picks) {
            e.modify(e.s.cards[id]!, 'power', 1000);
            e.modify(e.s.cards[id]!, 'strike', 1);
          }
        },
      },
    ],
  },

  // Hot Spring
  'EBP01-041': {
    acts: [
      {
        label: 'Rest up to 2 ◇6 or less Pals',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ assign: true }],
        effect: (e) => {
          for (const c of e.chooseUpTo(
            2,
            'Choose up to 2 ◇6 or less Pals to rest.',
            e.pals((c) => costOf(c) <= 6),
          ))
            restAndSkip(e, c);
        },
      },
    ],
  },

  // Antique Mirror
  'EBP01-042': { onDeploy: (e) => e.draw(1) },

  // Sphere Workbench
  'EBP01-043': {
    acts: [
      {
        label: 'Assign: draw 2, discard 1',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ assign: true }],
        effect: (e) => {
          e.draw(2);
          const c = e.chooseOne('Choose 1 card from your hand to discard.', e.hand(e.me));
          if (c) e.discard(c);
        },
      },
    ],
  },

  // Pengullet Rocket Launcher
  'EBP01-044': {
    acts: [
      {
        label: 'Rest: a Pal gets +200 power',
        zone: 'base',
        costs: [{ restSelf: true }],
        effect: (e) => {
          const c = e.chooseOne('Choose 1 Pal to power up.', e.pals());
          if (!c) return;
          if (!e.isMainName(c, 'Pengullet')) return e.modify(c, 'power', 200);
          e.modify(c, 'power', 500);
          e.grantSkill(c, 'launch');
        },
      },
    ],
    grants: {
      launch: {
        acts: [
          {
            label: "Rest: damage all the opponent's Pals",
            zone: 'base',
            costs: [{ restSelf: true }],
            effect: (e) => {
              const x = e.power(e.self);
              for (const c of e.targetable(e.palsOf(e.opp))) e.damage(c, x);
              e.destroy(e.self);
            },
          },
        ],
      },
    },
  },

  // Grappling Gun
  'EBP01-045': {
    acts: restForPower(200, (e, c) => e.grant(c, 'vigilance'), 'Rest: +200 power and Vigilance'),
  },

  // Victor's Strategy
  'EBP01-046': {
    event: (e) => {
      const structures = e.structuresOf(e.me).length;
      const mode = e.chooseMode('Choose 1:', [
        'Take 1 of the top 5 cards',
        'Return 1 Pal to hand',
        `Draw ${structures}`,
      ]);
      if (mode === 0) {
        const top = e.lookTop(5);
        const c = e.chooseOne('Choose 1 card to add to hand.', top);
        if (c) e.addToHand(c);
        e.shuffleDeck();
      } else if (mode === 1) {
        const c = e.chooseOne('Choose 1 Pal to return to hand.', e.pals());
        if (c) e.addToHand(c);
      } else e.draw(structures);
    },
  },

  // Pal Sphere
  'EBP01-047': { event: (e) => e.draw(3) },

  // Aurora Guide
  'EBP01-048': {
    event: (e) => {
      e.draw(1);
      for (const c of e.chooseUpTo(1, 'Choose up to 1 card to put on top of your deck.', e.hand(e.me)))
        e.putOnTopOfDeck(c);
    },
  },

  // Lyleen – Blessing of the Goddess
  'EBP01-049': {
    onDeploy: getResource('ingredient', 3),
    acts: [
      {
        label: 'Search the top 5 for a Pal',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ ingredient: 3 }],
        effect: (e) =>
          searchTop(e, {
            look: 5,
            max: 1,
            what: '◇6 or less Pal',
            filter: (d) => isPalDef(d) && costAtMost(6)(d),
            to: 'deploy',
          }),
      },
    ],
  },

  // Digtoise – Seismic Drillback
  'EBP01-050': {
    powerBonus: (s, self) => (soulsOf(s, self.owner) >= 10 ? 1000 : 0),
    strikeBonus: (s, self) => (soulsOf(s, self.owner) >= 10 ? 1 : 0),
    acts: [breakthroughAct],
  },

  // Petallia – Sweet Blessings
  'EBP01-051': {
    onDeploy: (e) => {
      e.gainLife(1);
      e.standSouls(2);
    },
  },

  // Rushoar – Reckless Destruction
  'EBP01-052': {
    onAttack: (e) => {
      if (e.subject && isStructure(e.subject)) e.modify(e.self, 'power', 800);
    },
  },

  // Elizabee – Queen of the Flower Garden
  'EBP01-053': {
    powerBonus: (s, self) =>
      300 *
      s.players[self.owner].base.filter((id) => isPal(s.cards[id]!) && hasMainName(s.cards[id]!, 'Beegarde')).length,
    acts: [
      {
        label: 'Look at the top card: play a Beegarde for 2 less',
        zone: 'base',
        costs: [{ ingredient: 1 }],
        effect: (e) => {
          const [top] = e.lookTop(1);
          if (!top || !isPal(top) || !e.isMainName(top, 'Beegarde') || !e.canDeploy(top)) return;
          const cost = Math.max(1, costOf(top) - 2);
          if (e.souls() === 0 || !e.confirm(`Play ${e.def(top).name} for ${cost}?`)) return;
          if (e.paySouls(cost)) e.deploy(top);
        },
      },
    ],
  },

  // Vaelet – Bewitching Blossom
  'EBP01-055': {
    acts: [
      {
        label: 'Stand this card (if assigned this turn)',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ discardFromHand: { count: 1 } }],
        effect: (e) => {
          if (e.assignedThisTurn().some((c) => c.id === e.self.id)) e.stand(e.self);
        },
      },
    ],
  },

  // Dumud – Mellow Bounty
  'EBP01-057': {
    onDeploy: getResource('ingredient', 2),
    onAssign: (e) => {
      if (e.subject && workOf(e.subject).includes('Farming')) e.addSouls(1, { rested: true });
    },
  },

  // Gumoss – Curious Sprout
  'EBP01-058': {
    onDeploy: (e) => {
      e.modify(e.self, 'power', 300);
      e.grant(e.self, 'assault');
    },
  },

  // Digtoise – Keen Needleback
  'EBP01-059': { acts: [breakthroughAct] },

  // Beegarde – Knight of the Flower Garden (copy limit is in deck.ts)
  'EBP01-061': {
    onDeploy: (e) => {
      e.gain('ingredient', 1);
      if (hasStructureWith(e.s, e.me, 'Farming')) e.modify(e.self, 'power', 500);
    },
  },

  // Breeding Farm
  'EBP01-063': {
    acts: [
      {
        label: 'Reveal the top card',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ ingredient: 2 }],
        effect: (e) => {
          const top = e.revealTop();
          if (!top) return;
          if (isPal(top) && costOf(top) <= 8) e.addToHand(top);
          else e.millTop(1);
        },
      },
      {
        label: 'Assign 2: deploy a Pal from hand',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ ingredient: 2, assign: 2 }],
        effect: (e) => {
          const options = e.hand(e.me).filter((c) => isPal(c) && costOf(c) <= 8 && e.canDeploy(c));
          const c = e.chooseOne('Choose 1 ◇8 or less Pal from your hand to deploy.', options);
          if (c) e.deploy(c);
        },
      },
    ],
  },

  // Cola Vending Machine
  'EBP01-064': {
    acts: [
      {
        label: 'Stand 1 + 3X souls',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ xIngredient: { min: 0 }, assign: true }],
        effect: (e) => e.standSouls(1 + 3 * e.x),
      },
    ],
  },

  // Feed Box
  'EBP01-065': {
    acts: [
      {
        label: 'Add a soul (rested)',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ ingredient: 1 }],
        effect: (e) => {
          const before = e.souls();
          e.addSouls(1, { rested: true });
          if (before >= 10) e.standSouls(2);
        },
      },
    ],
  },

  // Ranch
  'EBP01-066': {
    acts: [
      {
        label: 'Assign: get 3 Material or Ingredient, draw 1',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ assign: true }],
        effect: (e) => {
          e.gain(e.chooseMode('Get 3 of:', ['Material', 'Ingredient']) === 0 ? 'material' : 'ingredient', 3);
          e.draw(1);
        },
      },
    ],
  },

  // No Pals Beyond Sign
  'EBP01-067': {
    acts: [
      {
        label: 'Assign: that Pal gets Taunt',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ assign: true }],
        effect: (e) => {
          for (const c of e.assigned) e.grant(c, 'taunt', 'untilOpponentsNextTurnEnd');
        },
      },
    ],
  },

  // Digtoise's Headband
  'EBP01-068': {
    acts: restForPower(200, (e, c) => {
      if (!e.isMainName(c, 'Digtoise')) return;
      e.gain(e.chooseMode('Get 2 of:', ['Material', 'Ingredient']) === 0 ? 'material' : 'ingredient', 2);
    }),
  },

  // Farming Hat
  'EBP01-069': { acts: restForPower(200, (e) => e.gain('ingredient', 1), 'Rest: +200 power, get 1 Ingredient') },

  // Lily's Strategy
  'EBP01-070': {
    event: (e) => {
      const mode = e.chooseMode('Choose 1:', [
        'Your Pals get +1000',
        'Destroy a structure or gear',
        'Add a soul (rested)',
      ]);
      if (mode === 0) for (const c of e.palsOf(e.me)) e.modify(c, 'power', 1000);
      else if (mode === 1) {
        const options = [0, 1].flatMap((seat) => e.baseOf(seat as 0 | 1)).filter((c) => !isPal(c));
        const c = e.chooseOne('Choose 1 structure or gear to put into the graveyard.', options);
        if (c) e.destroy(c);
      } else e.addSouls(1, { rested: true });
    },
  },

  // Found an Egg!
  'EBP01-071': {
    event: (e) => {
      if (searchTop(e, { look: 5, max: 1, what: 'Pal', filter: isPalDef, to: 'hand' }).length === 0)
        e.gain('ingredient', 3);
    },
  },

  // Blessing of the Flower Spirit
  'EBP01-072': {
    event: (e) => {
      e.gainLife(1);
      e.draw(1);
    },
  },

  // Helzephyr – Wings of the Moonless Night
  'EBP01-073': {
    watchers: [
      {
        on: 'palDeployed',
        whose: 'mine',
        filter: (s, _self, c) => hasKeyword(s, c, 'nocturnal'),
        effect: (e) => {
          if (!e.isNight() || !e.subject) return;
          const max = costOf(e.subject);
          const [c] = e.chooseUpTo(
            1,
            `Choose up to 1 ◇${max} or less Pal to put into the graveyard.`,
            e.pals((c) => costOf(c) <= max),
          );
          if (!c) return;
          e.destroy(c);
          e.atEndOfTurn('rest');
        },
      },
    ],
    delayed: { rest: (e) => e.rest(e.self) },
  },

  // Shadowbeak – Seed of Despair
  'EBP01-074': {
    aura: { night: (_s, self) => self.rested, doubleAutoAtNight: true },
    endOfTurn: (e) => {
      const [c] = e.chooseUpTo(1, 'Choose up to 1 of your Pals to butcher.', e.palsOf(e.me));
      if (!c) return;
      e.butcher(c);
      const theirs = e.chooseOne('Choose 1 of your Pals to put into the graveyard.', e.palsOf(e.opp), e.opp);
      if (theirs) e.destroy(theirs);
    },
  },

  // Katress – Abyssal Sorcerer
  'EBP01-075': {
    acts: [
      {
        label: 'Butcher a Pal: +1000/+1',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ butcher: 'other' }],
        effect: (e) => {
          e.modify(e.self, 'power', 1000);
          e.modify(e.self, 'strike', 1);
        },
      },
    ],
    watchers: [
      {
        on: 'palButchered',
        whose: 'mine',
        effect: (e) => {
          if (!e.subject) return;
          const x = costOf(e.subject) - 1;
          const options = e
            .graveyard(e.me)
            .filter((c) => isPal(c) && isNormalPal(defOf(c)) && costOf(c) === x && e.canDeploy(c));
          for (const c of e.chooseUpTo(1, `Choose up to 1 ◇${x} normal Pal to deploy.`, options))
            e.deploy(c, { rested: true });
        },
      },
    ],
  },

  // Tombat – Out of Nowhere!?
  'EBP01-076': { onDeploy: (e) => revealTopToHand(e, 3, 'Pal', isPal) },

  // Lyleen Noct – Providence of the Goddess
  'EBP01-078': {
    acts: [
      {
        label: 'Deploy a ◇6 or less Pal from your graveyard',
        zone: 'base',
        costs: [{ restSelf: true, discardFromHand: { count: 1 } }],
        effect: (e) => {
          const options = e.graveyard(e.me).filter((c) => isPal(c) && costOf(c) <= 6 && e.canDeploy(c));
          const c = e.chooseOne('Choose 1 ◇6 or less Pal to deploy.', options);
          if (c) e.deploy(c, { rested: true });
        },
      },
    ],
  },

  // Lovander – Heartstealer
  'EBP01-081': {
    onAttack: (e) => {
      const [c] = e.chooseUpTo(1, 'You may discard 1 card to gain 1 life.', e.hand(e.me));
      if (!c) return;
      e.discard(c);
      e.gainLife(1);
    },
  },

  // Vanwyrm – Marauder of the Skies
  'EBP01-083': {
    onDeploy: (e) => {
      for (const c of e.chooseUpTo(1, 'Choose up to 1 Pal to get −300 power.', e.pals())) e.modify(c, 'power', -300);
    },
  },

  // Menasting – Darkness-Dwelling Scorpion (Retaliate comes from its text)
  'EBP01-084': {
    onGraveyard: (e) => {
      const options = e.graveyard(e.me).filter((c) => isPal(c) && isNormalPal(defOf(c)));
      for (const c of e.chooseUpTo(1, 'Choose up to 1 normal Pal to return to hand.', options)) e.addToHand(c);
    },
  },

  // Maraith – Twilight Messenger
  'EBP01-085': {
    aura: {
      night: (_s, self) => self.rested,
      power: (s, self, c) => (isNight(s) && isPal(c) && c.owner !== self.owner ? -200 : 0),
    },
  },

  // Loupmoon – Glinting Moonlight
  'EBP01-087': {
    onDeploy: (e) => {
      if (!e.isNight()) return;
      const options = e.pals((c) => costOf(c) <= 6 && !c.rested);
      for (const c of e.chooseUpTo(1, 'Choose up to 1 standing ◇6 or less Pal to put into the graveyard.', options))
        e.destroy(c);
    },
  },

  // Lamp
  'EBP01-088': {
    acts: [millForNight],
    aura: { keywords: (_s, self, c) => (myPal(self, c) ? ['nocturnal'] : []) },
  },

  // Shoddy Bed
  'EBP01-089': {
    acts: [millForNight],
    endOfTurn: (e) => {
      if (e.palsOf(e.me).some((c) => c.rested && e.hasKeyword(c, 'nocturnal'))) e.draw(1);
    },
  },

  // Medieval Medicine Workbench
  'EBP01-090': {
    acts: [
      {
        label: 'Deploy a Pal from your graveyard',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ souls: 3, assign: true }],
        effect: (e) => {
          const x = costOf(e.assigned[0]!) + 2;
          const options = e.graveyard(e.me).filter((c) => isPal(c) && costOf(c) <= x && e.canDeploy(c));
          const c = e.chooseOne(`Choose 1 ◇${x} or less Pal to deploy.`, options);
          if (c) e.deploy(c, { rested: true });
        },
      },
    ],
  },

  // Wooden Wall (Taunt comes from its text)
  'EBP01-091': { onGraveyard: (e) => e.draw(1) },

  // Viewing Cage
  'EBP01-092': {
    acts: [
      {
        label: 'Exile the assigned Pal and another',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ assign: true }],
        effect: (e) => {
          const assigned = e.assigned[0]!;
          const x = costOf(assigned) + 2;
          e.exile(assigned);
          const c = e.chooseOne(
            `Choose 1 ◇${x} or less Pal to exile.`,
            e.pals((c) => costOf(c) <= x),
          );
          if (c) e.exile(c);
        },
      },
    ],
    onLeaveBase: (e) => {
      for (const seat of [0, 1] as const) {
        for (const id of [...e.s.players[seat].exile]) {
          const c = e.s.cards[id]!;
          if (c.exiledBy !== e.self.id || !isPal(c)) continue;
          c.exiledBy = null;
          e.addToHand(c);
        }
      }
    },
  },

  // Meat Cleaver
  'EBP01-093': {
    acts: [
      {
        label: 'Butcher: take 1 of the top 3',
        zone: 'base',
        costs: [{ restSelf: true, butcher: 'any' }],
        effect: (e) => revealTopToHand(e, 3, 'card', () => true, 1),
      },
    ],
  },

  // Daedream's Necklace
  'EBP01-094': {
    onDeploy: (e) => {
      const options = e.hand(e.me).filter((c) => isPal(c) && e.isMainName(c, 'Daedream') && e.canDeploy(c));
      for (const c of e.chooseUpTo(1, 'Choose up to 1 Daedream to deploy.', options)) e.deploy(c);
    },
    acts: restForPower(200, (e) => e.setNightUntilEndOfOpponentsNextTurn(), 'Rest: +200 power, it becomes night'),
  },

  // Zoe's Strategy
  'EBP01-095': {
    event: (e) => {
      const mode = e.chooseMode('Choose 1:', [
        'Opponent loses up to 5 Material/Ingredient',
        'Return a Pal from your graveyard; opponent discards 1',
        "Butcher your Pal to destroy an opponent's Pal",
      ]);
      if (mode === 0) e.loseResources(e.opp, 5);
      else if (mode === 1) {
        for (const c of e.chooseUpTo(1, 'Choose up to 1 Pal to return to hand.', e.graveyard(e.me).filter(isPal)))
          e.addToHand(c);
        const d = e.chooseOne('Choose 1 card from your hand to discard.', e.hand(e.opp), e.opp);
        if (d) e.discard(d);
      } else {
        const mine = e.chooseOne('Choose 1 of your Pals to butcher.', e.palsOf(e.me));
        if (!mine) return;
        e.butcher(mine);
        const theirs = e.chooseOne("Choose 1 of your opponent's Pals to put into the graveyard.", e.palsOf(e.opp));
        if (theirs) e.destroy(theirs);
      }
    },
  },

  // Dark Cannon
  'EBP01-096': {
    event: (e) => {
      const c = e.chooseOne(
        'Choose 1 ◇5 or less Pal to put into the graveyard.',
        e.pals((c) => costOf(c) <= 5),
      );
      if (c) e.destroy(c);
    },
  },

  // Black Marketeer
  'EBP01-097': {
    event: (e) => {
      const options = e.graveyard(e.me).filter((c) => isPal(c) && !e.hasKeyword(c, 'interrupt'));
      for (const c of e.chooseUpTo(2, 'Choose up to 2 Pals without Interrupt to return to hand.', options))
        e.addToHand(c);
      e.setNightUntilEndOfOpponentsNextTurn();
    },
  },

  // Elphidran – Gentle Radiance
  'EBP01-098': {
    onAttack: (e) => {
      const [c] = e.chooseUpTo(1, 'You may reveal 1 card from your hand.', e.hand(e.me));
      if (!c) return;
      e.reveal([c]);
      if (isPal(c) && e.def(c).elements.includes('Dragon')) e.modify(e.self, 'power', 500);
    },
  },

  // The Adventure Begins
  'EBP01-100': {
    event: (e) => {
      // This card itself has just been played.
      if ((e.s.players[e.me].cardsPlayed ?? 0) <= 1) e.draw(2);
      const firsts = new Set(e.palsOf(e.me).flatMap((c) => e.names(c).filter((n) => n.includes('My First'))));
      if (firsts.size < 3) return;
      for (const c of e.palsOf(e.me)) {
        e.modify(c, 'power', 1000);
        e.modify(c, 'strike', 5);
      }
    },
  },
};

function soulsOf(s: EffectApi['s'], seat: 0 | 1) {
  return s.players[seat].soulsStanding + s.players[seat].soulsRested;
}
