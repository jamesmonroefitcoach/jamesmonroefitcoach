-- 0036 — Before/after fit column + load the real result photos
--
-- James wants before/after photo editing to live on its own coach screen,
-- separate from testimonial quote moderation, but backed by the same
-- `testimonials` table and the same client submission form (nothing changes
-- for clients). This migration:
--   1. Adds before_fit / after_fit so a photo pair can letterbox instead of
--      crop ("contain" vs "cover") — client-1's after shot needs this so
--      feet don't clip. Previously this only existed as a code-level
--      fallback, never on a real row.
--   2. Loads the 3 real client transformation photos (public/results/) as
--      actual approved + published rows with an empty body, so they show
--      in the results grid (never the quotes list — same rule as any other
--      photo-only entry) regardless of what else gets approved. These were
--      previously only a hardcoded fallback shown when the DB had zero
--      qualifying rows.

alter table testimonials
  add column if not exists before_fit text check (before_fit in ('cover', 'contain')),
  add column if not exists after_fit  text check (after_fit  in ('cover', 'contain'));

insert into testimonials
  (submitted_name, display_name, meta_line, body, status, is_published,
   before_image_url, after_image_url, after_fit, sort_order, approved_at, reviewed_at)
select v.submitted_name, v.submitted_name, v.meta_line, '', 'approved', true,
       v.before_image_url, v.after_image_url, v.after_fit, v.sort_order, now(), now()
from (values
  ('Body recomposition · Austin client',
   'Strength + recomp focus. Leaner build, less softness, more confidence. Same person, different season.',
   '/results/client-1-before.jpg', '/results/client-1-after.jpg', 'contain', 0),
  ('Lean-out · Austin client',
   'Strength + recomp. Visible torso definition and tighter waist after consistent programming.',
   '/results/client-2-before.jpg', '/results/client-2-after.jpg', null, 1),
  ('Strength + lean-out · Austin client',
   'Dropped body fat while keeping muscle mass. Clear waist taper and visible abs.',
   '/results/client-3-before.jpg', '/results/client-3-after.jpg', null, 2)
) as v(submitted_name, meta_line, before_image_url, after_image_url, after_fit, sort_order)
where not exists (
  select 1 from testimonials t where t.before_image_url = v.before_image_url
);
