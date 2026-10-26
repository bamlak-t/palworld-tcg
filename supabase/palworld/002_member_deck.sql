-- Players bring their own decks: store the 50 card ids on the seat.
-- Safe to re-run. Apply with: npm run db:apply
alter table palworld.members add column if not exists deck jsonb;
alter table palworld.members drop column if exists deck_id;
