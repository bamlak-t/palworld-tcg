/** Booster Pack 02 (EBP02) and Starter Set 01 (ESS01) card scripts. */
import { describe, expect, it } from 'vitest';
import { cardDb } from '@pal/cards';
import { isImplemented } from './abilities.ts';
import { apply } from './engine.ts';
import { getLegalActions } from './legal.ts';
import { playRandomGame, randomDeck } from './fuzz.ts';
import { costToPlay, hasKeyword, powerOf } from './stats.ts';
import { act, activate, answer, play, put, raw, toMain } from './testkit.ts';
import type { GameState } from './types.ts';

const pending = (s: GameState) => (s.pending?.kind === 'effectChoice' ? s.pending : null);

describe('coverage', () => {
  it('every card in every set is implemented', () => {
    const todo = cardDb.cards.filter((c) => c.kind !== 'Soul' && !isImplemented(c.id));
    expect(todo.map((c) => c.id)).toEqual([]);
  });

  it('random games with EBP02 + ESS01 decks run to the end', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const s = playRandomGame([randomDeck(['EBP02', 'ESS01'], seed), randomDeck(['EBP02'], seed + 500)], seed);
      expect(s.result, `seed ${seed} did not finish`).not.toBeNull();
    }
  });

  it('random games with decks from the whole pool run to the end', () => {
    const all = ['ETD01', 'ETD02', 'EBP01', 'EBP02', 'ESS01'];
    for (let seed = 1; seed <= 60; seed++) {
      const s = playRandomGame([randomDeck(all, seed * 3), randomDeck(all, seed * 3 + 1)], seed);
      expect(s.result, `seed ${seed} did not finish`).not.toBeNull();
    }
  });
});

describe('EBP02 red', () => {
  it('Orserk: each mode once per turn', () => {
    let s = toMain();
    s.players[0].material = 6;
    const orserk = put(s, 0, 'base', 'EBP02-001');
    const theirs = put(s, 1, 'base', 'EBP01-013');
    s = activate(s, 0, orserk, 0);
    s = answer(s, 0, ['m1']);
    expect(s.cards[theirs]!.damage).toBe(900);
    s = activate(s, 0, orserk, 0);
    expect(pending(s)?.options.map((o) => o.id)).toEqual(['m0', 'm2']);
  });

  it('Katress Ignis: after its Interrupt, comes back from the graveyard rested with 6+ souls', () => {
    let s = toMain();
    const attacker = put(s, 0, 'base', 'EBP01-013');
    const katress = put(s, 1, 'hand', 'EBP02-002');
    s.players[1].soulsStanding = 6;
    s = raw(s, 0, { type: 'attack', attackerId: attacker, target: { kind: 'player', seat: 1 } });
    s = raw(s, 1, { type: 'activate', sourceId: katress, index: 0, cost: { option: 0 } });
    s = answer(s, 1, ['yes']);
    expect(s.players[1].base).toContain(katress);
    expect(s.cards[katress]!.rested).toBe(true);
    expect(s.players[1].life).toBe(10);
  });

  it('Rayhound deals double battle damage', () => {
    let s = toMain();
    const ray = put(s, 0, 'base', 'EBP02-005'); // 500
    const target = put(s, 1, 'base', 'EBP01-037', true); // 700
    s = act(s, 0, { type: 'attack', attackerId: ray, target: { kind: 'card', id: target } });
    expect(s.players[1].graveyard).toContain(target);
  });

  it('Relaxaurus Lux stands after destroying the Pal it attacked', () => {
    let s = toMain();
    const lux = put(s, 0, 'base', 'EBP02-010');
    const target = put(s, 1, 'base', 'EBP01-056', true);
    s = act(s, 0, { type: 'attack', attackerId: lux, target: { kind: 'card', id: target } });
    expect(s.players[1].graveyard).toContain(target);
    expect(s.cards[lux]!.rested).toBe(false);
  });

  it('Mine: when your Pal is attacked, sacrifice it to deal 1500 to the attacker', () => {
    let s = toMain();
    const attacker = put(s, 0, 'base', 'EBP01-013');
    put(s, 1, 'base', 'EBP02-017');
    const target = put(s, 1, 'base', 'EBP01-056', true);
    s = raw(s, 0, { type: 'attack', attackerId: attacker, target: { kind: 'card', id: target } });
    s = answer(s, 1, ['yes']);
    expect(s.players[0].graveyard).toContain(attacker);
  });

  it('Flamethrower: consume Material to reduce its cost', () => {
    const s = toMain();
    s.players[0].material = 4;
    const id = put(s, 0, 'hand', 'EBP02-019');
    expect(getLegalActions(s, 0)).toContainEqual({ type: 'playCard', cardId: id, x: 4 });
    const after = raw(s, 0, { type: 'playCard', cardId: id, x: 4 });
    expect(10 - after.players[0].soulsStanding).toBe(4);
  });

  it("Mossanda Lux's Grenade Launcher: stands Mossanda Lux after it consumes Material", () => {
    let s = toMain();
    s.players[0].material = 2;
    const launcher = put(s, 0, 'base', 'EBP02-021');
    const mossanda = put(s, 0, 'base', 'EBP02-006');
    s.cards[mossanda]!.rested = true;
    s = activate(s, 0, mossanda, 0);
    s = answer(s, 0, []);
    s = answer(s, 0, ['yes']);
    expect(s.cards[mossanda]!.rested).toBe(false);
    expect(s.players[0].hand).toContain(launcher);
  });
});

describe('EBP02 blue', () => {
  it('Frostallion: Pals in hand cost 2 less; draws up to 4 at end of turn', () => {
    let s = toMain();
    put(s, 0, 'base', 'EBP02-025');
    const pal = put(s, 0, 'hand', 'EBP01-013');
    expect(costToPlay(s, 0, s.cards[pal]!)).toBe(4);
    s.players[0].hand = [pal];
    s = act(s, 0, { type: 'endTurn' });
    expect(s.players[0].hand.length).toBe(4);
  });

  it('Sibelyx: assigned to Farming, freezes a ◇7 or less Pal', () => {
    let s = toMain();
    const ranch = put(s, 0, 'base', 'EBP01-066');
    const sibelyx = put(s, 0, 'base', 'EBP02-028');
    const target = put(s, 1, 'base', 'EBP01-056');
    s = activate(s, 0, ranch, 0, { assignId: sibelyx });
    s = answer(s, 0, ['m0']); // Ranch resolves first, then Sibelyx's trigger
    s = answer(s, 0, [target]);
    expect(s.cards[target]!.frozenBy).toBe(sibelyx);
  });

  it('Broncherry Aqua: your structures get +500 durability', () => {
    const s = toMain();
    const b = put(s, 0, 'base', 'EBP02-031');
    const st = put(s, 0, 'base', 'EBP01-042');
    expect(powerOf(s, s.cards[st]!)).toBe(1500);
    expect(powerOf(s, s.cards[b]!)).toBe(1000);
  });

  it("High Quality Hot Spring: the assigned Pal can't be attacked through the opponent's turn", () => {
    let s = toMain();
    const spring = put(s, 0, 'base', 'EBP02-041');
    const pal = put(s, 0, 'base', 'EBP01-056');
    s = activate(s, 0, spring, 0, { assignId: pal });
    s = act(s, 0, { type: 'endTurn' });
    s.cards[pal]!.rested = true;
    const attacker = put(s, 1, 'base', 'EBP01-013');
    const targets = getLegalActions(s, 1).filter((a) => a.type === 'attack' && a.attackerId === attacker);
    expect(targets).toEqual([{ type: 'attack', attackerId: attacker, target: { kind: 'player', seat: 0 } }]);
  });

  it("Frostallion Saddle: your Frostallion can't be chosen by the opponent's Pals", () => {
    let s = toMain();
    s.activeSeat = 0;
    put(s, 1, 'base', 'EBP02-044');
    const frost = put(s, 1, 'base', 'EBP02-025');
    const other = put(s, 1, 'base', 'EBP01-056');
    s = play(s, 0, 'EBP01-007').s; // Kitsun: up to 1 ◇7+ Pal — Frostallion is protected
    expect(pending(s)).toBeNull();
    expect(s.cards[frost]!.damage).toBe(0);
    expect(s.cards[other]!.damage).toBe(0);
  });

  it('Love Overload: unchosen cards go to the bottom', () => {
    let s = toMain();
    const a = put(s, 0, 'deckTop', 'EBP01-047');
    const b = put(s, 0, 'deckTop', 'EBP01-047');
    const pal = put(s, 0, 'deckTop', 'EBP01-056');
    s = play(s, 0, 'EBP02-047').s;
    s = answer(s, 0, [pal]);
    s = answer(s, 0, [b]);
    expect(s.players[0].deck.slice(-2)).toEqual([b, a]);
  });

  it('Wooden Chest: hides the top card, then returns it to hand', () => {
    let s = toMain();
    const chest = put(s, 0, 'base', 'EBP02-067');
    const pal = put(s, 0, 'base', 'EBP01-056');
    const top = s.players[0].deck[0]!;
    s = activate(s, 0, chest, 0);
    expect(s.cards[chest]!.under).toEqual([top]);
    s = activate(s, 0, chest, 1, { assignId: pal });
    expect(s.players[0].hand).toContain(top);
  });
});

describe('EBP02 green', () => {
  it('Anubis costs 1 less per Pal you have', () => {
    const s = toMain();
    put(s, 0, 'base', 'EBP01-056');
    put(s, 0, 'base', 'EBP01-086');
    const anubis = put(s, 0, 'hand', 'EBP02-049');
    expect(costToPlay(s, 0, s.cards[anubis]!)).toBe(5);
  });

  it('Quivern Botan cannot be chosen by structures or events', () => {
    let s = toMain();
    const q = put(s, 1, 'base', 'EBP02-054');
    const other = put(s, 1, 'base', 'EBP01-013'); // 1200, survives the hit
    s = play(s, 0, 'EBP02-024').s; // Flame Funnel
    expect(s.cards[other]!.damage).toBe(1000);
    expect(s.cards[q]!.damage).toBe(0);
  });

  it('Eikthyrdeer Terra: after beating its opposing Pal, destroys a structure or gear', () => {
    let s = toMain();
    const eik = put(s, 0, 'base', 'EBP02-057');
    const target = put(s, 1, 'base', 'EBP01-056', true);
    const wall = put(s, 1, 'base', 'EBP01-042');
    s = act(s, 0, { type: 'attack', attackerId: eik, target: { kind: 'card', id: target } });
    s = answer(s, 0, [wall]);
    expect(s.players[1].graveyard).toContain(wall);
  });

  it('Electric Kitchen: assign 3 to stand your Pals with +1000', () => {
    let s = toMain();
    s.players[0].ingredient = 3;
    const kitchen = put(s, 0, 'base', 'EBP02-065');
    const pals = [put(s, 0, 'base', 'EBP01-056'), put(s, 0, 'base', 'EBP01-086'), put(s, 0, 'base', 'EBP01-099')];
    s = activate(s, 0, kitchen, 0, { assignIds: pals });
    expect(pals.every((id) => !s.cards[id]!.rested)).toBe(true);
    expect(powerOf(s, s.cards[pals[0]!]!)).toBe(1500);
    expect(s.players[0].ingredient).toBe(5);
  });

  it('Lily’s Gambit: +10 souls (capped by the soul deck)', () => {
    let s = toMain();
    s.players[0].soulDeck = 4;
    s.players[0].soulsStanding = 6;
    s = play(s, 0, 'EBP02-071').s;
    expect(s.players[0].soulsStanding + s.players[0].soulsRested).toBe(10);
  });
});

describe('EBP02 purple', () => {
  it('Frostallion Noct: the opponent discards down to 4 at the end of your turn', () => {
    let s = toMain();
    put(s, 0, 'base', 'EBP02-073');
    s.players[1].hand = s.players[1].hand.slice(0, 5);
    s = raw(s, 0, { type: 'endTurn' });
    s = answer(s, 1, [s.players[1].hand[0]!]);
    expect(s.players[1].hand.length).toBe(4 + 1); // then draws for their turn
  });

  it("Shroomer Noct: an assigned Pal stands but can't be assigned to that structure again", () => {
    let s = toMain();
    put(s, 0, 'base', 'EBP02-077');
    const ranch = put(s, 0, 'base', 'EBP01-066');
    const pal = put(s, 0, 'base', 'EBP01-056');
    s = activate(s, 0, ranch, 0, { assignId: pal });
    s = answer(s, 0, ['m0']);
    expect(s.cards[pal]!.rested).toBe(false);
    const furnace = put(s, 0, 'base', 'EBP01-016');
    const assignable = getLegalActions(s, 0).filter(
      (a) => a.type === 'activate' && a.sourceId === furnace && a.index === 0,
    );
    expect(assignable.some((a) => a.type === 'activate' && a.cost?.assignId === pal)).toBe(true);
  });

  it('Chandelier + Lamp: Lamp makes Pals Nocturnal, Chandelier gives Nocturnal Pals Retaliate', () => {
    const s = toMain();
    put(s, 0, 'base', 'EBP01-088');
    put(s, 0, 'base', 'EBP02-088');
    const pal = put(s, 0, 'base', 'EBP01-056');
    expect(hasKeyword(s, s.cards[pal]!, 'nocturnal')).toBe(true);
    expect(hasKeyword(s, s.cards[pal]!, 'retaliate')).toBe(true);
  });

  it('Bear Trap: an attacking ◇5 or less opposing Pal gets −500', () => {
    let s = toMain();
    put(s, 1, 'base', 'EBP02-089');
    const attacker = put(s, 0, 'base', 'EBP01-056');
    s = raw(s, 0, { type: 'attack', attackerId: attacker, target: { kind: 'player', seat: 1 } });
    expect(powerOf(s, s.cards[attacker]!)).toBe(0);
    expect(s.players[0].base).toContain(attacker);
  });

  it('Poison Arrow Crossbow: the opponent cannot gain life', () => {
    let s = toMain();
    put(s, 1, 'base', 'EBP02-093');
    s = play(s, 0, 'EBP01-072').s;
    expect(s.players[0].life).toBe(10);
  });

  it('Jetragon: exiling two Legendary Pals also stands Legendaries', () => {
    let s = toMain();
    const jet = put(s, 0, 'base', 'EBP02-097', true);
    const g1 = put(s, 0, 'graveyard', 'EBP02-025');
    const g2 = put(s, 0, 'graveyard', 'EBP02-073');
    s = activate(s, 0, jet, 0, { exileIds: [g1, g2] });
    s = answer(s, 0, [jet]);
    expect(s.players[0].exile).toEqual(expect.arrayContaining([g1, g2]));
    expect(s.cards[jet]!.rested).toBe(false);
    expect(hasKeyword(s, s.cards[jet]!, 'vigilance')).toBe(true);
  });

  it('Awakening of Legends returns to hand if nothing was found', () => {
    let s = toMain();
    const { id, s: s2 } = play(s, 0, 'EBP02-100');
    s = pending(s2) ? answer(s2, 0, []) : s2;
    expect(s.players[0].hand).toContain(id);
  });

  it("Zoe's Gambit puts every Pal into the graveyard", () => {
    let s = toMain();
    const a = put(s, 0, 'base', 'EBP01-056');
    const b = put(s, 1, 'base', 'EBP01-013');
    s = play(s, 0, 'EBP02-094').s;
    expect(s.players[0].graveyard).toContain(a);
    expect(s.players[1].graveyard).toContain(b);
  });
});

describe('ESS01', () => {
  it('Chillet – Final Frostneedle draws after its opposing combat Pal goes to the graveyard', () => {
    let s = toMain();
    const chillet = put(s, 0, 'base', 'ESS01-002');
    const target = put(s, 1, 'base', 'EBP01-056', true);
    const hand = s.players[0].hand.length;
    s = act(s, 0, { type: 'attack', attackerId: chillet, target: { kind: 'card', id: target } });
    expect(s.players[0].hand.length).toBe(hand + 1);
  });

  it('Cattiva: +200 at 5 souls and another +200 at 10', () => {
    const s = toMain();
    const c = put(s, 0, 'base', 'ESS01-004');
    expect(powerOf(s, s.cards[c]!)).toBe(700);
    s.players[0].soulsStanding = 6;
    expect(powerOf(s, s.cards[c]!)).toBe(500);
  });

  it('Quivern: attacking a card lets it deal 700 to a Pal or structure', () => {
    let s = toMain();
    const q = put(s, 0, 'base', 'ESS01-005');
    const target = put(s, 1, 'base', 'EBP01-013', true);
    const wall = put(s, 1, 'base', 'EBP01-042');
    s = raw(s, 0, { type: 'attack', attackerId: q, target: { kind: 'card', id: target } });
    s = answer(s, 0, [wall]);
    expect(s.cards[wall]!.damage).toBe(700);
    expect(apply(s, 0, { type: 'endTurn' }).ok).toBe(false); // still mid-battle
  });
});
