-- 0019 — system messages with action links
-- Auto-posted messages (e.g. "Completed: <program>") render in italics on
-- both sides with an optional View button that deep-links to wherever the
-- referenced thing lives in the app.

alter table messages
  add column if not exists is_system  boolean not null default false,
  add column if not exists link_url   text,
  add column if not exists link_label text;
