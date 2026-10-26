import { CARD_FEATURES, cardDb, type CardDef } from '@pal/cards';

/** 'has' = must have the feature, 'lacks' = must not have it. Absent = don't care. */
export type FeatureMode = 'has' | 'lacks';
export type Range = [number, number];
export type SortKey = 'number' | 'name' | 'cost' | 'power' | 'strike';

export interface CardFilters {
  query: string;
  sets: string[];
  kinds: string[];
  subKind: '' | 'Normal Pal' | 'Lucky Pal';
  colors: string[];
  elements: string[];
  work: string[];
  rarities: string[];
  cost: Range;
  power: Range;
  strike: Range;
  features: Record<string, FeatureMode>;
  sort: SortKey;
}

export const browsableCards = cardDb.cards.filter((c) => c.kind !== 'Soul');

const uniqueSorted = (values: Iterable<string>) => [...new Set(values)].sort();
const maxOf = (pick: (c: CardDef) => number | null) => Math.max(0, ...browsableCards.map((c) => pick(c) ?? 0));

export const FILTER_OPTIONS = {
  sets: uniqueSorted(browsableCards.flatMap((c) => c.sets)),
  kinds: ['Pal', 'Structure', 'Gear', 'Event'],
  colors: ['Red', 'Blue', 'Green', 'Purple'],
  elements: uniqueSorted(browsableCards.flatMap((c) => c.elements)),
  work: uniqueSorted(browsableCards.flatMap((c) => c.workSuitability)),
  rarities: uniqueSorted(browsableCards.flatMap((c) => c.printings.map((p) => p.rarity))),
  maxCost: maxOf((c) => c.cost),
  maxPower: maxOf((c) => c.power),
  maxStrike: maxOf((c) => c.strike),
};

export const DEFAULT_FILTERS: CardFilters = {
  query: '',
  sets: [],
  kinds: [],
  subKind: '',
  colors: [],
  elements: [],
  work: [],
  rarities: [],
  cost: [0, FILTER_OPTIONS.maxCost],
  power: [0, FILTER_OPTIONS.maxPower],
  strike: [0, FILTER_OPTIONS.maxStrike],
  features: {},
  sort: 'number',
};

const isFullRange = (r: Range, max: number) => r[0] === 0 && r[1] === max;

/** A narrowed range excludes cards that don't have that stat at all. */
const inRange = (v: number | null, r: Range, max: number) =>
  isFullRange(r, max) || (v != null && v >= r[0] && v <= r[1]);

const anyOf = (selected: string[], values: string[]) =>
  selected.length === 0 || values.some((v) => selected.includes(v));

const featureById = new Map(CARD_FEATURES.map((f) => [f.id, f]));

export function applyFilters(f: CardFilters): CardDef[] {
  const q = f.query.trim().toLowerCase();
  const features = Object.entries(f.features);

  const results = browsableCards.filter(
    (c) =>
      (!q || c.name.toLowerCase().includes(q) || c.text.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)) &&
      anyOf(f.sets, c.sets) &&
      anyOf(f.kinds, [c.kind]) &&
      (!f.subKind || c.subKind === f.subKind) &&
      anyOf(f.colors, c.color ? [c.color] : []) &&
      anyOf(f.elements, c.elements) &&
      anyOf(f.work, c.workSuitability) &&
      anyOf(
        f.rarities,
        c.printings.map((p) => p.rarity),
      ) &&
      inRange(c.cost, f.cost, FILTER_OPTIONS.maxCost) &&
      inRange(c.power, f.power, FILTER_OPTIONS.maxPower) &&
      inRange(c.strike, f.strike, FILTER_OPTIONS.maxStrike) &&
      features.every(([id, mode]) => featureById.get(id)!.test(c) === (mode === 'has')),
  );

  const num = (v: number | null) => v ?? -1;
  const sorters: Record<SortKey, (a: CardDef, b: CardDef) => number> = {
    number: (a, b) => a.id.localeCompare(b.id),
    name: (a, b) => a.name.localeCompare(b.name),
    cost: (a, b) => num(a.cost) - num(b.cost),
    power: (a, b) => num(b.power) - num(a.power),
    strike: (a, b) => num(b.strike) - num(a.strike),
  };
  return results.sort((a, b) => sorters[f.sort](a, b) || a.id.localeCompare(b.id));
}

/** Number of filter groups that differ from the defaults (for the "Filters (3)" badge). */
export function countActiveFilters(f: CardFilters): number {
  const d = DEFAULT_FILTERS;
  return (
    [
      f.query.trim() !== '',
      f.sets.length > 0,
      f.kinds.length > 0,
      f.subKind !== '',
      f.colors.length > 0,
      f.elements.length > 0,
      f.work.length > 0,
      f.rarities.length > 0,
      f.cost.join() !== d.cost.join(),
      f.power.join() !== d.power.join(),
      f.strike.join() !== d.strike.join(),
    ].filter(Boolean).length + Object.keys(f.features).length
  );
}
