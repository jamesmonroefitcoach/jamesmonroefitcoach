-- 0028 — Client program day logs
--
-- When a client finishes a day of their program they submit it (their actual
-- weights/reps per set + a post-session note, dated). Each submission lands
-- here so James is notified and can review it on the client's profile. One
-- row per (program, day, date) the client logs — a day repeats across the
-- program's weeks, so multiple dated rows per day_index are expected.

create table if not exists program_day_logs (
  id          uuid primary key default uuid_generate_v4(),
  program_id  uuid not null references programs(id) on delete cascade,
  client_id   uuid not null,
  coach_id    uuid,
  day_index   int  not null default 0,
  day_title   text,
  logged_date date,
  entries     jsonb,                 -- per-exercise actuals { key: {weights[],reps[],done,notes,name} }
  note        text,                  -- post-session note
  submitted_at timestamptz not null default now(),
  reviewed_at  timestamptz,          -- set when James reviews → drives the "new" badge
  created_at   timestamptz not null default now()
);

create index if not exists program_day_logs_client_idx  on program_day_logs (client_id, submitted_at desc);
create index if not exists program_day_logs_program_idx on program_day_logs (program_id, day_index);
