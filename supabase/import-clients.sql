-- Import: Google Sheet "Client DB" tab (gid=0) → profiles + client_details.
-- Run AFTER schema.sql.
--
-- Step 1: paste CSV rows into the staging table below.
--         (Open the sheet, File → Download → CSV, paste rows in the VALUES list,
--         OR use the COPY form at the bottom if running psql locally.)
-- Step 2: run the INSERT INTO profiles + client_details blocks.
-- Step 3: review the report at the bottom.

-- ─── 1. staging table ─────────────────────────────────────────────────
drop table if exists _stg_clients;
create temp table _stg_clients (
  client_status text,
  full_name     text,
  age_category  text,
  dire_need     text,
  priorities    text,
  trained_since text,
  accountability text,
  education     text,
  commitment    text,
  gender        text,
  regular_frequency text,
  session_rate  text,
  starting_weight text,
  current_weight text,
  goal_weight   text,
  monthly_dollars text,
  test_rate     text,
  net_increase  text,
  net_increase_month text,
  gut_feel      text,
  time_window   text
);

-- ─── 2. paste rows here (skip header row from the sheet) ──────────────
insert into _stg_clients values
('Current','Abbey Archer','22','Low','Form & knowledge ','April 10 2026','High','Low to medium','Low','Female ','1','$100','NA','NA','NA','$200','$100','$0','','',''),
('Current','Acacia Chan','30','High','Weight Loss, muscle, posture','March 2025','Low','Medium','Low','Female','2','$70','200','198','150','$280','$100','$30','','',''),
('Current','David Syndicongo','32','High ','Weight loss, muscle, posture ','Oct 2024','Low','Low','Medium','Male','1','$65','','229','180','$260','$100','$35','','',''),
('Current','Elizabeth Archer','60-70','Low','Knowledge, muscle, injury prevent','March 19 2026','High ','Medium ','High ','Female','1','$100','NA','N;A','NA','$100','$100','$0','','',''),
('Current','Hahn Franklin','35','Medium','Fat loss, accountability, physique','Feb 2025','Low','High','Medium','Male','3','$65','220','205','190','$650','$100','$35','','',''),
('Current','Harper Carlson','17','Low','Strength and general fitness, core ','March 27 2025','High','Medium ','High ','Female ','4','$65','','','','$260','$100','$35','','',''),
('Current','Jen Loving','48','Low','Body Recomp- 1 Pull Up','November 2025','High','High ','High','Female','2','$65','','','145','$1,040','$100','$35','','',''),
('Current','Jesse Ramanazi','40','Low','Body Recomp','Feb 10 2025','High','Medium','High','Male','4','$65','','','Na','$260','$100','$35','','',''),
('Current','Jim Darling','52','Low','Body Recomp)','Jan 2026','High','Medium','High','Male','1','$65','','','Na','$260','$100','$35','','',''),
('Current','Johnell Wyatt','30','Medium','Body Recomp','Jan 10th ','High','Low','High','Male','1','$60','','','220','$240','$100','$40','','',''),
('Current','Katherine Serredel','26','Low','General fitness- 1 pull up','February 28','High','Low','Medium','Female','1','$65','','','','$280','$100','$35','','',''),
('Current','Katherine Sheppard','30','High','Wedding weight loss','July 2025','High','High','High','Female','1','$70','','','','$260','$100','$30','','',''),
('Current','Keaton Ley','Late 20s','','Body Recomp and dad strength','Jan 27th ','High','High','High','Male','1','$70','','','','$280','$100','$30','','',''),
('Current','Mike Wham','35','Medium','Posture','Oct 27','High','Medium','Medium','Male','2/month','$70','','','','$140','$100','$30','','',''),
('Current','Obii Onyegasi','31','Low','Six Pack','Jan 2024','High','High','High','Male','1','$65','','','','$260','$100','$35','','',''),
('Current','Rexton Loving','15','Medium','Sport track and field conditioning ','Oct 2024','high','low','high','male ','2','NA','','','','','$100','','','',''),
('Current','Rowland Bella','24','High','100 LB weight loss ','July 2025','High','Low','High ','Female','2','na','433','294','280','','$100','','','',''),
('Current','Jen Rowland','50','High','100 LB weight loss','July 2025','High','Low','High','Female','Na','Na','','','','','$100','','','',''),
('Current','Rowland Ragnar','50','High','100 LB weight loss','July 2025','High','Low','High','Male','Na','$80','','','','$640','$100','$20','','',''),
('Current','Sairam Jaisankar','35','Medium','47 LB weight gain, muscle','2024','Medium','High','High','Male','1','$65','','','','$260','$100','$35','','',''),
('Current','Samantha Saenz','30','Medium','Body recomp and lose 10 minimum','2024','Medium','Medium','Medium','Female','1','$65','','','','$260','$100','$35','','',''),
('Current','Seamus Ley','25','Low','General fitness','2024','Medium','Medium','Medium','Male','1','$65','','','','$260','$100','$35','','','Oct 5th 2025'),
('Current','Tom Brown','35','Medium','Lose 20 LBS, prep for boxing','2024','Medium','Medium','High','Male','1','$65','','','','$260','$100','$35','','',''),
('Current','Tyler Thomas','30','Medium','Lose 20 LBS','2024','Medium','Medium','Medium','Male','1','$65','','','','$260','$100','$35','','',''),
('Current','William Archer','35','Medium','Strength and fitness','2024','Medium','Medium','Medium','Male','1','$65','','','','$260','$100','$35','','',''),
('Current','William Watkins','35','Medium','Lose 15 LBS, gain muscle','2024','Medium','Medium','High','Male','1','$65','','','','$260','$100','$35','','',''),
('Current','Sabine','40','High','Repair hip and combat atrophy','2024','High','High','High','Female','1','$65','','','','$260','$100','$35','','',''),
-- ─── Potential clients ────────────────────────────────────────────────
('Potential','Theo Stout','','High','Lose 100 lbs','','','','','Male','','$65','','','','','$100','','','',''),
('Potential','Nick Daniels','','Medium','Body recomp','','','','','Male','','$65','','','','','$100','','','',''),
('Potential','Brandy Lee','','Medium','Core development','','','','','Female','','$65','','','','','$100','','','',''),
('Potential','Pedro Padilla','','Medium','Fire academy training','','','','','Male','','$65','','','','','$100','','','',''),
('Potential','Zach Selman','','Medium','','','','','','Male','','$65','','','','','$100','','','',''),
('Potential','Marek Loving','','Low','Confidence, general fitness','','','','','Male','','$65','','','','','$100','','','',''),
('Potential','Henry Wong','','Low','General fitness','','','','','Male','','$65','','','','','$100','','','','');
-- ↑↑↑ paste any new rows here as more clients sign up ↑↑↑

-- ─── 3. helper: strip $ and commas, then cast to numeric ──────────────
create or replace function _money_to_num(t text) returns numeric language sql immutable as $$
  select case
    when t is null or trim(t) = '' or upper(trim(t)) in ('NA','N/A','N;A') then null
    else nullif(regexp_replace(t, '[^0-9.\-]', '', 'g'), '')::numeric
  end
$$;

-- ─── 4. upsert into profiles ──────────────────────────────────────────
insert into profiles (full_name, role, approval_status)
select trim(full_name), 'client', 'approved'
from _stg_clients
where full_name is not null and trim(full_name) <> ''
on conflict (email) do nothing;

-- For new clients without email, dedupe by full_name to avoid double-adds on re-runs.
-- (We can't use ON CONFLICT (full_name) without a unique constraint, so guard with NOT EXISTS.)
delete from profiles p
using (
  select min(id) as keep_id, full_name
  from profiles
  where role = 'client' and email is null
  group by full_name
  having count(*) > 1
) dups
where p.role = 'client' and p.email is null and p.full_name = dups.full_name and p.id <> dups.keep_id;

-- ─── 5. upsert client_details ─────────────────────────────────────────
insert into client_details (
  profile_id, coach_id, age_category, gender, goals, dire_need_ranking,
  trained_since_note, accountability, education, commitment,
  regular_frequency, session_rate, test_rate, net_increase,
  starting_weight_lb, current_weight_lb, goal_weight_lb, monthly_revenue,
  time_window_note, status
)
select
  p.id,
  '00000000-0000-0000-0000-00000000c0a4'::uuid,                  -- James as coach
  nullif(trim(s.age_category), ''),
  nullif(trim(s.gender), ''),
  nullif(trim(s.priorities), ''),
  nullif(trim(s.dire_need), ''),
  nullif(trim(s.trained_since), ''),
  nullif(trim(s.accountability), ''),
  nullif(trim(s.education), ''),
  nullif(trim(s.commitment), ''),
  nullif(trim(s.regular_frequency), ''),
  _money_to_num(s.session_rate),
  _money_to_num(s.test_rate),
  _money_to_num(s.net_increase),
  _money_to_num(s.starting_weight),
  _money_to_num(s.current_weight),
  _money_to_num(s.goal_weight),
  _money_to_num(s.monthly_dollars),
  nullif(trim(s.time_window), ''),
  lower(nullif(trim(s.client_status), ''))
from _stg_clients s
join profiles p on p.full_name = trim(s.full_name) and p.role = 'client'
on conflict (profile_id) do update set
  age_category       = excluded.age_category,
  gender             = excluded.gender,
  goals              = excluded.goals,
  dire_need_ranking  = excluded.dire_need_ranking,
  trained_since_note = excluded.trained_since_note,
  accountability     = excluded.accountability,
  education          = excluded.education,
  commitment         = excluded.commitment,
  regular_frequency  = excluded.regular_frequency,
  session_rate       = excluded.session_rate,
  test_rate          = excluded.test_rate,
  net_increase       = excluded.net_increase,
  starting_weight_lb = excluded.starting_weight_lb,
  current_weight_lb  = excluded.current_weight_lb,
  goal_weight_lb     = excluded.goal_weight_lb,
  monthly_revenue    = excluded.monthly_revenue,
  time_window_note   = excluded.time_window_note,
  status             = excluded.status,
  coach_id           = coalesce(client_details.coach_id, excluded.coach_id);

-- ─── 6. report ────────────────────────────────────────────────────────
select
  (select count(*) from profiles where role = 'client') as total_clients,
  (select count(*) from client_details where coach_id is not null) as assigned_to_coach,
  (select sum(monthly_revenue) from client_details) as total_monthly_revenue;
