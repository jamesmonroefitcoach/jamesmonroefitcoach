-- 0026 — Client testimonials with coach approval gate
--
-- Clients submit a written testimonial from inside the app; nothing goes
-- public until James flips status to 'approved'. He can also override the
-- display name (e.g. "Sarah K." vs the client's full name) and paste
-- before/after image URLs to attach to the quote.
--
-- The public landing page lists rows where status='approved' AND
-- is_published=true ordered by `sort_order` then created_at. Falls back
-- to in-code PLACEHOLDER set when the table returns zero rows so a fresh
-- deploy still looks complete.

create table if not exists testimonials (
  id              uuid primary key default uuid_generate_v4(),
  client_id       uuid references profiles(id) on delete set null,
  -- Snapshot of the client's name at submit time; James can override via
  -- display_name without losing the original attribution.
  submitted_name  text not null,
  display_name    text,                       -- coach override (nullable: use submitted_name)
  meta_line       text,                       -- short subtitle line (e.g. "Down 22 lb · DL 405")
  body            text not null,
  -- Triage state.  new (just submitted) → approved / declined / hidden
  status          text not null default 'new'
                  check (status in ('new', 'approved', 'declined', 'hidden')),
  -- Belt-and-braces visibility toggle: a row can be approved but not yet
  -- live (e.g. James wants to stage a few approvals and flip them all
  -- public for a campaign).
  is_published    boolean not null default false,
  before_image_url text,
  after_image_url  text,
  sort_order      int not null default 0,    -- lower = first; negative allowed
  client_feedback text,                       -- coach-facing message back to client (future)
  created_at      timestamptz not null default now(),
  reviewed_at     timestamptz,
  reviewed_by     uuid references profiles(id) on delete set null,
  approved_at     timestamptz
);

create index if not exists testimonials_status_idx
  on testimonials(status, created_at desc);
create index if not exists testimonials_public_idx
  on testimonials(is_published, sort_order, created_at desc)
  where status = 'approved';
create index if not exists testimonials_client_idx
  on testimonials(client_id, created_at desc);
