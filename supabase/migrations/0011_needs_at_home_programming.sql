-- 0011 — flag clients that need at-home programming
--
-- The Build Program / View Programs / Dashboard widgets all hide unflagged
-- clients from their "Programs" lists. Sessions are unaffected (every
-- active client still appears there).
--
-- Seed: any client who already has a current at-home program is treated
-- as flagged, so existing data continues to surface in the UI without
-- manual re-flagging.

alter table client_details
  add column if not exists needs_at_home_programming boolean not null default false;

update client_details cd
set needs_at_home_programming = true
where exists (
  select 1
  from programs p
  where p.client_id = cd.profile_id
    and p.program_kind = 'at_home'
    and p.is_current = true
    and p.archived_at is null
);
