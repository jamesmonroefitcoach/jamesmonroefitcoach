-- 0011 — explicit appointment.program_status + builder_state JSON snapshot
-- Adds the missing piece so an appointment can distinguish between
-- "needs programming", "draft", and "programmed". Today the app computes
-- this from session_program_id which can't represent "draft".

-- ─── appointments: program_status as a real column ──────────────────────
alter table appointments
  add column if not exists program_status text not null default 'needs_programming'
  check (program_status in ('needs_programming', 'draft', 'programmed', 'n/a'));

-- Backfill from existing session_program_id → programs.is_published
update appointments set program_status = 'n/a' where session_type = 'personal';

update appointments a set program_status = 'programmed'
from programs p
where a.session_program_id = p.id and p.is_published = true;

update appointments a set program_status = 'draft'
from programs p
where a.session_program_id = p.id and p.is_published = false;

create index if not exists appointments_program_status_idx on appointments(program_status);

-- ─── programs: lossless builder-state snapshot ──────────────────────────
-- The normalized program_days/program_movements tables are still the source
-- of truth for queries, the client portal, and movement_logs FKs. But the
-- builder UI carries additional state (set_rows for per-set overrides,
-- variations, superset groupings, optional fields like tempo/RIR/position,
-- etc.) that doesn't map cleanly to normalized columns. We stash the raw
-- builder state here so reopening a saved program restores it exactly as
-- the coach left it.
alter table programs
  add column if not exists builder_state jsonb;
