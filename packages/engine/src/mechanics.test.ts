/**
 * Engine mechanics used by the booster sets, tested with small made-up scripts on vanilla
 * cards (cards with no text of their own), so each test checks one mechanic in isolation.
 */
import { describe, expect, it } from 'vitest';
import { registerScripts } from './abilities.ts';
import { copyLimit, validateDeck } from './deck.ts';
import { getLegalActions } from './legal.ts';
import { apply } from './engine.ts';
import { powerOf } from './stats.ts';
import { act, activate, answer, play, put, raw, toMain } from './testkit.ts';

// Vanilla Pals: Pyrin ◇6 1200, Surfent ◇4 700, Lifmunk ◇3 500, Nox ◇3 500, Direhowl ◇3 500.
const PYRIN = 'EBP01-013';
const SURFENT = 'EBP01-037';
const LIFMUNK = 'EBP01-056';
const NOX = 'EBP01-086';
const DIREHOWL = 'EBP01-099';
const FROSTALLION = 'EBP02-025'; // Legendary

describe('Legendary', () => {
  it('only one Legendary Pal with the same name can be put into your base', () => {
    let s = toMain();
    s = play(s, 0, FROSTALLION).s;
    const second = put(s, 0, 'hand', FROSTALLION);
    expect(getLegalActions(s, 0)).not.toContainEqual({ type: 'playCard', cardId: second });
    const r = apply(s, 0, { type: 'playCard', cardId: second });
    expect(r.ok).toBe(false);
  });
});

describe('deck copy limits', () => {
  it('reads exceptions from card text', () => {
    expect(copyLimit('EBP01-061')).toBe(Infinity); // Beegarde: any number
    expect(copyLimit('EBP02-034')).toBe(8); // Swee: up to 8
    expect(copyLimit(PYRIN)).toBe(4);
  });

  it('accepts 10 Beegarde but not 9 Swee', () => {
    const filler = (n: number) => Array.from({ length: n }, (_, i) => [PYRIN, SURFENT, LIFMUNK, NOX, DIREHOWL][i % 5]!);
    const ok = [
      ...Array(10).fill('EBP01-061'),
      ...filler(20),
      ...Array(4).fill('EBP01-021'),
      ...Array(16).fill('EBP01-021'),
    ];
    expect(validateDeck(ok).filter((p) => p.includes('Beegarde'))).toEqual([]);
    expect(validateDeck(Array(9).fill('EBP02-034')).some((p) => p.includes('At most 8'))).toBe(true);
  });
});

describe('cost changes', () => {
  it('materialReducesCost: consume X Material to reduce the cost by X (never below 1)', () => {
    registerScripts({ [PYRIN]: { materialReducesCost: true } });
    const s = toMain();
    s.players[0].material = 9;
    s.players[0].soulsStanding = 3;
    const id = put(s, 0, 'hand', PYRIN);
    const plays = getLegalActions(s, 0).filter((a) => a.type === 'playCard' && a.cardId === id);
    expect(plays.map((a) => (a.type === 'playCard' ? (a.x ?? 0) : -1))).toEqual([3, 4, 5, 6, 7, 8, 9]);
    const after = raw(s, 0, { type: 'playCard', cardId: id, x: 5 });
    expect(after.players[0].material).toBe(4);
    expect(after.players[0].soulsStanding).toBe(2); // 6 - 5 = 1
    registerScripts({ [PYRIN]: {} });
  });
});

describe('triggers and watchers', () => {
  it('a watcher fires when your other Pal is deployed, with that Pal as the subject', () => {
    registerScripts({
      [SURFENT]: {
        watchers: [
          {
            on: 'palDeployed',
            whose: 'mine',
            filter: (_s, self, c) => c.id !== self.id,
            effect: (e) => e.modify(e.subject!, 'power', 100),
          },
        ],
      },
    });
    let s = toMain();
    s = play(s, 0, SURFENT).s;
    const { id, s: s2 } = play(s, 0, LIFMUNK);
    expect(powerOf(s2, s2.cards[id]!)).toBe(600);
    registerScripts({ [SURFENT]: {} });
  });

  it('a delayed ability resolves at the end of the turn it was set up', () => {
    registerScripts({
      [DIREHOWL]: { onDeploy: (e) => e.atEndOfTurn('back'), delayed: { back: (e) => e.addToHand(e.self) } },
    });
    let s = toMain();
    const { id, s: s2 } = play(s, 0, DIREHOWL);
    expect(s2.players[0].base).toContain(id);
    s = act(s2, 0, { type: 'endTurn' });
    expect(s.players[0].hand).toContain(id);
    registerScripts({ [DIREHOWL]: {} });
  });

  it('onAttacked fires for the attacked card', () => {
    registerScripts({ [NOX]: { onAttacked: (e) => e.modify(e.self, 'power', 1000) } });
    let s = toMain();
    const nox = put(s, 1, 'base', NOX, true);
    const pyrin = put(s, 0, 'base', PYRIN);
    s = act(s, 0, { type: 'attack', attackerId: pyrin, target: { kind: 'card', id: nox } });
    // Nox (500 + 1000) survives Pyrin's 1200 and destroys it.
    expect(s.players[1].base).toContain(nox);
    expect(s.players[0].graveyard).toContain(pyrin);
    registerScripts({ [NOX]: {} });
  });
});

describe('granted skills', () => {
  it('a Pal given a skill uses it, and loses it when the duration ends', () => {
    registerScripts({
      [LIFMUNK]: {
        onDeploy: (e) =>
          e.grantSkill(
            e.chooseOne(
              'Choose a Pal',
              e.palsOf(e.me).filter((c) => c.id !== e.self.id),
            )!,
            'gather',
          ),
        grants: { gather: { onAttack: (e) => e.gain('ingredient', 1) } },
      },
    });
    let s = toMain();
    const pyrin = put(s, 0, 'base', PYRIN);
    s = play(s, 0, LIFMUNK).s;
    s = act(s, 0, { type: 'attack', attackerId: pyrin, target: { kind: 'player', seat: 1 } });
    expect(s.players[0].ingredient).toBe(1);
    s = act(s, 0, { type: 'endTurn' });
    expect(s.cards[pyrin]!.modifiers).toEqual([]);
    registerScripts({ [LIFMUNK]: {} });
  });
});

describe('durations and freeze', () => {
  it("'untilOpponentsNextTurnEnd' lasts through the opponent's turn", () => {
    registerScripts({ [NOX]: { onDeploy: (e) => e.modify(e.self, 'power', 300, 'untilOpponentsNextTurnEnd') } });
    let s = toMain();
    const { id, s: s2 } = play(s, 0, NOX);
    s = act(s2, 0, { type: 'endTurn' });
    expect(powerOf(s, s.cards[id]!)).toBe(800);
    s = act(s, 1, { type: 'endTurn' });
    expect(powerOf(s, s.cards[id]!)).toBe(500);
    registerScripts({ [NOX]: {} });
  });

  it('a frozen Pal stays rested while the card that froze it is in a base', () => {
    registerScripts({ [SURFENT]: { onDeploy: (e) => e.freeze(e.chooseOne('Freeze', e.palsOf(e.opp))!) } });
    let s = toMain();
    const target = put(s, 1, 'base', NOX, true);
    const { id: surfent, s: s2 } = play(s, 0, SURFENT);
    s = act(s2, 0, { type: 'endTurn' });
    expect(s.cards[target]!.rested).toBe(true);
    // Once Surfent is gone, the Pal stands as normal.
    s.players[0].base = s.players[0].base.filter((x) => x !== surfent);
    s = act(s, 1, { type: 'endTurn' });
    s = act(s, 0, { type: 'endTurn' });
    expect(s.cards[target]!.rested).toBe(false);
    registerScripts({ [SURFENT]: {} });
  });
});

describe('turn flags', () => {
  it('mustAttack: you cannot end the turn while a Pal can still attack', () => {
    registerScripts({ [NOX]: { onDeploy: (e) => e.setTurnFlag('mustAttack') } });
    let s = toMain();
    const pyrin = put(s, 0, 'base', PYRIN);
    s = play(s, 0, NOX).s;
    expect(getLegalActions(s, 0)).not.toContainEqual({ type: 'endTurn' });
    expect(apply(s, 0, { type: 'endTurn' }).ok).toBe(false);
    s = act(s, 0, { type: 'attack', attackerId: pyrin, target: { kind: 'player', seat: 1 } });
    // Nox itself was just deployed and is standing, so it must attack too.
    const nox = s.players[0].base.find((x) => s.cards[x]!.cardId === NOX)!;
    s = act(s, 0, { type: 'attack', attackerId: nox, target: { kind: 'player', seat: 1 } });
    expect(getLegalActions(s, 0)).toContainEqual({ type: 'endTurn' });
    registerScripts({ [NOX]: {} });
  });
});

describe('X costs', () => {
  it('an ability that consumes X Material gets X', () => {
    registerScripts({
      [PYRIN]: {
        acts: [
          {
            label: 'Pump',
            zone: 'base',
            costs: [{ xMaterial: { min: 1 } }],
            effect: (e) => e.modify(e.self, 'power', 100 * e.x),
          },
        ],
      },
    });
    const s = toMain();
    s.players[0].material = 3;
    const pyrin = put(s, 0, 'base', PYRIN);
    const after = activate(s, 0, pyrin, 0, { x: 2 });
    expect(powerOf(after, after.cards[pyrin]!)).toBe(1400);
    expect(after.players[0].material).toBe(1);
    expect(apply(s, 0, { type: 'activate', sourceId: pyrin, index: 0, cost: { x: 4 } }).ok).toBe(false);
    registerScripts({ [PYRIN]: {} });
  });
});

describe('modes', () => {
  it('chooseMode returns the chosen option, skipping disabled ones', () => {
    registerScripts({
      [NOX]: {
        onDeploy: (e) => {
          const m = e.chooseMode('Choose one', ['Draw', 'Material', 'Ingredient'], [false, true, false]);
          if (m === 0) e.draw(1);
          if (m === 2) e.gain('ingredient', 2);
        },
      },
    });
    let s = toMain();
    s = play(s, 0, NOX).s;
    expect(s.pending?.kind === 'effectChoice' && s.pending.options.map((o) => o.id)).toEqual(['m0', 'm2']);
    s = answer(s, 0, ['m2']);
    expect(s.players[0].ingredient).toBe(2);
    registerScripts({ [NOX]: {} });
  });
});

describe('house rules', () => {
  it('starting life and soul count come from the rules', async () => {
    const { createGame } = await import('./engine.ts');
    const { TRIAL_DECKS } = await import('./decks.ts');
    const { state } = createGame(
      1,
      [
        { name: 'A', deck: [...TRIAL_DECKS.ETD01.cards] },
        { name: 'B', deck: [...TRIAL_DECKS.ETD02.cards] },
      ],
      { startingLife: 7, souls: 14 },
    );
    expect(state.players.map((p) => [p.life, p.soulDeck])).toEqual([
      [7, 14],
      [7, 14],
    ]);
    expect(() =>
      createGame(
        1,
        [
          { name: 'A', deck: [] },
          { name: 'B', deck: [] },
        ],
        { souls: 50 },
      ),
    ).toThrow();
  });
});

describe('turn clock and timeouts', () => {
  it('the turn player keeps their remaining time across an opponent response', async () => {
    const { advanceClock, deadline } = await import('./clock.ts');
    const s = toMain();
    let clock = advanceClock(null, s, 0)!;
    expect(deadline(clock, s, 60)).toBe(60_000);
    // 20s in, the opponent has to respond: they get a full minute of their own.
    const responding = { ...s, pending: { kind: 'quickStep' as const, seat: 1 as const } };
    clock = advanceClock(clock, responding, 20_000)!;
    expect(deadline(clock, responding, 60)).toBe(80_000);
    // Back to the turn player 5s later: 40s left.
    clock = advanceClock(clock, s, 25_000)!;
    expect(deadline(clock, s, 60)).toBe(65_000);
  });

  it('expire: ends the turn, even if Pals still had to attack', async () => {
    const { expire } = await import('./engine.ts');
    let s = toMain();
    s.turnFlags = { mustAttack: [0], noAssign: [] };
    put(s, 0, 'base', PYRIN);
    const r = expire(s);
    expect(r.ok && r.state.activeSeat).toBe(1);
    expect(r.ok && r.events[0]).toEqual({ type: 'timedOut', seat: 0 });
    s = r.ok ? r.state : s;
  });

  it('expire: an unanswered choice takes the fewest picks allowed', async () => {
    const { expire } = await import('./engine.ts');
    registerScripts({ [NOX]: { onDeploy: (e) => e.chooseUpTo(1, 'Pick', e.pals()).forEach((c) => e.rest(c)) } });
    let s = toMain();
    put(s, 1, 'base', PYRIN);
    s = play(s, 0, NOX).s;
    expect(s.pending?.kind).toBe('effectChoice');
    const r = expire(s);
    expect(r.ok && r.state.pending).toBeNull();
    registerScripts({ [NOX]: {} });
  });
});
