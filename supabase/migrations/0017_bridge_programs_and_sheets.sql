-- 0017 — bridge programs ↔ workout_sheets (1:1) + allow free-text rows on
-- program_movements so the sheet view and the structured Builder/Sessions
-- Rework views all render from the same underlying program rows.
--
-- A row in program_movements is either:
--   * structured  — movement_id FK + sets/reps/intensity (Builder writes)
--   * free-text   — name_text + equipment_text + notes_text (Sheet writes)
-- Both kinds carry per-set actuals in `actuals` (jsonb) when the client logs
-- a session from either view.

-- ─── Bridge link ──────────────────────────────────────────────────────
alter table programs
  add column if not exists workout_sheet_id uuid references workout_sheets(id) on delete set null;

alter table workout_sheets
  add column if not exists program_id uuid references programs(id) on delete set null;

-- 1:1 — at most one program per sheet, at most one sheet per program.
create unique index if not exists programs_workout_sheet_uniq
  on programs(workout_sheet_id) where workout_sheet_id is not null;
create unique index if not exists workout_sheets_program_uniq
  on workout_sheets(program_id) where program_id is not null;

create index if not exists programs_workout_sheet_idx on programs(workout_sheet_id);
create index if not exists workout_sheets_program_idx on workout_sheets(program_id);

-- ─── Free-text + actuals on program_movements ────────────────────────
-- movement_id is now optional (free-text rows have no FK). Existing rows
-- already have a non-null movement_id so we don't need a backfill.
alter table program_movements
  alter column movement_id drop not null;

alter table program_movements
  add column if not exists name_text       text,
  add column if not exists equipment_text  text,
  add column if not exists notes_text      text,
  add column if not exists actuals         jsonb;

-- A row needs either a structured movement_id OR a name_text (or both).
do $$ begin
  alter table program_movements
    add constraint program_movements_named_or_id check (movement_id is not null or name_text is not null);
exception when duplicate_object then null; end $$;
