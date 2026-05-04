-- 0004 — recurring sessions, change-request linking on appointments, sidebar nav for availability

-- ─── recurring series ────────────────────────────────────────────────
create table if not exists appointment_series (
  id          uuid primary key default uuid_generate_v4(),
  coach_id    uuid not null references profiles(id) on delete cascade,
  client_id   uuid references profiles(id) on delete set null,
  starts_at   timestamptz not null,             -- first occurrence
  duration_min int not null default 60,
  weekday     int not null,                     -- 0=Sun..6=Sat (informational; computed from starts_at)
  cadence_weeks int not null default 1,         -- 1=weekly, 2=biweekly
  occurrences   int not null default 1,         -- how many were materialized
  ends_on     date,                             -- nullable, used by UI for visual reference
  rate        numeric(8,2),
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists appointment_series_coach_idx on appointment_series(coach_id);
create index if not exists appointment_series_client_idx on appointment_series(client_id);

alter table appointments
  add column if not exists series_id uuid references appointment_series(id) on delete set null;

create index if not exists appointments_series_idx on appointments(series_id);

-- ─── change-request "ghost" appointments ────────────────────────────
-- When a client requests a reschedule we keep the existing row at status=change_requested,
-- but we also want to surface a *proposed* new time on the schedule. Easiest: a second column.
alter table appointments
  add column if not exists requested_starts_at timestamptz,
  add column if not exists requested_ends_at   timestamptz,
  add column if not exists requested_reason    text;

-- ─── slot offer audience flexibility ─────────────────────────────────
-- Already have slot_offers + slot_offer_targets. Add "tier" target option for bulk targeting.
alter table slot_offers
  add column if not exists target_tier tier,             -- if set, anyone in this tier sees it
  add column if not exists notify_only boolean not null default false; -- true = "let them know" but not claimable
