-- House rules (starting life, soul count) chosen by the host when creating a game.
-- Null means the standard rules. Safe to re-run.
alter table palworld.sessions add column if not exists rules jsonb;
