-- 0023 — Body Mastery weekly target
--
-- The Body Mastery category seeded in 0021 only contains PR-style
-- milestone goals (15 pull-ups, bench 185x10, etc.). The schedule's
-- weekly progress strip picks up the FIRST weekly_hours/weekly_count
-- goal in each category as the rollup target, so Body Mastery never
-- appeared and couldn't be auto-scheduled.
--
-- This adds a 4-hour-per-week training goal at priority -1 so it
-- sorts ahead of every existing milestone goal in the category,
-- becoming the category's primary goal for the strip. Idempotent:
-- only inserts when no weekly_* goal already exists in Body Mastery.

do $$
declare
  coach_uuid uuid;
  cat_body uuid;
begin
  select id into coach_uuid from profiles where role = 'coach' limit 1;
  if coach_uuid is null then return; end if;
  select id into cat_body from goal_categories
    where owner_id = coach_uuid and name = 'Body Mastery'
    limit 1;
  if cat_body is null then return; end if;

  if exists (
    select 1 from goals
    where category_id = cat_body
    and kind in ('weekly_hours', 'weekly_count')
  ) then
    return;
  end if;

  insert into goals (
    category_id, name, kind,
    target_value, target_range_low, target_range_high, target_unit,
    priority, notes
  )
  values (
    cat_body, 'Body training 4 hr / week', 'weekly_hours',
    4, 3, 5, 'hr',
    -1, 'Fits gym holes between sessions; 60 min full workout or 30 min single-exercise focus'
  );
end $$;
