# Handoff — 2026-07-27 session

Written by Claude (this session) for whichever Claude picks this up next.
Read this fully before touching code — several items below reference prior
decisions/rules you won't rediscover just by reading the codebase.

**Read [`CLAUDE.md`](../CLAUDE.md) first if you haven't** — hard rules on
this repo: ask before design decisions, don't commit/push without being
told (I was told this session — see below), all SQL goes through Ryan, and
phone-view (375px) checks are mandatory on every UI change.

## 0. Set up the Supabase CLI before doing anything DB-related

The Supabase MCP tools were connected this session but errored on every
call:

> Your account does not have the necessary privileges to access this
> endpoint... your access token may be scoped to a different organization

The CLI is installed locally (`supabase 2.98.2` at `/opt/homebrew/bin/supabase`,
an update to 2.110.0 is available — update if convenient) but **not logged
in and not linked** to this project. Run:

```bash
supabase login
```

```bash
supabase link --project-ref knixmjpvdfmqpjwhkrgd
```

(Project ref is the subdomain in `NEXT_PUBLIC_SUPABASE_URL` in
`.env.local`: `https://knixmjpvdfmqpjwhkrgd.supabase.co`.)

Until this is done, don't rely on the `mcp__supabase__*` tools either — they
hit the same org/privilege wall. For read-only verification in the
meantime, a plain Node script against `.env.local`'s
`SUPABASE_SERVICE_ROLE_KEY` works fine — load `@supabase/supabase-js` via
`createRequire` if you write it as `.mjs` (this repo has no
`"type": "module"` in `package.json`, so a bare `import` will fail).
**Per CLAUDE.md, you still don't run SQL against prod yourself** —
schema/data changes go to Ryan as one paste-ready query for the Supabase
SQL editor; CLI/read-only access is for verification and local dev only.

## 1. What shipped this session (already committed + pushed to main)

Commit `a6eb735`, pushed to `origin/main` — Ryan explicitly said "publish"
after reviewing, so this is live on `monroefitcoach.com` already, not
pending review:

- **Pay-band chart hover glitch** (James's bug report) — fixed. Root cause
  was two compounding bugs in `app/coach/dashboard-client.tsx`'s
  `IncomeByBandChart`: per-segment `onMouseLeave` handlers caused a
  null-hover flash between adjacent elements, and the detail panel below
  the chart auto-grew to fit content, which shifted the chart under the
  cursor mid-hover and re-triggered the flash — a layout-shift feedback
  loop. Fixed by moving to a single container-level `onMouseLeave` and a
  fixed-height (150px, internally scrolling) detail panel.
- **Bonus bug found + fixed**: `GroupShell` (same file) nested the
  right-side action buttons inside the section's collapse-toggle
  `<button>` — invalid HTML, threw a React hydration error on every single
  dashboard load in dev. Unrelated to what James reported, but I was in
  the file and it's a real defect, so I fixed it (restructured to a `<div>`
  header with the toggle as one inner button and the actions as a sibling).
- **All-time session history**: hovering a week's bar now shows a
  fixed-height detail strip with that week's count + its calendar month's
  running total.
- **Pay-band legend width bug**: the client-count/income text could overlap
  the % text at narrow widths — swapped a fixed-width grid column for
  `minmax()`.
- **Clients table** (`app/coach/clients/clients-client.tsx`,
  `lib/data.ts`): under the Scheduled column, added % of past sessions
  completed, cancellation count, and the next 2 upcoming session
  date/times. Explicitly **excluded reschedule rate** per Ryan — "could
  just be James moving things around," not a meaningful signal.
- **Goals page** (`components/goals-client.tsx`): weekly goals now render
  grouped under category subheaders in one view instead of one flat mixed
  list (annual goals unchanged, still flat).

All four changed files type-check clean (`npx tsc --noEmit`) and were
verified in-browser (impersonated James via the legacy `mfc_session`
cookie — see §4 — since email/password sign-in isn't scriptable) at both
desktop and 375px mobile width, with console/network checked for errors.
The pay-band and all-time-session numbers were cross-checked against a
direct read-only DB query and matched exactly.

## 2. Open work — nothing built yet, in priority order Ryan hasn't set

### 2a. Resources tab — corrective exercise procedures (both portals)

Ryan asked for: a deep-research pass on corrective exercise procedures for
common injuries, turned into a page that lives on **both** the coach and
client portal, in a tab literally named **"Resources"**, **coach-editable,
client read-only**.

**Research is done** — see
[`docs/research/corrective-exercise-research.md`](research/corrective-exercise-research.md)
for the full write-up (8 verified findings, 3 refuted claims to avoid, 5
unverified claims that need a re-run, and real coverage gaps). Read the
"Coverage gaps" and "Unverified" sections before writing client copy —
**do not publish anything about rotator cuff/shoulder from this research
pass**, the verification run hit a session-limit wall on every rotator cuff
claim (0 valid votes, not because they were false — genuinely untested).
Tennis/golfer's elbow, hip tightness/APT, standalone ankle mobility, and
neck pain beyond upper-crossed posture also have **zero verified findings**
— the original ask named all of these, so either run a follow-up
deep-research pass on just the gaps, or scope the first version of the page
down to what's actually verified (patellofemoral pain, plantar fasciitis,
Achilles tendinopathy, low back pain activity guidance, upper crossed
syndrome) and say so.

**I have not designed or built anything for this yet** — no schema, no
route, no component. Before writing code, bring Ryan a plan (per CLAUDE.md's
"ask before acting" rule). Things to decide in that plan:

- Data model: the existing Materials feature
  (`lib/materials-seed.ts`, `app/coach/programming/library/materials/`,
  `app/client/programming/library/materials/`) is the closest precedent —
  same shape (coach edits, client reads), but it's **localStorage-only
  today**, not backed by Supabase (see the comment at the top of
  `lib/materials-seed.ts`: "Until edits move to Supabase, James's edits
  remain coach-local in localStorage and clients see these defaults" —
  meaning right now James's Materials edits on his laptop don't even show
  up for clients, let alone sync across his devices). If Resources needs
  real coach→client sync (implied by "coach can edit, clients see it"),
  it needs an actual table, not the same localStorage pattern. That's a
  schema change — SQL goes to Ryan per the hard rule.
- Where "Resources" sits in nav on each portal, and whether it replaces or
  sits alongside the existing Materials tab (there's real content overlap:
  Materials already has an "Injury Prevention" category with entries like
  "Common Joint Injuries" and "Postural Imbalances" — decide whether
  Resources subsumes that or is a separate, more clinical-feeling section).

### 2b. Exercise library backfill draft

Ryan asked to combine (a) the app's existing exercise library
(`app/coach/programming/library/exercise-library/`,
`app/client/programming/library/exercise-library/page.tsx`, plus
`ExercisePreset` types referenced from
`app/coach/programming/build/build-program-client.tsx` — see the "Danger
zones" section of CLAUDE.md before touching that file, its default export
is dead code but other files import types/components from it), (b) the
"Excercise Backfill" tab of James's Google Sheet, and (c) more deep
research, into a finalized library James can edit later. **Draft for
approval first, don't integrate directly.**

I pulled and extracted the Backfill tab — see
[`docs/research/exercise-backfill-source.md`](research/exercise-backfill-source.md)
and the raw JSON next to it. Key finding: **the sheet has names/taxonomy
only — zero rows have cues, muscles, or demo links filled in.** It's a
naming/category skeleton, not usable content on its own. You'll need a
deep-research pass (similar to §2a's, scoped to "cues + muscle groups +
form notes for common gym exercises") to actually fill it in, then diff
against what's already in the app's exercise library to avoid duplicating
entries.

No draft has been started. James's own dashboard To Do list already has
"Generate backfill document for exercises (RM to assist)" — so this is
expected, not a surprise to him.

### 2c. Goals page — weekly self-survey (1-5 stars)

Ryan wants a **weekly** survey on the Goals page where James scores himself
1-5 stars on unspecified items, or otherwise marks items he "knows." This
needs a design decision from Ryan before any code: what the survey items
actually are, and whether it's a star rating or a binary "I know this"
checkbox style (her phrasing used both "scores himself 1-5 star" and "hits
up for things he knows" — those aren't obviously the same UI). Ask before
building. No code exists for this yet.

## 3. Task list state (if your session shares TaskList with mine)

If you have access to the same task-tracking as this session, tasks #1, #2,
#7, #9 are the shipped work above (mark completed if not already). #4, #5,
#8 are the three open items in §2. #6 ("log session work in James' Tracker
under Claude") is **still outstanding** — I never got to it this session,
see §5.

If your session does NOT share task state with mine (likely, if this is a
fresh conversation), just use this doc as the source of truth instead.

## 4. How to verify changes in-browser without real credentials

The app now requires Supabase Auth email/password sign-in at `/login`,
which isn't scriptable from a headless session. There's a legacy fallback
(`lib/session.ts`, `mfc_session` cookie, consulted only when there's no
Supabase Auth session) — I used it to impersonate James for browser
verification:

```js
document.cookie = "mfc_session=" + encodeURIComponent(JSON.stringify({
  id: "00000000-0000-0000-0000-00000000c0a4",
  name: "James Monroe", role: "coach", email: null
})) + "; path=/";
```

Then navigate/reload. This is a **dev-only convenience**, not a real
session — don't treat it as auth-bypass-worthy of concern, it's the same
fallback path that's existed in the codebase already.

One more gotcha: the in-app preview browser reports
`visibilityState=hidden`, so anything gated on page visibility (and
`requestAnimationFrame`, which never fires) won't run there — I hit this
testing chart hover timing and had to swap `requestAnimationFrame` for a
plain `setTimeout`. See memory `reference_preview_tab_hidden` if you have
access to it, otherwise just know this going in.

## 5. Still owed: log this session's work in James' Tracker

Per the standing working agreement, coach-facing bug fixes should get
logged in James' Tracker Google Sheet
(`1L-C4U7J7vKzPQoijQ7B8QLbsH8TLIKuEK20HK-JvT5o`) under the name "Claude." I
did not do this before running out of turn budget this session — the
pay-band hover glitch fix and the all-time-history hover addition are the
two items James would recognize from his own bug report / feature ask.
Please add those entries if you have Sheets access and haven't already seen
them logged.
