# Architecture map

Next.js 14 App Router + TypeScript + Supabase + Tailwind, deployed on Vercel at
monroefitcoach.com. No tests, no state library. See CLAUDE.md for working
agreements and danger zones; this file is the structural map.

## Routes

**Public:** `/` (marketing or portal redirect) · `/preview` (marketing inside app
tab) · `/login` · `/signup` · `/consult` · `/s/[token]` (open-access workout sheet)
· `/account`.

**Coach (`app/coach/`):** dashboard (`dashboard-client.tsx`, ~2000 lines: week
banners, revenue, income by pay band, requests, todos) · `appointments/` (board,
cancellation backlog, consultation requests) · `availability/` · `clients/` +
`clients/[id]/` (profile edit, settings, high-level plan, payments, past programs,
PDF upload, program logs, workout sheets, exercises learned, check-ins) · `goals/`
(+ `growth-plan/`) · `messages/` · `programming/` (the big subtree: `build/`,
`library/`, `templates/`, `view/[programId]/`, view-programs list) · `schedule/`
(`schedule-view.tsx`, 3200 lines, drag-drop week/month) · `testimonials/`.

**Client (`app/client/`):** mirrors coach where relevant — schedule/upcoming,
check-ins (+ session followups), goals, profile (+ testimonial submit), messages,
`programming/` (build variants, library read-only, view/[programId] day logging,
complete flow).

**Admin (`app/admin/`):** account-request approval, coach assignment, profiles.

**API (`app/api/`):** `sign-in-password`, `sign-out`, `account/password`,
`workout-sheets/*` (CRUD, lock [unenforced], pdf, pdf-upload),
`public/workout-sheets/[token]` (unauthenticated GET/PUT), `exercise-explorer/sync`,
`debug` (coach/admin-gated diagnostics).

## Data layer

- `lib/supabase/server.ts` — `createSupabaseServer` (cookie-aware),
  `createSupabaseServerForResponse` (route handlers that set cookies),
  `createSupabaseAdmin` (service role — used for nearly all reads/writes, so RLS
  is bypassed; policies not yet written). `hasSupabaseEnv()` gates demo mode.
- `lib/session.ts` — auth resolution: Supabase Auth user → `profiles.auth_user_id`,
  else email match + back-fill, else legacy `mfc_session` cookie. Hardcoded
  `ADMIN_PROFILE_IDS` must stay in sync with `app/login/page.tsx`.
- `lib/data.ts` (~1070 lines) — roster, prospects, account requests, plans; every
  function returns `DEMO_*` fallbacks when env is missing **or a query errors**.
- Key tables (schema.sql + migrations 0002–0034): `profiles`, `coach_details`,
  `client_details`, `account_requests`, `movements`, `programs`/`program_days`/
  `program_movements`, `appointments` (+ series), `check_ins`, `message_threads`/
  `messages`, `schedule_changes`, `workout_sheets` (+ `public_token`),
  `program_day_logs`, `goals`, `growth_plan`, `testimonials`,
  `consultation_requests`, `external_exercises`. View `appointments_with_names` is
  drop+recreated across migrations — never `create or replace` with renamed columns.
- **The bridge** (`lib/programs-sheets-bridge.ts`): bidirectional sync between
  program tables and `workout_sheets.sheet_data` positional row arrays
  `[movement, reps1, wt1, …, coachNote]`; client notes live in `day.clientNotes[]`
  outside the row array. Fire-and-forget from 4+ mutation paths; failures only
  `console.error`. Paired with `lib/movement-matcher.ts` fuzzy name matching.
- **localStorage layer** (migration target — see Roadmap): builder drafts
  (`builder_state_*`), exercise logs, exercises-learned, session feedback, client
  followups, coach todos (`monroe-coach-todos`), materials edits, library presets,
  sidebar last-path. Anything here is invisible cross-device and to the other role.

## Conventions

- Pages are server components calling `lib/*`; mutations via co-located
  `actions.ts` (`"use server"`) or API routes when response cookies are needed.
- Client components: `*-client.tsx` beside their `page.tsx`; server-only lib code:
  `*.server.ts`; per-feature `types.ts`.
- Tailwind theme (`tailwind.config.ts`): `ink/cream/rust/clay/sage/line`, Oswald
  headings, Inter body ("old-gym editorial").
- Coach and client programming trees are parallel; `rework`/`sheets`/`template`
  variants share near-identical draft logic (dedupe candidate).

## Known dead weight (flagged, not yet removed)

- `app/coach/programming/build/build-program-client.tsx` (5,285 lines): default
  export unrendered; `rework-client.tsx` imports `ExerciseCard`,
  `LibraryMovementsContext`, `VARIATION_LABELS` + types from it. Extract-then-delete
  is a standalone careful task.
- `archive/coach-programming-build/` — legacy Build surfaces, kept per Ryan's
  explicit "archive, don't delete" (Jun 2026). Zero imports.
- `app/coach/programming/build/in-app/page.tsx` — legacy redirect, no inbound links.
- Dead actions in `build/actions.ts` (`saveProgram`, `logMovementSet`,
  `loadProgramForAppointment`) tied to the dormant In-App builder.
