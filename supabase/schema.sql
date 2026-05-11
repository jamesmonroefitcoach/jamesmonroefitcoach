-- Monroe Fit Coach — initial schema
-- Run this once in the Supabase SQL editor.
--
-- Roles: coach | client | admin
-- For now there is no real auth — `profiles` is the source of truth.
-- When we add Supabase Auth later, link profiles.id ←→ auth.users.id.

set check_function_bodies = off;

-- ─── extensions ────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ─── enums ─────────────────────────────────────────────────────────────
do $$ begin
  create type app_role as enum ('coach', 'client', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type approval_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tier as enum ('tier_1', 'tier_2', 'tier_3'); -- "premium / standard" or "platinum / gold / silver" — relabel in UI
exception when duplicate_object then null; end $$;

do $$ begin
  create type appt_status as enum ('scheduled', 'completed', 'no_show', 'cancelled', 'change_requested');
exception when duplicate_object then null; end $$;

do $$ begin
  create type movement_category as enum ('push', 'pull', 'hinge', 'squat', 'core', 'leg_accessory', 'arm_accessory', 'shoulder', 'cardio', 'mobility');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('paid', 'owed', 'overdue', 'comp');
exception when duplicate_object then null; end $$;

do $$ begin
  create type cancel_reason as enum ('client_sick', 'client_travel', 'client_other', 'coach_sick', 'coach_other', 'no_show');
exception when duplicate_object then null; end $$;

-- ─── core tables ───────────────────────────────────────────────────────

create table if not exists profiles (
  id              uuid primary key default uuid_generate_v4(),
  role            app_role not null,
  full_name       text not null,
  email           text unique,
  phone           text,
  approval_status approval_status not null default 'approved',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists profiles_role_idx on profiles(role);

-- Coach-specific extension (one row per coach profile)
create table if not exists coach_details (
  profile_id  uuid primary key references profiles(id) on delete cascade,
  bio         text,
  gym_name    text default 'Hyde Park Gym',
  gym_address text default '4125 Guadalupe St, Austin, TX 78751'
);

-- Client-specific extension
create table if not exists client_details (
  profile_id          uuid primary key references profiles(id) on delete cascade,
  coach_id            uuid references profiles(id) on delete set null,
  member_since        date,
  age_category        text,
  gender              text,
  goals               text,
  dire_need_ranking   text,
  trained_since_note  text,
  accountability      text,
  education           text,
  commitment          text,
  regular_frequency   text,
  session_rate        numeric(8,2),
  test_rate           numeric(8,2),                 -- "rate increase" target
  net_increase        numeric(8,2),
  starting_weight_lb  numeric(6,2),
  current_weight_lb   numeric(6,2),
  goal_weight_lb      numeric(6,2),
  monthly_revenue     numeric(8,2),
  time_window_note    text,
  preferred_days      text[] default '{}',
  preferred_times     text,
  tier                tier default 'tier_2',
  check_in_cadence_days int default 14,
  status              text default 'current'         -- "Current" / "Paused" / etc.
);

create index if not exists client_details_coach_idx on client_details(coach_id);

-- ─── account requests (sign-up flow → admin approval) ─────────────────
create table if not exists account_requests (
  id          uuid primary key default uuid_generate_v4(),
  full_name   text not null,
  email       text not null,
  phone       text,
  message     text,
  desired_role app_role not null default 'client',
  status      approval_status not null default 'pending',
  created_at  timestamptz not null default now(),
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  resulting_profile_id uuid references profiles(id)
);

-- ─── movements library ────────────────────────────────────────────────
create table if not exists movements (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  category     movement_category not null,
  subcategory  text,
  muscles      text[] default '{}',          -- e.g. {'pec_major','triceps'} for muscle map
  equipment    text,
  demo_url     text,                         -- video or gif link
  cues         text,
  created_by   uuid references profiles(id),
  archived     boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists movements_category_idx on movements(category);
create index if not exists movements_archived_idx on movements(archived);

-- ─── programs ──────────────────────────────────────────────────────────
create table if not exists programs (
  id           uuid primary key default uuid_generate_v4(),
  client_id    uuid not null references profiles(id) on delete cascade,
  coach_id     uuid not null references profiles(id) on delete restrict,
  name         text not null,
  starts_on    date,
  ends_on      date,
  is_published boolean not null default false,
  is_current   boolean not null default false,
  notes        text,
  created_at   timestamptz not null default now(),
  archived_at  timestamptz                          -- "delete bin"
);

create index if not exists programs_client_idx on programs(client_id);
create index if not exists programs_coach_idx on programs(coach_id);

-- A program day = one session worth of movements
create table if not exists program_days (
  id           uuid primary key default uuid_generate_v4(),
  program_id   uuid not null references programs(id) on delete cascade,
  day_number   int not null,
  title        text,
  focus        text,
  notes        text,
  unique (program_id, day_number)
);

create table if not exists program_movements (
  id            uuid primary key default uuid_generate_v4(),
  program_day_id uuid not null references program_days(id) on delete cascade,
  movement_id   uuid not null references movements(id) on delete restrict,
  order_index   int not null default 0,
  is_warmup     boolean not null default false,
  sets          int,
  reps          text,                       -- text: "8-10", "AMRAP", "30s"
  weight        text,
  rest_seconds  int,
  notes         text,
  cues_override text
);

create index if not exists program_movements_day_idx on program_movements(program_day_id);

-- ─── sessions / appointments ───────────────────────────────────────────
-- An appointment is a scheduled or completed training session.
create table if not exists appointments (
  id            uuid primary key default uuid_generate_v4(),
  client_id     uuid references profiles(id) on delete cascade,        -- null for personal blocks
  coach_id      uuid not null references profiles(id) on delete restrict,
  program_day_id uuid references program_days(id) on delete set null,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  status        appt_status not null default 'scheduled',
  cancel_reason cancel_reason,
  change_count  int not null default 0,           -- # of reschedules
  rate          numeric(8,2),                     -- snapshot of rate at session time
  paid          boolean not null default false,
  notes         text,                             -- session notes (post-session)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists appointments_starts_at_idx on appointments(starts_at);
create index if not exists appointments_client_idx on appointments(client_id);
create index if not exists appointments_coach_idx on appointments(coach_id);
create index if not exists appointments_status_idx on appointments(status);

-- Slots James opens up for grabs
create table if not exists slot_offers (
  id          uuid primary key default uuid_generate_v4(),
  coach_id    uuid not null references profiles(id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  notes       text,
  status      text not null default 'open',         -- open | claimed | cancelled
  claimed_by  uuid references profiles(id),
  claimed_at  timestamptz,
  created_at  timestamptz not null default now()
);

-- Who can see / claim a given slot
create table if not exists slot_offer_targets (
  slot_offer_id uuid not null references slot_offers(id) on delete cascade,
  client_id     uuid not null references profiles(id) on delete cascade,
  can_claim     boolean not null default true,      -- false = notify-only
  primary key (slot_offer_id, client_id)
);

-- ─── check-ins / progress ─────────────────────────────────────────────
create table if not exists check_ins (
  id              uuid primary key default uuid_generate_v4(),
  client_id       uuid not null references profiles(id) on delete cascade,
  coach_id        uuid references profiles(id) on delete set null,
  submitted_at    timestamptz not null default now(),
  weight_lb       numeric(6,2),
  body_fat_pct    numeric(5,2),
  satisfaction    int,                              -- 1-5 from survey
  nutrition_conf  int,                              -- 1-5
  sleep_recovery  int,                              -- 1-5
  commitment      int,                              -- 1-10
  goals_text      text,
  improvement_text text,
  challenges      text,
  injuries        text,
  raw_survey      jsonb                              -- full Google Form payload
);

create index if not exists check_ins_client_idx on check_ins(client_id);

create table if not exists progress_photos (
  id          uuid primary key default uuid_generate_v4(),
  check_in_id uuid references check_ins(id) on delete cascade,
  client_id   uuid not null references profiles(id) on delete cascade,
  storage_path text not null,
  view        text,                                  -- 'front' | 'back' | 'left' | 'right' | 'other'
  created_at  timestamptz not null default now()
);

create table if not exists meal_logs (
  id         uuid primary key default uuid_generate_v4(),
  client_id  uuid not null references profiles(id) on delete cascade,
  logged_on  date not null,
  meal       text,                                   -- 'breakfast' | 'lunch' | 'dinner' | 'snack'
  description text,
  protein_g  int,
  calories   int,
  notes      text
);

-- ─── messaging ─────────────────────────────────────────────────────────
create table if not exists message_threads (
  id          uuid primary key default uuid_generate_v4(),
  coach_id    uuid not null references profiles(id) on delete cascade,
  client_id   uuid not null references profiles(id) on delete cascade,
  topic       text,
  is_announcement boolean not null default false,    -- coach broadcast
  created_at  timestamptz not null default now(),
  unique (coach_id, client_id, topic)
);

create table if not exists messages (
  id          uuid primary key default uuid_generate_v4(),
  thread_id   uuid not null references message_threads(id) on delete cascade,
  sender_id   uuid not null references profiles(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

create index if not exists messages_thread_idx on messages(thread_id, created_at);

-- ─── payments (tracking only — no Stripe v1) ──────────────────────────
create table if not exists invoices (
  id           uuid primary key default uuid_generate_v4(),
  client_id    uuid not null references profiles(id) on delete cascade,
  period_label text not null,                         -- e.g. "Apr 2026"
  amount       numeric(8,2) not null,
  due_date     date,
  paid_on      date,
  status       payment_status not null default 'owed',
  notes        text,
  created_at   timestamptz not null default now()
);

create index if not exists invoices_client_idx on invoices(client_id);
create index if not exists invoices_status_idx on invoices(status);

-- ─── change-request log (for schedule edit metric) ────────────────────
create table if not exists schedule_changes (
  id              uuid primary key default uuid_generate_v4(),
  appointment_id  uuid references appointments(id) on delete cascade,
  changed_by      uuid not null references profiles(id),
  before_starts_at timestamptz,
  after_starts_at  timestamptz,
  reason          text,
  created_at      timestamptz not null default now()
);

-- ─── views ────────────────────────────────────────────────────────────

-- Coach week-at-a-glance helper. Filter by coach_id and current week in app code.
create or replace view appointments_with_names as
select
  a.*,
  cp.full_name as client_name,
  ch.full_name as coach_name,
  cd.tier      as client_tier
from appointments a
left join profiles cp on cp.id = a.client_id
join  profiles ch on ch.id = a.coach_id
left join client_details cd on cd.profile_id = a.client_id;

create or replace view client_balance as
select
  client_id,
  coalesce(sum(case when status in ('owed','overdue') then amount else 0 end), 0) as balance_owed,
  coalesce(sum(case when status = 'overdue' then amount else 0 end), 0) as overdue
from invoices
group by client_id;

-- ─── seed: James + ramecca admin ──────────────────────────────────────
insert into profiles (id, role, full_name, email, approval_status)
values
  ('00000000-0000-0000-0000-00000000c0a4', 'coach', 'James Monroe', 'coachjamesmonroe@gmail.com', 'approved'),
  ('00000000-0000-0000-0000-000000000ad1', 'admin', 'Ryan Mecca', 'ramecca0711@gmail.com', 'approved')
on conflict (id) do nothing;

insert into coach_details (profile_id)
values ('00000000-0000-0000-0000-00000000c0a4')
on conflict (profile_id) do nothing;
