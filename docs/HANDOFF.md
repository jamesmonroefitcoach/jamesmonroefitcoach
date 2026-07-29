# Handoff — updated 2026-07-28 (pickup session)

Written by Claude for whichever Claude picks this up next. Read this fully
before touching code — several items reference prior decisions/rules you
won't rediscover just by reading the codebase. This file has been updated
twice now (2026-07-27 original, 2026-07-28 pickup); treat it, not git log
alone, as the source of truth for what's actually done vs. still open.

**Read [`CLAUDE.md`](../CLAUDE.md) first if you haven't** — hard rules on
this repo: ask before design decisions, don't commit/push without being
told, all SQL goes through Ryan, phone-view (375px) checks are mandatory on
every UI change.

## 0. Supabase CLI — still not set up

Unchanged from the original handoff: the CLI (`supabase 2.98.2`,
`/opt/homebrew/bin/supabase`) is installed but never logged in or linked.
The `mcp__supabase__*` tools error with an org/privilege message for the
same reason. Run:

```bash
supabase login
```
```bash
supabase link --project-ref knixmjpvdfmqpjwhkrgd
```

Until then, use a throwaway Node script against `.env.local`'s
`SUPABASE_SERVICE_ROLE_KEY` for read-only verification (load
`@supabase/supabase-js` via `createRequire` in a `.mjs` file — this repo has
no `"type": "module"`). Per CLAUDE.md you still never run SQL against prod
yourself — schema/data changes go to Ryan as one paste-ready query.

## 1. Shipped and pushed to `main` (live on monroefitcoach.com)

Commit `4dd0869` — the original handoff doc + persisted research, pushed
after Ryan said "commit" then "push" explicitly. `main` here is both the
GitHub branch and what Vercel deploys from; there's only one.

## 2. Built this pickup session — on localhost, UNCOMMITTED

Everything below is working-tree changes, not yet committed. Don't assume
it's live. Files touched: `app/coach/dashboard-client.tsx`,
`app/coach/page.tsx`, `app/coach/week-banners.tsx`, `app/coach/goals/page.tsx`,
`app/goals/actions.ts`, `components/goals-client.tsx`, `lib/data.ts`,
`lib/goals.server.ts`, plus new file
`supabase/migrations/0035_goal_weekly_checkins.sql`. `npx tsc --noEmit`
clean; each item verified in-browser (desktop + 375px mobile, console
checked) using the `mfc_session` cookie trick — see §5.

- **All-time chart x-axis alignment** (James' tracker "quick win"). The
  axis line + date labels used full-width `space-between` while the bars
  were fixed-width and left-anchored, so they drifted apart as history
  grew. Now sized to the bars' exact pixel width
  (`stats.weeks.length * (BAR_W + BAR_GAP) - BAR_GAP`). Verified pixel-exact
  in-browser.
- **Client Programs dropdown showing 0 active** (James' tracker "quick
  win"). Real root cause, not cosmetic: the dashboard was calling
  `pastProgramsForClient()` from `lib/programs.ts`, which is **demo data
  only** — it always returned nothing for a real Supabase-backed roster, so
  the banner said "0 active" no matter what James published, with no way
  to open anyone's program. Added `currentProgramsByClient()` in
  `lib/data.ts` that queries the real `programs` table (current +
  published, at-home preferred over in-gym when both exist — verified
  against actual data that in-gym is what James mostly publishes, so
  at-home-only would have kept the banner nearly empty). Active rows are
  now links to `/coach/programming/view/[programId]`. Verified: banner
  went from "0 active · 8 need programming" to "2 active · 6 need
  programming" with working links to both.
  - **Known follow-on bug, not yet fixed**: the same demo-data problem
    likely affects the Program column on the Clients table and the client
    profile page (anywhere else that calls `pastProgramsForClient()` /
    `currentProgramsForClient()` / `currentProgramForClient()` from
    `lib/programs.ts` expecting real data). `grep` those call sites before
    assuming any of them show real programs.
- **Weekly goals check-in survey** (Ryan's ask, clarified via
  AskUserQuestion this session: *"depends on the goal — either James types
  the latest number, or he stars it 1-5"*). Built as a collapsible card
  above the goal lists on `/coach/goals` only (not client-side — this is
  James scoring himself, not client-facing). One row per weekly
  (non-`one_time`) top-level goal: goals with a numeric target
  (`target_value`/`target_range_low`/`target_range_high` set) get a
  type-a-number input that also writes through to `goals.current_value`;
  everything else gets 1-5 stars. Saves per-row via the new
  `saveWeeklyCheckin` server action, one row per `(goal_id, week_start)`
  in the new `goal_weekly_checkins` table (migration 0035, **not yet run
  by Ryan** — the card correctly shows "Check-in storage isn't set up yet"
  until it is; verified that fallback state in-browser). Week is
  Monday-anchored, same convention as the rest of the app.

**Tracker log text for these two, paste-ready** (or write directly — see
§6, Ryan said Claude should be able to update the Sheet itself):

> x-axis row: `Resolved 2026-07-28 — Claude: axis line and dates now sized
> to the bars' width, aligned exactly. Deploy pending.`
>
> Client Programs row: `Resolved 2026-07-28 — Claude: dashboard was reading
> demo data, never the real programs table, and only counted at-home
> programs. Now shows anyone with a current published program, and their
> name opens the program view. Deploy pending.`

## 3. Open work

### 3a. Resources tab — corrective exercise procedures

**Placement decided this session** (AskUserQuestion): a "Corrective
Exercise" subtab under Programming → Library on both portals, next to
Exercise Library and Materials — per James' own tracker comment ("put this
under the library and call it corrective exercise"), not a new top-level
nav item as originally floated.

**Scope decision**: Ryan chose "research gaps first" over shipping the
5-condition version now. A gap-filling research pass was launched but
**hit the session's usage limit mid-run and did not finish** — see
[`docs/research/corrective-exercise-research-gaps-raw.md`](research/corrective-exercise-research-gaps-raw.md).
It only produced 4 fully-verified claims (all about rotator cuff dosing
limits) before the limit hit; 21 more claims got pulled from real sources
but never verified (infrastructure failure, not falsified — don't discard
them, but don't publish them either without re-running verification).
Ankle dorsiflexion, neck pain, and refer-out red flags weren't reached at
all. **One thing in there is worth flagging to Ryan/James now, even
unverified**: a 2020 systematic review found "very low" certainty evidence
that anything corrects anterior pelvic tilt, and no causal link between APT
and pain — which would mean going easy on the APT-correction framing
already live in the app's Materials → Injury Prevention section. Re-verify
before acting on it, but it's a real enough lead to mention.

**Original pass's clean, fully-verified research** is still solid — see
[`docs/research/corrective-exercise-research.md`](research/corrective-exercise-research.md):
patellofemoral pain, plantar fasciitis, Achilles tendinopathy, low back pain
activity guidance, upper crossed syndrome, plus the NASM assessment
framework. That's 8 real findings you can build from immediately.

**Next step**: re-run the gap pass's verify + synthesis stages (resume
`wf_1ec5c064-8df`, or start fresh — the raw doc has resume instructions),
then decide with Ryan whether to wait for full coverage or ship what's
verified. Data model still needs a design decision — the existing Materials
feature (`lib/materials-seed.ts`) is the closest precedent but is
**localStorage-only, not Supabase-backed** (see the comment at the top of
that file). If Corrective Exercise needs real coach→client sync, it needs
an actual table — schema change, SQL goes to Ryan. No schema, route, or
component built yet.

### 3b. Exercise library backfill

**Scope decided**: full ~110-exercise set in one pass, not a small sample
first (AskUserQuestion this session).

**Status: partial, blocked on the same session limit.** See
[`docs/research/exercise-backfill-content-partial.md`](research/exercise-backfill-content-partial.md)
and the JSON next to it — 90 of 106 exercises got cues + muscles +
candidate demo links generated, but the **independent link-verification
pass never ran** (session limit), and the last 16 exercises never even
reached generation. I recovered the 90 generated-but-unverified entries
directly from the workflow's journal rather than let the pipeline's
all-or-nothing failure discard them — but **none of the demo_url values in
that file have been checked**, treat them as unverified leads only.

**Next step**: resume the workflow (`wf_d5da78f1-287` /
`exercise-backfill-content-wf_9216a421-6d5.js`, same file path — completed
generation batches replay from cache) to verify links on the 90 and
generate+verify the remaining 16. Then diff against the app's real
`movements` table (31 active rows, confirmed via direct DB query this
session — zero of them have cues/muscles/demo_url either) before drafting
import SQL for Ryan.

### 3c. (Resolved) Goals weekly self-survey — see §2

Was open in the original handoff; built this session. Migration 0035 still
needs Ryan to run it before it's live.

## 4. Task list state

If your session shares TaskList with mine: #1, #2, #3, #7, #8, #9, #10,
#11 are done. #4 (Resources tab) and #5 (exercise library) are open —
partial research exists per §3a/§3b above, needs a fresh pass to finish
before building. #6 (tracker log) — see §6, attempt a direct write first.

If you don't share task state (fresh conversation), use this doc instead.

## 5. How to verify changes in-browser without real credentials

App requires Supabase Auth email/password at `/login`, not scriptable
headlessly. Use the legacy `mfc_session` cookie fallback
(`lib/session.ts`, only consulted when there's no real Auth session):

```js
document.cookie = "mfc_session=" + encodeURIComponent(JSON.stringify({
  id: "00000000-0000-0000-0000-00000000c0a4",
  name: "James Monroe", role: "coach", email: null
})) + "; path=/";
```

Navigate/reload after. Dev-only convenience, not a real session.

The in-app preview browser reports `visibilityState=hidden` and never fires
`requestAnimationFrame` — use `setTimeout` instead when timing hover/async
UI in tests.

## 6. James' Tracker — try a direct write before falling back to paste-ready

Ryan said this session that Claude should be able to update the tracker
directly, not just hand over paste-ready text. There's no Sheets-write MCP
tool connected (checked `ToolSearch` — only Drive read/download/copy
tools), but a Chrome browser **is** connected via the `claude-in-chrome`
MCP (confirmed this session: `list_connected_browsers` returned "Browser 1"
on macOS, `isLocal: true`). Try opening the Sheet at
`https://docs.google.com/spreadsheets/d/1L-C4U7J7vKzPQoijQ7B8QLbsH8TLIKuEK20HK-JvT5o`
in that browser and editing the Resolution Status / Comments cells directly
via `computer`/`find`/`form_input` before falling back to giving Ryan
paste-ready text. Log entries: name "Claude", the two paste-ready blurbs in
§2 above for the x-axis and Client Programs fixes.
