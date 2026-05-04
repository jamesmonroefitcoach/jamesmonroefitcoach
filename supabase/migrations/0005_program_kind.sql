-- 0005 — distinguish in-gym (James-led, day-by-day) from at-home (client follows independently) programs

do $$ begin
  create type program_kind as enum ('in_gym', 'at_home');
exception when duplicate_object then null; end $$;

alter table programs
  add column if not exists program_kind program_kind not null default 'in_gym';

-- At-home programs typically have a recommended cadence (e.g. "3x/week") that doesn't map cleanly to specific days.
alter table programs
  add column if not exists at_home_cadence text;          -- "3x/week", "daily mobility", etc.

create index if not exists programs_kind_idx on programs(program_kind);
