/** Postgres implementation of the session store, using the function's direct database URL. */
import type postgres from 'postgres';
import type { MemberRow, SessionRow, Store, Tx } from '@pal/server';

type TxSql = postgres.TransactionSql;

const session = (r: Record<string, unknown>): SessionRow => ({
  id: r.id as string,
  code: r.code as string,
  status: r.status as SessionRow['status'],
  state: r.state as SessionRow['state'],
  version: r.version as number,
  rules: (r.rules as SessionRow['rules']) ?? null,
  clock: (r.clock as SessionRow['clock']) ?? null,
});

const member = (r: Record<string, unknown>): MemberRow => ({
  id: r.id as string,
  sessionId: r.session_id as string,
  role: r.role as MemberRow['role'],
  seatToken: r.seat_token as string,
  displayName: r.display_name as string,
  avatarId: r.avatar_id as string,
  deck: (r.deck as string[] | null) ?? null,
  secondsAway: Number(r.seconds_away ?? 0),
});

function tx(sql: TxSql): Tx {
  return {
    async sessionByCode(code) {
      const [r] = await sql`select * from palworld.sessions where code = ${code} for update`;
      return r ? session(r) : null;
    },
    async insertSession(code, rules) {
      const [r] =
        await sql`insert into palworld.sessions (code, rules) values (${code}, ${rules ? sql.json(rules) : null}) returning *`;
      return session(r!);
    },
    async updateSession(id, patch) {
      const row: Record<string, unknown> = { updated_at: new Date() };
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.version !== undefined) row.version = patch.version;
      if (patch.state !== undefined) row.state = sql.json(patch.state as never);
      if (patch.clock !== undefined) row.clock = patch.clock ? sql.json(patch.clock as never) : null;
      await sql`update palworld.sessions set ${sql(row)} where id = ${id}`;
    },
    async deleteSession(id) {
      await sql`delete from palworld.sessions where id = ${id}`;
    },
    async deleteStaleSessions(hours) {
      await sql`delete from palworld.sessions where updated_at < now() - make_interval(hours => ${hours})`;
    },
    async members(sessionId) {
      const rows =
        await sql`select *, extract(epoch from now() - last_seen) as seconds_away from palworld.members where session_id = ${sessionId} order by joined_at`;
      return rows.map(member);
    },
    async memberByToken(sessionId, seatToken) {
      const [r] =
        await sql`select *, extract(epoch from now() - last_seen) as seconds_away from palworld.members where session_id = ${sessionId} and seat_token = ${seatToken}`;
      return r ? member(r) : null;
    },
    async insertMember(m) {
      const [r] = await sql`
        insert into palworld.members (session_id, role, display_name, avatar_id, deck)
        values (${m.sessionId}, ${m.role}, ${m.displayName}, ${m.avatarId}, ${m.deck ? sql.json(m.deck) : null})
        returning *`;
      return member(r!);
    },
    async deleteMember(id) {
      await sql`delete from palworld.members where id = ${id}`;
    },
    async touchMember(id) {
      await sql`update palworld.members set last_seen = now() where id = ${id}`;
    },
    async insertEvents(sessionId, version, events) {
      await sql`insert into palworld.events (session_id, version, events) values (${sessionId}, ${version}, ${sql.json(events as never)})`;
    },
    async eventsSince(sessionId, version) {
      const rows = await sql`
        select version, events from palworld.events
        where session_id = ${sessionId} and version > ${version}
        order by version limit 50`;
      return rows.map((r) => ({ version: r.version as number, events: r.events as unknown[] }));
    },
  };
}

export const pgStore = (sql: postgres.Sql): Store => ({
  transaction: (fn) => sql.begin((t) => fn(tx(t))) as never,
});
