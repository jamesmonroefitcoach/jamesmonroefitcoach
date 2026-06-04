-- 0015 — workout sheets (in-app interactive sheets + uploaded fillable PDFs).
--
-- A workout sheet is its own document, not a session record. Multiple sheets
-- can exist for the same client on the same day (e.g. one in-app, one
-- uploaded PDF). Sheets can be assigned to a client and optionally attached
-- to a session (appointment); unattached sheets land in the client's
-- Programs section on both coach and client sides.
--
-- Editing is gated by a soft lock (lock_holder_id + lock_acquired_at). The
-- API route refreshes the lock on heartbeat and treats a lock as stale after
-- ~10 minutes, so a side that closes the tab without releasing won't strand
-- the document.

create table if not exists workout_sheets (
  id                    uuid primary key default uuid_generate_v4(),
  name                  text not null,
  kind                  text not null check (kind in ('app','pdf')) default 'app',
  coach_id              uuid not null references profiles(id) on delete cascade,
  client_id             uuid references profiles(id) on delete cascade,
  session_id            uuid references appointments(id) on delete set null,
  status                text not null check (status in ('draft','active','archived')) default 'active',
  sheet_data            jsonb,                          -- structured state for kind='app'
  pdf_storage_path      text,                           -- path inside workout-sheet-pdfs for kind='pdf'
  pdf_original_filename text,
  lock_holder_id        uuid references profiles(id) on delete set null,
  lock_acquired_at      timestamptz,
  last_edited_by        uuid references profiles(id),
  last_edited_at        timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists workout_sheets_coach_idx     on workout_sheets(coach_id);
create index if not exists workout_sheets_client_idx    on workout_sheets(client_id);
create index if not exists workout_sheets_session_idx   on workout_sheets(session_id);
create index if not exists workout_sheets_updated_idx   on workout_sheets(updated_at desc);

-- keep updated_at fresh on every UPDATE
create or replace function set_workout_sheets_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end
$$ language plpgsql;

drop trigger if exists workout_sheets_updated_at on workout_sheets;
create trigger workout_sheets_updated_at
  before update on workout_sheets
  for each row execute function set_workout_sheets_updated_at();

alter table workout_sheets enable row level security;

-- The app uses a profile-picker login (not Supabase Auth), so client-side
-- access always flows through API routes that use the service-role client
-- and enforce permissions there. Mirror the convention from 0003_storage:
-- permissive SELECT for any authenticated role, writes only via service role.
do $$ begin
  create policy workout_sheets_read on workout_sheets
    for select using (true);
exception when duplicate_object then null; end $$;

-- ─── Storage bucket for uploaded PDFs ─────────────────────────────────
insert into storage.buckets (id, name, public)
values ('workout-sheet-pdfs', 'workout-sheet-pdfs', false)
on conflict (id) do nothing;

do $$ begin
  create policy "workout-sheet-pdfs read"
    on storage.objects for select
    using (bucket_id = 'workout-sheet-pdfs');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "workout-sheet-pdfs write"
    on storage.objects for insert
    with check (bucket_id = 'workout-sheet-pdfs');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "workout-sheet-pdfs update"
    on storage.objects for update
    using (bucket_id = 'workout-sheet-pdfs');
exception when duplicate_object then null; end $$;
