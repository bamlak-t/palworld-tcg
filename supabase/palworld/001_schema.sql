-- Palworld TCG online play. Everything lives in its own schema so it can share a Supabase
-- project with another app without touching that app's tables.
--
-- Clients never query these tables: the palworld-game Edge Function connects with the
-- database URL and enforces every rule. The schema isn't exposed through the Data API and
-- the browser-facing roles get no privileges, with RLS on as a second guard.
--
-- Safe to re-run. Apply with: npm run db:apply

create schema if not exists palworld;

create table if not exists palworld.sessions (
  id uuid primary key default gen_random_uuid(),
  -- Short join code, e.g. K7QP2M.
  code text not null unique,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  -- Full engine state (hidden information included); null until both players have joined.
  state jsonb,
  -- Bumped on every accepted action; clients send the version they saw (optimistic lock).
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists palworld.members (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references palworld.sessions (id) on delete cascade,
  role text not null check (role in ('p1', 'p2', 'spectator')),
  -- Secret that identifies this seat; stored in the joiner's browser.
  seat_token uuid not null unique default gen_random_uuid(),
  display_name text not null,
  avatar_id text not null,
  deck_id text,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

-- One p1 and one p2 per session; spectators are capped in the function.
create unique index if not exists members_one_player_per_seat
  on palworld.members (session_id, role) where role in ('p1', 'p2');
create index if not exists members_session on palworld.members (session_id);

-- Append-only log of engine events per accepted action, for animations, the game log and
-- replays. Events carry no hidden information.
create table if not exists palworld.events (
  id bigint generated always as identity primary key,
  session_id uuid not null references palworld.sessions (id) on delete cascade,
  version integer not null,
  events jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists events_session_version on palworld.events (session_id, version);

alter table palworld.sessions enable row level security;
alter table palworld.members enable row level security;
alter table palworld.events enable row level security;

revoke all on schema palworld from public, anon, authenticated;
revoke all on all tables in schema palworld from public, anon, authenticated;
revoke all on all sequences in schema palworld from public, anon, authenticated;
