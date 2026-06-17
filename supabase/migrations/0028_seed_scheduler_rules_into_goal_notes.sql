-- 0028 — Write per-category scheduler rules into the goal notes
--
-- The auto-fill / reorg behavior for personal-block goals is hard-coded
-- in lib/goal-scheduler.server.ts. James can't edit those rules from
-- the UI today. Stuffing a human-readable summary into each goal's
-- notes column gives him a place to see what the scheduler will do
-- per category. Editing the notes is for reference only — changing
-- behavior still needs a code change.
--
-- Idempotent: only writes notes for goals whose notes are NULL or
-- empty, preserving anything James already typed. Re-run safe.

update goals g
set notes = case
  when c.name ~* '^sleep'    then 'Auto-fill rule: nightly block at 22:00, length = per-night target (clamped 4-12 hr). Shifts 30 min at a time on conflict (up to 2 hr). For any night under 7 hr, schedules a 13:00-14:00 nap the next day.'
  when c.name ~* '^piano'    then 'Auto-fill rule: Tue + Thu 12:00-13:00 priority. Then evening after the last client session of the day. Then between-session gaps but only if the gap is at least 2 hours (block drops at gap start to leave a 1 hr buffer before next client).'
  when c.name ~* '^cook'     then 'Auto-fill rule: time-of-day bands in priority order — afternoon 13-18, evening 18-22, morning 06-12 (last resort). Largest gap first within each band. 2 hr blocks when the gap allows, otherwise 1 hr. Caps at remaining target.'
  when c.name ~* '^cardio'   then 'Auto-fill rule: 30 min runs. Hardcoded priority slots first (Sun 17:00, Wed 18:00, Fri 18:00). Then evening 17-19:30, afternoon 14-16:30, midday 11-13:30 — exhausts each band across all 7 days before moving to the next. Count-based target.'
  when c.name ~* '^body'     then 'Auto-fill rule: gym holes between client sessions first (60 min when both gap + remaining target allow, otherwise 30 min). Then a slot after the day''s last client session (up to 21:00 cap) — catches light-load days with only one client.'
  when c.name ~* '^business' then 'Auto-fill rule: 1 hr blocks. Never schedules before the day''s first client session ("no AM before sessions"). Per day order: 1) between-session gap >= 60 min after first client, 2) afternoon 13-17 if after first session, 3) evening 18-21.'
  when c.name ~* '^biz'      then 'Auto-fill rule: 1 hr blocks. Never schedules before the day''s first client session ("no AM before sessions"). Per day order: 1) between-session gap >= 60 min after first client, 2) afternoon 13-17 if after first session, 3) evening 18-21.'
  else g.notes
end
from goal_categories c
where g.category_id = c.id
  and (g.notes is null or btrim(g.notes) = '')
  and c.name ~* '^(sleep|piano|cook|cardio|body|business|biz)';
