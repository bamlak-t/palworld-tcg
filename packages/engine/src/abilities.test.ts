/** Card scripts and keywords for the trial decks, one block per card. */
import { describe, expect, it } from 'vitest';
import { getCard } from '@pal/cards';
import { apply, createGame, getLegalActions, isImplemented, TRIAL_DECKS, validateDeck, viewFor } from './index.ts';
import { powerOf, strikeOf } from './stats.ts';
import type { Action, GameEvent, GameState, Seat } from './types.ts';
import { actThrough } from './testkit.ts';

// --- helpers ----------------------------------------------------------------

function toMain(seed = 1): GameState {
  let s = createGame(seed, [
    { name: 'Alice', deck: [...TRIAL_DECKS.ETD01.cards] },
    { name: 'Bob', deck: [...TRIAL_DECKS.ETD02.cards] },
  ]).state;
  s = raw(s, s.pending!.seat, { type: 'chooseFirstPlayer', first: 0 });
  s = raw(s, 0, { type: 'mulligan', redraw: false });
  s = raw(s, 1, { type: 'mulligan', redraw: false });
  s.players[0].soulsStanding = 10;
  s.players[0].soulDeck = 0;
  return s;
}

/** apply() that throws on rejection and does not auto-pass quick steps. */
function raw(s: GameState, seat: Seat, action: Action): GameState {
  return rawWithEvents(s, seat, action).s;
}
function rawWithEvents(s: GameState, seat: Seat, action: Action): { s: GameState; events: GameEvent[] } {
  const r = apply(s, seat, action);
  if (!r.ok) throw new Error(`${action.type} rejected: ${r.error}`);
  return { s: r.state, events: r.events };
}
const act = (s: GameState, seat: Seat, action: Action) => actThrough(s, seat, action).s;

let n = 0;
/** Creates a card straight into a zone (test setup only). */
function put(
  s: GameState,
  seat: Seat,
  zone: 'base' | 'hand' | 'graveyard' | 'deckTop',
  cardId: string,
  rested = false,
) {
  if (!getCard(cardId)) throw new Error(`Unknown card ${cardId}`);
  const id = `t${n++}`;
  s.cards[id] = { id, cardId, owner: seat, rested, damage: 0, modifiers: [], placedAt: 0, assignedTo: null };
  if (zone === 'deckTop') s.players[seat].deck.unshift(id);
  else s.players[seat][zone].push(id);
  return id;
}

const play = (s: GameState, seat: Seat, cardId: string) => {
  const id = put(s, seat, 'hand', cardId);
  return { id, s: raw(s, seat, { type: 'playCard', cardId: id }) };
};

const answer = (s: GameState, seat: Seat, choice: string[]) => raw(s, seat, { type: 'answer', choice });
const activate = (s: GameState, seat: Seat, sourceId: string, index = 0, cost = {}) =>
  raw(s, seat, { type: 'activate', sourceId, index, cost });

const ALL_TD_IDS = [...new Set([...TRIAL_DECKS.ETD01.cards, ...TRIAL_DECKS.ETD02.cards])];

// --- decks and coverage -------------------------------------------------------

describe('trial decks', () => {
  it('are legal 50-card decks', () => {
    expect(validateDeck([...TRIAL_DECKS.ETD01.cards])).toEqual([]);
    expect(validateDeck([...TRIAL_DECKS.ETD02.cards])).toEqual([]);
  });

  it('have every card fully implemented', () => {
    expect(ALL_TD_IDS.filter((id) => !isImplemented(id))).toEqual([]);
  });
});

// --- keywords -----------------------------------------------------------------

describe('keywords', () => {
  it('Assault: Grizzbolt can attack a standing Pal', () => {
    const s = toMain();
    const grizz = put(s, 0, 'base', 'ETD01-001');
    const standing = put(s, 1, 'base', 'ETD02-002');
    const after = act(s, 0, { type: 'attack', attackerId: grizz, target: { kind: 'card', id: standing } });
    expect(after.players[1].graveyard).toContain(standing);
  });

  it('Taunt: a rested Broncherry must be the target', () => {
    const s = toMain();
    const atk = put(s, 0, 'base', 'ETD01-006');
    const taunt = put(s, 1, 'base', 'ETD02-006', true);
    put(s, 1, 'base', 'ETD02-002', true);
    const targets = getLegalActions(s, 0).filter((a) => a.type === 'attack');
    expect(targets).toEqual([{ type: 'attack', attackerId: atk, target: { kind: 'card', id: taunt } }]);
    expect(apply(s, 0, { type: 'attack', attackerId: atk, target: { kind: 'player', seat: 1 } }).ok).toBe(false);
  });

  it('Taunt does nothing while the taunting Pal is standing (it can’t be targeted)', () => {
    const s = toMain();
    const atk = put(s, 0, 'base', 'ETD01-006');
    put(s, 1, 'base', 'ETD02-006');
    expect(apply(s, 0, { type: 'attack', attackerId: atk, target: { kind: 'player', seat: 1 } }).ok).toBe(true);
  });

  it('Stealth: Cawgnito cannot be blocked', () => {
    const s = toMain();
    const cawgnito = put(s, 0, 'base', 'ETD02-015');
    put(s, 1, 'base', 'ETD02-001'); // a standing would-be blocker
    const after = raw(s, 0, { type: 'attack', attackerId: cawgnito, target: { kind: 'player', seat: 1 } });
    expect(after.pending).toEqual({ kind: 'quickStep', seat: 1 });
  });

  it('Vigilance: Suzaku Aqua stands again at the end of your turn', () => {
    let s = toMain();
    const suzaku = put(s, 0, 'base', 'ETD01-017');
    s = act(s, 0, { type: 'attack', attackerId: suzaku, target: { kind: 'player', seat: 1 } });
    expect(s.cards[suzaku]!.rested).toBe(true);
    s = act(s, 0, { type: 'endTurn' });
    expect(s.cards[suzaku]!.rested).toBe(false);
  });

  describe('Interrupt (Foxparks)', () => {
    function attacked() {
      const s = toMain();
      const atk = put(s, 0, 'base', 'ETD01-006');
      const fox = put(s, 1, 'hand', 'ETD01-004');
      s.players[1].soulsStanding = 1;
      return { s: raw(s, 0, { type: 'attack', attackerId: atk, target: { kind: 'player', seat: 1 } }), atk, fox };
    }

    it('pays ① and discards itself to nullify the attack', () => {
      const { s, fox } = attacked();
      const lifeBefore = s.players[1].life;
      const deckBefore = s.players[1].deck.length;
      const after = rawWithEvents(s, 1, { type: 'activate', sourceId: fox, index: 0, cost: { option: 0 } });
      expect(after.s.battle).toBeNull();
      expect(after.s.players[1].life).toBe(lifeBefore);
      expect(after.s.players[1].deck).toHaveLength(deckBefore);
      expect(after.s.players[1].graveyard).toContain(fox);
      expect(after.s.players[1].soulsStanding).toBe(0);
      expect(after.events.some((e) => e.type === 'attackNullified')).toBe(true);
    });

    it('can instead discard itself and one other card', () => {
      const { s, fox } = attacked();
      const other = s.players[1].hand.find((id) => id !== fox)!;
      const after = raw(s, 1, { type: 'activate', sourceId: fox, index: 0, cost: { option: 1, discardIds: [other] } });
      expect(after.players[1].graveyard).toEqual(expect.arrayContaining([fox, other]));
      expect(after.players[1].soulsStanding).toBe(1);
      expect(after.battle).toBeNull();
    });

    it("can't be used in your own main phase", () => {
      const s = toMain();
      const fox = put(s, 0, 'hand', 'ETD01-004');
      expect(apply(s, 0, { type: 'activate', sourceId: fox, index: 0, cost: { option: 0 } }).ok).toBe(false);
    });

    it('the attacker cannot use Quick abilities in the quick step (§9.5.2.2)', () => {
      const { s } = attacked();
      expect(getLegalActions(s, 0)).toEqual([]);
    });
  });
});

describe('quick step', () => {
  it('is always offered to the defender, even with nothing to play', () => {
    const s = toMain();
    s.players[1].hand = [];
    const atk = put(s, 0, 'base', 'ETD01-002');
    const after = raw(s, 0, { type: 'attack', attackerId: atk, target: { kind: 'player', seat: 1 } });
    expect(after.pending).toEqual({ kind: 'quickStep', seat: 1 });
    expect(getLegalActions(after, 1)).toEqual([{ type: 'passQuick' }]);
  });

  it('only Quick events can be played', () => {
    const s = toMain();
    const atk = put(s, 0, 'base', 'ETD01-002');
    const strike = put(s, 1, 'hand', 'ETD02-021'); // not Quick
    s.players[1].soulsStanding = 5;
    const after = raw(s, 0, { type: 'attack', attackerId: atk, target: { kind: 'player', seat: 1 } });
    expect(apply(after, 1, { type: 'playCard', cardId: strike }).ok).toBe(false);
  });

  it('Ignis Breath in the quick step can destroy the attacker before damage', () => {
    let s = toMain();
    const atk = put(s, 0, 'base', 'ETD01-002'); // 300 power
    const breath = put(s, 1, 'hand', 'ETD01-011');
    s.players[1].soulsStanding = 2;
    s = raw(s, 0, { type: 'attack', attackerId: atk, target: { kind: 'player', seat: 1 } });
    s = raw(s, 1, { type: 'playCard', cardId: breath }); // the attacker is the only Pal, so it's chosen
    expect(s.players[0].graveyard).toContain(atk);
    expect(s.pending).toEqual({ kind: 'quickStep', seat: 1 }); // can keep responding
    s = raw(s, 1, { type: 'passQuick' });
    expect(s.battle).toBeNull();
    expect(s.players[1].life).toBe(10);
  });
});

// --- ETD01 --------------------------------------------------------------------

describe('ETD01 Red・Blue', () => {
  it('Arsox: On Deploy, get 2 Material', () => {
    expect(play(toMain(), 0, 'ETD01-005').s.players[0].material).toBe(2);
  });

  it('Mossanda Lux: consume 2 Material for +500 power', () => {
    const s = toMain();
    const id = put(s, 0, 'base', 'ETD01-006');
    s.players[0].material = 2;
    const after = activate(s, 0, id);
    expect(powerOf(after, after.cards[id]!)).toBe(1600);
    expect(after.players[0].material).toBe(0);
    expect(apply(after, 0, { type: 'activate', sourceId: id, index: 0 }).ok).toBe(false);
  });

  it('Blazamut: On Deploy, deal 1000 damage to up to 1 Pal', () => {
    const s = toMain();
    const target = put(s, 1, 'base', 'ETD02-016'); // 900
    const { s: chosen } = play(s, 0, 'ETD01-007');
    expect(chosen.pending).toMatchObject({ kind: 'effectChoice', seat: 0, min: 0, max: 1 });
    expect(answer(chosen, 0, [target]).players[1].graveyard).toContain(target);
    expect(answer(chosen, 0, []).players[1].base).toContain(target);
  });

  it('Stone Pit: assign a Pal for 3 Material and a card, once per turn', () => {
    const s = toMain();
    const pit = put(s, 0, 'base', 'ETD01-008');
    const pal = put(s, 0, 'base', 'ETD01-002');
    const pal2 = put(s, 0, 'base', 'ETD01-013');
    const hand = s.players[0].hand.length;
    const after = activate(s, 0, pit, 0, { assignId: pal });
    expect(after.players[0].material).toBe(3);
    expect(after.players[0].hand).toHaveLength(hand + 1);
    expect(after.cards[pal]).toMatchObject({ rested: true, assignedTo: pit });
    expect(apply(after, 0, { type: 'activate', sourceId: pit, index: 0, cost: { assignId: pal2 } }).ok).toBe(false);
  });

  it("can't assign a rested Pal", () => {
    const s = toMain();
    const pit = put(s, 0, 'base', 'ETD01-008');
    const pal = put(s, 0, 'base', 'ETD01-002', true);
    expect(apply(s, 0, { type: 'activate', sourceId: pit, index: 0, cost: { assignId: pal } }).ok).toBe(false);
  });

  it('Weapon Workbench: 800 damage, and your Pals get +1 strike', () => {
    let s = toMain();
    const bench = put(s, 0, 'base', 'ETD01-009');
    const worker = put(s, 0, 'base', 'ETD01-002');
    const other = put(s, 0, 'base', 'ETD01-005');
    const enemy = put(s, 1, 'base', 'ETD02-005'); // 800
    s.players[0].material = 1;
    s = activate(s, 0, bench, 0, { assignId: worker });
    s = answer(s, 0, [enemy]);
    expect(s.players[1].graveyard).toContain(enemy);
    expect(strikeOf(s, s.cards[other]!)).toBe(3);
    expect(strikeOf(s, s.cards[worker]!)).toBe(2);
    expect(s.players[0].material).toBe(0);
  });

  it('Single-Shot Rifle: 1500 damage on deploy; rest for +200 power', () => {
    let s = toMain();
    const enemy = put(s, 1, 'base', 'ETD02-007'); // 2000
    const mine = put(s, 0, 'base', 'ETD01-002');
    const played = play(s, 0, 'ETD01-010');
    s = answer(played.s, 0, [enemy]);
    expect(s.cards[enemy]!.damage).toBe(1500);
    s = activate(s, 0, played.id);
    s = answer(s, 0, [mine]);
    expect(powerOf(s, s.cards[mine]!)).toBe(500);
    expect(s.cards[played.id]!.rested).toBe(true);
  });

  it('Ignis Breath: deal 500 damage to 1 Pal', () => {
    const s = toMain();
    const enemy = put(s, 1, 'base', 'ETD02-013'); // 300
    const ally = put(s, 0, 'base', 'ETD01-006');
    const { s: chosen } = play(s, 0, 'ETD01-011');
    expect((chosen.pending as { options: { id: string }[] }).options.map((o) => o.id)).toEqual([ally, enemy]);
    const after = answer(chosen, 0, [enemy]);
    expect(after.players[1].graveyard).toContain(enemy);
    expect(after.players[0].graveyard.some((id) => after.cards[id]!.cardId === 'ETD01-011')).toBe(true);
  });

  it('Elphidran Aqua: draw 2, put 1 card from hand on top of the deck', () => {
    const s = toMain();
    const handBefore = s.players[0].hand.length;
    const { s: chosen } = play(s, 0, 'ETD01-012');
    expect(chosen.pending).toMatchObject({ kind: 'effectChoice', min: 1, max: 1 });
    const options = (chosen.pending as { options: { id: string }[] }).options;
    expect(options).toHaveLength(handBefore + 2);
    expect(viewFor(chosen, 1).pending).toMatchObject({ options: [] }); // hidden from the opponent
    const pick = options[0]!.id;
    const after = answer(chosen, 0, [pick]);
    expect(after.players[0].hand).toHaveLength(handBefore + 1);
    expect(after.players[0].deck[0]).toBe(pick);
  });

  it('Hangyu Cryst: rest up to 1 ◇3 or less Pal', () => {
    const s = toMain();
    const cheap = put(s, 1, 'base', 'ETD02-003'); // cost 3
    put(s, 1, 'base', 'ETD02-004'); // cost 4, not an option
    const { s: chosen } = play(s, 0, 'ETD01-015');
    expect((chosen.pending as { options: { id: string }[] }).options.map((o) => o.id)).toEqual([cheap]);
    expect(answer(chosen, 0, [cheap]).cards[cheap]!.rested).toBe(true);
  });

  it('Mammorest Cryst: +200 power per structure; discard a structure for +1 strike', () => {
    let s = toMain();
    const mammo = put(s, 0, 'base', 'ETD01-018');
    put(s, 0, 'base', 'ETD01-008');
    put(s, 0, 'base', 'ETD01-020');
    expect(powerOf(s, s.cards[mammo]!)).toBe(2100);
    const structure = put(s, 0, 'hand', 'ETD01-019');
    put(s, 0, 'hand', 'ETD01-002'); // not a structure, can't be discarded for this
    expect(
      apply(s, 0, { type: 'activate', sourceId: mammo, index: 0, cost: { discardIds: [s.players[0].hand[0]!] } }).ok,
    ).toBe(false);
    s = activate(s, 0, mammo, 0, { discardIds: [structure] });
    expect(strikeOf(s, s.cards[mammo]!)).toBe(4);
  });

  it('Antique Wooden Chair: up to 1 Pal gets +1000 power', () => {
    const s = toMain();
    const pal = put(s, 0, 'base', 'ETD01-002');
    const after = answer(play(s, 0, 'ETD01-019').s, 0, [pal]);
    expect(powerOf(after, after.cards[pal]!)).toBe(1300);
  });

  describe('Primitive Workbench', () => {
    function setup(top: string) {
      const s = toMain();
      const bench = put(s, 0, 'base', 'ETD01-020');
      const worker = put(s, 0, 'base', 'ETD01-002');
      const topId = put(s, 0, 'deckTop', top);
      return { s: activate(s, 0, bench, 0, { assignId: worker }), topId };
    }

    it('may deploy a ◇6 or less structure or gear from the top', () => {
      const { s, topId } = setup('ETD01-008');
      expect(s.pending).toMatchObject({ kind: 'effectChoice', options: [{ id: 'yes' }, { id: 'no' }] });
      expect(answer(s, 0, ['yes']).players[0].base).toContain(topId);
      expect(answer(s, 0, ['no']).players[0].hand).toContain(topId);
    });

    it('otherwise adds it to hand', () => {
      const { s, topId } = setup('ETD01-002');
      expect(s.pending).toBeNull();
      expect(s.players[0].hand).toContain(topId);
    });
  });

  it('Single-Shot Sphere Launcher: draw 1 on deploy', () => {
    const s = toMain();
    const before = s.players[0].hand.length;
    expect(play(s, 0, 'ETD01-021').s.players[0].hand).toHaveLength(before + 1);
  });

  it("Crystal Breath: −3 strike, and it doesn't stand next stand phase", () => {
    let s = toMain();
    const enemy = put(s, 1, 'base', 'ETD02-007', true);
    s = play(s, 0, 'ETD01-022').s; // the only Pal, chosen automatically
    expect(strikeOf(s, s.cards[enemy]!)).toBe(1);
    s = act(s, 0, { type: 'endTurn' });
    expect(s.cards[enemy]!.rested).toBe(true); // Bob's stand phase skipped it
    s = act(s, 1, { type: 'endTurn' });
    s = act(s, 0, { type: 'endTurn' });
    expect(s.cards[enemy]!.rested).toBe(false); // only the next one
  });

  it('Lamball: cannot be attacked by ◇4 or greater Pals', () => {
    const s = toMain();
    const lamball = put(s, 1, 'base', 'ETD01-023', true);
    const big = put(s, 0, 'base', 'ETD01-006');
    const small = put(s, 0, 'base', 'ETD01-002');
    const target = { kind: 'card' as const, id: lamball };
    expect(apply(s, 0, { type: 'attack', attackerId: big, target }).ok).toBe(false);
    expect(apply(s, 0, { type: 'attack', attackerId: small, target }).ok).toBe(true);
  });

  it('Ribbuny: get 1 Material when put into the graveyard from the base', () => {
    let s = toMain();
    const ribbuny = put(s, 0, 'base', 'ETD01-024');
    s = answer(play(s, 0, 'ETD01-007').s, 0, [ribbuny]); // Blazamut kills it
    expect(s.players[0].material).toBe(1);
  });
});

// --- ETD02 --------------------------------------------------------------------

describe('ETD02 Green・Purple', () => {
  const asBob = (s: GameState) => {
    s.activeSeat = 1;
    s.players[1].soulsStanding = 10;
    return s;
  };

  it('Flopie: On Deploy, get 2 Ingredient', () => {
    expect(play(asBob(toMain()), 1, 'ETD02-003').s.players[1].ingredient).toBe(2);
  });

  it('Eikthyrdeer Terra: Taunt, and 2 Ingredient for +500', () => {
    const s = asBob(toMain());
    const deer = put(s, 1, 'base', 'ETD02-005');
    s.players[1].ingredient = 2;
    expect(powerOf(activate(s, 1, deer), s.cards[deer]!)).toBe(800); // input unchanged
    const after = activate(s, 1, deer);
    expect(powerOf(after, after.cards[deer]!)).toBe(1300);
  });

  it('Mammorest: get 3 Ingredient when put into the graveyard', () => {
    let s = toMain();
    const mammo = put(s, 1, 'base', 'ETD02-007');
    s = play(s, 0, 'ETD02-021').s; // Strike from the Darkness; the only Pal
    expect(s.players[1].graveyard).toContain(mammo);
    expect(s.players[1].ingredient).toBe(3);
  });

  it('Berry Plantation: assign for 3 Ingredient and a card', () => {
    const s = asBob(toMain());
    const farm = put(s, 1, 'base', 'ETD02-008');
    const pal = put(s, 1, 'base', 'ETD02-002');
    expect(activate(s, 1, farm, 0, { assignId: pal }).players[1].ingredient).toBe(3);
  });

  it('Campfire: gain 1 life and your Pals get +1000', () => {
    const s = asBob(toMain());
    const fire = put(s, 1, 'base', 'ETD02-009');
    const worker = put(s, 1, 'base', 'ETD02-002');
    const fighter = put(s, 1, 'base', 'ETD02-016');
    s.players[1].ingredient = 2;
    const after = activate(s, 1, fire, 0, { assignId: worker });
    expect(after.players[1].life).toBe(11);
    expect(powerOf(after, after.cards[fighter]!)).toBe(1900);
    expect(after.players[1].ingredient).toBe(0);
  });

  it('Refined Metal Spear: rest for +900', () => {
    let s = asBob(toMain());
    const spear = put(s, 1, 'base', 'ETD02-010');
    const pal = put(s, 1, 'base', 'ETD02-002');
    s = activate(s, 1, spear); // the only Pal
    expect(powerOf(s, s.cards[pal]!)).toBe(1200);
  });

  it('Stone Blast: +500 power, playable in the quick step', () => {
    let s = toMain();
    const atk = put(s, 0, 'base', 'ETD01-006', false); // 1100
    const def = put(s, 1, 'base', 'ETD02-001', true); // 900, rested target
    const blast = put(s, 1, 'hand', 'ETD02-011');
    s.players[1].soulsStanding = 2;
    s = raw(s, 0, { type: 'attack', attackerId: atk, target: { kind: 'card', id: def } });
    s = answer(raw(s, 1, { type: 'playCard', cardId: blast }), 1, [def]);
    s = raw(s, 1, { type: 'passQuick' });
    expect(s.players[0].graveyard).toContain(atk); // 1400 beats 1100
    expect(s.players[1].base).toContain(def);
  });

  it('Astegon: −1000 power on deploy without destroying; On Attack destroys every Pal at 300 or less', () => {
    let s = asBob(toMain());
    const weak = put(s, 0, 'base', 'ETD01-002', true); // 300
    const strong = put(s, 0, 'base', 'ETD01-006'); // 1100
    const ownWeak = put(s, 1, 'base', 'ETD02-024'); // 200, Bob's own
    const played = play(s, 1, 'ETD02-012');
    s = answer(played.s, 1, [strong]);
    expect(powerOf(s, s.cards[strong]!)).toBe(100);
    expect(s.players[0].base).toContain(strong); // §11.4 needs damage, not just low power
    s = act(s, 1, { type: 'attack', attackerId: played.id, target: { kind: 'player', seat: 0 } });
    expect(s.players[0].graveyard).toEqual(expect.arrayContaining([weak, strong]));
    expect(s.players[1].graveyard).toContain(ownWeak);
  });

  it('Leezpunk: when destroyed, the opponent discards a card of their choice', () => {
    let s = asBob(toMain());
    const leez = put(s, 0, 'base', 'ETD02-014'); // Alice's Leezpunk
    const handBefore = s.players[1].hand.length;
    s = play(s, 1, 'ETD02-021').s; // Strike from the Darkness on the only Pal
    expect(s.players[0].graveyard).toContain(leez);
    expect(s.pending).toMatchObject({ kind: 'effectChoice', seat: 1 }); // Bob chooses from his own hand
    expect(viewFor(s, 0).pending).toMatchObject({ options: [] });
    const pick = (s.pending as { options: { id: string }[] }).options[0]!.id;
    s = answer(s, 1, [pick]);
    expect(s.players[1].hand).toHaveLength(handBefore - 1);
    expect(s.players[1].graveyard).toContain(pick);
  });

  it('Felbat: gain 1 life On Attack', () => {
    const s = asBob(toMain());
    const felbat = put(s, 1, 'base', 'ETD02-018');
    const after = act(s, 1, { type: 'attack', attackerId: felbat, target: { kind: 'player', seat: 0 } });
    expect(after.players[1].life).toBe(11);
  });

  it('Hanging Trap: exiles a Pal, and only one at a time', () => {
    let s = asBob(toMain());
    const trap = put(s, 1, 'base', 'ETD02-019');
    const worker = put(s, 1, 'base', 'ETD02-002');
    const victim = put(s, 0, 'base', 'ETD01-006');
    put(s, 0, 'base', 'ETD01-002');
    s = answer(activate(s, 1, trap, 0, { assignId: worker }), 1, [victim]);
    expect(s.players[0].exile).toContain(victim);
    expect(s.cards[victim]!.exiledBy).toBe(trap);
  });

  it('Hanging Trap: the exiled Pal comes back rested when the trap is destroyed', () => {
    let s = asBob(toMain());
    const trap = put(s, 1, 'base', 'ETD02-019', false);
    const worker = put(s, 1, 'base', 'ETD02-002');
    const victim = put(s, 0, 'base', 'ETD01-006');
    s = answer(activate(s, 1, trap, 0, { assignId: worker }), 1, [victim]); // Bob's worker is also an option
    // Destroy the trap in battle: rest it and attack it with Alice's turn.
    s = act(s, 1, { type: 'endTurn' });
    s.cards[trap]!.rested = true;
    const atk = put(s, 0, 'base', 'ETD01-001'); // 1600 vs durability 900
    s = act(s, 0, { type: 'attack', attackerId: atk, target: { kind: 'card', id: trap } });
    expect(s.players[1].graveyard).toContain(trap);
    expect(s.players[0].base).toContain(victim);
    expect(s.cards[victim]!.rested).toBe(true);
  });

  it('Cawgnito Hat: +200 and Stealth until end of turn', () => {
    let s = asBob(toMain());
    const hat = put(s, 1, 'base', 'ETD02-020');
    const pal = put(s, 1, 'base', 'ETD02-016');
    put(s, 0, 'base', 'ETD01-006'); // a blocker
    s = answer(activate(s, 1, hat), 1, [pal]);
    expect(powerOf(s, s.cards[pal]!)).toBe(1100);
    const attacked = raw(s, 1, { type: 'attack', attackerId: pal, target: { kind: 'player', seat: 0 } });
    expect(attacked.pending?.kind).toBe('quickStep'); // no block offered
  });

  it('Strike from the Darkness: put 1 Pal into the graveyard', () => {
    const s = toMain();
    const enemy = put(s, 1, 'base', 'ETD02-007');
    put(s, 0, 'base', 'ETD01-002');
    expect(answer(play(s, 0, 'ETD02-021').s, 0, [enemy]).players[1].graveyard).toContain(enemy);
  });

  it('Medical Supplies: deploy a ◇8 or less Pal from your graveyard, rested, with its On Deploy', () => {
    const s = toMain();
    const arsox = put(s, 0, 'graveyard', 'ETD01-005');
    const jolthog = put(s, 0, 'graveyard', 'ETD01-002');
    put(s, 0, 'graveyard', 'ETD01-008'); // a structure isn't an option
    put(s, 1, 'graveyard', 'ETD02-001'); // nor is the opponent's graveyard
    const { s: chosen } = play(s, 0, 'ETD02-022');
    expect((chosen.pending as { options: { id: string }[] }).options.map((o) => o.id)).toEqual([arsox, jolthog]);
    const after = answer(chosen, 0, [arsox]);
    expect(after.players[0].base).toContain(arsox);
    expect(after.cards[arsox]!.rested).toBe(true);
    expect(after.players[0].material).toBe(2);
  });

  it('Cattiva: cannot be attacked by ◇3 or less Pals', () => {
    const s = toMain();
    const cattiva = put(s, 1, 'base', 'ETD02-023', true);
    const small = put(s, 0, 'base', 'ETD01-002');
    expect(apply(s, 0, { type: 'attack', attackerId: small, target: { kind: 'card', id: cattiva } }).ok).toBe(false);
  });

  it('Chikipi: get 1 Ingredient when put into the graveyard', () => {
    let s = toMain();
    const chikipi = put(s, 1, 'base', 'ETD02-024');
    s = play(s, 0, 'ETD02-021').s;
    expect(s.players[1].ingredient).toBe(1);
  });
});

// --- resolution mechanics -----------------------------------------------------

describe('effect resolution', () => {
  it('rejects answers that are not among the options, leaving the state unchanged', () => {
    const s = toMain();
    const { s: chosen } = play(s, 0, 'ETD01-007');
    const r = apply(chosen, 0, { type: 'answer', choice: ['not-a-card'] });
    expect(r.ok).toBe(false);
    expect(apply(chosen, 0, { type: 'answer', choice: [] }).ok).toBe(true);
  });

  it('only the chooser can answer', () => {
    const { s } = play(toMain(), 0, 'ETD01-007');
    expect(apply(s, 1, { type: 'answer', choice: [] }).ok).toBe(false);
  });

  it('does not emit events from an effect until it finishes', () => {
    const s = toMain();
    const id = put(s, 0, 'hand', 'ETD01-012');
    const r = rawWithEvents(s, 0, { type: 'playCard', cardId: id });
    expect(r.events.some((e) => e.type === 'drew')).toBe(false);
    const pick = (r.s.pending as { options: { id: string }[] }).options[0]!.id;
    const done = rawWithEvents(r.s, 0, { type: 'answer', choice: [pick] });
    expect(done.events.filter((e) => e.type === 'drew')).toHaveLength(1);
  });
});

// --- fuzz ---------------------------------------------------------------------

describe('fuzz: trial deck vs trial deck', () => {
  it('random legal play always terminates and conserves cards', () => {
    for (let seed = 1; seed <= 40; seed++) {
      let s = createGame(seed, [
        { name: 'A', deck: [...TRIAL_DECKS.ETD01.cards] },
        { name: 'B', deck: [...TRIAL_DECKS.ETD02.cards] },
      ]).state;
      let rng = seed;
      const pick = <T>(xs: T[]): T => {
        rng = (rng * 1103515245 + 12345) & 0x7fffffff;
        return xs[rng % xs.length]!;
      };

      for (let step = 0; step < 4000 && !s.result; step++) {
        const seat: Seat = s.pending ? s.pending.seat : s.activeSeat;
        const legal = getLegalActions(s, seat);
        expect(legal.length, `seed ${seed} step ${step}: no legal actions`).toBeGreaterThan(0);
        const nonEnd = legal.filter((a) => a.type !== 'endTurn' && a.type !== 'passQuick');
        const action = nonEnd.length > 0 && pick([true, true, true, false]) ? pick(nonEnd) : pick(legal);
        const r = apply(s, seat, action);
        expect(r.ok, `seed ${seed} step ${step}: ${JSON.stringify(action)} → ${r.ok ? '' : r.error}`).toBe(true);
        s = (r as { state: GameState }).state;

        for (const seatN of [0, 1] as const) {
          const p = s.players[seatN];
          const resolving = s.resolutionZone.filter((id) => s.cards[id]!.owner === seatN).length;
          expect(p.deck.length + p.hand.length + p.base.length + p.graveyard.length + p.exile.length + resolving).toBe(
            50,
          );
          expect(p.soulDeck + p.soulsStanding + p.soulsRested).toBe(10);
        }
      }
      expect(s.result, `seed ${seed} did not finish`).not.toBeNull();
    }
  }, 120_000);
});
