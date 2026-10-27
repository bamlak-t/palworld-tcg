/** Starter Set 01 (ESS01). */
import type { CardScript } from '../abilities.ts';
import { isPal, isStructure } from '../cards.ts';
import type { GameState, Seat } from '../types.ts';

const soulsOf = (s: GameState, seat: Seat) => s.players[seat].soulsStanding + s.players[seat].soulsRested;

export const ESS01: Record<string, CardScript> = {
  // Grizzbolt – Cascading Voltage
  'ESS01-001': {
    onDeploy: (e) => {
      for (const c of e.targetable(e.palsOf(e.opp))) e.damage(c, 300);
    },
  },

  // Chillet – Final Frostneedle
  'ESS01-002': { onBeatOpponent: (e) => e.draw(1) },

  // Depresso – Midnight Overdrive (Nocturnal comes from its text)
  'ESS01-003': {
    onDeploy: (e) => {
      if (!e.isNight()) return;
      const structures = [...e.structuresOf(e.me), ...e.structuresOf(e.opp)];
      for (const c of e.chooseUpTo(1, 'Choose up to 1 structure to get −500 durability.', structures))
        e.modify(c, 'power', -500);
    },
  },

  // Cattiva – Brimming Bravado
  'ESS01-004': {
    powerBonus: (s, self) => (soulsOf(s, self.owner) >= 5 ? 200 : 0) + (soulsOf(s, self.owner) >= 10 ? 200 : 0),
  },

  // Quivern – Breath of the Wyvern
  'ESS01-005': {
    onAttack: (e) => {
      if (!e.subject) return;
      const options = [...e.baseOf(e.me), ...e.baseOf(e.opp)].filter((c) => isPal(c) || isStructure(c));
      for (const c of e.chooseUpTo(1, 'Choose up to 1 Pal or structure to deal 700 damage to.', options))
        e.damage(c, 700);
    },
  },
};
