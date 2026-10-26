import type { EventBatchRow, MemberRow, SessionRow, Store, Tx } from './store.ts';

/** In-memory store for tests. Transactions run one at a time. */
export function memoryStore(): Store & { dump(): { sessions: SessionRow[]; members: MemberRow[] } } {
  const sessions = new Map<string, SessionRow & { updatedAt: number }>();
  const members = new Map<string, MemberRow>();
  const events: (EventBatchRow & { sessionId: string })[] = [];
  let ids = 0;
  let queue = Promise.resolve();
  const uuid = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`;

  const tx: Tx = {
    async sessionByCode(code) {
      const s = [...sessions.values()].find((x) => x.code === code);
      return s
        ? structuredClone({ id: s.id, code: s.code, status: s.status, state: s.state, version: s.version })
        : null;
    },
    async insertSession(code) {
      const row = { id: uuid(), code, status: 'waiting' as const, state: null, version: 0, updatedAt: Date.now() };
      sessions.set(row.id, row);
      return { id: row.id, code, status: row.status, state: null, version: 0 };
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
      return [...members.values()].filter((m) => m.sessionId === sessionId).map((m) => ({ ...m }));
    },
    async memberByToken(sessionId, seatToken) {
      const m = [...members.values()].find((x) => x.sessionId === sessionId && x.seatToken === seatToken);
      return m ? { ...m } : null;
    },
    async insertMember(m) {
      const row: MemberRow = { ...m, id: uuid(), seatToken: uuid() };
      members.set(row.id, row);
      return { ...row };
    },
    async deleteMember(id) {
      members.delete(id);
    },
    async touchMember() {},
    async insertEvents(sessionId, version, evs) {
      events.push({ sessionId, version, events: structuredClone(evs) });
    },
    async eventsSince(sessionId, version) {
      return events
        .filter((e) => e.sessionId === sessionId && e.version > version)
        .map(({ version, events }) => ({ version, events }));
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
