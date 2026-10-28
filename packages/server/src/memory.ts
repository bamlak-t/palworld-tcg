import type { AccountRow, DeckRow, EventBatchRow, MemberRow, SessionRow, Store, Tx } from './store.ts';

/** In-memory store for tests. Transactions run one at a time. */
export function memoryStore(
  now: () => number = Date.now,
): Store & { dump(): { sessions: SessionRow[]; members: MemberRow[] } } {
  const lastSeen = new Map<string, number>();
  const away = (m: MemberRow): MemberRow => ({ ...m, secondsAway: (now() - (lastSeen.get(m.id) ?? now())) / 1000 });
  const sessions = new Map<string, SessionRow & { updatedAt: number }>();
  const members = new Map<string, MemberRow>();
  const events: (EventBatchRow & { sessionId: string })[] = [];
  const accounts = new Map<string, AccountRow>();
  const tokens = new Map<string, string>(); // token hash → account id
  const decks = new Map<string, DeckRow & { accountId: string }>(); // keyed by account id + deck id
  let ids = 0;
  let queue = Promise.resolve();
  const uuid = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`;

  const tx: Tx = {
    async sessionByCode(code) {
      const s = [...sessions.values()].find((x) => x.code === code);
      return s
        ? structuredClone({
            id: s.id,
            code: s.code,
            status: s.status,
            state: s.state,
            version: s.version,
            rules: s.rules,
            clock: s.clock,
          })
        : null;
    },
    async insertSession(code, rules) {
      const row = {
        id: uuid(),
        code,
        status: 'waiting' as const,
        state: null,
        version: 0,
        rules,
        clock: null,
        updatedAt: Date.now(),
      };
      sessions.set(row.id, row);
      return { id: row.id, code, status: row.status, state: null, version: 0, rules, clock: null };
    },
    async updateSession(id, patch) {
      const s = sessions.get(id)!;
      Object.assign(s, structuredClone(patch), { updatedAt: Date.now() });
    },
    async deleteSession(id) {
      sessions.delete(id);
      for (const [k, m] of members) if (m.sessionId === id) members.delete(k);
    },
    async deleteStaleSessions(hours) {
      const cutoff = Date.now() - hours * 3600_000;
      for (const s of [...sessions.values()]) if (s.updatedAt < cutoff) await tx.deleteSession(s.id);
    },
    async members(sessionId) {
      return [...members.values()].filter((m) => m.sessionId === sessionId).map(away);
    },
    async memberByToken(sessionId, seatToken) {
      const m = [...members.values()].find((x) => x.sessionId === sessionId && x.seatToken === seatToken);
      return m ? away(m) : null;
    },
    async insertMember(m) {
      const row: MemberRow = { ...m, id: uuid(), seatToken: uuid(), secondsAway: 0 };
      members.set(row.id, row);
      lastSeen.set(row.id, now());
      return { ...row };
    },
    async deleteMember(id) {
      members.delete(id);
    },
    async touchMember(id) {
      lastSeen.set(id, now());
    },
    async insertEvents(sessionId, version, evs) {
      events.push({ sessionId, version, events: structuredClone(evs) });
    },
    async eventsSince(sessionId, version) {
      return events
        .filter((e) => e.sessionId === sessionId && e.version > version)
        .map(({ version, events }) => ({ version, events }));
    },
    async accountByUsername(username) {
      const a = [...accounts.values()].find((x) => x.username === username);
      return a ? { ...a } : null;
    },
    async insertAccount(username, passwordHash) {
      const row = { id: uuid(), username, passwordHash };
      accounts.set(row.id, row);
      return { ...row };
    },
    async insertToken(accountId, tokenHash) {
      tokens.set(tokenHash, accountId);
    },
    async accountByToken(tokenHash) {
      const id = tokens.get(tokenHash);
      const a = id ? accounts.get(id) : undefined;
      return a ? { ...a } : null;
    },
    async deleteToken(tokenHash) {
      tokens.delete(tokenHash);
    },
    async decks(accountId) {
      return [...decks.values()]
        .filter((d) => d.accountId === accountId)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map(({ accountId: _, ...d }) => structuredClone(d));
    },
    async upsertDeck(accountId, deck) {
      const row = { ...structuredClone(deck), updatedAt: now(), accountId };
      decks.set(`${accountId}/${deck.id}`, row);
      const { accountId: _, ...d } = row;
      return structuredClone(d);
    },
    async deleteDeck(accountId, id) {
      decks.delete(`${accountId}/${id}`);
    },
  };

  return {
    transaction(fn) {
      const run = queue.then(() => fn(tx));
      queue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
    dump: () => ({ sessions: [...sessions.values()], members: [...members.values()] }),
  };
}
