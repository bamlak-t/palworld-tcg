/**
 * Pulls the official card list and writes packages/cards/data/cards.json.
 * Usage: npm run sync-cards
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { normalizeCards, type RawCard } from '../packages/cards/src/normalize.ts';
import type { CardDatabase } from '../packages/cards/src/types.ts';

const SITE = 'https://en.palworld-official-cardgame.com';
const API = `${SITE}/manage/card-list-user`;
const PER_PAGE = 100;
const OUT = fileURLToPath(new URL('../packages/cards/data/cards.json', import.meta.url));

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}

async function fetchAllCards(): Promise<RawCard[]> {
  const items: RawCard[] = [];
  for (let page = 1; ; page++) {
    const data = await getJson<{ total: number; items: RawCard[] }>(
      `${API}/list?page=${page}&per_page=${PER_PAGE}`,
    );
    items.push(...data.items);
    if (data.items.length === 0 || items.length >= data.total) break;
  }
  return items;
}

const form = await getJson<{ textIcons: Record<string, string> }>(`${API}/createSearchForm`);
const raw = await fetchAllCards();
const { cards, warnings } = normalizeCards(raw);

const sets: Record<string, string> = {};
for (const r of raw) sets[r.expansion] = r.expansion_name;

const db: CardDatabase = {
  syncedAt: new Date().toISOString(),
  source: `${API}/list`,
  imageBase: `${SITE}/wordpress/wp-content/images/cardlist/`,
  textIconBase: `${SITE}/wordpress/wp-content/images/texticon/`,
  textIcons: form.textIcons,
  sets,
  cards,
};

await writeFile(OUT, JSON.stringify(db, null, 2) + '\n', 'utf8');

for (const w of warnings) console.warn(`warning: ${w}`);
const byKind = Object.entries(
  cards.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.kind]: (acc[c.kind] ?? 0) + 1 }), {}),
);
console.log(`${raw.length} printings -> ${cards.length} unique cards (${byKind.map(([k, n]) => `${n} ${k}`).join(', ')})`);
console.log(`wrote ${OUT}`);
