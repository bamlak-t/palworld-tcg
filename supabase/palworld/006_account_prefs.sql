-- UI preferences per account (board skin, theme, player name and avatar, reduce motion,
-- house rules for new games), so they follow a player between devices. The web app owns
-- the shape; the function only checks it's a small JSON object.
-- Safe to re-run. Apply with: npm run db:apply

create table if not exists palworld.account_prefs (
  account_id uuid primary key references palworld.accounts (id) on delete cascade,
  prefs jsonb not null,
  updated_at timestamptz not null default now()
);

alter table palworld.account_prefs enable row level security;
revoke all on all tables in schema palworld from public, anon, authenticated;
