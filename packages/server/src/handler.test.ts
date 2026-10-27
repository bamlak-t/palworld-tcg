import { describe, expect, it } from 'vitest';
import { TRIAL_DECKS } from '@pal/engine';
import {
  CLAIM_WIN_AFTER_SECONDS,
  handle,
  MAX_SPECTATORS,
  memoryStore,
  type Request,
  type SessionInfo,
} from './index.ts';

const ETD01 = [...TRIAL_DECKS.ETD01.cards];
const ETD02 = [...TRIAL_DECKS.ETD02.cards];

/** clock: a fake time in ms that tests move forward. */
function setup() {
  const clock = { now: 1_000_000 };
  const store = memoryStore(() => clock.now);
  const pings: [string, number][] = [];
  let seed = 1;
  const deps = {
    store,
    broadcast: async (code: string, version: number) => {
      pings.push([code, version]);
    },
    random: () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    },
  };
  const call = async (req: Request) => handle(req, deps);
  const ok = async (req: Request) => {
    const r = await call(req);
    if (r.status !== 200) throw new Error(`${req.op} failed: ${JSON.stringify(r.body)}`);
    return r.body as SessionInfo;
  };
  return { call, ok, pings, store, clock };
}

async function startedGame() {
  const t = setup();
  const host = await t.ok({ op: 'create', name: 'Alice', avatarId: 'woolly', deck: ETD01 });
  const guest = await t.ok({ op: 'join', code: host.code, name: 'Bob', avatarId: 'ember', deck: ETD02 });
  return { ...t, host, guest };
}

describe('sessions', () => {
  it('creates a waiting game with a 6-character code and gives the host seat p1', async () => {
    const { ok } = setup();
    const host = await ok({ op: 'create', name: 'Alice', avatarId: 'woolly', deck: ETD01 });
    expect(host.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(host.status).toBe('waiting');
    expect(host.role).toBe('p1');
    expect(host.seatToken).toBeDefined();
    expect(host.view).toBeNull();
  });

  it('starts the game when the second player joins', async () => {
    const { host, guest, ok } = await startedGame();
    expect(guest.role).toBe('p2');
    expect(guest.status).toBe('playing');
    const hostView = await ok({ op: 'view', code: host.code, seatToken: host.seatToken! });
    expect(hostView.view?.pending?.kind).toBe('chooseFirstPlayer');
    expect(hostView.members.map((m) => m.name)).toEqual(['Alice', 'Bob']);
  });

  it('accepts codes in any case and with spaces', async () => {
    const { ok } = setup();
    const host = await ok({ op: 'create', name: 'A', avatarId: 'woolly', deck: ETD01 });
    const guest = await ok({
      op: 'join',
      code: ` ${host.code.toLowerCase()} `,
      name: 'B',
      avatarId: 'ember',
      deck: ETD02,
    });
    expect(guest.role).toBe('p2');
  });

  it(`seats up to ${MAX_SPECTATORS} spectators, then refuses`, async () => {
    const { host, call, ok } = await startedGame();
    for (let i = 0; i < MAX_SPECTATORS; i++) {
      const s = await ok({ op: 'join', code: host.code, name: `Watcher ${i}`, avatarId: 'frost' });
      expect(s.role).toBe('spectator');
      expect(s.seat).toBeNull();
      expect(s.legal).toEqual([]);
    }
    const full = await call({ op: 'join', code: host.code, name: 'Late', avatarId: 'frost' });
    expect(full).toEqual({ status: 409, body: { error: 'This game is full.' } });
  });

  it('rejects decks that break the deck rules', async () => {
    const { call } = setup();
    const tooMany = [...ETD01.slice(0, 45), ...Array(5).fill('ETD01-002')];
    const r = await call({ op: 'create', name: 'A', avatarId: 'woolly', deck: tooMany });
    expect(r.status).toBe(400);
    expect((r.body as { error: string }).error).toMatch(/At most 4 copies/);
    expect((await call({ op: 'create', name: 'A', avatarId: 'woolly', deck: ETD01.slice(0, 49) })).status).toBe(400);
  });

  it('rejects unknown codes, decks and bad names', async () => {
    const { call } = setup();
    expect((await call({ op: 'join', code: 'ZZZZZZ', name: 'A', avatarId: 'woolly', deck: ETD01 })).status).toBe(404);
    expect((await call({ op: 'create', name: 'A', avatarId: 'woolly', deck: ['NOPE'] })).status).toBe(400);
    expect((await call({ op: 'create', name: '   ', avatarId: 'woolly', deck: ETD01 })).status).toBe(400);
    expect((await call({ op: 'create', name: 'A'.repeat(25), avatarId: 'woolly', deck: ETD01 })).status).toBe(400);
  });
});

describe('hidden information', () => {
  it("never sends a player the opponent's hand, and spectators see no hands", async () => {
    const { host, guest, ok } = await startedGame();
    // Get past setup so both players hold cards.
    const chooser = (await ok({ op: 'view', code: host.code, seatToken: host.seatToken! })).view!.pending!.seat;
    const tokens = [host.seatToken!, guest.seatToken!];
    let v = await ok({ op: 'view', code: host.code, seatToken: tokens[chooser]! });
    v = await ok({
      op: 'action',
      code: host.code,
      seatToken: tokens[chooser]!,
      action: { type: 'chooseFirstPlayer', first: 0 },
      expectedVersion: v.version,
    });

    const hostView = await ok({ op: 'view', code: host.code, seatToken: host.seatToken! });
    expect(hostView.view!.players[0].hand).toHaveLength(5);
    expect(hostView.view!.players[1].hand).toBeNull();
    const guestView = await ok({ op: 'view', code: host.code, seatToken: guest.seatToken! });
    expect(guestView.view!.players[0].hand).toBeNull();

    const spectator = await ok({ op: 'join', code: host.code, name: 'Eve', avatarId: 'frost' });
    expect(spectator.view!.players.every((p) => p.hand === null)).toBe(true);

    // The opponent's card ids must not appear anywhere in what a player receives.
    const hostHandIds = hostView.view!.players[0].hand!.map((c) => c.id);
    const guestJson = JSON.stringify(guestView);
    for (const id of hostHandIds) expect(guestJson).not.toContain(id);
  });
});

describe('actions', () => {
  async function toFirstMain() {
    const g = await startedGame();
    const tokens = [g.host.seatToken!, g.guest.seatToken!];
    const step = async (
      seat: number,
      action: Request extends infer R ? (R extends { op: 'action'; action: infer A } ? A : never) : never,
    ) => {
      const v = await g.ok({ op: 'view', code: g.host.code, seatToken: tokens[seat]! });
      return g.ok({ op: 'action', code: g.host.code, seatToken: tokens[seat]!, action, expectedVersion: v.version });
    };
    const chooser = (await g.ok({ op: 'view', code: g.host.code, seatToken: tokens[0]! })).view!.pending!.seat;
    await step(chooser, { type: 'chooseFirstPlayer', first: 0 });
    await step(0, { type: 'mulligan', redraw: false });
    const main = await step(1, { type: 'mulligan', redraw: false });
    return { ...g, tokens, step, main };
  }

  it('applies a legal action and returns the new view, legal actions and events', async () => {
    const { main, pings } = await toFirstMain();
    expect(main.view!.phase).toBe('main');
    expect(pings.length).toBeGreaterThan(0);
    expect(pings.at(-1)![1]).toBe(main.version);
  });

  it("rejects actions out of turn with the engine's reason", async () => {
    const { host, tokens, call, main } = await toFirstMain();
    const r = await call({
      op: 'action',
      code: host.code,
      seatToken: tokens[1]!,
      action: { type: 'endTurn' },
      expectedVersion: main.version,
    });
    expect(r).toEqual({ status: 422, body: { error: "It's not your turn." } });
  });

  it('rejects a stale version so two tabs cannot both act on old state', async () => {
    const { host, tokens, call, main } = await toFirstMain();
    const r = await call({
      op: 'action',
      code: host.code,
      seatToken: tokens[0]!,
      action: { type: 'endTurn' },
      expectedVersion: main.version - 1,
    });
    expect(r.status).toBe(409);
  });

  it('spectators cannot act', async () => {
    const { host, call, ok, main } = await toFirstMain();
    const spec = await ok({ op: 'join', code: host.code, name: 'Eve', avatarId: 'frost' });
    const r = await call({
      op: 'action',
      code: host.code,
      seatToken: spec.seatToken!,
      action: { type: 'endTurn' },
      expectedVersion: main.version,
    });
    expect(r.status).toBe(403);
  });

  it('returns event batches since the version the client last saw', async () => {
    const { host, tokens, ok, main } = await toFirstMain();
    await ok({
      op: 'action',
      code: host.code,
      seatToken: tokens[0]!,
      action: { type: 'endTurn' },
      expectedVersion: main.version,
    });
    const seen = await ok({ op: 'view', code: host.code, seatToken: tokens[1]!, sinceVersion: main.version });
    expect(seen.events).toHaveLength(1);
    expect(seen.events[0]!.version).toBe(main.version + 1);
    expect((seen.events[0]!.events as { type: string }[]).some((e) => e.type === 'turnStarted')).toBe(true);
  });

  it('rejects a forged seat token', async () => {
    const { host, call, main } = await toFirstMain();
    const r = await call({
      op: 'action',
      code: host.code,
      seatToken: '00000000-0000-4000-8000-999999999999',
      action: { type: 'endTurn' },
      expectedVersion: main.version,
    });
    expect(r.status).toBe(401);
  });
});

describe('leaving', () => {
  it('a host leaving before anyone joins closes the game', async () => {
    const { ok, call } = setup();
    const host = await ok({ op: 'create', name: 'A', avatarId: 'woolly', deck: ETD01 });
    await ok({ op: 'leave', code: host.code, seatToken: host.seatToken! } as Request);
    expect((await call({ op: 'view', code: host.code, seatToken: host.seatToken! })).status).toBe(404);
  });

  it('a player leaving a game in progress concedes it', async () => {
    const { host, guest, call } = await startedGame();
    await call({ op: 'leave', code: host.code, seatToken: guest.seatToken! });
    const v = (await call({ op: 'view', code: host.code, seatToken: host.seatToken! })).body as SessionInfo;
    expect(v.status).toBe('finished');
    expect(v.view!.result).toEqual({ winner: 0, reason: 'Bob conceded' });
  });

  it('a spectator leaving frees their place', async () => {
    const { host, ok } = await startedGame();
    const s = await ok({ op: 'join', code: host.code, name: 'Eve', avatarId: 'frost' });
    await ok({ op: 'leave', code: host.code, seatToken: s.seatToken! } as Request);
    const v = await ok({ op: 'view', code: host.code, seatToken: host.seatToken! });
    expect(v.members.map((m) => m.role)).toEqual(['p1', 'p2']);
  });
});

describe('disconnects', () => {
  it('reports how long each member has been away', async () => {
    const { host, guest, ok, clock } = await startedGame();
    clock.now += 50_000;
    const v = await ok({ op: 'view', code: host.code, seatToken: host.seatToken! });
    expect(v.members.find((m) => m.role === 'p1')!.secondsAway).toBe(0);
    expect(v.members.find((m) => m.role === 'p2')!.secondsAway).toBe(50);
    await ok({ op: 'view', code: host.code, seatToken: guest.seatToken! });
    const again = await ok({ op: 'view', code: host.code, seatToken: host.seatToken! });
    expect(again.members.find((m) => m.role === 'p2')!.secondsAway).toBe(0);
  });

  it('you can claim the win once the opponent has been away long enough', async () => {
    const { host, guest, call, ok, clock, pings } = await startedGame();
    clock.now += (CLAIM_WIN_AFTER_SECONDS - 10) * 1000;
    expect((await call({ op: 'claimWin', code: host.code, seatToken: host.seatToken! })).status).toBe(409);
    clock.now += 20_000;
    const v = await ok({ op: 'claimWin', code: host.code, seatToken: host.seatToken! });
    expect(v.status).toBe('finished');
    expect(v.view!.result).toEqual({ winner: 0, reason: 'Bob disconnected' });
    expect(v.events.at(-1)?.events).toContainEqual(expect.objectContaining({ type: 'gameOver' }));
    expect(pings.at(-1)).toEqual([host.code, v.version]);
    // The game is over: claiming again fails.
    expect((await call({ op: 'claimWin', code: host.code, seatToken: guest.seatToken! })).status).toBe(409);
  });

  it('checking in (or moving) resets the clock, and spectators cannot claim', async () => {
    const { host, guest, call, ok, clock } = await startedGame();
    const spectator = await ok({ op: 'join', code: host.code, name: 'Eve', avatarId: 'frost' });
    clock.now += CLAIM_WIN_AFTER_SECONDS * 1000;
    await ok({ op: 'view', code: host.code, seatToken: guest.seatToken! });
    expect((await call({ op: 'claimWin', code: host.code, seatToken: host.seatToken! })).status).toBe(409);
    expect((await call({ op: 'claimWin', code: host.code, seatToken: spectator.seatToken! })).status).toBe(403);
  });
});

describe('house rules', () => {
  it("the host's starting life and soul count apply to the game", async () => {
    const { ok } = setup();
    const host = await ok({
      op: 'create',
      name: 'Alice',
      avatarId: 'woolly',
      deck: ETD01,
      rules: { startingLife: 15, souls: 12 },
    });
    expect(host.rules).toEqual({ startingLife: 15, souls: 12 });
    const guest = await ok({ op: 'join', code: host.code, name: 'Bob', avatarId: 'ember', deck: ETD02 });
    expect(guest.view!.players.map((p) => p.life)).toEqual([15, 15]);
    expect(guest.view!.players.map((p) => p.soulDeck)).toEqual([12, 12]);
    expect(guest.view!.rules).toEqual({ startingLife: 15, souls: 12 });
  });

  it('rejects out-of-range rules and defaults to the standard ones', async () => {
    const { call, ok } = setup();
    const r = await call({ op: 'create', name: 'A', avatarId: 'woolly', deck: ETD01, rules: { startingLife: 0 } });
    expect(r.status).toBe(400);
    const host = await ok({ op: 'create', name: 'A', avatarId: 'woolly', deck: ETD01 });
    expect(host.rules).toEqual({ startingLife: 10, souls: 10 });
  });
});
