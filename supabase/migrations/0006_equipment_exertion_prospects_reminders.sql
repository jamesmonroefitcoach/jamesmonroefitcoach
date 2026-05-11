-- 0006 — equipment list, 1-10 exertion, prospects, client lifecycle, reminders, confirmations, cancellation enum, change-request history

-- ─── movements: equipment as a multi-select list + free-text specifics ─
-- Existing column `equipment` is text. Keep it for back-compat but add `equipment_list` for proper multi-select.
alter table movements
  add column if not exists equipment_list text[] default '{}',          -- {'machine','dumbbells'}
  add column if not exists equipment_specifics text;                    -- "preacher curl machine" / "fat-grip bar"

-- Mark "core" movements explicitly (UI highlight in coverage view)
alter table movements
  add column if not exists is_core boolean not null default false;

-- ─── program_movements: equipment + exertion overrides per usage ──────
alter table program_movements
  add column if not exists equipment_list text[] default '{}',
  add column if not exists equipment_specifics text,
  add column if not exists exertion_score int;                          -- 1..10; if set, takes precedence over textual `exertion`

-- ─── clients: lifecycle + confirmation + reminder prefs ───────────────
do $$ begin
  create type client_lifecycle as enum ('active', 'inactive', 'paused');
exception when duplicate_object then null; end $$;

alter table client_details
  add column if not exists lifecycle client_lifecycle not null default 'active',
  add column if not exists requires_confirmation boolean not null default false;  -- "iffy" clients — coach confirms each session

-- Per-client reminder preferences (multi-select offsets + channels)
create table if not exists client_reminder_prefs (
  client_id    uuid primary key references profiles(id) on delete cascade,
  channel_email boolean not null default true,
  channel_sms   boolean not null default false,
  offsets_min   int[]   not null default '{1440,60}',  -- {day-before, 1h-before}
  updated_at    timestamptz not null default now()
);

-- ─── prospects (manual leads) ─────────────────────────────────────────
create table if not exists prospects (
  id              uuid primary key default uuid_generate_v4(),
  coach_id        uuid not null references profiles(id) on delete cascade,
  full_name       text not null,
  phone           text,
  email           text,
  where_met       text,
  connection      text,                       -- "referred by Jen", "co-worker"
  last_followed_up date,
  notes           text,
  converted_to_profile_id uuid references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists prospects_coach_idx on prospects(coach_id);

-- ─── change-request history (append-only audit log) ───────────────────
do $$ begin
  create type change_request_action as enum ('submitted', 'approved', 'denied', 'auto_cancelled');
exception when duplicate_object then null; end $$;

create table if not exists change_request_history (
  id              uuid primary key default uuid_generate_v4(),
  appointment_id  uuid references appointments(id) on delete set null,
  client_id       uuid references profiles(id) on delete set null,
  coach_id        uuid references profiles(id) on delete set null,
  action          change_request_action not null,
  before_starts_at timestamptz,
  after_starts_at  timestamptz,
  reason          text,
  created_at      timestamptz not null default now()
);

create index if not exists change_request_history_coach_idx on change_request_history(coach_id);

-- ─── cancellation reasons (replace open text where possible) ──────────
-- Existing enum cancel_reason from 0001 covers a few. Add the rest.
do $$ begin
  alter type cancel_reason add value if not exists 'travel';
exception when others then null; end $$;
do $$ begin
  alter type cancel_reason add value if not exists 'schedule_conflict';
exception when others then null; end $$;
do $$ begin
  alter type cancel_reason add value if not exists 'injury';
exception when others then null; end $$;
do $$ begin
  alter type cancel_reason add value if not exists 'family_emergency';
exception when others then null; end $$;
do $$ begin
  alter type cancel_reason add value if not exists 'weather';
exception when others then null; end $$;

alter table appointments
  add column if not exists cancel_reason_other text;     -- when cancel_reason is 'other'-ish
