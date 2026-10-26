/**
 * Pulls the official card list and writes packages/cards/data/cards.json.
 * Usage: npm run sync-cards
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { FULL_ART_THRESHOLD, parchmentFraction, TEXT_BOX } from '../packages/cards/src/frames.ts';
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
    const data = await getJson<{ total: number; items: RawCard[] }>(`${API}/list?page=${page}&per_page=${PER_PAGE}`);
    items.push(...data.items);
    if (data.items.length === 0 || items.length >= data.total) break;
  }
  return items;
}

const IMAGE_BASE = `${SITE}/wordpress/wp-content/images/cardlist/`;

/** Tells standard frames from full-art printings by looking for the parchment text box. */
async function detectFrames(cards: CardDatabase['cards']) {
  const jobs = cards.flatMap((card) => {
    const box = TEXT_BOX[card.kind];
    return box ? card.printings.map((printing) => ({ printing, box })) : [];
  });
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const { printing, box } = jobs[next++]!;
      const res = await fetch(IMAGE_BASE + printing.picture);
      if (!res.ok) throw new Error(`${res.status} for ${printing.picture}`);
      const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
      printing.frame =
        parchmentFraction(png.data, png.width, png.height, box) >= FULL_ART_THRESHOLD ? 'standard' : 'fullArt';
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return jobs.filter((j) => j.printing.frame === 'fullArt').length;
}

const form = await getJson<{ textIcons: Record<string, string> }>(`${API}/createSearchForm`);
const raw = await fetchAllCards();
const { cards, warnings } = normalizeCards(raw);
const fullArt = await detectFrames(cards);

const sets: Record<string, string> = {};
for (const r of raw) sets[r.expansion] = r.expansion_name;

const db: CardDatabase = {
  syncedAt: new Date().toISOString(),
  source: `${API}/list`,
  imageBase: IMAGE_BASE,
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
console.log(
  `${raw.length} printings -> ${cards.length} unique cards (${byKind.map(([k, n]) => `${n} ${k}`).join(', ')})`,
);
console.log(`${fullArt} full-art printings (no text overlay)`);
console.log(`wrote ${OUT}`);
