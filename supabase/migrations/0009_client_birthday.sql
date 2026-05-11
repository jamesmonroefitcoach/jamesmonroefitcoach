-- 0009 — add birthday to client_details
alter table client_details
  add column if not exists birthday date;
