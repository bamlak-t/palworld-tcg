import db from '../data/cards.json' with { type: 'json' };
import type { CardDatabase, CardDef, Printing } from './types.ts';

export * from './types.ts';
export { tokenizeText, type TextToken } from './text.ts';
export { CARD_FEATURES, KEYWORDS, type CardFeature } from './features.ts';
export { TEXT_BOX, hasStandardFrame } from './frames.ts';

export const cardDb = db as CardDatabase;

const byId = new Map(cardDb.cards.map((c) => [c.id, c]));
const byName = new Map(cardDb.cards.map((c) => [c.name, c]));

export const getCard = (id: string): CardDef | undefined => byId.get(id);
export const getCardByName = (name: string): CardDef | undefined => byName.get(name);

export const imageUrl = (p: Printing | CardDef): string => {
  const picture = 'picture' in p ? p.picture : p.printings[0]!.picture;
  return cardDb.imageBase + picture;
};

export const textIconUrl = (file: string): string => cardDb.textIconBase + encodeURI(file);

export const isLuckyPal = (c: CardDef): boolean => c.subKind === 'Lucky Pal';
