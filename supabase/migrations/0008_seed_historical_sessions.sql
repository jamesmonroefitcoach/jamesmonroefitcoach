-- 0008 — seed historical sessions from the actual schedule spreadsheet
-- Only imports real appointments (April 12 – May 2 2026) that James recorded.
-- All marked status='completed', paid=true, linked to a blank "Historical Sessions" program.
--
-- Idempotent: NOT EXISTS guards make it safe to re-run.
-- Run AFTER import-clients.sql (needs profiles + client_details rows to exist).

-- ─── 1. Create blank "Historical Sessions" program per client who appears ────
insert into programs (client_id, coach_id, name, is_published, is_current)
select distinct
  p.id,
  '00000000-0000-0000-0000-00000000c0a4'::uuid,
  'Historical Sessions',
  false,
  false
from profiles p
where p.role = 'client'
  and p.full_name in (
    'Abbey Archer','Acacia Chan','David Syndicongo','Hahn Franklin','Harper Carlson',
    'Jen Loving','Jen Rowland','Jesse Ramanazi','Jim Darling','Johnell Wyatt',
    'Katherine Serredel','Katherine Sheppard','Keaton Ley','Obii Onyegasi',
    'Rexton Loving','Rowland Ragnar','Sabine','Sairam Jaisankar','Samantha Saenz',
    'Seamus Ley','Tom Brown','Tyler Thomas','William Archer','William Watkins'
  )
  and not exists (
    select 1 from programs pg
    where pg.client_id = p.id and pg.name = 'Historical Sessions'
  );

-- ─── 2. Staging table with the real schedule data ────────────────────────────
drop table if exists _stg_schedule;
create temp table _stg_schedule (
  starts_local  text,
  ends_local    text,
  client_name   text,
  rate_override numeric
);

insert into _stg_schedule (starts_local, ends_local, client_name, rate_override) values
  ('2026-05-02 09:00:00', '2026-05-02 10:00:00', 'Johnell Wyatt', 60),
  ('2026-05-02 10:00:00', '2026-05-02 11:00:00', 'Katherine Serredel', 65),
  ('2026-05-02 11:00:00', '2026-05-02 12:00:00', 'Rexton Loving', null),
  ('2026-05-02 13:00:00', '2026-05-02 14:00:00', 'Sairam Jaisankar', 70),
  ('2026-05-02 14:00:00', '2026-05-02 15:00:00', 'Seamus Ley', 70),
  ('2026-05-01 08:00:00', '2026-05-01 09:00:00', 'Jim Darling', 65),
  ('2026-05-01 09:00:00', '2026-05-01 10:00:00', 'Jen Loving', 65),
  ('2026-05-01 11:00:00', '2026-05-01 12:00:00', 'Keaton Ley', 70),
  ('2026-05-01 12:00:00', '2026-05-01 13:00:00', 'Sabine', null),
  ('2026-05-01 14:00:00', '2026-05-01 15:00:00', 'Samantha Saenz', 70),
  ('2026-05-01 15:00:00', '2026-05-01 16:00:00', 'Hahn Franklin', 65),
  ('2026-04-30 13:00:00', '2026-04-30 14:00:00', 'Jen Loving', 65),
  ('2026-04-30 14:00:00', '2026-04-30 15:00:00', 'Tyler Thomas', 70),
  ('2026-04-30 17:00:00', '2026-04-30 18:00:00', 'Abbey Archer', 100),
  ('2026-04-30 18:00:00', '2026-04-30 19:00:00', 'Rowland Ragnar', 80),
  ('2026-04-30 19:00:00', '2026-04-30 20:00:00', 'Katherine Sheppard', 70),
  ('2026-04-29 07:00:00', '2026-04-29 08:00:00', 'Harper Carlson', 65),
  ('2026-04-29 09:00:00', '2026-04-29 10:00:00', 'William Archer', 100),
  ('2026-04-29 10:00:00', '2026-04-29 11:00:00', 'Acacia Chan', 70),
  ('2026-04-29 11:00:00', '2026-04-29 12:00:00', 'David Syndicongo', 65),
  ('2026-04-29 17:00:00', '2026-04-29 18:00:00', 'Hahn Franklin', 65),
  ('2026-04-29 18:00:00', '2026-04-29 19:00:00', 'Katherine Sheppard', 70),
  ('2026-04-28 07:00:00', '2026-04-28 08:00:00', 'Obii Onyegasi', 65),
  ('2026-04-28 13:00:00', '2026-04-28 14:00:00', 'Jen Loving', 65),
  ('2026-04-28 14:00:00', '2026-04-28 15:00:00', 'Tom Brown', 70),
  ('2026-04-28 16:00:00', '2026-04-28 17:00:00', 'Hahn Franklin', 65),
  ('2026-04-28 17:00:00', '2026-04-28 18:00:00', 'Rexton Loving', null),
  ('2026-04-28 18:00:00', '2026-04-28 19:00:00', 'Jen Rowland', null),
  ('2026-04-27 09:00:00', '2026-04-27 10:00:00', 'William Archer', 100),
  ('2026-04-27 16:00:00', '2026-04-27 17:00:00', 'Jesse Ramanazi', 65),
  ('2026-04-27 17:00:00', '2026-04-27 18:00:00', 'Hahn Franklin', 65),
  ('2026-04-25 09:00:00', '2026-04-25 10:00:00', 'Johnell Wyatt', 60),
  ('2026-04-25 10:00:00', '2026-04-25 11:00:00', 'Katherine Serredel', 65),
  ('2026-04-25 11:00:00', '2026-04-25 12:00:00', 'Rexton Loving', null),
  ('2026-04-25 12:00:00', '2026-04-25 13:00:00', 'Jesse Ramanazi', 65),
  ('2026-04-25 13:00:00', '2026-04-25 14:00:00', 'Sairam Jaisankar', 70),
  ('2026-04-25 14:00:00', '2026-04-25 15:00:00', 'Seamus Ley', 70),
  ('2026-04-24 11:00:00', '2026-04-24 12:00:00', 'Keaton Ley', 70),
  ('2026-04-24 12:00:00', '2026-04-24 13:00:00', 'Tyler Thomas', 70),
  ('2026-04-24 13:00:00', '2026-04-24 14:00:00', 'Samantha Saenz', 70),
  ('2026-04-23 07:00:00', '2026-04-23 08:00:00', 'Jim Darling', 65),
  ('2026-04-23 08:00:00', '2026-04-23 09:00:00', 'Obii Onyegasi', 65),
  ('2026-04-23 13:00:00', '2026-04-23 14:00:00', 'Jen Loving', 65),
  ('2026-04-23 14:00:00', '2026-04-23 15:00:00', 'Tyler Thomas', 70),
  ('2026-04-23 18:00:00', '2026-04-23 19:00:00', 'Jen Rowland', null),
  ('2026-04-22 09:00:00', '2026-04-22 10:00:00', 'William Archer', 100),
  ('2026-04-22 10:00:00', '2026-04-22 11:00:00', 'Acacia Chan', 70),
  ('2026-04-22 11:00:00', '2026-04-22 12:00:00', 'David Syndicongo', 65),
  ('2026-04-22 17:00:00', '2026-04-22 18:00:00', 'Hahn Franklin', 65),
  ('2026-04-22 18:00:00', '2026-04-22 19:00:00', 'Katherine Sheppard', 70),
  ('2026-04-21 10:00:00', '2026-04-21 11:00:00', 'William Archer', 100),
  ('2026-04-21 13:00:00', '2026-04-21 14:00:00', 'Jen Loving', 65),
  ('2026-04-21 17:00:00', '2026-04-21 18:00:00', 'Rexton Loving', null),
  ('2026-04-21 18:00:00', '2026-04-21 19:00:00', 'Jen Rowland', null),
  ('2026-04-20 07:00:00', '2026-04-20 08:00:00', 'Harper Carlson', 65),
  ('2026-04-20 09:00:00', '2026-04-20 10:00:00', 'William Archer', 100),
  ('2026-04-20 10:00:00', '2026-04-20 11:00:00', 'Katherine Serredel', 65),
  ('2026-04-20 17:00:00', '2026-04-20 18:00:00', 'Hahn Franklin', 65),
  ('2026-04-19 10:00:00', '2026-04-19 11:00:00', 'David Syndicongo', 65),
  ('2026-04-18 10:00:00', '2026-04-18 11:00:00', 'Johnell Wyatt', 60),
  ('2026-04-18 11:00:00', '2026-04-18 12:00:00', 'Rexton Loving', null),
  ('2026-04-18 12:00:00', '2026-04-18 13:00:00', 'Jesse Ramanazi', 65),
  ('2026-04-18 13:00:00', '2026-04-18 14:00:00', 'Sairam Jaisankar', 70),
  ('2026-04-18 14:00:00', '2026-04-18 15:00:00', 'Seamus Ley', 70),
  ('2026-04-17 07:00:00', '2026-04-17 08:00:00', 'Harper Carlson', 65),
  ('2026-04-17 09:00:00', '2026-04-17 10:00:00', 'Abbey Archer', 100),
  ('2026-04-17 10:00:00', '2026-04-17 11:00:00', 'William Watkins', 70),
  ('2026-04-17 11:00:00', '2026-04-17 12:00:00', 'Keaton Ley', 70),
  ('2026-04-17 12:00:00', '2026-04-17 13:00:00', 'Hahn Franklin', 65),
  ('2026-04-17 13:00:00', '2026-04-17 14:00:00', 'Tyler Thomas', 70),
  ('2026-04-17 14:00:00', '2026-04-17 15:00:00', 'Jen Loving', 65),
  ('2026-04-16 07:00:00', '2026-04-16 08:00:00', 'Obii Onyegasi', 65),
  ('2026-04-16 08:00:00', '2026-04-16 09:00:00', 'Jim Darling', 65),
  ('2026-04-16 10:00:00', '2026-04-16 11:00:00', 'Samantha Saenz', 70),
  ('2026-04-16 13:00:00', '2026-04-16 14:00:00', 'Jen Loving', 65),
  ('2026-04-16 14:00:00', '2026-04-16 15:00:00', 'Tyler Thomas', 70),
  ('2026-04-16 18:00:00', '2026-04-16 19:00:00', 'Rowland Ragnar', 80),
  ('2026-04-15 07:00:00', '2026-04-15 08:00:00', 'Harper Carlson', 65),
  ('2026-04-15 09:00:00', '2026-04-15 10:00:00', 'William Archer', 100),
  ('2026-04-15 10:00:00', '2026-04-15 11:00:00', 'Acacia Chan', 70),
  ('2026-04-15 17:00:00', '2026-04-15 18:00:00', 'Hahn Franklin', 65),
  ('2026-04-15 18:00:00', '2026-04-15 19:00:00', 'Katherine Sheppard', null),
  ('2026-04-14 13:00:00', '2026-04-14 14:00:00', 'Jen Loving', 65),
  ('2026-04-14 17:00:00', '2026-04-14 18:00:00', 'Rexton Loving', null),
  ('2026-04-14 18:00:00', '2026-04-14 19:00:00', 'Rowland Ragnar', 80),
  ('2026-04-13 09:00:00', '2026-04-13 10:00:00', 'William Archer', 100);

-- ─── 3. Insert appointments, joining on profile name ─────────────────────────
--
-- Times in the spreadsheet are America/Chicago local — convert to UTC via AT TIME ZONE.
-- Rate: use the spreadsheet value if present, otherwise fall back to client_details.session_rate.

insert into appointments (
  client_id, coach_id,
  starts_at, ends_at,
  status, paid,
  session_type, session_program_id,
  rate
)
select
  p.id,
  '00000000-0000-0000-0000-00000000c0a4'::uuid,
  (s.starts_local::timestamp at time zone 'America/Chicago'),
  (s.ends_local::timestamp   at time zone 'America/Chicago'),
  'completed',
  true,
  'session',
  (select id from programs where client_id = p.id and name = 'Historical Sessions' limit 1),
  coalesce(s.rate_override, cd.session_rate)
from _stg_schedule s
join profiles p
  on lower(trim(p.full_name)) = lower(trim(s.client_name))
  and p.role = 'client'
left join client_details cd on cd.profile_id = p.id
where not exists (
  select 1 from appointments a2
  where a2.client_id = p.id
    and a2.starts_at = (s.starts_local::timestamp at time zone 'America/Chicago')
);

-- ─── Report ──────────────────────────────────────────────────────────────────
select
  (select count(*) from programs  where name = 'Historical Sessions') as historical_programs,
  (select count(*) from appointments where status = 'completed' and paid = true) as completed_paid_appts;
