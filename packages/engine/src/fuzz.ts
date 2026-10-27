/** Random-play testing: builds random legal decks and plays random legal actions. */
import { expect } from 'vitest';
import { cardDb } from '@pal/cards';
import { createGame } from './engine.ts';
import { copyLimit, MAIN_DECK_SIZE, MAX_LUCKY, validateDeck } from './deck.ts';
import { getLegalActions } from './legal.ts';
import { actThrough } from './testkit.ts';
import type { Action, GameState, Seat } from './types.ts';

export function lcg(seed: number) {
  let r = seed;
  return <T>(xs: T[]): T => {
    r = (r * 1103515245 + 12345) & 0x7fffffff;
    return xs[r % xs.length]!;
  };
}

/** A random legal deck from the given sets. */
export function randomDeck(sets: string[], seed: number): string[] {
  const pick = lcg(seed);
  const pool = cardDb.cards.filter((c) => c.kind !== 'Soul' && sets.some((set) => c.id.startsWith(set)));
  const deck: string[] = [];
  const counts = new Map<string, number>();
  let lucky = 0;
  while (deck.length < MAIN_DECK_SIZE) {
    const c = pick(pool);
    const n = counts.get(c.id) ?? 0;
    if (n >= Math.min(copyLimit(c.id), 4)) continue;
    if (c.subKind === 'Lucky Pal' && lucky >= MAX_LUCKY) continue;
    if (c.subKind === 'Lucky Pal') lucky++;
    counts.set(c.id, n + 1);
    deck.push(c.id);
  }
  expect(validateDeck(deck)).toEqual([]);
  return deck;
}

/** Every card a player owns, wherever it is (including under structures). */
export function ownedCardCount(s: GameState, seat: Seat): number {
  const p = s.players[seat];
  const under = Object.values(s.cards).flatMap((c) => c.under ?? []);
  const owned = (ids: string[]) => ids.filter((id) => s.cards[id]!.owner === seat).length;
  return (
    p.deck.length +
    p.hand.length +
    p.base.length +
    p.graveyard.length +
    p.exile.length +
    owned(s.resolutionZone) +
    owned(under)
  );
}

/** Plays one random game to the end, checking invariants after every action. */
export function playRandomGame(decks: [string[], string[]], seed: number, maxSteps = 3000): GameState {
  let { state: s } = createGame(seed, [
    { name: 'A', deck: decks[0] },
    { name: 'B', deck: decks[1] },
  ]);
  const pick = lcg(seed * 7 + 1);
  for (let step = 0; step < maxSteps && !s.result; step++) {
    const seat: Seat = s.pending ? s.pending.seat : s.activeSeat;
    let action: Action;
    if (s.pending?.kind === 'overload') {
      const { candidates, mustKeep, keepCount } = s.pending;
      const rest = candidates.filter((id) => !mustKeep.includes(id));
      action = { type: 'chooseOverload', keep: [...mustKeep, ...rest].slice(0, keepCount) };
    } else {
      const legal = getLegalActions(s, seat);
      expect(legal.length, `no legal actions (seed ${seed}, step ${step})`).toBeGreaterThan(0);
      // Bias towards doing something other than ending the turn.
      const nonEnd = legal.filter((a) => a.type !== 'endTurn');
      action = nonEnd.length > 0 && pick([true, true, true, false]) ? pick(nonEnd) : pick(legal);
    }
    try {
      s = actThrough(s, seat, action).s;
    } catch (e) {
      throw new Error(`seed ${seed}, step ${step}, ${JSON.stringify(action)}: ${(e as Error).message}`, { cause: e });
    }
    for (const p of [0, 1] as const) {
      expect(ownedCardCount(s, p), `card count (seed ${seed}, step ${step})`).toBe(50);
      const pl = s.players[p];
      expect(pl.soulDeck + pl.soulsStanding + pl.soulsRested).toBe(10);
      expect(pl.soulsStanding).toBeGreaterThanOrEqual(0);
      expect(pl.material).toBeGreaterThanOrEqual(0);
      expect(pl.ingredient).toBeGreaterThanOrEqual(0);
    }
  }
  return s;
}
