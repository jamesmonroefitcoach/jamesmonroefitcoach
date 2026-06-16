-- 0024 — Public consultation requests
--
-- The new public flyer at / has a "free consultation" form that anyone (no
-- auth) can submit. The row lands here so James can see and triage it from
-- /coach/appointments under the "Consultation requests" dropdown.
--
-- The public form posts via a server action that uses the service-role admin
-- client, so we leave RLS off here (every other public-facing write in this
-- project goes through the admin client the same way). If we ever expose this
-- table to the anon key directly we'll add a permissive insert policy.

create table if not exists consultation_requests (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  email       text not null,
  phone       text,
  message     text,
  -- Triage state. new = inbox; contacted/booked/dismissed = resolved.
  status      text not null default 'new'
              check (status in ('new', 'contacted', 'booked', 'dismissed')),
  source      text,                          -- where on the flyer the submission came from
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references profiles(id) on delete set null,
  coach_notes text
);

create index if not exists consultation_requests_status_idx
  on consultation_requests(status, created_at desc);

create index if not exists consultation_requests_created_idx
  on consultation_requests(created_at desc);
