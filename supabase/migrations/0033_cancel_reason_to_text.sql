-- 0033: make appointments.cancel_reason free text
--
-- Bug: cancel_reason was a Postgres enum (`cancel_reason`), but the app's reason
-- picker (lib/cancel-reasons.ts) ships codes — accident, no_reason, personal,
-- client_schedule, injury_ill, other — that were NEVER added to the enum. Saving
-- a cancellation with any current code failed with
--   invalid input value for enum cancel_reason: "..."
-- which the server actions surface verbatim, so cancellations were refused as an
-- "invalid response" regardless of which reason was chosen.
--
-- Fix: convert the column to text. This is what the app already assumes (see the
-- comment in lib/cancel-reasons.ts). All current picker codes become valid and
-- every historical enum value is preserved as its string form.

-- The appointments_with_names view selects a.* and so depends on the column;
-- Postgres blocks altering a column a view reads. Drop the view, alter, then
-- recreate it (a.* re-expands to the new schema, picking up cancel_reason as text).
drop view if exists appointments_with_names;

alter table appointments
  alter column cancel_reason type text using cancel_reason::text;

-- The enum type is now unreferenced. Drop it (guarded so the migration is safe to
-- re-run and won't error if some other object still depends on it).
do $$ begin
  drop type if exists cancel_reason;
exception when dependent_objects_still_exist then null; end $$;

-- Recreate the view exactly as 0022 defined it.
create view appointments_with_names as
select
  a.*,
  cp.full_name as client_name,
  ch.full_name as coach_name,
  cd.tier      as client_tier
from appointments a
left join profiles cp on cp.id = a.client_id
join  profiles ch on ch.id = a.coach_id
left join client_details cd on cd.profile_id = a.client_id;
