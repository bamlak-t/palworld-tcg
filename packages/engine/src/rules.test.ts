/**
 * Edge cases, organised by Comprehensive Rules section. engine.test.ts covers the main flows.
 */
import { describe, expect, it } from 'vitest';
import { apply, createGame, getLegalActions } from './index.ts';
import type { Action, GameState, Seat } from './types.ts';

const LUCKY = ['ETD01-001', 'ETD01-007', 'ETD01-017', 'ETD01-018'];
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

function trialDeck(): string[] {
  const deck = [...LUCKY, ...LUCKY];
  for (const id of NORMAL_PALS) deck.push(id, id, id, id);
  return [...deck, 'ETD01-008', 'ETD01-008'].slice(0, 50);
}

function newGame(seed = 1) {
  return createGame(seed, [
    { name: 'Alice', deck: trialDeck() },
    { name: 'Bob', deck: trialDeck() },
  ]).state;
}

function act(s: GameState, seat: Seat, action: Action): GameState {
  const r = apply(s, seat, action);
  if (!r.ok) throw new Error(`${action.type} rejected: ${r.error}`);
  return r.state;
}

function err(s: GameState, seat: Seat, action: Action): string {
  const r = apply(s, seat, action);
  if (r.ok) throw new Error(`${action.type} should have been rejected`);
  return r.error;
}

function toMain(seed = 1): GameState {
  let s = newGame(seed);
  s = act(s, s.pending!.seat, { type: 'chooseFirstPlayer', first: 0 });
  s = act(s, 0, { type: 'mulligan', redraw: false });
  return act(s, 1, { type: 'mulligan', redraw: false });
}

let nextId = 0;
function putInBase(s: GameState, seat: Seat, cardId: string, opts: { rested?: boolean; placedAt?: number } = {}) {
  const id = `x${nextId++}`;
  s.cards[id] = {
    id,
    cardId,
    owner: seat,
    rested: !!opts.rested,
    damage: 0,
    modifiers: [],
    placedAt: opts.placedAt ?? 0,
    assignedTo: null,
  };
  s.players[seat].base.push(id);
  return id;
}

const attackPlayer = (attackerId: string, seat: Seat = 1): Action => ({
  type: 'attack',
  attackerId,
  target: { kind: 'player', seat },
});
const attackCard = (attackerId: string, id: string): Action => ({
  type: 'attack',
  attackerId,
  target: { kind: 'card', id },
});

describe('§1.2 winning and losing', () => {
  it('a player may concede at any time, even on the opponent’s turn', () => {
    const s = act(toMain(), 1, { type: 'concede' });
    expect(s.result).toEqual({ winner: 0, reason: 'Bob conceded' });
  });

  it('a player may concede during setup', () => {
    const s = newGame();
    expect(act(s, 0, { type: 'concede' }).result?.winner).toBe(1);
  });

  it('is a draw when both players lose at the same time (§1.2.2)', () => {
    const s = toMain();
    s.players[0].life = 0;
    s.players[1].life = 0;
    const after = act(s, 0, { type: 'endTurn' });
    expect(after.result).toEqual({ winner: null, reason: 'Both players lost at the same time' });
  });

  it('loses as soon as the deck is empty, even from a normal draw (§1.2.1.2)', () => {
    const s = toMain();
    s.players[1].deck = s.players[1].deck.slice(0, 1); // Bob draws his last card next turn
    const after = act(s, 0, { type: 'endTurn' });
    expect(after.players[1].deck).toHaveLength(0);
    expect(after.result).toEqual({ winner: 0, reason: 'Bob ran out of cards' });
  });

  it('rejects every action once the game is over', () => {
    const s = act(toMain(), 1, { type: 'concede' });
    expect(err(s, 0, { type: 'endTurn' })).toBe('The game is over.');
    expect(getLegalActions(s, 0)).toEqual([]);
  });
});

describe('§6.2 setup', () => {
  it('only the chosen player may pick who goes first', () => {
    const s = newGame(5);
    const chooser = s.pending!.seat;
    const other: Seat = chooser === 0 ? 1 : 0;
    expect(err(s, other, { type: 'chooseFirstPlayer', first: other })).toMatch(/Waiting for the other player/);
  });

  it('the first player decides on a redraw before the second player', () => {
    let s = newGame();
    s = act(s, s.pending!.seat, { type: 'chooseFirstPlayer', first: 1 });
    expect(s.pending).toEqual({ kind: 'mulligan', seat: 1 });
    expect(err(s, 0, { type: 'mulligan', redraw: true })).toMatch(/Waiting/);
    s = act(s, 1, { type: 'mulligan', redraw: false });
    expect(s.pending).toEqual({ kind: 'mulligan', seat: 0 });
  });

  it('each player may redraw only once (§6.2.1.7.1)', () => {
    let s = newGame();
    s = act(s, s.pending!.seat, { type: 'chooseFirstPlayer', first: 0 });
    s = act(s, 0, { type: 'mulligan', redraw: true });
    expect(s.pending?.seat).toBe(1);
    expect(err(s, 0, { type: 'mulligan', redraw: true })).toMatch(/Waiting/);
  });

  it('sets life to 10 and resources to 0 (§6.2.1.8–10)', () => {
    const s = toMain();
    for (const p of s.players) {
      expect(p.life).toBe(10);
      expect(p.damageTaken).toBe(0);
      expect(p.material).toBe(0);
      expect(p.ingredient).toBe(0);
    }
  });

  it('is deterministic for a given seed', () => {
    expect(JSON.stringify(toMain(42))).toBe(JSON.stringify(toMain(42)));
    expect(JSON.stringify(toMain(42))).not.toBe(JSON.stringify(toMain(43)));
  });
});

describe('§7 turn progression', () => {
  it('the first player draws normally from their second turn (§7.3.1)', () => {
    let s = toMain();
    s = act(s, 0, { type: 'endTurn' });
    s = act(s, 1, { type: 'endTurn' });
    expect(s.activeSeat).toBe(0);
    expect(s.players[0].hand).toHaveLength(6);
  });

  it('moves all remaining souls when fewer than 2 are left (§7.4.2.2)', () => {
    let s = toMain();
    s.players[1].soulDeck = 1;
    s = act(s, 0, { type: 'endTurn' });
    expect(s.players[1].soulDeck).toBe(0);
    expect(s.players[1].soulsStanding).toBe(2); // 1 from setup + 1
  });

  it('stands the base and the soul area at the start of the turn (§7.2.1)', () => {
    let s = toMain();
    const pal = putInBase(s, 1, 'ETD01-002', { rested: true });
    s.players[1].soulsRested = 1;
    s.players[1].soulsStanding = 0;
    s = act(s, 0, { type: 'endTurn' });
    expect(s.cards[pal]!.rested).toBe(false);
    expect(s.players[1].soulsStanding).toBe(3);
    expect(s.players[1].soulsRested).toBe(0);
  });

  it("does not stand the other player's cards", () => {
    let s = toMain();
    const pal = putInBase(s, 0, 'ETD01-002', { rested: true });
    s = act(s, 0, { type: 'endTurn' });
    expect(s.cards[pal]!.rested).toBe(true);
  });

  it('expires "until end of turn" effects but keeps permanent ones (§7.6.4)', () => {
    let s = toMain();
    const pal = putInBase(s, 0, 'ETD01-002');
    s.cards[pal]!.modifiers = [
      { stat: 'power', amount: 300, source: 'Brave 300', duration: 'endOfTurn' },
      { stat: 'power', amount: 100, source: 'Aura', duration: 'permanent' },
    ];
    s = act(s, 0, { type: 'endTurn' });
    expect(s.cards[pal]!.modifiers.map((m) => m.source)).toEqual(['Aura']);
  });

  it('night lasts until the end of the turn it was set for', () => {
    let s = toMain();
    s.nightUntilTurn = 2; // "until the end of the opponent's next turn"
    s = act(s, 0, { type: 'endTurn' });
    expect(s.nightUntilTurn).toBe(2);
    s = act(s, 1, { type: 'endTurn' });
    expect(s.nightUntilTurn).toBeNull();
  });

  it('resets the soul draw each turn (§8.5.2)', () => {
    let s = toMain();
    s.players[0].soulsStanding = 3;
    s = act(s, 0, { type: 'soulDraw' });
    s = act(s, 0, { type: 'endTurn' });
    s = act(s, 1, { type: 'endTurn' });
    expect(s.players[0].soulDrawUsed).toBe(false);
  });

  it('bumps the version on every accepted action, and only then', () => {
    const s = toMain();
    const v = s.version;
    expect(act(s, 0, { type: 'endTurn' }).version).toBe(v + 1);
    err(s, 1, { type: 'endTurn' });
    expect(s.version).toBe(v);
  });
});

describe('§8 main phase', () => {
  it('can only play cards from your own hand', () => {
    const s = toMain();
    expect(err(s, 0, { type: 'playCard', cardId: s.players[1].hand[0]! })).toMatch(/isn't in your hand/);
  });

  it('the soul draw needs 3 standing souls (§8.5.1)', () => {
    const s = toMain(); // 2 souls on turn 1
    expect(err(s, 0, { type: 'soulDraw' })).toMatch(/3 standing souls/);
  });

  it('lists only affordable cards as legal plays', () => {
    const s = toMain();
    s.players[0].hand.forEach((id, i) => (s.cards[id]!.cardId = i === 0 ? 'ETD01-002' : 'ETD01-006'));
    const plays = getLegalActions(s, 0).filter((a) => a.type === 'playCard');
    expect(plays).toEqual([{ type: 'playCard', cardId: s.players[0].hand[0] }]);
  });

  it('a structure can be deployed but cannot attack', () => {
    const s = toMain();
    const st = putInBase(s, 0, 'ETD01-008');
    expect(err(s, 0, attackPlayer(st))).toMatch(/can't attack/);
  });
});

describe('§9 battle', () => {
  it('a rested Pal cannot attack (§9.2.2.1)', () => {
    const s = toMain();
    const pal = putInBase(s, 0, 'ETD01-004', { rested: true });
    expect(err(s, 0, attackPlayer(pal))).toMatch(/can't attack/);
  });

  it("can't attack with the opponent's Pal or target yourself", () => {
    const s = toMain();
    const theirs = putInBase(s, 1, 'ETD01-004');
    const mine = putInBase(s, 0, 'ETD01-004');
    expect(err(s, 0, attackPlayer(theirs))).toMatch(/can't attack/);
    expect(err(s, 0, attackPlayer(mine, 0))).toMatch(/valid attack target/);
  });

  it('can target a rested structure as well as rested Pals (§9.2.3)', () => {
    const s = toMain();
    const atk = putInBase(s, 0, 'ETD01-006');
    const st = putInBase(s, 1, 'ETD01-008', { rested: true });
    const pal = putInBase(s, 1, 'ETD01-002', { rested: true });
    const targets = getLegalActions(s, 0)
      .filter((a): a is Extract<Action, { type: 'attack' }> => a.type === 'attack' && a.attackerId === atk)
      .map((a) => (a.target.kind === 'card' ? a.target.id : 'player'));
    expect(targets.sort()).toEqual(['player', pal, st].sort());
  });

  it('only standing Pals can block; rested Pals and structures cannot (§9.4.2)', () => {
    let s = toMain();
    const atk = putInBase(s, 0, 'ETD01-004');
    const standing = putInBase(s, 1, 'ETD01-002');
    putInBase(s, 1, 'ETD01-003', { rested: true });
    putInBase(s, 1, 'ETD01-008');
    s = act(s, 0, attackPlayer(atk));
    expect(s.pending).toEqual({ kind: 'block', seat: 1, options: [standing] });
  });

  it('skips the block step when nothing can block', () => {
    const s0 = toMain();
    const atk = putInBase(s0, 0, 'ETD01-004');
    const s = act(s0, 0, attackPlayer(atk));
    expect(s.pending).toBeNull();
    expect(s.battle).toBeNull();
    expect(s.players[1].graveyard.length).toBeGreaterThan(0);
  });

  it('declining to block lets the attack through to the player', () => {
    let s = toMain();
    const atk = putInBase(s, 0, 'ETD01-004'); // strike 2
    putInBase(s, 1, 'ETD01-002');
    s.players[1].deck.slice(0, 2).forEach((id) => (s.cards[id]!.cardId = 'ETD01-002'));
    s = act(s, 0, attackPlayer(atk));
    s = act(s, 1, { type: 'block', blockerId: null });
    expect(s.players[1].life).toBe(8);
  });

  it('the attacker cannot act while the defender is choosing a blocker', () => {
    let s = toMain();
    const atk = putInBase(s, 0, 'ETD01-004');
    putInBase(s, 1, 'ETD01-002');
    s = act(s, 0, attackPlayer(atk));
    expect(err(s, 0, { type: 'endTurn' })).toMatch(/Waiting/);
    expect(err(s, 1, { type: 'block', blockerId: 'nope' })).toMatch(/can't block/);
  });

  it('Pals of equal power destroy each other (§9.6.3.1, §11.4)', () => {
    let s = toMain();
    const atk = putInBase(s, 0, 'ETD01-013'); // 300
    const def = putInBase(s, 1, 'ETD01-002', { rested: true }); // 300
    s = act(s, 0, attackCard(atk, def));
    expect(s.players[0].graveyard).toContain(atk);
    expect(s.players[1].graveyard).toContain(def);
  });

  it('a Pal with 0 power deals no damage (§9.6.3.1.1)', () => {
    let s = toMain();
    const atk = putInBase(s, 0, 'ETD01-002'); // 300
    s.cards[atk]!.modifiers.push({ stat: 'power', amount: -300, source: 'test', duration: 'endOfTurn' });
    const def = putInBase(s, 1, 'ETD01-024', { rested: true }); // 200
    s = act(s, 0, attackCard(atk, def));
    expect(s.cards[def]!.damage).toBe(0);
    expect(s.players[1].base).toContain(def);
  });

  it('a Pal at 0 power with no damage is not destroyed (§11.4.1 needs damage > 0)', () => {
    let s = toMain();
    const pal = putInBase(s, 0, 'ETD01-002');
    s.cards[pal]!.modifiers.push({ stat: 'power', amount: -500, source: 'test', duration: 'endOfTurn' });
    s = act(s, 0, { type: 'endTurn' });
    expect(s.players[0].base).toContain(pal);
  });

  it('a structure is destroyed when damage reaches its durability', () => {
    let s = toMain();
    const atk = putInBase(s, 0, 'ETD01-006'); // 1100
    const st = putInBase(s, 1, 'ETD01-008', { rested: true }); // 600
    s = act(s, 0, attackCard(atk, st));
    expect(s.players[1].graveyard).toContain(st);
  });

  it('a Pal with 0 strike deals no damage to the player (§9.6.3.3.1)', () => {
    let s = toMain();
    const atk = putInBase(s, 0, 'ETD01-002'); // strike 1
    s.cards[atk]!.modifiers.push({ stat: 'strike', amount: -1, source: 'test', duration: 'endOfTurn' });
    const deckBefore = s.players[1].deck.length;
    s = act(s, 0, attackPlayer(atk));
    expect(s.players[1].deck).toHaveLength(deckBefore);
    expect(s.players[1].life).toBe(10);
  });

  it('a Pal can attack again after the battle only if something stands it', () => {
    let s = toMain();
    const atk = putInBase(s, 0, 'ETD01-004');
    s = act(s, 0, attackPlayer(atk));
    expect(err(s, 0, attackPlayer(atk))).toMatch(/can't attack/);
  });

  it('expires "during this battle" effects at the end of battle (§9.7.3)', () => {
    let s = toMain();
    const atk = putInBase(s, 0, 'ETD01-004');
    s.cards[atk]!.modifiers.push({ stat: 'power', amount: 500, source: 'test', duration: 'endOfBattle' });
    s = act(s, 0, attackPlayer(atk));
    expect(s.cards[atk]!.modifiers).toEqual([]);
  });
});

describe('§11.2 player damage', () => {
  it('a Lucky Pal on the first flip cancels everything after one card', () => {
    let s = toMain();
    const atk = putInBase(s, 0, 'ETD01-001'); // strike 4
    s.cards[s.players[1].deck[0]!]!.cardId = 'ETD01-017'; // Lucky
    const deckBefore = s.players[1].deck.length;
    s = act(s, 0, attackPlayer(atk));
    expect(s.players[1].deck).toHaveLength(deckBefore - 1);
    expect(s.players[1].life).toBe(10);
  });

  it('a Lucky Pal deeper than the damage amount is never reached', () => {
    let s = toMain();
    const atk = putInBase(s, 0, 'ETD01-004'); // strike 2
    const [a, b, c] = s.players[1].deck;
    s.cards[a!]!.cardId = 'ETD01-002';
    s.cards[b!]!.cardId = 'ETD01-002';
    s.cards[c!]!.cardId = 'ETD01-017';
    s = act(s, 0, attackPlayer(atk));
    expect(s.players[1].life).toBe(8);
    expect(s.players[1].deck[0]).toBe(c);
  });

  it('with a short deck, mills what it can then loses the full damage in life', () => {
    let s = toMain();
    const atk = putInBase(s, 0, 'ETD01-001'); // strike 4
    s.players[1].deck = s.players[1].deck.slice(0, 2);
    s.players[1].deck.forEach((id) => (s.cards[id]!.cardId = 'ETD01-002'));
    s = act(s, 0, attackPlayer(atk));
    expect(s.players[1].life).toBe(6);
    expect(s.result?.winner).toBe(0); // and the empty deck loses the game
  });
});

describe('§11.5 overloaded Pals', () => {
  it('when the newest Pals alone exceed the limit, keep only from those', () => {
    let s = toMain();
    s.placementCounter = 1;
    const batch = [0, 1, 2, 3, 4, 5].map(() => putInBase(s, 0, 'ETD01-002', { placedAt: 1 }));
    s.players[0].soulsStanding = 3;
    s = act(s, 0, { type: 'soulDraw' }); // any action runs a check timing
    expect(s.pending).toMatchObject({ kind: 'overload', candidates: batch, mustKeep: [], keepCount: 5 });
    expect(err(s, 0, { type: 'chooseOverload', keep: batch.slice(0, 4) })).toMatch(/exactly 5/);
    s = act(s, 0, { type: 'chooseOverload', keep: batch.slice(1) });
    expect(s.players[0].base).toEqual(batch.slice(1));
  });

  it('structures and gears do not count toward the limit', () => {
    let s = toMain();
    [0, 1, 2, 3, 4].forEach(() => putInBase(s, 0, 'ETD01-002'));
    putInBase(s, 0, 'ETD01-008');
    putInBase(s, 0, 'ETD01-010');
    s = act(s, 0, { type: 'endTurn' });
    expect(s.pending).toBeNull();
    expect(s.players[0].base).toHaveLength(7);
  });

  it('continues the battle after the overload choice', () => {
    let s = toMain();
    s.placementCounter = 1;
    const pals = [0, 1, 2, 3, 4, 5].map(() => putInBase(s, 1, 'ETD01-002', { placedAt: 1, rested: true }));
    const atk = putInBase(s, 0, 'ETD01-004');
    s = act(s, 0, attackPlayer(atk)); // the check timing after declaring finds Bob overloaded
    expect(s.pending).toMatchObject({ kind: 'overload', seat: 1 });
    s.players[1].deck.slice(0, 2).forEach((id) => (s.cards[id]!.cardId = 'ETD01-002'));
    s = act(s, 1, { type: 'chooseOverload', keep: pals.slice(0, 5) });
    expect(s.battle).toBeNull();
    expect(s.players[1].life).toBe(8);
  });
});
