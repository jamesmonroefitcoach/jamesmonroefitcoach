-- 0016 — link profiles to Supabase Auth users so we can layer real
-- email/password auth on top of the existing profile-picker login.
--
-- The id we already use for profiles stays as-is (and remains the FK target
-- for every existing relation). auth_user_id is just a back-link to the
-- corresponding auth.users row. On first password set we create the auth user
-- and stash the id here; on sign-in we look up the profile by this column.

alter table profiles
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

create index if not exists profiles_auth_user_id_idx on profiles(auth_user_id);
