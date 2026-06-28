-- 0027 — Track how a program was built (in-app builder vs template sheet)
--
-- A program built using the Template (workout sheet) format should be treated
-- as sheet-only: every later view/edit (coach + client) opens the latest sheet
-- version instead of the structured In-App builder. We record that intent with
-- build_format so the UI can route accordingly.
--
--   'in_app'   — built/edited in the structured builder (default)
--   'template' — built as a workout sheet; sheet is the source of truth
--
-- Guarded so re-running is safe. Existing rows default to 'in_app'.

alter table programs
  add column if not exists build_format text not null default 'in_app';
