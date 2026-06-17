-- 0029 — Growth Plan
-- One editable row per real client + blank rows for potential clients.
-- "tested_*" columns are the what-if values; they override the live
-- snapshot (rate, sessions-per-week) inside the planning view but
-- don't touch client_details or appointments.

create table if not exists growth_plan_rows (
  id             uuid primary key default uuid_generate_v4(),
  coach_id       uuid not null references profiles(id) on delete cascade,
  client_id      uuid references profiles(id) on delete set null,
  label          text,                              -- used when client_id is null
  tested_rate    numeric(8,2),
  tested_spw     numeric(4,2),                      -- tested sessions per week (avg)
  blackout_start date,
  blackout_end   date,
  end_date       date,
  notes          text,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists growth_plan_rows_coach_idx on growth_plan_rows(coach_id);
create index if not exists growth_plan_rows_client_idx on growth_plan_rows(client_id);

-- Named what-if scenarios ride on top of the rows. `changes` is a jsonb
-- keyed by row id with per-field overrides:
--   { "<row_id>": { "rate": 80, "spw": 2, "end_date": "2026-09-01" } }
create table if not exists growth_plan_scenarios (
  id          uuid primary key default uuid_generate_v4(),
  coach_id    uuid not null references profiles(id) on delete cascade,
  name        text not null,
  notes       text,
  changes     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists growth_plan_scenarios_coach_idx on growth_plan_scenarios(coach_id);
