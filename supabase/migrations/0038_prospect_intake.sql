-- 0038 — intake form answers on potential clients
-- Adds two columns to the existing prospects table so a public intake
-- submission can land in the coach's Potential Clients list with its answers
-- attached. Nothing is removed or altered. Safe to re-run.
--
-- Mirrors the convention set by 0007_intake_form.sql, which put form_data /
-- form_received_at on client_details, so the coach-side display code is shared.

alter table prospects
  add column if not exists intake_data jsonb,
  add column if not exists intake_received_at timestamptz;

comment on column prospects.intake_data is
  'New-client intake form answers as {question: answer} JSON. Null = added by hand, no form.';
comment on column prospects.intake_received_at is
  'When the intake form was submitted. Null = no form received.';
