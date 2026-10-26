/** Saved decks (in this browser) plus the built-in trial decks. */
import { useSyncExternalStore } from 'react';
import { getCard, getCardByName, isLuckyPal } from '@pal/cards';
import { isImplemented, MAX_COPIES, MAX_LUCKY, MAIN_DECK_SIZE, TRIAL_DECKS, validateDeck } from '@pal/engine';

export interface DeckList {
  id: string;
  name: string;
  /** Card id → copies. */
  cards: Record<string, number>;
  /** Trial decks ship with the app and can't be edited (copy them instead). */
  builtIn?: boolean;
  updatedAt: number;
}

const STORAGE_KEY = 'pal-decks';
const CHANGE_EVENT = 'pal-decks-changed';

const counts = (ids: readonly string[]) =>
  ids.reduce<Record<string, number>>((acc, id) => ({ ...acc, [id]: (acc[id] ?? 0) + 1 }), {});

export const BUILT_IN_DECKS: DeckList[] = Object.entries(TRIAL_DECKS).map(([key, d]) => ({
  id: `trial:${key}`,
  name: d.name,
  cards: counts(d.cards),
  builtIn: true,
  updatedAt: 0,
}));

let cache: { raw: string | null; decks: DeckList[] } = { raw: null, decks: [] };

function readSaved(): DeckList[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: no saved decks.
  }
  if (raw === cache.raw) return cache.decks;
  let decks: DeckList[] = [];
  try {
    decks = raw ? (JSON.parse(raw) as DeckList[]) : [];
  } catch {
    decks = [];
  }
  cache = { raw, decks };
  return decks;
}

function writeSaved(decks: DeckList[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
  } catch {
    // Non-fatal: the deck just won't persist.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

const subscribe = (onChange: () => void) => {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
};

export function useDecks() {
  const saved = useSyncExternalStore(subscribe, readSaved, () => []);
  return {
    saved,
    all: [...BUILT_IN_DECKS, ...saved],
    save(deck: DeckList) {
      const next = { ...deck, builtIn: undefined, updatedAt: Date.now() };
      const rest = readSaved().filter((d) => d.id !== deck.id);
      writeSaved([next, ...rest]);
      return next;
    },
    remove(id: string) {
      writeSaved(readSaved().filter((d) => d.id !== id));
    },
  };
}

export const newDeckId = () => `deck:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** The deck as a flat list of card ids, as games and the server expect. */
export const expandDeck = (deck: DeckList): string[] =>
  Object.entries(deck.cards).flatMap(([id, n]) => Array<string>(n).fill(id));

export const deckSize = (deck: DeckList) => Object.values(deck.cards).reduce((a, b) => a + b, 0);
export const luckyCount = (deck: DeckList) =>
  Object.entries(deck.cards).reduce((n, [id, c]) => n + (getCard(id) && isLuckyPal(getCard(id)!) ? c : 0), 0);

export interface DeckCheck {
  /** Rule problems: the deck can't be played until these are fixed. */
  problems: string[];
  /** Cards whose text the engine doesn't enforce yet (they play with stats only). */
  unscripted: string[];
  legal: boolean;
}

export function checkDeck(deck: DeckList): DeckCheck {
  const problems = validateDeck(expandDeck(deck));
  const unscripted = Object.keys(deck.cards).filter((id) => !isImplemented(id));
  return { problems, unscripted, legal: problems.length === 0 };
}

export const DECK_RULES = { size: MAIN_DECK_SIZE, copies: MAX_COPIES, lucky: MAX_LUCKY };

// ---------------------------------------------------------------------------
// Text import/export: one line per card, "4 ETD01-002 Jolthog – Shocking Yet Innocent".
// ---------------------------------------------------------------------------

export function deckToText(deck: DeckList): string {
  return Object.entries(deck.cards)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, n]) => `${n} ${id} ${getCard(id)?.name ?? ''}`.trim())
    .join('\n');
}

/** Parses "4 ETD01-002 …", "4x ETD01-002" or "4 Jolthog – Shocking Yet Innocent". */
export function deckFromText(text: string): { cards: Record<string, number>; unknown: string[] } {
  const cards: Record<string, number> = {};
  const unknown: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(\d+)\s*x?\s+(.+)$/i.exec(line);
    if (!m) {
      unknown.push(line);
      continue;
    }
    const n = Number(m[1]);
    const rest = m[2]!.trim();
    const byId = getCard(rest.split(/\s+/)[0]!.toUpperCase());
    const card = byId ?? getCardByName(rest);
    if (!card || card.kind === 'Soul') {
      unknown.push(line);
      continue;
    }
    cards[card.id] = (cards[card.id] ?? 0) + n;
  }
  return { cards, unknown };
}
