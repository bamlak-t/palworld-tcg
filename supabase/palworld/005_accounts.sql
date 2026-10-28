-- Accounts (username + password) and the decks saved to them, so decks follow a player
-- between devices. Like the rest of the schema, only the palworld-game Edge Function
-- touches these tables: browsers get no privileges and RLS stays on.
-- Safe to re-run. Apply with: npm run db:apply

create table if not exists palworld.accounts (
  id uuid primary key default gen_random_uuid(),
  -- Lowercase; checked by the function (3–20 of a-z, 0-9, - and _).
  username text not null unique,
  -- "pbkdf2$<iterations>$<salt>$<hash>".
  password_hash text not null,
  created_at timestamptz not null default now()
);

-- Sign-in tokens, stored as SHA-256 hashes. Unused for 180 days, they stop working.
create table if not exists palworld.account_tokens (
  token_hash text primary key,
  account_id uuid not null references palworld.accounts (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_used timestamptz not null default now()
);
create index if not exists account_tokens_account on palworld.account_tokens (account_id);

create table if not exists palworld.decks (
  account_id uuid not null references palworld.accounts (id) on delete cascade,
  -- The id the web app gave the deck, e.g. deck:lq2k3x9a.
  id text not null,
  name text not null,
  -- Card id → copies.
  cards jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (account_id, id)
);

alter table palworld.accounts enable row level security;
alter table palworld.account_tokens enable row level security;
alter table palworld.decks enable row level security;

revoke all on all tables in schema palworld from public, anon, authenticated;
