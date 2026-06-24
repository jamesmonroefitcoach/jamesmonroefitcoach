-- 0026 — Add current activity level to consultation_requests
--
-- The public consult form now asks an optional "current activity level"
-- (sedentary / lightly active / ... / very active) so James has a sense of
-- the visitor's day-to-day baseline before the call. Stored as its own
-- column alongside the other intake fields.
--
-- Guarded so re-running is safe.

alter table consultation_requests
  add column if not exists activity_level text;
