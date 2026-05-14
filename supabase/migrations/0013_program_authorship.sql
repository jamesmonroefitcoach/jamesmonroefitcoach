-- 0013 — distinguish coach-assigned vs client-created programs.
--
-- When James pushes a program to a client it's coach-assigned (default).
-- When a client builds their own program from the client-side builder it's
-- flagged as client-created. The client profile's Past Programs widget
-- splits the list into two collapsibles based on this flag.

alter table programs
  add column if not exists created_by_client boolean not null default false;

create index if not exists programs_created_by_client_idx on programs(created_by_client);
