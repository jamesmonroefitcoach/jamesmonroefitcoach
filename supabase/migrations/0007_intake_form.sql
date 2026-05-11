-- 0007 — client intake form responses
-- Stores the raw answers a client submitted on their intake survey
-- (Google Form / in-app signup questionnaire).
-- form_data is a jsonb map of question → answer.
-- form_received_at is null until a form is linked.

alter table client_details
  add column if not exists form_received_at timestamptz,
  add column if not exists form_data jsonb;

-- Helpful view for displaying form responses in the coach UI
comment on column client_details.form_data is
  'Raw intake form answers as {question: answer} JSON. Null = no form received.';
comment on column client_details.form_received_at is
  'Timestamp when the intake form was received / imported.';
