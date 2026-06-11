-- 0018 — client_personal_events
-- Client-owned events that show up next to their training sessions on the
-- /client home calendar. Read-only for everyone else; writes happen via
-- API routes / server actions that already gate on the session user.

create table if not exists client_personal_events (
  id          uuid primary key default uuid_generate_v4(),
  client_id   uuid not null references profiles(id) on delete cascade,
  title       text not null,
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  notes       text,
  color       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists client_personal_events_client_idx on client_personal_events(client_id);
create index if not exists client_personal_events_starts_idx on client_personal_events(starts_at);

create or replace function set_client_personal_events_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end
$$ language plpgsql;

drop trigger if exists client_personal_events_updated_at on client_personal_events;
create trigger client_personal_events_updated_at
  before update on client_personal_events
  for each row execute function set_client_personal_events_updated_at();

alter table client_personal_events enable row level security;

-- Same convention as the rest of the app: permissive SELECT; writes happen
-- via the service-role admin client through server actions that check the
-- session user explicitly.
do $$ begin
  create policy client_personal_events_read on client_personal_events
    for select using (true);
exception when duplicate_object then null; end $$;
