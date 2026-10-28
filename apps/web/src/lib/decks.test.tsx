import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { handle, memoryStore, type Request } from '@pal/server';

// The real account handler behind the client's API, with a switch to simulate going offline.
const server = vi.hoisted(() => ({ offline: false, deps: null as unknown }));
vi.mock('@/game/online', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/game/online')>();
  return {
    ...actual,
    call: async (body: Request) => {
      if (server.offline) throw new actual.GameApiError(0, 'Failed to fetch');
      const res = await handle(body, server.deps as Parameters<typeof handle>[1]);
      if (res.status !== 200) throw new actual.GameApiError(res.status, (res.body as { error: string }).error);
      return res.body;
    },
  };
});

const { signIn, signOut, signUp } = await import('./account');
const { syncDecks, useDecks, useDeckSync } = await import('./decks');

const deck = (id: string, name = id) => ({ id, name, cards: { 'ETD01-002': 4 }, updatedAt: 0 });

beforeEach(() => {
  localStorage.clear();
  server.offline = false;
  server.deps = { store: memoryStore(), broadcast: async () => {}, random: Math.random };
});
afterEach(() => signOut());

const hook = () => renderHook(() => ({ decks: useDecks(), sync: useDeckSync() }));
const names = (h: ReturnType<typeof hook>) => h.result.current.decks.saved.map((d) => d.name);

describe('deck sync', () => {
  it('keeps decks on this device when signed out', () => {
    const h = hook();
    act(() => void h.result.current.decks.save(deck('deck:a', 'Fire')));
    expect(names(h)).toEqual(['Fire']);
    expect(h.result.current.sync).toEqual({ state: 'local' });
  });

  it('moves this device’s decks into the account on sign-up, and they show on another device', async () => {
    const h = hook();
    act(() => void h.result.current.decks.save(deck('deck:a', 'Fire')));
    await act(() => signUp('alice', 'secret1'));
    expect(names(h)).toEqual(['Fire']);
    expect(h.result.current.sync).toEqual({ state: 'synced' });

    // "Another device": nothing local, sign in to the same account.
    act(() => signOut());
    expect(names(h)).toEqual([]); // signing out leaves the account's decks in the account
    await act(() => signIn('alice', 'secret1'));
    expect(names(h)).toEqual(['Fire']);
  });

  it('saves and deletes through the account', async () => {
    await signUp('alice', 'secret1');
    const h = hook();
    await act(async () => {
      h.result.current.decks.save(deck('deck:a', 'Fire'));
      h.result.current.decks.save(deck('deck:b', 'Water'));
      await syncDecks();
    });
    await act(async () => {
      h.result.current.decks.remove('deck:a');
      await syncDecks();
    });
    act(() => signOut());
    await act(() => signIn('alice', 'secret1'));
    expect(names(h)).toEqual(['Water']);
  });

  it('keeps changes made offline and uploads them once back online', async () => {
    await signUp('alice', 'secret1');
    const h = hook();
    server.offline = true;
    await act(async () => {
      h.result.current.decks.save(deck('deck:a', 'Fire'));
      await syncDecks();
    });
    expect(names(h)).toEqual(['Fire']); // shown straight away
    expect(h.result.current.sync).toEqual({ state: 'offline' });

    server.offline = false;
    await act(() => syncDecks());
    expect(h.result.current.sync).toEqual({ state: 'synced' });
    act(() => signOut());
    await act(() => signIn('alice', 'secret1'));
    expect(names(h)).toEqual(['Fire']);
  });

  it('when the sign-in stops working, keeps the decks on this device', async () => {
    await signUp('alice', 'secret1');
    const h = hook();
    await act(async () => {
      h.result.current.decks.save(deck('deck:a', 'Fire'));
      await syncDecks();
    });
    // The server forgets every token (e.g. it expired).
    server.deps = { ...(server.deps as object), store: memoryStore() };
    await act(() => syncDecks());
    expect(h.result.current.sync).toEqual({ state: 'local' });
    expect(names(h)).toEqual(['Fire']);
  });
});
