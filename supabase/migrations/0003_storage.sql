-- 0003 — storage bucket for progress photos
-- Run AFTER 0002.
-- We're not using Supabase Auth yet (login is a profile-picker), so policies
-- below are permissive. Tighten when real auth lands.

insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do nothing;

-- Allow signed-uploads from any authenticated/anon role for now.
-- (Replace with role-based policies when real auth is wired up.)
do $$ begin
  create policy "progress-photos read"
    on storage.objects for select
    using (bucket_id = 'progress-photos');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "progress-photos write"
    on storage.objects for insert
    with check (bucket_id = 'progress-photos');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "progress-photos update"
    on storage.objects for update
    using (bucket_id = 'progress-photos');
exception when duplicate_object then null; end $$;
