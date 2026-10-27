/** Booster Pack 01 card scripts. */
import { describe, expect, it } from 'vitest';
import { cardDb } from '@pal/cards';
import { isImplemented } from './abilities.ts';
import { apply } from './engine.ts';
import { getLegalActions } from './legal.ts';
import { playRandomGame, randomDeck } from './fuzz.ts';
import { isNight, powerOf, strikeOf } from './stats.ts';
import { act, activate, answer, play, put, raw, toMain } from './testkit.ts';
import type { GameState } from './types.ts';

const pending = (s: GameState) => (s.pending?.kind === 'effectChoice' ? s.pending : null);
const optionIds = (s: GameState) => pending(s)?.options.map((o) => o.id) ?? [];

describe('EBP01 coverage', () => {
  it('every card is implemented', () => {
    const todo = cardDb.cards.filter((c) => c.id.startsWith('EBP01') && c.kind !== 'Soul' && !isImplemented(c.id));
    expect(todo.map((c) => c.id)).toEqual([]);
  });

  it('random games with EBP01 decks run to the end without errors', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const s = playRandomGame([randomDeck(['EBP01'], seed), randomDeck(['EBP01'], seed + 1000)], seed);
      expect(s.result, `seed ${seed} did not finish`).not.toBeNull();
    }
  });
});

describe('EBP01 red', () => {
  it('Suzaku: your red cards deal +200 non-battle damage, including its own', () => {
    let s = toMain();
    const target = put(s, 1, 'base', 'EBP01-013'); // Pyrin 1200
    s = play(s, 0, 'EBP01-002').s;
    s = answer(s, 0, [target]);
    expect(s.cards[target]!.damage).toBe(900);
  });

  it('Gobfin Ignis: your other red Pals get +300', () => {
    const s = toMain();
    const gobfin = put(s, 0, 'base', 'EBP01-003');
    const red = put(s, 0, 'base', 'EBP01-013');
    expect(powerOf(s, s.cards[red]!)).toBe(1500);
    expect(powerOf(s, s.cards[gobfin]!)).toBe(400);
  });

  it('Mounted Machine Gun: consume X Material to deal 500 X times', () => {
    let s = toMain();
    s.players[0].material = 2;
    const gun = put(s, 0, 'base', 'EBP01-015');
    const pal = put(s, 0, 'base', 'EBP01-056');
    const target = put(s, 1, 'base', 'EBP01-037'); // Surfent 700
    s = activate(s, 0, gun, 0, { x: 2, assignId: pal });
    s = answer(s, 0, [target]);
    s = answer(s, 0, [target]);
    expect(s.players[1].graveyard).toContain(target);
  });

  it('Primitive Furnace: the next gear costs X less, never below 1', () => {
    let s = toMain();
    s.players[0].material = 5;
    const furnace = put(s, 0, 'base', 'EBP01-016');
    s = activate(s, 0, furnace, 1, { x: 5 });
    const gear = put(s, 0, 'hand', 'EBP01-020'); // Pump-Action Shotgun ◇7
    const before = s.players[0].soulsStanding;
    s = raw(s, 0, { type: 'playCard', cardId: gear });
    expect(before - s.players[0].soulsStanding).toBe(2);
  });

  it('Alarm Bell: stands assigned Pals; they must attack and no more assigning', () => {
    let s = toMain();
    const bell = put(s, 0, 'base', 'EBP01-018');
    const pal = put(s, 0, 'base', 'EBP01-013');
    s = activate(s, 0, bell, 0, { assignId: pal });
    expect(s.cards[pal]!.rested).toBe(false);
    expect(getLegalActions(s, 0)).not.toContainEqual({ type: 'endTurn' });
  });

  it("Foxparks' Harness: a Foxparks gets an On Attack damage skill", () => {
    let s = toMain();
    const harness = put(s, 0, 'base', 'EBP01-019');
    const foxparks = put(s, 0, 'base', 'ETD01-004');
    const target = put(s, 1, 'base', 'EBP01-056');
    s = activate(s, 0, harness, 0);
    s = answer(s, 0, [foxparks]);
    s = raw(s, 0, { type: 'attack', attackerId: foxparks, target: { kind: 'player', seat: 1 } });
    s = answer(s, 0, [target]);
    expect(s.players[1].graveyard).toContain(target);
  });

  it("Axel's Strategy: the opponent's ◇5+ Pals can't block", () => {
    let s = toMain();
    const big = put(s, 1, 'base', 'EBP01-013');
    const attacker = put(s, 0, 'base', 'EBP01-056');
    s = play(s, 0, 'EBP01-023').s;
    s = answer(s, 0, ['m2']);
    const r = raw(s, 0, { type: 'attack', attackerId: attacker, target: { kind: 'player', seat: 1 } });
    expect(r.pending?.kind).not.toBe('block');
    expect(r.cards[big]!.rested).toBe(false);
  });

  it('Treasure Chest Found!: no red structure or gear chosen → 3 Material', () => {
    let s = toMain();
    s = play(s, 0, 'EBP01-024').s;
    if (pending(s)) s = answer(s, 0, []);
    expect(s.players[0].material).toBe(3);
  });
});

describe('EBP01 blue', () => {
  it('Relaxaurus: the rested Pal does not stand while Relaxaurus is in the base', () => {
    let s = toMain();
    const target = put(s, 1, 'base', 'EBP01-056');
    s = play(s, 0, 'EBP01-026').s;
    s = answer(s, 0, [target]);
    s = act(s, 0, { type: 'endTurn' });
    expect(s.cards[target]!.rested).toBe(true);
  });

  it('Jormuntide: the rested Pal skips its next stand', () => {
    let s = toMain();
    const target = put(s, 1, 'base', 'EBP01-056');
    s = play(s, 0, 'EBP01-027').s;
    s = answer(s, 0, [target]);
    s = act(s, 0, { type: 'endTurn' });
    expect(s.cards[target]!.rested).toBe(true);
    s = act(s, 1, { type: 'endTurn' });
    s = act(s, 0, { type: 'endTurn' });
    expect(s.cards[target]!.rested).toBe(false);
  });

  it('Penking: your Pengullets get +700', () => {
    const s = toMain();
    put(s, 0, 'base', 'EBP01-031');
    const pengullet = put(s, 0, 'base', 'EBP01-028');
    expect(powerOf(s, s.cards[pengullet]!)).toBe(1300);
  });

  it("Wumpo: while rested, the opponent's Pals get −1 strike", () => {
    const s = toMain();
    const wumpo = put(s, 0, 'base', 'EBP01-033', true);
    const theirs = put(s, 1, 'base', 'EBP01-013');
    expect(strikeOf(s, s.cards[theirs]!)).toBe(1);
    s.cards[wumpo]!.rested = false;
    expect(strikeOf(s, s.cards[theirs]!)).toBe(2);
  });

  it('Mau Cryst: draws when assigned to a Farming structure', () => {
    let s = toMain();
    const ranch = put(s, 0, 'base', 'EBP01-066'); // Ranch: Farming
    const mau = put(s, 0, 'base', 'EBP01-035');
    const hand = s.players[0].hand.length;
    s = activate(s, 0, ranch, 0, { assignId: mau });
    s = answer(s, 0, ['m0']);
    expect(s.players[0].hand.length).toBe(hand + 2); // Mau Cryst + Ranch
  });

  it('Antique Curtain: returns up to X Pals, X = Antique names among your structures', () => {
    let s = toMain();
    put(s, 0, 'base', 'EBP01-042');
    put(s, 0, 'base', 'EBP01-042');
    const a = put(s, 1, 'base', 'EBP01-056');
    const b = put(s, 1, 'base', 'EBP01-086');
    s = play(s, 0, 'EBP01-039').s;
    expect(pending(s)?.max).toBe(2); // Mirror + Curtain
    s = answer(s, 0, [a, b]);
    expect(s.players[1].hand).toEqual(expect.arrayContaining([a, b]));
  });

  it('Antique Dresser: discard X to give X Pals +1000/+1', () => {
    let s = toMain();
    const dresser = put(s, 0, 'base', 'EBP01-040');
    const pal = put(s, 0, 'base', 'EBP01-056');
    const [d1, d2] = s.players[0].hand;
    put(s, 0, 'base', 'EBP01-086');
    put(s, 0, 'base', 'EBP01-099');
    s = activate(s, 0, dresser, 1, { discardIds: [d1!, d2!] });
    expect(pending(s)?.min).toBe(2);
    const other = s.players[0].base.find((id) => s.cards[id]!.cardId === 'EBP01-086')!;
    s = answer(s, 0, [pal, other]);
    expect(powerOf(s, s.cards[pal]!)).toBe(1500);
    expect(strikeOf(s, s.cards[other]!)).toBe(2);
  });

  it('Pengullet Rocket Launcher: a Pengullet can rest to hit all opposing Pals for its power', () => {
    let s = toMain();
    const launcher = put(s, 0, 'base', 'EBP01-044');
    const pengullet = put(s, 0, 'base', 'EBP01-028');
    const t1 = put(s, 1, 'base', 'EBP01-013');
    s = activate(s, 0, launcher, 0);
    s = answer(s, 0, [pengullet]);
    expect(powerOf(s, s.cards[pengullet]!)).toBe(1100);
    s = activate(s, 0, pengullet, 0);
    expect(s.cards[t1]!.damage).toBe(1100);
    expect(s.players[0].graveyard).toContain(pengullet);
  });

  it('Grappling Gun: the chosen Pal stands at end of turn', () => {
    let s = toMain();
    const gun = put(s, 0, 'base', 'EBP01-045');
    const pal = put(s, 0, 'base', 'EBP01-013');
    s = activate(s, 0, gun, 0); // the only Pal, so it's chosen automatically
    s = act(s, 0, { type: 'attack', attackerId: pal, target: { kind: 'player', seat: 1 } });
    s = act(s, 0, { type: 'endTurn' });
    expect(s.cards[pal]!.rested).toBe(false);
  });

  it('Aurora Guide is a Quick event', () => {
    let s = toMain();
    const attacker = put(s, 0, 'base', 'EBP01-013');
    const guide = put(s, 1, 'hand', 'EBP01-048');
    s.players[1].soulsStanding = 3;
    s = raw(s, 0, { type: 'attack', attackerId: attacker, target: { kind: 'player', seat: 1 } });
    expect(getLegalActions(s, 1)).toContainEqual({ type: 'playCard', cardId: guide });
  });
});

describe('EBP01 green', () => {
  it('Digtoise – Seismic Drillback: +1000/+1 with 10 or more souls', () => {
    const s = toMain();
    const d = put(s, 0, 'base', 'EBP01-050');
    expect(powerOf(s, s.cards[d]!)).toBe(1900);
    expect(strikeOf(s, s.cards[d]!)).toBe(3);
  });

  it('Petallia: gain 1 life and stand 2 souls', () => {
    let s = toMain();
    s = play(s, 0, 'EBP01-051').s;
    expect(s.players[0].life).toBe(11);
    expect(s.players[0].soulsStanding).toBe(10 - 6 + 2);
  });

  it('Rushoar: +800 when attacking a structure', () => {
    let s = toMain();
    const rushoar = put(s, 0, 'base', 'EBP01-052');
    const wall = put(s, 1, 'base', 'EBP01-042', true); // Antique Mirror, 1000 durability
    s = act(s, 0, { type: 'attack', attackerId: rushoar, target: { kind: 'card', id: wall } });
    expect(s.players[1].graveyard).toContain(wall);
  });

  it('Elizabee: +300 per Beegarde; plays a Beegarde from the top for 2 less', () => {
    let s = toMain();
    s.players[0].ingredient = 1;
    const eliza = put(s, 0, 'base', 'EBP01-053');
    put(s, 0, 'base', 'EBP01-061');
    expect(powerOf(s, s.cards[eliza]!)).toBe(1000);
    const top = put(s, 0, 'deckTop', 'EBP01-061');
    s = activate(s, 0, eliza, 0);
    const before = s.players[0].soulsStanding;
    s = answer(s, 0, ['yes']);
    expect(s.players[0].base).toContain(top);
    expect(before - s.players[0].soulsStanding).toBe(1);
  });

  it('Cola Vending Machine: stand 1 + 3X souls', () => {
    let s = toMain();
    s.players[0].soulsStanding = 0;
    s.players[0].soulsRested = 10;
    s.players[0].ingredient = 2;
    const cola = put(s, 0, 'base', 'EBP01-064');
    const pal = put(s, 0, 'base', 'EBP01-056');
    s = activate(s, 0, cola, 0, { x: 2, assignId: pal });
    expect(s.players[0].soulsStanding).toBe(7);
  });

  it('Feed Box: adds a rested soul, and stands 2 if you already had 10', () => {
    let s = toMain();
    s.players[0].soulDeck = 2;
    s.players[0].soulsStanding = 4;
    s.players[0].soulsRested = 6;
    s.players[0].ingredient = 1;
    const box = put(s, 0, 'base', 'EBP01-065');
    s = activate(s, 0, box, 0);
    expect(s.players[0].soulsRested).toBe(5);
    expect(s.players[0].soulsStanding).toBe(6);
  });

  it('No Pals Beyond Sign: the assigned Pal has Taunt through the opponent’s turn', () => {
    let s = toMain();
    const sign = put(s, 0, 'base', 'EBP01-067');
    const pal = put(s, 0, 'base', 'EBP01-056');
    s = activate(s, 0, sign, 0, { assignId: pal });
    s = act(s, 0, { type: 'endTurn' });
    const attacker = put(s, 1, 'base', 'EBP01-013');
    s.cards[pal]!.rested = true;
    const targets = getLegalActions(s, 1).filter((a) => a.type === 'attack' && a.attackerId === attacker);
    expect(targets).toEqual([{ type: 'attack', attackerId: attacker, target: { kind: 'card', id: pal } }]);
  });

  it('The Adventure Begins: draws 2 as your first card of the game', () => {
    let s = toMain();
    const hand = s.players[0].hand.length;
    s = play(s, 0, 'EBP01-100').s;
    expect(s.players[0].hand.length).toBe(hand + 2);
  });
});

describe('EBP01 purple', () => {
  it('Shadowbeak: rested means night, and auto abilities trigger twice', () => {
    let s = toMain();
    put(s, 0, 'base', 'EBP01-074', true);
    expect(isNight(s)).toBe(true);
    s = play(s, 0, 'EBP01-012').s; // Flambelle: get 2 Material
    expect(s.players[0].material).toBe(4);
  });

  it('Shadowbeak: butcher your Pal at end of turn, then the opponent loses one', () => {
    let s = toMain();
    put(s, 0, 'base', 'EBP01-074');
    const mine = put(s, 0, 'base', 'EBP01-056');
    const theirs = put(s, 1, 'base', 'EBP01-086');
    s = raw(s, 0, { type: 'endTurn' });
    s = answer(s, 0, [mine]);
    expect(s.players[0].graveyard).toContain(mine);
    expect(s.players[1].graveyard).toContain(theirs);
  });

  it('Katress: when your Pal is butchered, deploy a normal Pal costing 1 less from the graveyard', () => {
    let s = toMain();
    const katress = put(s, 0, 'base', 'EBP01-075');
    const fodder = put(s, 0, 'base', 'EBP01-037'); // ◇4
    const back = put(s, 0, 'graveyard', 'EBP01-056'); // ◇3
    s = activate(s, 0, katress, 0, { butcherId: fodder });
    expect(optionIds(s)).toEqual([back]);
    s = answer(s, 0, [back]);
    expect(s.players[0].base).toContain(back);
    expect(powerOf(s, s.cards[katress]!)).toBe(1900);
  });

  it('Helzephyr: at night, a Nocturnal Pal deploying lets you destroy a Pal of equal or lower cost', () => {
    let s = toMain();
    s.nightUntilTurn = 99;
    const helz = put(s, 0, 'base', 'EBP01-073');
    const target = put(s, 1, 'base', 'EBP01-056');
    s = play(s, 0, 'EBP01-077').s; // Pyrin Noct (Nocturnal, ◇?)
    s = answer(s, 0, [target]);
    expect(s.players[1].graveyard).toContain(target);
    s = act(s, 0, { type: 'endTurn' });
    expect(s.cards[helz]!.rested).toBe(true);
  });

  it('Maraith: rested makes it night, and opposing Pals get −200', () => {
    const s = toMain();
    put(s, 0, 'base', 'EBP01-085', true);
    const theirs = put(s, 1, 'base', 'EBP01-013');
    expect(powerOf(s, s.cards[theirs]!)).toBe(1000);
  });

  it('Lamp: your Pals are Nocturnal; milling 3 makes it night', () => {
    let s = toMain();
    const lamp = put(s, 0, 'base', 'EBP01-088');
    const pal = put(s, 0, 'base', 'EBP01-056');
    expect(powerOf(s, s.cards[pal]!)).toBe(500);
    s = activate(s, 0, lamp, 0);
    expect(powerOf(s, s.cards[pal]!)).toBe(800);
  });

  it('Viewing Cage: exiled Pals return to hand when the cage leaves', () => {
    let s = toMain();
    const cage = put(s, 0, 'base', 'EBP01-092');
    const mine = put(s, 0, 'base', 'EBP01-056'); // ◇3 → X = 5
    const theirs = put(s, 1, 'base', 'EBP01-037'); // ◇4
    s = activate(s, 0, cage, 0, { assignId: mine }); // Surfent is the only ◇5 or less Pal left
    expect(s.players[1].exile).toContain(theirs);
    s = play(s, 0, 'EBP01-070').s; // Lily's Strategy: destroy a structure or gear (only the cage)
    s = answer(s, 0, ['m1']);
    expect(s.players[1].hand).toContain(theirs);
    expect(s.players[0].hand).toContain(mine);
  });

  it("Zoe's Strategy: the opponent loses up to 5 resources, split as chosen", () => {
    let s = toMain();
    s.players[1].material = 3;
    s.players[1].ingredient = 4;
    s = play(s, 0, 'EBP01-095').s;
    s = answer(s, 0, ['m0']);
    s = answer(s, 0, ['2']);
    expect([s.players[1].material, s.players[1].ingredient]).toEqual([1, 1]);
  });

  it('Dark Cannon only hits ◇5 or less', () => {
    let s = toMain();
    put(s, 1, 'base', 'EBP01-013');
    const small = put(s, 1, 'base', 'EBP01-056');
    s = play(s, 0, 'EBP01-096').s;
    expect(s.players[1].graveyard).toContain(small);
  });

  it('Legendary keeps a second copy out (smoke check through apply)', () => {
    const s = toMain();
    put(s, 0, 'base', 'EBP02-025');
    const id = put(s, 0, 'hand', 'EBP02-025');
    expect(apply(s, 0, { type: 'playCard', cardId: id }).ok).toBe(false);
  });
});
