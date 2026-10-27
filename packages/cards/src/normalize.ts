import type { CardColor, CardDef, CardKind, Element, PalSubKind, Printing } from './types.ts';

/** Shape of one item from the official card-list API. */
export interface RawCard {
  id: number;
  picture: string;
  card_number: string;
  card_name: string;
  card_kind: string;
  card_kind_sub: string | null;
  rare: string;
  expansion: string;
  expansion_name: string;
  color: string | null;
  type: string | null;
  aptitude: string | null;
  cost: string | null;
  power: string | null;
  attack: string | null;
  text: string | null;
}

const NAME_SEPARATOR = ' – ';

const toInt = (v: string | null): number | null => {
  if (v == null || v.trim() === '') return null;
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
};

const splitList = (v: string | null): string[] =>
  (v ?? '').split('|').map((s) => s.trim()).filter(Boolean);

/** "EBP01-012SR" -> "EBP01-012" */
export const baseNumber = (cardNumber: string): string =>
  /^[A-Z]+\d*-\d+/.exec(cardNumber)?.[0] ?? cardNumber;

const isPromo = (number: string) => number.startsWith('EPR-');

export function normalizeCards(raw: RawCard[]): { cards: CardDef[]; warnings: string[] } {
  const warnings: string[] = [];
  const byName = new Map<string, RawCard[]>();
  for (const r of raw) {
    const group = byName.get(r.card_name) ?? [];
    group.push(r);
    byName.set(r.card_name, group);
  }

  const cards: CardDef[] = [];
  for (const [name, group] of byName) {
    const bases = [...new Set(group.map((r) => baseNumber(r.card_number)))].sort(
      (a, b) => Number(isPromo(a)) - Number(isPromo(b)) || a.localeCompare(b),
    );
    const canonical = group.find((r) => r.card_number === bases[0]) ?? group[0]!;

    const texts = new Set(group.map((r) => (r.text ?? '').trim()));
    if (texts.size > 1 && canonical.card_kind !== 'Soul') {
      warnings.push(`"${name}" has ${texts.size} different texts across printings`);
    }

    const sepIdx = name.indexOf(NAME_SEPARATOR);
    const printings: Printing[] = group
      .map((r) => ({ number: r.card_number, rarity: r.rare, set: r.expansion, picture: r.picture }))
      .sort((a, b) => a.number.localeCompare(b.number));

    cards.push({
      id: bases[0]!,
      name,
      mainName: sepIdx >= 0 ? name.slice(0, sepIdx) : name,
      subName: sepIdx >= 0 ? name.slice(sepIdx + NAME_SEPARATOR.length) : null,
      kind: canonical.card_kind as CardKind,
      subKind: (canonical.card_kind_sub || null) as PalSubKind | null,
      color: (canonical.color || null) as CardColor | null,
      elements: splitList(canonical.type) as Element[],
      workSuitability: splitList(canonical.aptitude),
      cost: toInt(canonical.cost),
      power: toInt(canonical.power),
      strike: toInt(canonical.attack),
      text: (canonical.text ?? '').trim(),
      sets: [...new Set(group.map((r) => r.expansion))].sort(),
      printings,
    });
  }

  cards.sort((a, b) => a.id.localeCompare(b.id));
  return { cards, warnings };
}
