/** Booster Pack 02 (EBP02). Keyword-only and textless cards need no entry. */
import type { CardScript, EffectApi } from '../abilities.ts';
import { printedKeywords } from '../abilities.ts';
import { costOf, defOf, isPal, isStructure } from '../cards.ts';
import { hasKeyword, hasMainName, isNight } from '../stats.ts';
import type { CardInstance, GameState, Seat } from '../types.ts';
import {
  antiqueNameCount,
  assignForResource,
  colorOf,
  getResource,
  isNormalPal,
  isPalDef,
  millForNight,
  restAndSkip,
  restForPower,
  revealTopToHand,
  searchTop,
  workOf,
} from './shared.ts';

const myPal = (self: CardInstance, c: CardInstance) => isPal(c) && c.owner === self.owner;
const isLegendary = (c: CardInstance) => printedKeywords(c.cardId).has('legendary');
const gearsOf = (s: GameState, seat: Seat) =>
  s.players[seat].base.filter((id) => defOf(s.cards[id]!).kind === 'Gear').length;
const soulsOf = (s: GameState, seat: Seat) => s.players[seat].soulsStanding + s.players[seat].soulsRested;
const farming = (e: EffectApi) => !!e.subject && workOf(e.subject).includes('Farming');
const hasBigPal = (e: EffectApi) => e.palsOf(e.me).some((c) => costOf(c) >= 5);

/** "You may reveal 1 〈Legendary〉 Pal from your hand." Returns whether you did. */
function revealLegendary(e: EffectApi): boolean {
  const [c] = e.chooseUpTo(
    1,
    'You may reveal 1 Legendary Pal from your hand.',
    e.hand(e.me).filter((c) => isPal(c) && isLegendary(c)),
  );
  if (c) e.reveal([c]);
  return !!c;
}

/** "Your opponent discards until their hand has N cards." */
function discardDownTo(e: EffectApi, seat: Seat, n: number) {
  const extra = e.hand(seat).length - n;
  if (extra <= 0) return;
  const picks = e.choose({
    prompt: `Discard ${extra} card${extra > 1 ? 's' : ''}.`,
    options: e.hand(seat),
    min: extra,
    max: extra,
    chooser: seat,
  });
  for (const id of picks) e.discard(e.s.cards[id]!);
}

export const EBP02: Record<string, CardScript> = {
  // Orserk – Thunderclap Roar
  'EBP02-001': {
    acts: [
      {
        label: 'Choose a mode not chosen this turn',
        zone: 'base',
        costs: [{ material: 2 }],
        usable: (s, self) => [0, 1, 2].some((i) => !(s.turnMemory ?? []).includes(`${self.id}:mode${i}`)),
        effect: (e) => {
          const labels = ['Your Pal gets +500/+1', "Deal 900 to an opponent's Pal", 'Stand a ◇3 or less Pal'];
          const mode = e.chooseMode(
            'Choose 1 not chosen this turn:',
            labels,
            [0, 1, 2].map((i) => e.remembered(`mode${i}`)),
          );
          if (mode < 0) return;
          e.remember(`mode${mode}`);
          if (mode === 0) {
            const c = e.chooseOne('Choose 1 of your Pals.', e.palsOf(e.me));
            if (!c) return;
            e.modify(c, 'power', 500);
            e.modify(c, 'strike', 1);
          } else if (mode === 1) {
            const c = e.chooseOne("Choose 1 of your opponent's Pals to deal 900 damage to.", e.palsOf(e.opp));
            if (c) e.damage(c, 900);
          } else {
            const c = e.chooseOne(
              'Choose 1 ◇3 or less Pal to stand.',
              e.pals((c) => costOf(c) <= 3),
            );
            if (c) e.stand(c);
          }
        },
      },
    ],
  },

  // Katress Ignis – Scathing Counter
  'EBP02-002': {
    onInterrupt: (e) => {
      if (e.souls() < 6 || !e.s.players[e.me].graveyard.includes(e.self.id) || !e.canDeploy(e.self)) return;
      if (e.confirm('Deploy Katress Ignis from your graveyard, rested?')) e.deploy(e.self, { rested: true });
    },
  },

  // Faleris – Marcus' Soaring Wings
  'EBP02-003': {
    powerBonus: (s, self) => 200 * gearsOf(s, self.owner),
    onDeploy: (e) => {
      const options = e.hand(e.me).filter((c) => e.def(c).kind === 'Gear' && costOf(c) >= 8);
      const picks = e.chooseUpTo(options.length, 'Choose ◇8 or greater gears with different names to deploy.', options);
      const seen = new Set<string>();
      for (const c of picks) {
        if (seen.has(e.def(c).name)) continue;
        seen.add(e.def(c).name);
        e.deploy(c);
      }
    },
  },

  // Chillet Ignis – Ember-Clad Dragon
  'EBP02-004': {
    onDeploy: (e) => {
      const dragons = e.hand(e.me).filter((c) => isPal(c) && e.def(c).elements.includes('Dragon'));
      const [d] = e.chooseUpTo(1, 'You may discard 1 Dragon Pal to deal 700 damage.', dragons);
      if (!d) return;
      e.discard(d);
      const c = e.chooseOne('Choose 1 Pal to deal 700 damage to.', e.pals());
      if (c) e.damage(c, 700);
    },
  },

  // Rayhound – Soaring Flash
  'EBP02-005': { battleDamageMultiplier: 2 },

  // Mossanda Lux – Apex Grenadier
  'EBP02-006': {
    acts: [
      {
        label: 'Deal 400 to up to 2 Pals',
        zone: 'base',
        costs: [{ material: 2 }],
        effect: (e) => {
          for (const c of e.chooseUpTo(2, 'Choose up to 2 Pals to deal 400 damage to.', e.pals())) e.damage(c, 400);
        },
      },
    ],
  },

  // Flambelle – Feverish Tears
  'EBP02-007': {
    acts: [
      { label: 'Rest: get 2 Material', zone: 'base', costs: [{ restSelf: true }], effect: getResource('material', 2) },
    ],
  },

  // Dazzi – Thunder Maiden
  'EBP02-008': { onDeploy: getResource('material', 2) },

  // Arsox – Blazing Fury
  'EBP02-009': {
    powerBonus: (s, self) => 200 * gearsOf(s, self.owner),
    onDeploy: (e) => searchTop(e, { look: 5, max: 1, what: 'gear', filter: (d) => d.kind === 'Gear', to: 'hand' }),
  },

  // Relaxaurus Lux – Party Time (Assault comes from its text)
  'EBP02-010': {
    onBeatOpponent: (e) => {
      if (e.s.battle?.attackerId === e.self.id) e.stand(e.self);
    },
  },

  // Improved Furnace
  'EBP02-015': {
    acts: [
      ...assignForResource('material'),
      {
        label: 'Search your deck for a ◇8+ gear',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ material: 5 }],
        effect: (e) => {
          const options = e.deck(e.me).filter((c) => e.def(c).kind === 'Gear' && costOf(c) >= 8);
          for (const c of e.chooseUpTo(1, 'Choose up to 1 ◇8 or greater gear to add to hand.', options)) {
            e.reveal([c]);
            e.addToHand(c);
          }
          e.shuffleDeck();
        },
      },
    ],
  },

  // Coal Quarry
  'EBP02-016': { acts: assignForResource('material'), endOfTurn: getResource('material', 1) },

  // Mine
  'EBP02-017': {
    watchers: [
      {
        on: 'palAttacked',
        whose: 'mine',
        effect: (e) => {
          const attacker = e.s.battle ? e.s.cards[e.s.battle.attackerId] : undefined;
          if (!e.confirm('Put Mine into the graveyard to deal 1500 damage to the attacker?')) return;
          e.destroy(e.self);
          if (attacker && e.targetable([attacker]).length) e.damage(attacker, 1500);
        },
      },
    ],
  },

  // Rocket Launcher
  'EBP02-018': {
    onDeploy: (e) => {
      for (const c of e.chooseUpTo(3, 'Choose up to 3 Pals to deal 1000 damage to.', e.pals())) e.damage(c, 1000);
    },
    acts: [
      {
        label: 'Rest: a Pal gets +1 strike',
        zone: 'base',
        costs: [{ restSelf: true }],
        effect: (e) => {
          const c = e.chooseOne('Choose 1 Pal to get +1 strike.', e.pals());
          if (c) e.modify(c, 'strike', 1);
        },
      },
    ],
  },

  // Flamethrower
  'EBP02-019': {
    materialReducesCost: true,
    acts: restForPower(200, (e) => {
      if (!hasBigPal(e)) return;
      for (const c of e.targetable(e.pals())) e.damage(c, 500);
    }),
  },

  // Musket
  'EBP02-020': {
    acts: [
      {
        label: 'Rest: deal 200 damage',
        zone: 'base',
        costs: [{ restSelf: true }],
        effect: (e) => {
          const c = e.chooseOne('Choose 1 Pal to deal 200 damage to.', e.pals());
          if (c) e.damage(c, 200);
          e.skipNextStand(e.self);
        },
      },
    ],
  },

  // Mossanda Lux's Grenade Launcher
  'EBP02-021': {
    watchers: [
      {
        on: 'actConsumedMaterial',
        whose: 'mine',
        filter: (_s, _self, c) => isPal(c) && hasMainName(c, 'Mossanda Lux'),
        effect: (e) => {
          const pal = e.subject;
          if (!pal || !pal.rested || !e.confirm('Stand Mossanda Lux and return the Grenade Launcher to hand?')) return;
          e.stand(pal);
          e.addToHand(e.self);
        },
      },
    ],
    acts: restForPower(200),
  },

  // Axel's Gambit
  'EBP02-022': {
    event: (e) => {
      for (const c of [...e.palsOf(e.me), ...e.gearsOf(e.me)]) e.stand(c);
    },
  },

  // Marcus' Turf
  'EBP02-023': {
    event: (e) =>
      searchTop(e, {
        look: 5,
        max: 1,
        what: '◇8 or greater red card',
        filter: (d) => d.color === 'Red' && (d.cost ?? 0) >= 8,
        to: 'hand',
      }),
  },

  // Flame Funnel
  'EBP02-024': {
    event: (e) => {
      const c = e.chooseOne('Choose 1 Pal to deal 1000 damage to.', e.pals());
      if (c) e.damage(c, 1000);
    },
  },

  // Frostallion – Everlasting Rime
  'EBP02-025': {
    aura: { cost: (_s, _self, c) => (isPal(c) ? 2 : 0) },
    endOfTurn: (e) => e.draw(Math.max(0, 4 - e.hand(e.me).length)),
  },

  // Foxcicle – Aurora Hymn
  'EBP02-026': {
    aura: { cost: (_s, _self, c) => (isPal(c) && isLegendary(c) ? 1 : 0) },
    onDeploy: (e) => {
      e.draw(1);
      const c = e.chooseOne('Choose 1 card from your hand to discard.', e.hand(e.me));
      if (c) e.discard(c);
    },
  },

  // Sweepa – Record Breaker
  'EBP02-027': {
    onDeploy: (e) => {
      const options = e.hand(e.me).filter((c) => isPal(c) && e.isMainName(c, 'Swee') && e.canDeploy(c));
      for (const c of e.chooseUpTo(101, 'Choose any number of Swee to deploy.', options)) e.deploy(c);
    },
  },

  // Sibelyx – Silken Spinner (Vigilance comes from its text)
  'EBP02-028': {
    onAssign: (e) => {
      if (!farming(e)) return;
      for (const c of e.chooseUpTo(
        1,
        'Choose up to 1 ◇7 or less Pal to rest.',
        e.pals((c) => costOf(c) <= 7),
      )) {
        e.rest(c);
        e.freeze(c);
      }
    },
  },

  // Jolthog Cryst – Midwinter Awakening
  'EBP02-029': {
    onDeploy: (e) => {
      if (!revealLegendary(e)) e.rest(e.self);
    },
  },

  // Gobfin – Sunken Memories
  'EBP02-030': {
    onAttack: (e) => {
      const blue = e.hand(e.me).filter((c) => colorOf(c) === 'Blue');
      if (blue.length < 3 || !e.confirm('Reveal 3 blue cards for +500 power?')) return;
      const picks = e.choose({ prompt: 'Choose 3 blue cards to reveal.', options: blue, min: 3, max: 3 });
      e.reveal(picks.map((id) => e.s.cards[id]!));
      e.modify(e.self, 'power', 500);
    },
  },

  // Broncherry Aqua – The Shape of Love
  'EBP02-031': {
    powerBonus: (s, self) => 300 * s.players[self.owner].base.filter((id) => isStructure(s.cards[id]!)).length,
    aura: { power: (_s, self, c) => (isStructure(c) && c.owner === self.owner ? 500 : 0) },
  },

  // Kingpaca Cryst – Prideful Solitude (Vigilance comes from its text)
  'EBP02-032': { onDeploy: (e) => e.draw(1) },

  // Pengullet – Locked and Loaded
  'EBP02-033': {
    onDeploy: (e) => {
      e.draw(1);
      const c = e.chooseOne('Choose 1 card from your hand to discard.', e.hand(e.me));
      if (c) e.discard(c);
    },
  },

  // Swee – Hibernating Together (copy limit is in deck.ts)
  'EBP02-034': {
    onDeploy: (e) => {
      const n = e.palsOf(e.me).filter((c) => e.isMainName(c, 'Sweepa') || e.isMainName(c, 'Swee')).length;
      if (n >= 3) e.draw(1);
    },
  },

  // Antique Cabinet
  'EBP02-039': {
    onDeploy: (e) => {
      const x = antiqueNameCount(e);
      const options = e.hand(e.me).filter((c) => (isPal(c) || isStructure(c)) && costOf(c) <= 6 && e.canDeploy(c));
      for (const c of e.chooseUpTo(x, `Choose up to ${x} ◇6 or less Pals or structures to deploy.`, options))
        e.deploy(c, { rested: true });
    },
  },

  // Water Fountain
  'EBP02-040': {
    aura: { power: (_s, self, c) => (myPal(self, c) && colorOf(c) === 'Blue' ? 200 : 0) },
    endOfTurn: (e) => {
      if (e.palsOf(e.me).filter((c) => colorOf(c) === 'Blue').length >= 3) e.draw(1);
    },
  },

  // High Quality Hot Spring
  'EBP02-041': {
    acts: [
      {
        label: "Assign: that Pal can't be chosen or attacked",
        zone: 'base',
        oncePerTurn: true,
        costs: [{ assign: true }],
        effect: (e) => {
          for (const c of e.assigned) {
            e.addFlag(c, 'untargetableByOpponent', 'untilOpponentsNextTurnEnd');
            e.addFlag(c, 'cannotBeAttacked', 'untilOpponentsNextTurnEnd');
          }
        },
      },
    ],
  },

  // Antique Partition
  'EBP02-042': {
    onDeploy: (e) => {
      for (const c of e.chooseUpTo(
        1,
        'Choose up to 1 ◇3 or less Pal to return to hand.',
        e.pals((c) => costOf(c) <= 3),
      ))
        e.addToHand(c);
    },
  },

  // Stun Baton
  'EBP02-043': {
    onDeploy: (e) => {
      for (const c of e.chooseUpTo(1, 'Choose up to 1 Pal to rest.', e.pals())) restAndSkip(e, c);
    },
    acts: restForPower(200, (e) => {
      if (hasBigPal(e)) e.draw(1);
    }),
  },

  // Frostallion Saddle
  'EBP02-044': {
    aura: {
      protects: (_s, self, target, source) =>
        target.owner === self.owner &&
        isPal(target) &&
        hasMainName(target, 'Frostallion') &&
        source.owner !== self.owner &&
        isPal(source),
    },
    acts: restForPower(200),
  },

  // Sweepa Saddle
  'EBP02-045': {
    onDeploy: (e) => {
      const top = e.lookTop(5);
      e.reveal(top);
      const options = top.filter((c) => isPal(c) && e.isMainName(c, 'Swee'));
      for (const c of e.chooseUpTo(options.length, 'Choose any number of Swee to add to hand.', options))
        e.addToHand(c);
      e.shuffleDeck();
    },
    acts: restForPower(200),
  },

  // Victor's Gambit
  'EBP02-046': {
    event: (e) => {
      const mine = e.chooseOne('Choose 1 of your Pals.', e.palsOf(e.me));
      if (!mine) return;
      const options = e.hand(e.me).filter((c) => isPal(c) && costOf(c) === costOf(mine) && e.canDeploy(c));
      const c = e.chooseOne(`Choose 1 ◇${costOf(mine)} Pal from your hand to deploy.`, options);
      if (c) e.deploy(c);
    },
  },

  // Love Overload
  'EBP02-047': {
    event: (e) => {
      const top = e.lookTop(3);
      for (const c of e.chooseUpTo(1, 'Choose up to 1 Pal to add to hand.', top.filter(isPal))) e.addToHand(c);
      for (const c of e.chooseUpTo(1, 'Choose up to 1 structure to add to hand.', top.filter(isStructure)))
        e.addToHand(c);
      // The rest go to the bottom, in the order chosen.
      let rest = top.filter((c) => e.s.players[e.me].deck.includes(c.id));
      while (rest.length > 1) {
        const c = e.chooseOne('Choose the next card to put on the bottom of your deck.', rest)!;
        e.putOnBottomOfDeck(c);
        rest = rest.filter((x) => x.id !== c.id);
      }
      if (rest[0]) e.putOnBottomOfDeck(rest[0]);
    },
  },

  // Iceberg
  'EBP02-048': {
    event: (e) => {
      e.draw(1);
      for (const c of e.chooseUpTo(1, 'Choose up to 1 Pal to rest.', e.pals())) e.rest(c);
    },
  },

  // Anubis – Noble Reaper
  'EBP02-049': {
    handCostReduction: (s, self) => s.players[self.owner].base.filter((id) => isPal(s.cards[id]!)).length,
    onDeploy: (e) => {
      const c = e.chooseOne('Choose 1 of your Pals to get +500 power.', e.palsOf(e.me));
      if (c) e.modify(c, 'power', 500);
    },
    onAttacked: (e) => {
      if (e.confirm('Return Anubis to your hand?')) e.addToHand(e.self);
    },
  },

  // Mammorest – Gaia Crusher (Breakthrough comes from its text)
  'EBP02-050': { powerBonus: (s, self) => 100 * s.players[self.owner].ingredient },

  // Bristla – Regal Gaze
  'EBP02-051': {
    acts: [
      {
        label: 'Your green Pals get +300',
        zone: 'base',
        costs: [{ ingredient: 1 }],
        effect: (e) => {
          for (const c of e.palsOf(e.me).filter((c) => colorOf(c) === 'Green')) e.modify(c, 'power', 300);
        },
      },
    ],
  },

  // Fuddler – Claw-Honing Mole
  'EBP02-052': {
    onAttack: (e) => {
      if (e.subject && isStructure(e.subject)) e.modify(e.self, 'power', 800);
    },
  },

  // Dumud – Bountiful Earth
  'EBP02-053': { onGraveyard: getResource('ingredient', 6) },

  // Quivern Botan – Meadow's Grace (Taunt comes from its text)
  'EBP02-054': {
    aura: {
      protects: (_s, self, target, source) =>
        target.id === self.id && (defOf(source).kind === 'Structure' || defOf(source).kind === 'Event'),
    },
  },

  // Beegarde – Faithful Honor
  'EBP02-055': {
    acts: [
      {
        label: 'Rest: get 2 Ingredient',
        zone: 'base',
        costs: [{ restSelf: true }],
        effect: getResource('ingredient', 2),
      },
    ],
  },

  // Lifmunk – Hidden Power
  'EBP02-056': { onGraveyard: (e) => e.addSouls(1, { rested: true }) },

  // Eikthyrdeer Terra – Will of Nature
  'EBP02-057': {
    onBeatOpponent: (e) => {
      const options = [...e.baseOf(e.me), ...e.baseOf(e.opp)].filter((c) => !isPal(c));
      for (const c of e.chooseUpTo(1, 'Choose up to 1 structure or gear to put into the graveyard.', options))
        e.destroy(c);
    },
  },

  // Digtoise – Pulverizing Whirl
  'EBP02-058': {
    acts: [
      {
        label: '+500 power, 1000 damage to a structure',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ ingredient: 2 }],
        effect: (e) => {
          e.modify(e.self, 'power', 500);
          const structures = [...e.structuresOf(e.me), ...e.structuresOf(e.opp)];
          for (const c of e.chooseUpTo(1, 'Choose up to 1 structure to deal 1000 damage to.', structures))
            e.damage(c, 1000);
        },
      },
    ],
  },

  // Beware of Mammorest Sign
  'EBP02-063': {
    acts: [
      {
        label: 'Deploy a Mammorest from hand',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ ingredient: 3 }],
        effect: (e) => {
          const options = e.hand(e.me).filter((c) => isPal(c) && e.isMainName(c, 'Mammorest') && e.canDeploy(c));
          const c = e.chooseOne('Choose 1 Mammorest to deploy.', options);
          if (c) e.deploy(c);
        },
      },
    ],
  },

  // Mill
  'EBP02-064': {
    acts: [
      {
        label: 'Assign: 3 Ingredient, 1 life, draw 1',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ ingredient: 1, assign: true }],
        effect: (e) => {
          e.gain('ingredient', 3);
          e.gainLife(1);
          e.draw(1);
        },
      },
    ],
  },

  // Electric Kitchen
  'EBP02-065': {
    acts: [
      {
        label: 'Assign 3: stand your Pals, +1000',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ ingredient: 3, assign: 3 }],
        effect: (e) => {
          e.gain('ingredient', 5);
          for (const c of e.palsOf(e.me)) {
            e.stand(c);
            e.modify(c, 'power', 1000);
          }
        },
      },
    ],
  },

  // Pioneer Ranch
  'EBP02-066': {
    acts: [
      {
        label: 'Assign: draw 1, stand a soul',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ assign: true }],
        effect: (e) => {
          e.draw(1);
          e.standSouls(1);
        },
      },
    ],
  },

  // Wooden Chest
  'EBP02-067': {
    acts: [
      {
        label: 'Put the top card underneath',
        zone: 'base',
        oncePerTurn: true,
        costs: [{}],
        effect: (e) => {
          const [top] = e.lookTop(1);
          if (top) e.putUnder(e.self, top);
        },
      },
      {
        label: 'Return the cards underneath to hand',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ souls: 2, assign: true }],
        effect: (e) => {
          for (const c of e.underneath(e.self)) e.addToHand(c);
        },
      },
    ],
  },

  // Lifmunk's Submachine Gun
  'EBP02-068': {
    watchers: [
      {
        on: 'palDeployed',
        whose: 'mine',
        filter: (_s, _self, c) => hasMainName(c, 'Lifmunk'),
        effect: (e) => {
          for (const c of e.chooseUpTo(2, 'Choose up to 2 Pals to get +300 power.', e.pals()))
            e.modify(c, 'power', 300);
        },
      },
    ],
    acts: restForPower(200),
  },

  // Refined Metal Axe
  'EBP02-069': {
    acts: restForPower(200, (e, c) => e.grantSkill(c, 'souls'), 'Rest: +200 power and a skill'),
    grants: { souls: { onBeatOpponent: (e) => e.standSouls(2) } },
  },

  // Old Bow
  'EBP02-070': {
    acts: restForPower(300, (e) => {
      if (e.souls() >= 10) e.destroy(e.self);
    }),
  },

  // Lily's Gambit
  'EBP02-071': {
    event: (e) => {
      const before = e.souls();
      e.addSouls(10);
      if (before >= 10) e.standSouls(e.souls());
    },
  },

  // Seed Machine Gun
  'EBP02-072': {
    event: (e) => {
      const c = e.chooseOne('Choose 1 Pal to get +300 power.', e.pals());
      if (c) e.modify(c, 'power', 300);
    },
  },

  // Frostallion Noct – Eternal Darkness
  'EBP02-073': {
    aura: { power: (_s, self, c) => (myPal(self, c) && c.id !== self.id ? 500 : 0) },
    endOfTurn: (e) => discardDownTo(e, e.opp, 4),
  },

  // Selyne – Saya's Moonlit Beacon (Nocturnal comes from its text)
  'EBP02-074': {
    handCostReduction: (s, self) => {
      const nocturnal = s.players[self.owner].graveyard.filter((id) => {
        const c = s.cards[id]!;
        return isPal(c) && hasKeyword(s, c, 'nocturnal');
      }).length;
      return nocturnal >= 10 && isNight(s) ? 5 : 0;
    },
  },

  // Tombat – Resonance of Shadows
  'EBP02-075': {
    onDeploy: (e) => {
      e.millTop(3);
      const options = e.graveyard(e.me).filter((c) => isPal(c) && isLegendary(c));
      for (const c of e.chooseUpTo(1, 'Choose up to 1 Legendary Pal to add to hand.', options)) e.addToHand(c);
    },
  },

  // Shroomer Noct – Spores of the Void
  'EBP02-077': {
    watchers: [
      {
        on: 'palAssigned',
        whose: 'mine',
        effect: (e) => {
          const pal = e.subject;
          if (!pal) return;
          const structure = pal.assignedTo ? e.s.cards[pal.assignedTo] : undefined;
          e.stand(pal);
          if (structure) e.blockAssign(pal, structure);
        },
      },
    ],
  },

  // Kitsun Noct – Umbral Prowler (Nocturnal comes from its text)
  'EBP02-078': {
    onDeploy: (e) => {
      for (const c of e.chooseUpTo(
        1,
        'Choose up to 1 ◇7 or greater Pal to get −1200.',
        e.pals((c) => costOf(c) >= 7),
      ))
        e.modify(c, 'power', -1200);
    },
  },

  // Nox – One-Way Ticket
  'EBP02-079': {
    onDeploy: (e) => {
      if (!revealLegendary(e)) return;
      const c = e.chooseOne('Choose 1 Pal to get −500 power.', e.pals());
      if (c) e.modify(c, 'power', -500);
    },
  },

  // Mau – Greed Beckons
  'EBP02-080': {
    onAssign: (e) => {
      if (!farming(e)) return;
      const c = e.chooseOne('Choose 1 card from your hand to discard.', e.hand(e.opp), e.opp);
      if (c) e.discard(c);
    },
  },

  // Sootseer – Grave Robber
  'EBP02-081': { onAttack: (e) => revealTopToHand(e, 3, 'Pal', isPal) },

  // Daedream – Blissful Dreams
  'EBP02-082': {
    onAttack: (e) => {
      if (!e.isNight()) return;
      const options = e.pals((c) => costOf(c) <= 4 && !c.rested);
      for (const c of e.chooseUpTo(1, 'Choose up to 1 standing ◇4 or less Pal to put into the graveyard.', options))
        e.destroy(c);
    },
  },

  // Electric Medicine Workbench
  'EBP02-087': {
    acts: [
      {
        label: 'Assign X: return X normal Pals from your graveyard',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ assign: 'X' }],
        effect: (e) => {
          const options = e
            .graveyard(e.me)
            .filter((c) => isPal(c) && isNormalPal(defOf(c)) && !e.hasKeyword(c, 'interrupt'));
          const n = Math.min(e.x, options.length);
          const picks = e.choose({
            prompt: `Choose ${n} normal Pals without Interrupt to return to hand.`,
            options,
            min: n,
            max: n,
          });
          for (const id of picks) e.addToHand(e.s.cards[id]!);
        },
      },
    ],
  },

  // Chandelier
  'EBP02-088': {
    acts: [millForNight],
    aura: { keywords: (s, self, c) => (myPal(self, c) && hasKeyword(s, c, 'nocturnal') ? ['retaliate'] : []) },
  },

  // Bear Trap (Small)
  'EBP02-089': {
    watchers: [
      {
        on: 'palAttacks',
        whose: 'opponent',
        filter: (_s, _self, c) => costOf(c) <= 5,
        effect: (e) => {
          if (e.subject) e.modify(e.subject, 'power', -500);
        },
      },
    ],
  },

  // Fine Bed
  'EBP02-090': {
    acts: [millForNight],
    endOfTurn: (e) => {
      if (!e.palsOf(e.me).some((c) => c.rested && e.hasKeyword(c, 'nocturnal'))) return;
      for (const c of e.chooseUpTo(
        1,
        'Choose up to 1 ◇3 or less Pal to put into the graveyard.',
        e.pals((c) => costOf(c) <= 3),
      ))
        e.destroy(c);
    },
  },

  // Dark Grenade
  'EBP02-091': {
    aura: {
      power: (s, self, c) => (s.activeSeat === self.owner && myPal(self, c) && colorOf(c) === 'Purple' ? 100 : 0),
    },
    acts: [
      {
        label: 'Rest: opponent loses up to 7 resources',
        zone: 'base',
        costs: [{ restSelf: true }],
        effect: (e) => {
          e.loseResources(e.opp, 7);
          e.destroy(e.self);
        },
      },
    ],
  },

  // Frostallion Noct Saddle
  'EBP02-092': {
    watchers: [
      {
        on: 'palDeployed',
        whose: 'mine',
        filter: (_s, _self, c) => hasMainName(c, 'Frostallion Noct'),
        effect: (e) => {
          const options = e.graveyard(e.me).filter((c) => isPal(c) && costOf(c) <= 3 && e.canDeploy(c));
          for (const c of e.chooseUpTo(1, 'Choose up to 1 ◇3 or less Pal to deploy.', options))
            e.deploy(c, { rested: true });
        },
      },
    ],
    acts: restForPower(200),
  },

  // Poison Arrow Crossbow
  'EBP02-093': {
    aura: { opponentCannotGainLife: true },
    acts: restForPower(200, (e) => {
      if (!hasBigPal(e)) return;
      for (const c of e.chooseUpTo(
        1,
        'Choose up to 1 ◇5 or less Pal to put into the graveyard.',
        e.pals((c) => costOf(c) <= 5),
      ))
        e.destroy(c);
    }),
  },

  // Zoe's Gambit
  'EBP02-094': {
    event: (e) => {
      for (const c of e.targetable(e.pals())) e.destroy(c);
    },
  },

  // Saya's Crescent Moon
  'EBP02-095': {
    event: (e) => {
      const c = e.chooseOne('Choose 1 Pal.', e.pals());
      if (!c) return;
      if (e.isNight()) e.destroy(c);
      else e.modify(c, 'power', -1000);
    },
  },

  // Poison Fog
  'EBP02-096': {
    event: (e) => {
      const c = e.chooseOne('Choose 1 Pal to get Retaliate.', e.pals());
      if (c) e.grant(c, 'retaliate');
    },
  },

  // Jetragon – Legendary Guardian Dragon
  'EBP02-097': {
    acts: [
      {
        label: 'Exile 2: Vigilance (and stand Legendaries)',
        zone: 'base',
        oncePerTurn: true,
        costs: [{ exileFromGraveyard: { count: 2, filter: (d) => isPalDef(d) && (d.cost ?? 0) >= 7 } }],
        effect: (e) => {
          e.grant(e.self, 'vigilance');
          if (!e.exiledForCost.every(isLegendary)) return;
          const options = e.pals((c) => isLegendary(c));
          for (const c of e.chooseUpTo(3, 'Choose up to 3 Legendary Pals to stand.', options)) e.stand(c);
        },
      },
    ],
  },

  // Melpaca – A Fluffy Gift
  'EBP02-098': {
    onAssign: (e) => {
      if (farming(e)) e.gainLife(1);
    },
  },

  // Awakening of Legends
  'EBP02-100': {
    event: (e) => {
      const found = searchTop(e, {
        look: 5,
        max: 1,
        what: 'Legendary Pal',
        filter: (d) => isPalDef(d) && /CONT@Legendary/.test(d.text),
        to: 'hand',
      });
      if (found.length === 0) e.addToHand(e.self);
    },
  },
};
