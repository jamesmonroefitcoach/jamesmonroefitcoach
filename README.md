# Monroe Fit Coach

Web portal for James Monroe's coaching practice (Hyde Park Gym, Austin TX).

Three roles: **Coach**, **Client**, **Admin** — each gets a dedicated portal with role-appropriate views.

## Stack

- Next.js 14 (App Router) + TypeScript
- Supabase (Postgres + RLS, Storage for progress photos)
- Tailwind CSS — custom "old-gym editorial" theme (cream + rust)
- Vercel for deploys
- Domain: `monroefitcoach.com`

## Setup

```bash
npm install
cp .env.local.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Run `supabase/import-clients.sql` to seed clients from the Google Sheet (paste CSV rows into the staging table at the top of the file first).
4. Copy URL + anon key into `.env.local`.

## Roles

Stored in `profiles.role` — one of `coach`, `client`, `admin`.

Auth is Supabase Auth (password) — see `lib/session.ts`. Profiles link to auth users
via `auth_user_id`, back-filled by email match on first sign-in. A legacy
`mfc_session` picker cookie still works as a fallback when no Auth session exists.

## Routes

- `/` — marketing site (logged-out) or redirect to portal (logged-in)
- `/login`, `/signup`, `/consult` — sign-in, account requests, consultation requests
- `/s/[token]` — public workout-sheet link (open access, autosaves)
- `/coach` — dashboard (week at a glance, $, income by pay band, open requests)
- `/coach/clients` + `/coach/clients/[id]` — client list and deep client detail
- `/coach/programming` — programs, builder (sheet-first), exercise library, materials
- `/coach/schedule` — drag-drop schedule with recurring series + change tracking
- `/coach/appointments`, `/coach/availability`, `/coach/goals`, `/coach/messages`,
  `/coach/testimonials`
- `/client` — schedule + programming, check-ins, goals, profile, messages
- `/admin` — approve account requests, assign coaches

Fuller map: `docs/ARCHITECTURE.md`. Working agreements + history: `CLAUDE.md`,
`docs/BACKLOG.md`, `docs/WORKFLOW.md`.

## Reference

Layout pattern mirrors the Archetype Athlete portal in `../reference/` (gitignored). Reused: app shell with sidebar, role-routed `/page.tsx`, Supabase server/client helpers.
