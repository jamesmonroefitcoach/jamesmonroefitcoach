-- 0020 — automated movement mapping for sheet → builder sync
--
-- When the sheet view writes back into program_movements as free-text rows,
-- the bridge sync now tries to lexically match each row's name_text to a
-- library movement. Outcomes get stamped here so a coach review queue can
-- pick up anything that didn't auto-resolve.

alter table program_movements
  add column if not exists mapping_source text check (mapping_source in ('manual','auto','unmapped'));

-- Backfill any historical rows: a row with movement_id set predates the
-- bridge — treat it as manual. Free-text rows (movement_id null, name_text
-- set) start as 'unmapped' so they surface in the review queue.
update program_movements
   set mapping_source = case
     when movement_id is not null then 'manual'
     when name_text is not null then 'unmapped'
     else null
   end
 where mapping_source is null;

create index if not exists program_movements_mapping_source_idx
  on program_movements(mapping_source)
  where mapping_source = 'unmapped';
