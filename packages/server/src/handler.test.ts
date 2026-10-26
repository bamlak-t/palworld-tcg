import { describe, expect, it } from 'vitest';
import { handle, MAX_SPECTATORS, memoryStore, type Request, type SessionInfo } from './index.ts';

function setup() {
  const store = memoryStore();
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
  return { call, ok, pings, store };
}

async function startedGame() {
  const t = setup();
  const host = await t.ok({ op: 'create', name: 'Alice', avatarId: 'woolly', deckId: 'ETD01' });
  const guest = await t.ok({ op: 'join', code: host.code, name: 'Bob', avatarId: 'ember', deckId: 'ETD02' });
  return { ...t, host, guest };
}

describe('sessions', () => {
  it('creates a waiting game with a 6-character code and gives the host seat p1', async () => {
    const { ok } = setup();
    const host = await ok({ op: 'create', name: 'Alice', avatarId: 'woolly', deckId: 'ETD01' });
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
    const host = await ok({ op: 'create', name: 'A', avatarId: 'woolly', deckId: 'ETD01' });
    const guest = await ok({
      op: 'join',
      code: ` ${host.code.toLowerCase()} `,
      name: 'B',
      avatarId: 'ember',
      deckId: 'ETD02',
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

  it('rejects unknown codes, decks and bad names', async () => {
    const { call } = setup();
    expect((await call({ op: 'join', code: 'ZZZZZZ', name: 'A', avatarId: 'woolly', deckId: 'ETD01' })).status).toBe(
      404,
    );
    expect((await call({ op: 'create', name: 'A', avatarId: 'woolly', deckId: 'NOPE' })).status).toBe(400);
    expect((await call({ op: 'create', name: '   ', avatarId: 'woolly', deckId: 'ETD01' })).status).toBe(400);
    expect((await call({ op: 'create', name: 'A'.repeat(25), avatarId: 'woolly', deckId: 'ETD01' })).status).toBe(400);
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
    const host = await ok({ op: 'create', name: 'A', avatarId: 'woolly', deckId: 'ETD01' });
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
