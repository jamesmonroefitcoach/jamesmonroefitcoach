-- Personal blocks (session_type = 'personal') have no client.
-- Drop the NOT NULL constraint on appointments.client_id so they can be saved.

alter table appointments
  alter column client_id drop not null;

-- Recreate the view with LEFT JOINs so personal blocks (client_id IS NULL)
-- are still returned by the view instead of being silently excluded.
create or replace view appointments_with_names as
select
  a.*,
  cp.full_name as client_name,
  ch.full_name as coach_name,
  cd.tier      as client_tier
from appointments a
left join profiles cp on cp.id = a.client_id
join  profiles ch on ch.id = a.coach_id
left join client_details cd on cd.profile_id = a.client_id;
