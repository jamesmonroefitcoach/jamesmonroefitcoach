-- 0022 — Refresh appointments_with_names so it picks up appointments.goal_id
--
-- Postgres views snapshot their column list at creation time. The migration
-- that added goal_id to appointments (0021) didn't recreate the view, so a
-- select that asks for goal_id from appointments_with_names fails and the
-- schedule reads back [].
--
-- `create or replace view` is strict — it disallows changing column names
-- or order, only appending columns at the end. If an earlier in-DB version
-- of the view drifted from what's in source control (which is what
-- happened: another column was added between then and now), the replace
-- fails with 'cannot change name of view column'. Drop + recreate works
-- in all cases because `a.*` re-expands to the current appointments
-- schema, so this migration uses that pattern instead.

drop view if exists appointments_with_names;

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
