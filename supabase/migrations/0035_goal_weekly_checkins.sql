-- Weekly goals check-in (James's self-survey on the Goals page).
-- One row per goal per week: numeric goals store the typed value,
-- non-numeric goals store a 1-5 star self-score.
create table if not exists goal_weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals(id) on delete cascade,
  week_start date not null,
  value numeric,
  stars smallint check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (goal_id, week_start)
);

create index if not exists goal_weekly_checkins_goal_week_idx
  on goal_weekly_checkins (goal_id, week_start desc);
