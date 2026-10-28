import type { CardDef } from './types.ts';

/** A searchable trait of a card's rules text. */
export interface CardFeature {
  id: string;
  label: string;
  group: 'Ability' | 'Timing' | 'Resource' | 'Keyword';
  test: (card: CardDef) => boolean;
}

const hasToken = (token: string) => (c: CardDef) => c.text.includes(token);

/** Matches a keyword the card has (or grants), not one it only refers to like "your 〈Nocturnal〉 Pals". */
const hasKeyword = (keyword: string) => {
  const re = new RegExp(`(?:@|^|\\n)\\s*${keyword}\\b`);
  return (c: CardDef) => re.test(c.text);
};

export const KEYWORDS = [
  'Brave',
  'Serious',
  'Interrupt',
  'Vigilance',
  'Taunt',
  'Stealth',
  'Retaliate',
  'Nocturnal',
  'Breakthrough',
  'Assault',
] as const;

export const CARD_FEATURES: CardFeature[] = [
  { id: 'act', label: 'ACT', group: 'Ability', test: hasToken('ACT@') },
  { id: 'auto', label: 'AUTO', group: 'Ability', test: hasToken('AUTO@') },
  { id: 'cont', label: 'CONT', group: 'Ability', test: hasToken('CONT@') },
  { id: 'vanilla', label: 'No text', group: 'Ability', test: (c) => c.text === '' },

  { id: 'on-deploy', label: 'On Deploy', group: 'Timing', test: hasToken('OnDeploy@') },
  { id: 'on-attack', label: 'On Attack', group: 'Timing', test: hasToken('OnAttack@') },
  { id: 'on-assign', label: 'On Assign', group: 'Timing', test: hasToken('OnAssign@') },
  { id: 'quick', label: 'Quick', group: 'Timing', test: hasToken('Quick@') },
  { id: 'hand-quick', label: 'Hand + Quick', group: 'Timing', test: hasToken('Hand@Quick@') },
  { id: 'hand', label: 'Works from hand', group: 'Timing', test: hasToken('Hand@') },
  { id: 'once-per-turn', label: '1/Turn', group: 'Timing', test: hasToken('1Turn@') },
  { id: 'night', label: 'Night', group: 'Timing', test: (c) => /\bnight\b/i.test(c.text) },

  { id: 'material', label: 'Material', group: 'Resource', test: hasToken('Material@') },
  { id: 'ingredient', label: 'Ingredient', group: 'Resource', test: hasToken('Ingredient@') },
  { id: 'damage', label: 'Deals damage', group: 'Resource', test: hasToken('Damage@') },
  { id: 'draw', label: 'Draws cards', group: 'Resource', test: (c) => /\bdraw \d/i.test(c.text) },
  { id: 'assign', label: 'Assigns Pals', group: 'Resource', test: (c) => /\bAssign \d+ Pal/i.test(c.text) },

  ...KEYWORDS.map((k): CardFeature => ({
    id: k.toLowerCase(),
    label: k,
    group: 'Keyword',
    test: hasKeyword(k),
  })),
];
