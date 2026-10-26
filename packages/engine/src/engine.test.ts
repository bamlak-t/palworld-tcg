import { describe, expect, it } from 'vitest';
import { apply, createGame, getLegalActions, validateDeck, viewFor } from './index.ts';
import type { Action, GameEvent, GameState, Seat } from './types.ts';

// --- fixtures ---------------------------------------------------------------

const LUCKY = ['ETD01-001', 'ETD01-007', 'ETD01-017', 'ETD01-018']; // Grizzbolt, Blazamut, Suzaku Aqua, Mammorest Cryst
const NORMAL_PALS = [
  'ETD01-002',
  'ETD01-003',
  'ETD01-004',
  'ETD01-005',
  'ETD01-006',
  'ETD01-013',
  'ETD01-014',
  'ETD01-015',
  'ETD01-016',
  'ETD01-023',
  'ETD01-024',
];
const STRUCTURE = 'ETD01-008'; // Stone Pit, cost 1, durability 600
const EVENT = 'ETD01-011'; // Ignis Breath, cost 2

/** 50 cards: 8 Lucky Pals, 44 normal Pals... trimmed to 50 with 2 structures. */
function trialDeck(): string[] {
  const deck = [...LUCKY, ...LUCKY];
  for (const id of NORMAL_PALS) deck.push(id, id, id, id);
  return [...deck, STRUCTURE, STRUCTURE].slice(0, 50);
}

function act(s: GameState, seat: Seat, action: Action): { s: GameState; events: GameEvent[] } {
  const r = apply(s, seat, action);
  if (!r.ok) throw new Error(`${action.type} rejected: ${r.error}`);
  return { s: r.state, events: r.events };
}

function reject(s: GameState, seat: Seat, action: Action): string {
  const r = apply(s, seat, action);
  if (r.ok) throw new Error(`${action.type} should have been rejected`);
  return r.error;
}

/** Plays setup with seat 0 going first and no redraws. Returns turn 1, seat 0, main phase. */
function toMain(seed = 1): GameState {
  let { state: s } = createGame(seed, [
    { name: 'Alice', deck: trialDeck() },
    { name: 'Bob', deck: trialDeck() },
  ]);
  s = act(s, s.pending!.seat, { type: 'chooseFirstPlayer', first: 0 }).s;
  s = act(s, 0, { type: 'mulligan', redraw: false }).s;
  s = act(s, 1, { type: 'mulligan', redraw: false }).s;
  return s;
}

/** Test helper: rewrite a card instance in place (tests only). */
function setCard(s: GameState, id: string, cardId: string) {
  s.cards[id]!.cardId = cardId;
}

/** Test helper: put a fresh copy of a card straight into a player's base. */
function putInBase(s: GameState, seat: Seat, cardId: string, opts: { rested?: boolean } = {}): string {
  const id = `t${Object.keys(s.cards).length}`;
  s.cards[id] = {
    id,
    cardId,
    owner: seat,
    rested: !!opts.rested,
    damage: 0,
    modifiers: [],
    placedAt: 0,
    assignedTo: null,
  };
  s.players[seat].base.push(id);
  return id;
}

const cardCount = (s: GameState, seat: Seat) => {
  const p = s.players[seat];
  return p.deck.length + p.hand.length + p.base.length + p.graveyard.length + p.exile.length;
};

// --- tests ------------------------------------------------------------------

describe('deck construction (§6.1)', () => {
  it('accepts the trial deck', () => {
    expect(validateDeck(trialDeck())).toEqual([]);
  });

  it('rejects wrong size, too many copies and too many Lucky Pals', () => {
    expect(validateDeck(trialDeck().slice(0, 49))[0]).toMatch(/exactly 50/);
    const fiveCopies = [...trialDeck().slice(0, 45), ...Array(5).fill('ETD01-002')];
    expect(validateDeck(fiveCopies).join()).toMatch(/At most 4 copies/);
    const nineLucky = [...trialDeck().slice(0, 49), 'ETD02-006'];
    expect(validateDeck(nineLucky).join()).toMatch(/At most 8 Lucky/);
  });
});

describe('setup (§6.2)', () => {
  it('lets a random player choose, gives the second player 1 soul, and deals 5 each', () => {
    const { state } = createGame(7, [
      { name: 'Alice', deck: trialDeck() },
      { name: 'Bob', deck: trialDeck() },
    ]);
    expect(state.pending?.kind).toBe('chooseFirstPlayer');
    const chooser = state.pending!.seat;
    const s = act(state, chooser, { type: 'chooseFirstPlayer', first: 1 }).s;
    expect(s.players[0].soulsStanding).toBe(1);
    expect(s.players[1].soulsStanding).toBe(0);
    expect(s.players[0].hand).toHaveLength(5);
    expect(s.players[1].hand).toHaveLength(5);
    expect(s.pending).toEqual({ kind: 'mulligan', seat: 1 });
  });

  it('allows one redraw that keeps the hand at 5', () => {
    let { state: s } = createGame(3, [
      { name: 'Alice', deck: trialDeck() },
      { name: 'Bob', deck: trialDeck() },
    ]);
    s = act(s, s.pending!.seat, { type: 'chooseFirstPlayer', first: 0 }).s;
    const before = [...s.players[0].hand];
    s = act(s, 0, { type: 'mulligan', redraw: true }).s;
    expect(s.players[0].hand).toHaveLength(5);
    expect(s.players[0].deck).toHaveLength(45);
    expect(s.players[0].hand).not.toEqual(before);
  });

  it('starts turn 1: the first player skips their draw and gains 2 souls', () => {
    const s = toMain();
    expect(s.turn).toBe(1);
    expect(s.phase).toBe('main');
    expect(s.players[0].hand).toHaveLength(5);
    expect(s.players[0].soulsStanding).toBe(2);
    expect(s.players[0].life).toBe(10);
  });
});

describe('turn structure (§7)', () => {
  it('second player draws, gains souls on top of their starting soul, and everything stands', () => {
    let s = toMain();
    s = act(s, 0, { type: 'endTurn' }).s;
    expect(s.activeSeat).toBe(1);
    expect(s.turn).toBe(2);
    expect(s.players[1].hand).toHaveLength(6);
    expect(s.players[1].soulsStanding).toBe(3);
    expect(s.players[1].soulDeck).toBe(7);
  });

  it('stops gaining souls once all 10 are out', () => {
    let s = toMain();
    for (let i = 0; i < 12; i++) s = act(s, s.activeSeat, { type: 'endTurn' }).s;
    expect(s.players[0].soulDeck).toBe(0);
    expect(s.players[0].soulsStanding + s.players[0].soulsRested).toBe(10);
  });

  it("rejects actions on the opponent's turn", () => {
    const s = toMain();
    expect(reject(s, 1, { type: 'endTurn' })).toMatch(/not your turn/);
  });
});

describe('playing cards (§8.2, §10.4)', () => {
  it('rests souls equal to the cost and deploys the card standing', () => {
    const s0 = toMain();
    const id = s0.players[0].hand[0]!;
    setCard(s0, id, 'ETD01-002'); // Jolthog, cost 2
    const { s } = act(s0, 0, { type: 'playCard', cardId: id });
    expect(s.players[0].base).toContain(id);
    expect(s.cards[id]!.rested).toBe(false);
    expect(s.players[0].soulsStanding).toBe(0);
    expect(s.players[0].soulsRested).toBe(2);
  });

  it("can't play a card that costs more than your standing souls", () => {
    const s = toMain();
    const id = s.players[0].hand[0]!;
    setCard(s, id, 'ETD01-006'); // cost 6
    expect(reject(s, 0, { type: 'playCard', cardId: id })).toMatch(/Not enough souls/);
  });

  it('sends events to the graveyard after resolving', () => {
    const s0 = toMain();
    const id = s0.players[0].hand[0]!;
    setCard(s0, id, EVENT);
    const { s } = act(s0, 0, { type: 'playCard', cardId: id });
    expect(s.players[0].graveyard).toContain(id);
  });

  it('allows paying 3 souls to draw once per turn (§8.5)', () => {
    let s = toMain();
    s.players[0].soulsStanding = 6;
    s = act(s, 0, { type: 'soulDraw' }).s;
    expect(s.players[0].hand).toHaveLength(6);
    expect(reject(s, 0, { type: 'soulDraw' })).toMatch(/once per turn/);
  });

  it('never mutates the input state', () => {
    const s = toMain();
    const snapshot = JSON.stringify(s);
    act(s, 0, { type: 'endTurn' });
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe('battle (§9)', () => {
  it('lets Pals attack the turn they are deployed, and rests the attacker', () => {
    const s0 = toMain();
    const atk = putInBase(s0, 0, 'ETD01-004'); // Foxparks 400 / strike 2
    const { s, events } = act(s0, 0, { type: 'attack', attackerId: atk, target: { kind: 'player', seat: 1 } });
    expect(s.cards[atk]!.rested).toBe(true);
    expect(events.some((e) => e.type === 'attackDeclared')).toBe(true);
  });

  it("can't target standing Pals", () => {
    const s = toMain();
    const atk = putInBase(s, 0, 'ETD01-004');
    const standing = putInBase(s, 1, 'ETD01-002');
    expect(reject(s, 0, { type: 'attack', attackerId: atk, target: { kind: 'card', id: standing } })).toMatch(
      /valid attack target/,
    );
  });

  it('Pals deal power to each other; the weaker one is destroyed', () => {
    const s0 = toMain();
    const atk = putInBase(s0, 0, 'ETD01-006'); // Mossanda Lux 1100
    const def = putInBase(s0, 1, 'ETD01-005', { rested: true }); // Arsox 800
    const { s, events } = act(s0, 0, { type: 'attack', attackerId: atk, target: { kind: 'card', id: def } });
    expect(s.players[1].graveyard).toContain(def);
    expect(s.players[0].base).toContain(atk);
    expect(s.cards[atk]!.damage).toBe(800);
    expect(events.some((e) => e.type === 'destroyed' && e.instanceId === def)).toBe(true);
    expect(s.battle).toBeNull();
  });

  it("structures don't hit back (§9.6.3.2)", () => {
    const s0 = toMain();
    const atk = putInBase(s0, 0, 'ETD01-004'); // 400
    const st = putInBase(s0, 1, STRUCTURE, { rested: true }); // durability 600
    const { s } = act(s0, 0, { type: 'attack', attackerId: atk, target: { kind: 'card', id: st } });
    expect(s.cards[atk]!.damage).toBe(0);
    expect(s.cards[st]!.damage).toBe(400);
    expect(s.players[1].base).toContain(st);
  });

  it('asks the defender to block, and the blocker becomes the target', () => {
    let s = toMain();
    const atk = putInBase(s, 0, 'ETD01-004'); // 400
    const blocker = putInBase(s, 1, 'ETD01-006'); // 1100, standing
    s = act(s, 0, { type: 'attack', attackerId: atk, target: { kind: 'player', seat: 1 } }).s;
    expect(s.pending).toEqual({ kind: 'block', seat: 1, options: [blocker] });
    expect(getLegalActions(s, 0)).toEqual([]);

    s = act(s, 1, { type: 'block', blockerId: blocker }).s;
    expect(s.players[0].graveyard).toContain(atk);
    expect(s.cards[blocker]!.rested).toBe(true);
    expect(s.players[1].life).toBe(10);
  });

  it('clears damage at the end of the turn (§7.6.3)', () => {
    let s = toMain();
    const atk = putInBase(s, 0, 'ETD01-006');
    const def = putInBase(s, 1, 'ETD01-002', { rested: true });
    s = act(s, 0, { type: 'attack', attackerId: atk, target: { kind: 'card', id: def } }).s;
    expect(s.cards[atk]!.damage).toBe(300);
    s = act(s, 0, { type: 'endTurn' }).s;
    expect(s.cards[atk]!.damage).toBe(0);
  });
});

describe('player damage (§11.2)', () => {
  function attackPlayer(strikeCard: string, topOfDeck: string[]) {
    const s0 = toMain();
    const atk = putInBase(s0, 0, strikeCard);
    topOfDeck.forEach((cardId, i) => setCard(s0, s0.players[1].deck[i]!, cardId));
    return act(s0, 0, { type: 'attack', attackerId: atk, target: { kind: 'player', seat: 1 } });
  }

  it('mills cards equal to the damage, then loses that much life', () => {
    const { s, events } = attackPlayer('ETD01-004', ['ETD01-002', 'ETD01-003']); // strike 2
    expect(s.players[1].life).toBe(8);
    expect(s.players[1].graveyard).toHaveLength(2);
    expect(events.filter((e) => e.type === 'milled')).toHaveLength(2);
  });

  it('a Lucky Pal cancels the damage, but milled cards stay milled', () => {
    const { s, events } = attackPlayer('ETD01-001', ['ETD01-002', 'ETD01-007', 'ETD01-003']); // strike 4, 2nd is Lucky
    expect(s.players[1].life).toBe(10);
    expect(s.players[1].graveyard).toHaveLength(2);
    expect(events.some((e) => e.type === 'damageCancelled')).toBe(true);
    expect(s.players[1].damageTaken).toBe(0);
  });

  it('ends the game when life reaches 0', () => {
    const s0 = toMain();
    s0.players[1].life = 2;
    const atk = putInBase(s0, 0, 'ETD01-004');
    s0.players[1].deck.slice(0, 2).forEach((id) => setCard(s0, id, 'ETD01-002'));
    const { s } = act(s0, 0, { type: 'attack', attackerId: atk, target: { kind: 'player', seat: 1 } });
    expect(s.result).toEqual({ winner: 0, reason: 'Bob ran out of life' });
    expect(apply(s, 0, { type: 'endTurn' })).toEqual({ ok: false, error: 'The game is over.' });
  });

  it('loses when the deck runs out (§11.3.2)', () => {
    const s0 = toMain();
    const atk = putInBase(s0, 0, 'ETD01-004');
    s0.players[1].deck = s0.players[1].deck.slice(0, 2);
    s0.players[1].deck.forEach((id) => setCard(s0, id, 'ETD01-002'));
    const { s } = act(s0, 0, { type: 'attack', attackerId: atk, target: { kind: 'player', seat: 1 } });
    expect(s.result?.winner).toBe(0);
  });
});

describe('overloaded Pals (§11.5)', () => {
  it('makes the player choose 5 Pals to keep, including the one just played', () => {
    let s = toMain();
    const old = [0, 1, 2, 3, 4].map(() => putInBase(s, 0, 'ETD01-002'));
    old.forEach((id, i) => (s.cards[id]!.placedAt = i + 1));
    s.placementCounter = 5;
    const newPal = s.players[0].hand[0]!;
    setCard(s, newPal, 'ETD01-023'); // Lamball, cost 2
    s = act(s, 0, { type: 'playCard', cardId: newPal }).s;
    expect(s.pending).toMatchObject({ kind: 'overload', seat: 0, mustKeep: [newPal], keepCount: 5 });

    expect(reject(s, 0, { type: 'chooseOverload', keep: old })).toMatch(/must stay/);
    s = act(s, 0, { type: 'chooseOverload', keep: [newPal, ...old.slice(1)] }).s;
    expect(s.players[0].base).toHaveLength(5);
    expect(s.players[0].graveyard).toContain(old[0]);
    expect(s.pending).toBeNull();
  });
});

describe('views', () => {
  it("hides the opponent's hand and both decks", () => {
    const s = toMain();
    const v = viewFor(s, 0);
    expect(v.players[0].hand).toHaveLength(5);
    expect(v.players[1].hand).toBeNull();
    expect(v.players[1].handCount).toBe(5);
    const json = JSON.stringify(viewFor(s, 'spectator'));
    for (const id of [...s.players[0].hand, ...s.players[1].hand, ...s.players[0].deck]) {
      expect(json).not.toContain(id);
    }
  });
});

describe('fuzz', () => {
  it('random legal play always terminates and conserves cards', () => {
    for (let seed = 1; seed <= 150; seed++) {
      let { state: s } = createGame(seed, [
        { name: 'A', deck: trialDeck() },
        { name: 'B', deck: trialDeck() },
      ]);
      let rng = seed;
      const pick = <T>(xs: T[]): T => {
        rng = (rng * 1103515245 + 12345) & 0x7fffffff;
        return xs[rng % xs.length]!;
      };

      for (let step = 0; step < 3000 && !s.result; step++) {
        const seat: Seat = s.pending ? s.pending.seat : s.activeSeat;
        let action: Action;
        if (s.pending?.kind === 'overload') {
          const { candidates, mustKeep, keepCount } = s.pending;
          const rest = candidates.filter((id) => !mustKeep.includes(id));
          action = { type: 'chooseOverload', keep: [...mustKeep, ...rest].slice(0, keepCount) };
        } else {
          const legal = getLegalActions(s, seat);
          expect(legal.length).toBeGreaterThan(0);
          // Bias towards doing something other than ending the turn.
          const nonEnd = legal.filter((a) => a.type !== 'endTurn');
          action = nonEnd.length > 0 && pick([true, true, true, false]) ? pick(nonEnd) : pick(legal);
        }
        s = act(s, seat, action).s;

        expect(cardCount(s, 0)).toBe(50);
        expect(cardCount(s, 1)).toBe(50);
        for (const p of s.players) {
          expect(p.soulDeck + p.soulsStanding + p.soulsRested).toBe(10);
          expect(p.soulsStanding).toBeGreaterThanOrEqual(0);
          if (!s.pending)
            expect(p.base.filter((id) => s.cards[id]!.cardId.startsWith('ETD01')).length).toBeLessThanOrEqual(7);
        }
      }
      expect(s.result, `seed ${seed} did not finish`).not.toBeNull();
    }
  });
});
