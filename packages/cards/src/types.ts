export type CardKind = 'Pal' | 'Structure' | 'Gear' | 'Event' | 'Soul';
export type PalSubKind = 'Normal Pal' | 'Lucky Pal';
export type CardColor = 'Red' | 'Blue' | 'Green' | 'Purple';
export type Element =
  | 'Neutral' | 'Fire' | 'Water' | 'Grass' | 'Electric'
  | 'Ground' | 'Ice' | 'Dark' | 'Dragon';

/** One physical printing (alt arts, promos) of a card. */
export interface Printing {
  number: string;
  rarity: string;
  set: string;
  /** Path relative to the official card image base URL. */
  picture: string;
  /** Full-art printings print their text over the art, not in the standard text box. */
  frame?: 'standard' | 'fullArt';
}

/** A unique card, identified by name. All printings share rules text. */
export interface CardDef {
  /** Canonical id: the lowest non-promo card number, e.g. "EBP01-012". */
  id: string;
  name: string;
  mainName: string;
  subName: string | null;
  kind: CardKind;
  subKind: PalSubKind | null;
  color: CardColor | null;
  elements: Element[];
  workSuitability: string[];
  cost: number | null;
  /** Power for Pals, durability for structures. */
  power: number | null;
  strike: number | null;
  /** Raw official text with icon tokens like "ACT@", "Power@", "◇3". */
  text: string;
  sets: string[];
  printings: Printing[];
}

export interface CardDatabase {
  syncedAt: string;
  source: string;
  imageBase: string;
  textIconBase: string;
  /** Maps text tokens (e.g. "ACT@") to icon file names under textIconBase. */
  textIcons: Record<string, string>;
  sets: Record<string, string>;
  cards: CardDef[];
}
