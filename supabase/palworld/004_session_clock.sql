-- The move clock for games with a turn timer: whose move it is and since when.
-- Null for untimed games. Safe to re-run.
alter table palworld.sessions add column if not exists clock jsonb;
