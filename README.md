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

For now there is **no real auth** — login is a name-picker that sets a cookie. Wire Supabase Auth in once we're ready to ship to clients.

## Routes

- `/login` — pick a profile (no password)
- `/coach` — dashboard (week at a glance, $, open requests)
- `/coach/clients` + `/coach/clients/[id]` — client list and detail
- `/coach/build-program` — program builder
- `/coach/schedule` — drag-drop schedule with change tracking
- `/coach/messages` — DMs + announcements
- `/client` — schedule + today's program
- `/client/profile` — profile edit
- `/client/check-ins` — submit check-in (weight, photos, notes)
- `/client/messages` — DM with coach
- `/admin` — approve account requests, assign coaches

## Reference

Layout pattern mirrors the Archetype Athlete portal in `../reference/` (gitignored). Reused: app shell with sidebar, role-routed `/page.tsx`, Supabase server/client helpers.
