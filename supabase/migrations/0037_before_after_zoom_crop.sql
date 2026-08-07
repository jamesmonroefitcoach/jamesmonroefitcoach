-- 0037 — Before/after zoom & crop position
--
-- James asked to be able to zoom/reposition a before or after photo himself
-- instead of only choosing "crop to fill" vs "show full body". Adds a
-- zoom level + focal point (x/y percentage) per side. Defaults (zoom 1,
-- pos 50/0) reproduce today's fixed "center top" crop exactly, so existing
-- rows render unchanged until James adjusts one.

alter table testimonials
  add column if not exists before_zoom  real not null default 1
    check (before_zoom between 1 and 4),
  add column if not exists before_pos_x real not null default 50
    check (before_pos_x between 0 and 100),
  add column if not exists before_pos_y real not null default 0
    check (before_pos_y between 0 and 100),
  add column if not exists after_zoom   real not null default 1
    check (after_zoom between 1 and 4),
  add column if not exists after_pos_x  real not null default 50
    check (after_pos_x between 0 and 100),
  add column if not exists after_pos_y  real not null default 0
    check (after_pos_y between 0 and 100);
