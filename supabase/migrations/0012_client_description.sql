-- 0012 — free-text "Client Description" on each client profile
--
-- Coach-facing notes about who the client is, written by the coach in
-- their own words. Rendered between the Coach/Client profile cards and
-- the High Level Plan section on /coach/clients/[id].

alter table client_details
  add column if not exists client_description text;
