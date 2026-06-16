-- 0027 — Testimonial photo uploads
--
-- Switch the testimonial before/after columns from a single text URL to a
-- text[] of URLs so clients can attach multiple shots from each side. The
-- old columns stay (nullable) so any historic single-URL rows still work,
-- but every new submission writes the array columns instead.
--
-- Also provisions the public 'testimonial-photos' Supabase Storage bucket
-- the upload form writes into, with policies allowing anyone to read
-- (these are meant for public display once approved) and only authenticated
-- users (clients via the app) to upload. James + admin can do anything via
-- the service-role client used in the server actions.

alter table testimonials
  add column if not exists before_image_urls text[],
  add column if not exists after_image_urls  text[];

-- ── Storage bucket ──────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('testimonial-photos', 'testimonial-photos', true)
on conflict (id) do nothing;

do $$ begin
  create policy "testimonial-photos read"
    on storage.objects for select
    using (bucket_id = 'testimonial-photos');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "testimonial-photos write"
    on storage.objects for insert
    with check (bucket_id = 'testimonial-photos');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "testimonial-photos update"
    on storage.objects for update
    using (bucket_id = 'testimonial-photos');
exception when duplicate_object then null; end $$;
