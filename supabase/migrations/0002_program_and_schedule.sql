-- 0002 — program builder + schedule additions
-- Run AFTER schema.sql.

-- ─── programs ──────────────────────────────────────────────────────────
alter table programs
  add column if not exists duration_weeks int,
  add column if not exists based_on_program_id uuid references programs(id) on delete set null;

create index if not exists programs_based_on_idx on programs(based_on_program_id);

-- ─── program_movements: replace reps/weight with exertion + logging ────
-- We keep reps/weight columns but they now mean PRESCRIBED targets only.
-- Exertion is the coach's prescribed effort. Client logs go to a new table.
alter table program_movements
  add column if not exists exertion text;          -- e.g. "RPE 7", "8/10", "moderate"

-- Per-set client log (reps + weight actually performed)
create table if not exists movement_logs (
  id                  uuid primary key default uuid_generate_v4(),
  appointment_id      uuid references appointments(id) on delete set null,
  program_movement_id uuid not null references program_movements(id) on delete cascade,
  client_id           uuid not null references profiles(id) on delete cascade,
  set_index           int not null,
  reps                int,
  weight_lb           numeric(6,2),
  rpe                 numeric(3,1),
  notes               text,
  logged_at           timestamptz not null default now()
);

create index if not exists movement_logs_program_movement_idx on movement_logs(program_movement_id);
create index if not exists movement_logs_client_idx on movement_logs(client_id);

-- ─── appointments: session-level program override + revenue helpers ────
alter table appointments
  add column if not exists session_type text not null default 'session', -- 'session' | 'personal'
  add column if not exists personal_label text,                          -- "Doctor", "Out of town"
  add column if not exists is_blocking boolean not null default false,   -- personal time blocks
  add column if not exists session_program_id uuid references programs(id) on delete set null,
  add column if not exists override_movements jsonb;                     -- ad-hoc movements for this session only

-- Allow multiple events in the same block: status filter handles "scheduled over"
-- (no schema change needed — we already key by id, not by slot)

-- ─── helpful view: daily totals for month view ────────────────────────
create or replace view coach_daily_totals as
select
  coach_id,
  date_trunc('day', starts_at)::date as day,
  count(*) filter (where status not in ('cancelled')) as session_count,
  coalesce(sum(rate) filter (where status = 'completed'), 0) as completed_revenue,
  coalesce(sum(rate) filter (where status = 'completed' and paid = true), 0) as paid_revenue,
  coalesce(sum(rate) filter (where status = 'completed' and paid = false), 0) as unpaid_revenue,
  coalesce(sum(rate) filter (where status = 'scheduled'), 0) as scheduled_revenue
from appointments
group by coach_id, date_trunc('day', starts_at)::date;

-- ─── client tier shorthand (for slot-offer targeting UI) ──────────────
-- already exists as enum tier; nothing to add here.
