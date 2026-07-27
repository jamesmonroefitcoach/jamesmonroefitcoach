# CLAUDE.md — Monroe Fit Coach

Web portal for James Monroe's personal-training practice (Hyde Park Gym, Austin TX).
One coach (James, non-technical), his clients, and an admin role. Built and maintained
by Ryan; James reports bugs/requests via the "James' Tracker" Google Sheet.

**This tool is in daily use by a real coach. Changes must be surgical.** Prefer the
smallest edit that fixes the reported item; don't refactor adjacent code, rename
things, or "improve" UI James didn't ask about. See docs/WORKFLOW.md for how updates
flow from James's tracker to commits, and docs/ARCHITECTURE.md for the full map.

## Stack

Next.js 14 App Router + TypeScript, Supabase (Postgres/Auth/Storage), Tailwind,
Vercel (`monroefitcoach.com`). No test framework, no state library. Verify changes
with `npx tsc --noEmit` and by exercising the app (`npm run dev`).

## Layout

- `app/` — routes. Public: `/` (marketing), `/login`, `/signup`, `/consult`,
  `/s/[token]` (public workout sheet). Portals: `app/coach/`, `app/client/`,
  `app/admin/`. API handlers in `app/api/`.
- `lib/` — data access + domain logic. `*.server.ts` = server-only (service-role
  client); the paired `.ts` is shared/client-safe.
- `components/` — only 4 shared components (sidebar, goals, intake display, sheet
  embed). Most UI lives beside its route as `*-client.tsx`.
- `supabase/` — `schema.sql` + `migrations/0002…0034`. Run in filename order.
- `reference/` — gitignored reference repo (Archetype Athlete). Never edit.
- `docs/` — BACKLOG.md (triaged history), WORKFLOW.md, ARCHITECTURE.md.

## Conventions

- Pages are server components that call `lib/*` functions; those use
  `createSupabaseAdmin()` (service role — RLS is effectively bypassed; policies not
  yet written). Mutations via co-located `actions.ts` (`"use server"`) or an
  `app/api/*` route when response cookies must be written.
- Every `lib` data function falls back to `DEMO_*` constants when `hasSupabaseEnv()`
  is false **or a query errors** — a broken query can look like demo mode. Check
  server logs for `console.error` before assuming data is right.
- Auth (`lib/session.ts`): Supabase Auth first (profile match by `auth_user_id`,
  then by email back-fill), legacy `mfc_session` picker cookie as fallback.
  `ADMIN_PROFILE_IDS` is hardcoded and must stay in sync with `app/login/page.tsx`.
- Much client-side state persists to localStorage (builder drafts `builder_state_*`,
  exercise logs, learned exercises, coach todos, materials edits…). Changing key
  formats breaks in-flight data — migrate, don't rename.
- Styling: Tailwind theme in `tailwind.config.ts` — `ink/cream/rust/clay/sage/line`,
  Oswald headings, Inter body. Match the existing "old-gym editorial" look.
- James is colorblind — never distinguish states by color alone; keep the
  colorblind-safe palette choices already in the schedule.
- Past sessions are treated as completed by default; status pills only for
  cancelled / no-show / reschedule.

## Danger zones (read before touching)

- **`lib/programs-sheets-bridge.ts`** — bidirectional sync between structured
  program tables and `workout_sheets.sheet_data` blobs with a positional row shape.
  Called fire-and-forget from 4+ mutation paths; failures only `console.error`.
  Any change to sheet row shape or program-movement columns touches both sides
  plus `lib/movement-matcher.ts`.
- **`app/coach/programming/build/build-program-client.tsx`** (5,285 lines) — the
  default export is dead (never rendered), but `rework-client.tsx` imports
  `ExerciseCard`, `LibraryMovementsContext`, `VARIATION_LABELS`, and types from it,
  and `exercise-library-client.tsx` mirrors its `ExercisePreset` shape. Don't delete
  without extracting those first.
- **`appointments_with_names` view** — recreated in migrations 0009/0022/0025/0030;
  column renames require drop+recreate, not `create or replace`.
- **`scripts/reset-all-passwords.ts`** — resets every auth user's password; guarded
  by `RESET_ALL_PASSWORDS=yes-i-am-sure`. Leave the guard alone.

## Settled decisions (don't re-litigate)

- Programming flow: Build → Template (+ toggle), View → as-built; single-day session
  template; "clear programming" clears programs+sheets only, never the schedule.
- Saved sheets open editable with autosave on the public link; no Edit/Save buttons
  on the public page.
- Verification note: the in-app preview browser reports `visibilityState=hidden`,
  so visibility-gated client code won't run there — verify via DB-level checks.
