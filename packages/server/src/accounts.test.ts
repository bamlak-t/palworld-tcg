import { describe, expect, it } from 'vitest';
import { handle, memoryStore, type Request } from './index.ts';

function setup() {
  const clock = { now: 1_000_000 };
  const deps = { store: memoryStore(() => clock.now), broadcast: async () => {}, random: Math.random };
  const call = (req: Request) => handle(req, deps);
  const ok = async <T>(req: Request) => {
    const r = await call(req);
    if (r.status !== 200) throw new Error(`${req.op} failed: ${JSON.stringify(r.body)}`);
    return r.body as T;
  };
  const signUp = (username = 'Alice', password = 'secret1') =>
    ok<{ username: string; token: string }>({ op: 'signUp', username, password });
  return { call, ok, signUp, clock };
}

const deck = { id: 'deck:a', name: 'Fire', cards: { 'ETD01-002': 4, 'ETD01-006': 2 } };

describe('accounts', () => {
  it('signs up with a lowercase username and signs in again with the password', async () => {
    const t = setup();
    const up = await t.signUp();
    expect(up.username).toBe('alice');
    expect(up.token.length).toBeGreaterThan(20);
    const again = await t.ok<{ token: string }>({ op: 'signIn', username: ' ALICE ', password: 'secret1' });
    expect(again.token).not.toBe(up.token);
  });

  it('rejects taken usernames, bad usernames, short passwords and wrong passwords', async () => {
    const t = setup();
    await t.signUp();
    expect((await t.call({ op: 'signUp', username: 'alice', password: 'secret1' })).status).toBe(409);
    expect((await t.call({ op: 'signUp', username: 'a b', password: 'secret1' })).status).toBe(400);
    expect((await t.call({ op: 'signUp', username: 'bob', password: '123' })).status).toBe(400);
    const wrong = await t.call({ op: 'signIn', username: 'alice', password: 'nope!!' });
    const unknown = await t.call({ op: 'signIn', username: 'carol', password: 'secret1' });
    expect(wrong).toEqual({ status: 401, body: { error: 'Wrong username or password.' } });
    expect(unknown).toEqual(wrong); // doesn't reveal which usernames exist
  });

  it('saves, lists, replaces and deletes decks per account', async () => {
    const t = setup();
    const { token } = await t.signUp();
    const other = await t.signUp('bob');
    await t.ok({ op: 'saveDeck', token, deck });
    t.clock.now += 1000;
    await t.ok({ op: 'saveDeck', token, deck: { id: 'deck:b', name: 'Water', cards: { 'ETD02-001': 1 } } });
    t.clock.now += 1000;
    await t.ok({ op: 'saveDeck', token, deck: { ...deck, name: 'Fire 2' } });

    const { decks } = await t.ok<{ decks: { id: string; name: string; updatedAt: number }[] }>({ op: 'decks', token });
    expect(decks.map((d) => [d.id, d.name])).toEqual([
      ['deck:a', 'Fire 2'],
      ['deck:b', 'Water'],
    ]);
    expect(await t.ok({ op: 'decks', token: other.token })).toEqual({ decks: [] });

    await t.ok({ op: 'deleteDeck', token, id: 'deck:a' });
    expect((await t.ok<{ decks: unknown[] }>({ op: 'decks', token })).decks).toHaveLength(1);
  });

  it('checks decks: known cards, whole counts, at most 50 cards', async () => {
    const t = setup();
    const { token } = await t.signUp();
    const save = (cards: Record<string, number>) => t.call({ op: 'saveDeck', token, deck: { ...deck, cards } });
    expect((await save({ 'NOPE-001': 1 })).status).toBe(400);
    expect((await save({ 'ETD01-002': 1.5 })).status).toBe(400);
    expect((await save({ 'ETD01-002': 30, 'ETD01-006': 21 })).status).toBe(400);
    expect((await save({ 'ETD01-002': 30, 'ETD01-006': 20 })).status).toBe(200); // incomplete or illegal decks are fine to keep
  });

  it('stores UI preferences per account', async () => {
    const t = setup();
    const { token } = await t.signUp();
    const other = await t.signUp('bob');
    expect(await t.ok({ op: 'prefs', token })).toEqual({ prefs: null });
    const prefs = { theme: 'dark', settings: { skinId: 'desert' } };
    await t.ok({ op: 'savePrefs', token, prefs });
    expect(await t.ok({ op: 'prefs', token })).toEqual({ prefs });
    expect(await t.ok({ op: 'prefs', token: other.token })).toEqual({ prefs: null });
    expect((await t.call({ op: 'savePrefs', token, prefs: [] as never })).status).toBe(400);
    expect((await t.call({ op: 'savePrefs', token, prefs: { big: 'x'.repeat(9000) } })).status).toBe(400);
  });

  it('needs a valid token, and signing out ends it', async () => {
    const t = setup();
    const { token } = await t.signUp();
    expect((await t.call({ op: 'decks', token: 'forged' })).status).toBe(401);
    await t.ok({ op: 'signOut', token });
    expect((await t.call({ op: 'decks', token })).status).toBe(401);
  });
});
