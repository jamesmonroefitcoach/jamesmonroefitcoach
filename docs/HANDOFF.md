# Handoff — merged, 2026-07-28

Written by Claude, merging two parallel sessions that both worked this repo
off James' Tracker at the same time (2026-07-27 evening → 2026-07-28). Read
this fully before touching code. Treat this doc, not git log alone, as the
source of truth for what's actually done vs. still open — a lot happened
across three separate handoffs now folded into this one.

**Read [`CLAUDE.md`](../CLAUDE.md) first if you haven't** — hard rules on
this repo: ask before design decisions, don't commit/push without being
told, all SQL goes through Ryan, phone-view (375px) checks are mandatory on
every UI change.

## 0. Supabase access — check both paths, reports conflict

One parallel session reported the `mcp__supabase__*` tools erroring with an
org/privilege wall (told you to `supabase login` + `supabase link
--project-ref knixmjpvdfmqpjwhkrgd`, CLI installed but not logged in). The
*other* parallel session reported those same MCP tools working fine against
project `knixmjpvdfmqpjwhkrgd`. Both were true at different points — try
the MCP tools first (they're faster, read-only SELECTs through them beat a
Node script), and fall back to the CLI-login path or a throwaway
`.env.local`-backed script only if they actually error for you. Either way,
**you still never run SQL against prod yourself** — schema/data changes go
to Ryan as one paste-ready query. See
[`docs/sql-for-ryan-2026-07-27.md`](sql-for-ryan-2026-07-27.md) for the
most recent one; Ryan applied blocks 1 and 2 from it (verified: message
threads 54→40, DM threads down to 2, no message loss, unique index in
place, test rows archived). **Block 3 (orphaned public-link sweep) was not
run** and needs a select-first judgement call before anything is archived.
Block 4 is an undo template, not a cleanup step.

## 1. What's live on `main` / monroefitcoach.com right now

`origin/main` currently includes (in addition to the original 2026-07-27
handoff commit `4dd0869`):

- **Programs: delete a saved program, closes its public link too.** Soft
  delete via `programs.archived_at`; deleting now also flips the paired
  `workout_sheets.status` to `archived` so `/s/<token>` stops resolving
  (previously the sheet stayed live after its program was deleted). "Edit"
  renamed to "View".
- **Template: removed the empty leading `×` column from published sheets**
  (was hidden per-mode but the cells were never actually removed from the
  DOM). Edit-mode delete/duplicate controls moved to the Movement cell's
  right edge, deliberately not the Sets cell (would sit beside the per-set
  `×` and invite a mis-click).
- **Messages: fixed a real data-loss bug, not a display bug.**
  `message_threads` has a unique index on `(coach_id, client_id, topic)`,
  but Postgres treats `null` as distinct, so it never actually constrained
  DM threads (`topic = null`). Every "+ New message" click inserted a new
  empty thread instead of reusing one; the lookup then got multiple rows,
  errored, and silently fell through to *another* create. One client
  showed "No messages yet" over 7 real messages. Also fixed: timestamps
  were rendered with no timezone on Vercel's UTC Node runtime, so every
  stamp shipped 5 hours off — now pinned to America/Chicago with a date
  prefix when not from today. **Duplicate threads already in prod were
  consolidated via the SQL Ryan ran (block 1/2 above).**
- **Sheet: hid the `+ Row` control in every read-only mode** — a client on
  the open public link could previously append rows to James's own
  prescription.
- **Build: "+ New program" no longer pre-creates a program+sheet row on
  click** (was littering prod with empties). The at-home/in-gym kind is
  now stamped on first save instead via `markSheetProgramAtHome`, carried
  through the existing `onSaved` callback — `lib/programs-sheets-bridge.ts`
  and the positional row shape were not touched.
- **Data: coach inbox `.limit(50)` cap raised to 500** and archived
  programs now excluded — the old cap was silently dropping whole clients
  (Acacia Chan, Jen Loving, David Syndicongo were confirmed missing from
  James's inbox because of it, ordered by thread `created_at` against 54
  real threads).

Two things flagged by that session as **not fixed, need Ryan's call**:

- **Announcement threads win the per-client inbox collapse.** After a
  broadcast, every client's inbox row points at the announcement thread,
  but `/client/messages` only reads topic-null threads — so anything James
  types into one of those rows is invisible to the client, and clients
  can't see announcements at all despite the Announce modal promising they
  land in each client's inbox. Direct "one database, both ways" break.
- **Deep links to an archived program still open the coach's builder**
  (`?program=<id>` — the client-facing link is correctly dead, this is
  just whether James himself should be able to reopen a program he
  deleted via an old link). Product call, not a bug.

Also noted: `samples/client-materials/workout-sheet.html` is a stale design
sample diverged from the live `public/workout-sheet.html` — left alone
deliberately, undecided whether to delete or resync.

**This merge commit adds this pickup session's work on top** — see §2.
Everything in §1 and §2 will be on `origin/main` together once this is
pushed (which it will be, since Ryan asked to push).

## 2. Built this pickup session (2026-07-28, dashboard/goals track)

Verified in-browser (desktop + 375px mobile, console checked) via the
`mfc_session` cookie trick — see §6. `npx tsc --noEmit` clean.

- **All-time chart x-axis alignment** (James' tracker "quick win" — the
  *other* parallel session flagged this row as "deliberately left Open,
  still running at end of session, verify actual state before touching"
  — it's genuinely fixed now, not a stale claim). The axis line + date
  labels used full-width `space-between` while the bars were fixed-width
  and left-anchored, so they drifted apart as history grew. Now sized to
  the bars' exact pixel width. Verified pixel-exact in-browser.
- **Client Programs dropdown showing "0 active"** (same tracker row, same
  "left Open" flag from the other session — also genuinely fixed). Real
  root cause: the dashboard called `pastProgramsForClient()` from
  `lib/programs.ts`, which is **demo data only** — always empty against a
  real roster. Added `currentProgramsByClient()` in `lib/data.ts` querying
  the real `programs` table (current + published, at-home preferred over
  in-gym when both exist — verified in-gym is what James mostly publishes,
  so at-home-only kept the banner nearly empty). Active rows now link to
  `/coach/programming/view/[programId]`. Verified: banner went from
  "0 active · 8 need programming" to "2 active · 6 need programming" with
  working links.
  - **Known follow-on, not yet fixed**: the same demo-data problem likely
    affects the Program column on the Clients table and the client
    profile page — anywhere else calling `pastProgramsForClient()` /
    `currentProgramsForClient()` / `currentProgramForClient()` from
    `lib/programs.ts` expecting real data. Grep those call sites before
    assuming any of them show real programs.
- **Weekly goals check-in survey** (Ryan's ask, clarified via
  AskUserQuestion: *"depends on the goal — either James types the latest
  number, or he stars it 1-5"*). Collapsible card above the goal lists on
  `/coach/goals` only (James scoring himself, not client-facing). One row
  per weekly (non-`one_time`) top-level goal: numeric-target goals get a
  type-a-number input (writes through to `goals.current_value`), the rest
  get 1-5 stars. Saves per-row via `saveWeeklyCheckin`, one row per
  `(goal_id, week_start)` in the new `goal_weekly_checkins` table
  (**migration 0035, not yet run by Ryan** — the card correctly shows
  "Check-in storage isn't set up yet" until it is; verified that fallback
  in-browser). Monday-anchored week, same convention as the rest of the
  app.
- **Weekly goals now grouped by category subsection** in one view instead
  of a flat mixed list (Ryan's ask). Annual/high-level goals unchanged.
- **Clients table**: under the Scheduled column, added % of past sessions
  completed, cancellation count, and next 2 upcoming session date/times.
  Reschedule rate explicitly excluded per Ryan ("could just be James
  moving things around").
- **Pay-band chart hover glitch** (James's original bug report) and its
  **month-detail-on-hover addition to the all-time history chart** — from
  the *first* 2026-07-27 session, already committed in `4dd0869`, still
  live, unaffected by this merge.

## 3. Tracker sheet — actual current state, verify before writing

Sheet: `1L-C4U7J7vKzPQoijQ7B8QLbsH8TLIKuEK20HK-JvT5o`. James reads this
directly — comments go in plain language, no jargon, matching the existing
"Claude 2026-07-2x" entries.

**This session attempted a direct write via the connected Chrome browser
and it did not go well** — Google Sheets' canvas UI doesn't map cleanly to
pixel-coordinate clicks in this environment. First attempt landed on the
wrong row (corrupted the "corrective exercise procedures" request row's
Name/Resolution Date/Status/Comments); caught it immediately and `Cmd+Z`'d
it back to the exact original state (verified via zoomed screenshot
comparison before and after — fully restored, nothing corrupted). A second
attempt using the cell-reference Name Box instead of pixel coordinates
produced no effect at all (typed input didn't register). **Gave up on
direct editing this session rather than keep guessing on a live, shared
document.** If you try again: verify the Name Box actually shows the
target cell reference after each navigation before typing anything, and
don't chain more than one blind edit without a verification screenshot
between.

**As of this session's last check, the sheet itself is unchanged from
before either parallel session started writing to it** (my edit attempt
was fully undone). What actually needs logging, from both sessions
combined:

- The all-time-history x-axis row and the Client Programs dropdown row
  (both "quick win" bugs) — genuinely fixed now (§2 above), need
  `Resolved` + a plain-language comment. Suggested text:
  > x-axis: `Claude 2026-07-28: axis line and dates now sized to the bars' width, aligned exactly. Deploy pending.`
  > Client Programs: `Claude 2026-07-28: dashboard was reading demo data, never the real programs table, and only counted at-home programs. Now shows anyone with a current published program, and their name opens the program view. Deploy pending.`
- The other session logged rows for inbox errors, template first column,
  and Recently Saved delete+View as Resolved, and added a row for the
  inbox `.limit(50)` cap — **check whether that cap row needs updating**,
  since the fix already landed (raised to 500, §1). It was also about to
  add two more rows (announcement-thread bug, archived-program deep-link
  question) when it wrapped — **check whether those exist before
  re-adding them**, since sheet state may have moved since either session
  last looked.

## 4. Open work

### 4a. Resources tab — corrective exercise procedures

Tracker priority 4. **Placement decided**: a "Corrective Exercise" subtab
under Programming → Library on both portals, next to Exercise Library and
Materials — per James' own tracker comment ("put this under the library
and call it corrective exercise"), not a top-level nav item.

**Scope decision**: Ryan chose to research remaining gaps before shipping
rather than launch with partial coverage. A gap-filling pass was launched
but **hit the session's usage limit mid-run** — see
[`docs/research/corrective-exercise-research-gaps-raw.md`](research/corrective-exercise-research-gaps-raw.md).
Only 4 fully-verified claims survived (rotator cuff dosing limits); 21 more
were pulled from real sources but never verified — infrastructure failure,
not falsified, don't discard but don't publish unverified either. Ankle
dorsiflexion, neck pain, and refer-out red flags weren't reached at all.
**Worth flagging to Ryan/James even unverified**: a 2020 systematic review
found "very low" certainty that anything corrects anterior pelvic tilt, and
no causal link between APT and pain — would mean going easy on the
APT-correction framing already live in Materials → Injury Prevention.
Re-verify before acting on it, but it's a real enough lead to mention now.

**Original pass's clean, fully-verified research is solid** — see
[`docs/research/corrective-exercise-research.md`](research/corrective-exercise-research.md):
patellofemoral pain, plantar fasciitis, Achilles tendinopathy, low back
pain activity guidance, upper crossed syndrome, plus the NASM assessment
framework. 8 real findings, buildable now.

**Next step**: re-run the gap pass's verify + synthesis stages (resume
`wf_1ec5c064-8df`, raw doc has resume instructions), then decide with Ryan
whether to wait for full coverage or ship what's verified. Data model still
needs a design decision — the existing Materials feature
(`lib/materials-seed.ts`) is the closest precedent but is
**localStorage-only, not Supabase-backed**. If Corrective Exercise needs
real coach→client sync, it needs an actual table — schema change, SQL goes
to Ryan. No schema, route, or component built yet.

### 4b. Exercise library backfill

Tracker priority 3. **Scope decided**: full ~110-exercise set in one pass.
**Status: partial, blocked on the same session limit.** See
[`docs/research/exercise-backfill-content-partial.md`](research/exercise-backfill-content-partial.md)
— 90 of 106 got cues + muscles + candidate demo links generated, but the
independent link-verification pass never ran, and the last 16 never
reached generation. Recovered the 90 generated-but-unverified entries
directly from the workflow's journal rather than let the pipeline's
all-or-nothing failure discard them — **none of the demo_url values are
checked**, treat as unverified leads only.

**Next step**: resume the workflow (`wf_d5da78f1-287` /
`exercise-backfill-content-wf_9216a421-6d5.js` — completed generation
batches replay from cache) to verify the 90 and generate+verify the
remaining 16. Then diff against the app's real `movements` table (31
active rows, confirmed via direct DB query — zero have cues/muscles/
demo_url either) before drafting import SQL for Ryan.

### 4c. Still open from the tracker (not started, in sheet priority order)

- **Pause / deactivate clients** (priority 1, "quick win"): pause button
  where "no planned session" shows, unpause with elapsed-pause duration,
  split past clients into paused vs. deactivated dropdowns with an
  activate button. Groundwork exists: `client_details.lifecycle` already
  carries `active`/`paused`/`inactive` in prod, and `clients-client.tsx`
  already has a lifecycle dropdown and splits active vs. past. Elapsed-pause
  display needs a `paused_at` column — schema change, goes to Ryan.
- **XLS backfill items for client profiles** (priority 2). Sheet comment
  suggests a per-person dropdown form that submits, as a separate artifact
  to load Supabase history later.
- **Mapping review behind the scenes** (priority 6): separate/normalize/
  map program-sheet exercise entries to the library automatically, only
  surface hard-to-match anomalies to James.
- **Change request / slot offer check** with dashed-line boxes for offered
  slots in the schedule view (lower priority).
- Postponed by James already: pay-band dropdown persistence-on-scroll,
  template formatting (per-row set counts etc.), phone notes-column
  cutoff (check if still reproducible first).

## 5. Task list state

If your session shares TaskList with mine: #1, #2, #3, #7, #8, #9, #10,
#11 are done. #4 (Resources tab) and #5 (exercise library) are open —
partial research exists per §4a/§4b, needs a fresh pass to finish before
building. #6 (tracker log) is still open — see §3, direct write didn't
work out this session, paste-ready text is the fallback.

## 6. How to verify in-browser without real credentials

Supabase Auth email/password at `/login` isn't scriptable headlessly. Use
the legacy `mfc_session` cookie fallback (`lib/session.ts`, only consulted
when there's no real Auth session):

```js
document.cookie = "mfc_session=" + encodeURIComponent(JSON.stringify({
  id: "00000000-0000-0000-0000-00000000c0a4",
  name: "James Monroe", role: "coach", email: null
})) + "; path=/";
```

Same trick with a client's profile id and `role:"client"` checks the other
side of a thread/flow. Navigate/reload after setting the cookie.

Gotcha: the in-app preview browser reports `visibilityState=hidden` and
never fires `requestAnimationFrame` — use `setTimeout` instead when timing
hover/async UI in tests.
