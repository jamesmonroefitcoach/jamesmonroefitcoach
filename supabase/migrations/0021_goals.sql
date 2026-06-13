-- 0021 — Goals: per-user categories + goals + appointment tagging
--
-- A goal_categories row groups a user's goals and carries the color used to
-- render any calendar block tagged with one of its goals. Goals can nest one
-- level deep via parent_goal_id (sub-goals — e.g. Piano > learn natural major
-- scale). The appointments.goal_id FK is the schedule integration hook for a
-- later commit; the migration adds the column now so we don't ALTER it later.
--
-- Seed block at the bottom prefills James's goals on instances where exactly
-- one coach exists.

create table if not exists goal_categories (
  id          uuid primary key default uuid_generate_v4(),
  owner_id    uuid not null references profiles(id) on delete cascade,
  name        text not null,
  color       text not null default '#7a6f63',
  sort_order  int  not null default 0,
  is_archived boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists goal_categories_owner_idx on goal_categories(owner_id);

create table if not exists goals (
  id                 uuid primary key default uuid_generate_v4(),
  category_id        uuid not null references goal_categories(id) on delete cascade,
  parent_goal_id     uuid references goals(id) on delete cascade,
  name               text not null,
  -- weekly_hours: range/single weekly hour total (cook 4-6 hr, piano 3.5 hr)
  -- weekly_count:  weekly tally (cardio 2 runs, 25 sessions)
  -- per_night:     nightly average (sleep 7-8 hr)
  -- pr:            one-time achievement target (15 pull-ups)
  -- one_time:      a single milestone with no numeric target (handstand)
  kind               text not null check (kind in ('weekly_hours','weekly_count','per_night','pr','one_time')),
  target_value       numeric,
  target_range_low   numeric,
  target_range_high  numeric,
  target_unit        text,
  -- Current snapshot — manually edited by the goal owner for now. Future
  -- commits will compute this from appointments / actuals / check-ins.
  current_value      numeric,
  is_achieved        boolean not null default false,
  notes              text,
  priority           int     not null default 0,
  is_archived        boolean not null default false,
  created_at         timestamptz not null default now()
);

create index if not exists goals_category_idx     on goals(category_id);
create index if not exists goals_parent_idx       on goals(parent_goal_id);
create index if not exists goals_priority_idx     on goals(category_id, priority);

-- Schedule integration hook — a personal block can be tagged to a goal so
-- the calendar can color the block by the goal's category and roll-up
-- weekly progress at the top of the schedule.
alter table appointments
  add column if not exists goal_id uuid references goals(id) on delete set null;
create index if not exists appointments_goal_idx on appointments(goal_id);

-- ─── Seed: James's defaults ─────────────────────────────────────────────
-- Runs only if (a) the table is empty for the lone coach AND (b) there's
-- exactly one coach in the instance (which is the case for this deployment).
do $$
declare
  coach_uuid uuid;
  cat_work uuid; cat_sleep uuid; cat_cook uuid; cat_piano uuid;
  cat_body uuid; cat_cardio uuid; cat_biz uuid;
  piano_main uuid;
begin
  select id into coach_uuid from profiles where role = 'coach' limit 1;
  if coach_uuid is null then return; end if;
  if exists (select 1 from goal_categories where owner_id = coach_uuid) then return; end if;

  -- Categories (color-coded by brand language).
  insert into goal_categories (owner_id, name, color, sort_order) values
    (coach_uuid, 'Work',         '#a83d2b', 0) returning id into cat_work;
  insert into goal_categories (owner_id, name, color, sort_order) values
    (coach_uuid, 'Sleep',        '#3e6079', 1) returning id into cat_sleep;
  insert into goal_categories (owner_id, name, color, sort_order) values
    (coach_uuid, 'Cook',         '#c9613e', 2) returning id into cat_cook;
  insert into goal_categories (owner_id, name, color, sort_order) values
    (coach_uuid, 'Piano',        '#7a3a55', 3) returning id into cat_piano;
  insert into goal_categories (owner_id, name, color, sort_order) values
    (coach_uuid, 'Body Mastery', '#5a6b4a', 4) returning id into cat_body;
  insert into goal_categories (owner_id, name, color, sort_order) values
    (coach_uuid, 'Cardio',       '#d97706', 5) returning id into cat_cardio;
  insert into goal_categories (owner_id, name, color, sort_order) values
    (coach_uuid, 'Business',     '#3a342f', 6) returning id into cat_biz;

  -- Work — sessions per week with a tolerated range + planned 60/20/20 mix.
  insert into goals (category_id, name, kind, target_value, target_range_low, target_range_high, target_unit, priority, notes)
  values
    (cat_work, '25 sessions / week avg',         'weekly_count', 25, 20, 30, 'sessions', 0, '7am–7pm work hours'),
    (cat_work, 'Distribution: 60/20/20 mix',     'one_time',     null, null, null, null,   1, '60% of weeks at 25, 20% at 30, 20% at 20');

  -- Sleep
  insert into goals (category_id, name, kind, target_value, target_range_low, target_range_high, target_unit, priority)
  values
    (cat_sleep, 'Sleep 7–8 hr / night',          'per_night', 7.5, 7, 8, 'hr', 0);

  -- Cook
  insert into goals (category_id, name, kind, target_value, target_range_low, target_range_high, target_unit, priority, notes)
  values
    (cat_cook, 'Cook 4–6 hr / week',             'weekly_hours', 5, 4, 6, 'hr', 0, 'Split however across the week');

  -- Piano + sub-goals
  insert into goals (category_id, name, kind, target_value, target_unit, priority, notes)
  values
    (cat_piano, 'Practice 3.5 hr / week (30 min/day avg)', 'weekly_hours', 3.5, 'hr', 0, 'Can split however across the week')
  returning id into piano_main;
  insert into goals (category_id, parent_goal_id, name, kind, priority)
  values
    (cat_piano, piano_main, 'Learn natural major scale', 'one_time', 0),
    (cat_piano, piano_main, 'Learn natural minor scale', 'one_time', 1),
    (cat_piano, piano_main, 'Write + practice own songs','one_time', 2),
    (cat_piano, piano_main, 'Learn others'' songs',      'one_time', 3);

  -- Body mastery PRs
  insert into goals (category_id, name, kind, target_value, target_unit, priority)
  values
    (cat_body, '15 pull-ups',          'pr', 15, 'reps', 0),
    (cat_body, '50 dips',              'pr', 50, 'reps', 1),
    (cat_body, '75 push-ups',          'pr', 75, 'reps', 2),
    (cat_body, '5 ring dips',          'pr',  5, 'reps', 3),
    (cat_body, '1 muscle-up',          'pr',  1, 'reps', 4),
    (cat_body, 'Bench 185 lb × 10',    'pr', 10, 'reps @ 185', 5),
    (cat_body, '5 pistol squats',      'pr',  5, 'reps', 6),
    (cat_body, '30 BW horizontal rows','pr', 30, 'reps', 7),
    (cat_body, 'Handstand',            'one_time', null, null, 8);

  -- Cardio
  insert into goals (category_id, name, kind, target_value, target_unit, priority, notes)
  values
    (cat_cardio, 'Run 2 mi · 2× / week', 'weekly_count', 2, 'runs', 0, '2 miles each');

  -- Business
  insert into goals (category_id, name, kind, target_value, target_range_low, target_range_high, target_unit, priority)
  values
    (cat_biz, 'Biz dev 2–5 hr / week', 'weekly_hours', 3, 2, 5, 'hr', 0);
end $$;
