-- 0014 — external exercise cache for the Exercise Explorer (Programming tab).
--
-- A directional sandbox: cache exercises pulled from external libraries
-- (RapidAPI ExerciseDB with animated GIFs, and yuhonas/free-exercise-db with
-- static images) so the coach can compare media + taxonomy against the app's
-- own movement library before committing to a source.
--
-- Caching / dedup: each row is unique per (source, external_id). Re-running a
-- sync upserts with ignoreDuplicates so the same exercise is never inserted
-- twice. The AI-coaching columns are reserved now and populated later.

create table if not exists external_exercises (
  id                 uuid primary key default uuid_generate_v4(),
  source             text not null check (source in ('rapidapi', 'free-db')),
  external_id        text not null,
  name               text not null,
  body_part          text,
  target_muscle      text,
  secondary_muscles  text[] not null default '{}',
  equipment          text,
  movement_pattern   text,                          -- mapped onto the app's Category vocabulary
  gif_url            text,
  image_urls         text[] not null default '{}',
  instructions       text[] not null default '{}',

  -- ─── reserved for future AI coaching tags (nullable; filled in later) ───
  cues               text[] not null default '{}',
  regressions        text[] not null default '{}',
  progressions       text[] not null default '{}',
  feel               text,
  difficulty         text,

  raw                jsonb,                          -- full upstream payload, for re-mapping later
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (source, external_id)
);

create index if not exists external_exercises_source_idx     on external_exercises(source);
create index if not exists external_exercises_pattern_idx    on external_exercises(movement_pattern);
create index if not exists external_exercises_equipment_idx  on external_exercises(equipment);

alter table external_exercises enable row level security;

-- Reads for any authenticated user; writes happen through the service-role
-- client in the sync route (which bypasses RLS).
do $$ begin
  create policy external_exercises_read on external_exercises
    for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
