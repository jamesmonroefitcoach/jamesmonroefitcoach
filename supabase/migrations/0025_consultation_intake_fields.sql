-- 0025 — Extend consultation_requests with intake fields
--
-- The public consult form now collects more than just a free-form message:
-- which offerings the visitor is interested in, what they want to
-- accomplish, any injuries we should know about, training experience, and
-- when they can train. Stored as discrete columns so James can sort/filter
-- on them later.
--
-- All adds are guarded so re-running is safe.

alter table consultation_requests
  add column if not exists offerings_interest text[],
  add column if not exists goals_text         text,
  add column if not exists injuries_text      text,
  add column if not exists experience_level   text,
  add column if not exists availability_text  text;
