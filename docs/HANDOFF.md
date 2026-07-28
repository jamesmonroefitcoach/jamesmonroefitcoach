# Handoff — 2026-07-27 (second session)

Written by Claude for whichever Claude picks this up next. Read this fully
before touching code.

**Read [`CLAUDE.md`](../CLAUDE.md) first if you haven't** — hard rules on this
repo: ask before design decisions, don't commit/push without being told, all
SQL goes through Ryan, and phone-view (375px) checks are mandatory on every UI
change.

This session was driven off James' Tracker Google Sheet
(`1L-C4U7J7vKzPQoijQ7B8QLbsH8TLIKuEK20HK-JvT5o`), working the "quick win" rows
first, then by priority. Work was split across parallel subagents on disjoint
file sets.

## 0. Supabase access — the previous handoff is out of date

The last handoff said the `mcp__supabase__*` tools hit an org/privilege wall and
told you to set up the CLI. **That is no longer true.** The Supabase MCP tools
work fine this session against project `knixmjpvdfmqpjwhkrgd` (Monroe Fit
Coach). Read-only SELECTs through them were the primary verification tool and
are much faster than a Node script.

**You still do not run SQL against prod yourself.** Schema and data changes go
to Ryan as paste-ready queries. See
[`docs/sql-for-ryan-2026-07-27.md`](sql-for-ryan-2026-07-27.md), written this
session. Ryan **applied blocks 1 and 2** during the session and they are
verified: threads went 54 → 40, DM threads down to 2, message count unchanged
at 81 so no history was lost, `message_threads_dm_unique` is in place, and the
test rows are archived. **Block 3 (the orphaned public link sweep) was not run**
and still needs the select-first judgement call. Block 4 is an undo template,
not a cleanup step.

## 1. What shipped this session (committed to `main`, NOT pushed)

Six commits. **Nothing has been pushed to `origin/main`**, so none of this is
live on monroefitcoach.com yet. Pushing is Ryan's call.

- `8c5d8e6` **Programs: delete a saved program, and close its public link.**
  Soft delete via the existing `programs.archived_at` "delete bin". The
  substantive part is that `/s/<token>` resolves purely by
  `workout_sheets.public_token`, so archiving the program alone left the sheet
  live; delete now also flips the sheet to `status='archived'`, which the token
  lookup filters. "Edit" renamed to "View".
- `13debf1` **Template: remove the empty leading column from published sheets.**
  The `×` column's buttons were hidden per-mode but the `td`/`th`/`col` were
  never removed, leaving a narrow empty column in every published view. Those
  cells are gone from the markup entirely. In edit mode the delete/duplicate
  controls moved to the right edge of the Movement cell (deliberately *not* into
  the Sets cell, where they'd sit beside the per-set `×` and invite a
  destructive mis-click). Saved data shape untouched.
- `3a84fb6` **Messages: stop spawning duplicate DM threads, pin stamps to
  Austin.** See §2 — this was the serious one.
- `1483913` **Sheet: hide the `+ Row` control in every read-only mode.** A client
  on the open public link could append rows to James's prescription.
  `.day-controls` was missing from all four read-only hide lists.
- `e9ee433` **Build: stop creating a program row on "+ New program" click.**
  See §3.
- `df4eff4` **docs: SQL handoff for Ryan.**

Type-check (`npx tsc --noEmit`) is clean at every commit; baseline was also
clean, so there are no pre-existing errors to excuse anything.

## 2. The messages bug was data loss, not a display problem

Worth understanding, because the tracker row understates it ("inbox display has
multiple errors").

`message_threads` has a unique index on `(coach_id, client_id, topic)`. Postgres
treats nulls as distinct, so that index **cannot** constrain DM threads, which
use `topic = null`. `startThreadWithClient` upserted with `onConflict` on that
index, so the conflict never matched and **every "+ New message" click inserted
a new empty thread**. `loadOrCreateClientThread` then called `.maybeSingle()` on
a lookup that now returned several rows; PostgREST returns an error, the code
read only `data`, got `null`, and fell through to its create branch — inserting
*another* empty thread and rendering an empty inbox.

Measured live: loading `/client/messages` as one client showed "No messages yet"
despite 7 real messages, and took his topic-null thread count from 11 to 12 on
that single page view.

Timestamps: both views used `toLocaleTimeString` with no `timeZone`. These are
server components and Vercel's Node runtime is UTC, so **production shipped
every stamp 5 hours off**. Now pinned to `America/Chicago` with a date prefix
once a message is not from today.

**The duplicate threads already in prod are still there.** §1 of the SQL doc
consolidates them and adds a partial unique index that actually covers
topic-null threads.

## 3. Deferred program creation, and why the pre-create existed

"+ New program" used to write a `programs` row and an "Untitled program" sheet
immediately on click, littering prod with empties attached to real clients.

It did that **on purpose**: `getOrCreatePairedProgram` in
`lib/programs-sheets-bridge.ts` hardcodes `program_kind: "in_gym"` for any
sheet-origin program, and the sheet's POST body cannot carry a kind, so
pre-creating was how at-home programs got kinded correctly.

The fix carries the `at_home` intent to the first save instead, stamping it via
`markSheetProgramAtHome` from the workspace's existing `onSaved` callback.
`syncSheetToProgram` never rewrites `program_kind`, so the stamp holds. **The
bridge and the positional row shape were not touched.**

Accepted residual risk: a sub-second window where the row exists as `in_gym`
before the stamp lands. If the stamp fails it surfaces a visible message and
heals on the next save.

## 4. Pre-existing bugs found in passing — three of them

None of these were on the tracker. Two are fixed, one is not.

1. **Fixed.** The old `deleteDraftProgram` hard-deleted the program but only
   nulled the sheet's `program_id`, leaving it `status='active'` with a live
   `public_token`. **Every program James deleted through the Build lobby before
   this session left a working, client-editable public link behind.** The code
   path is fixed; the orphaned sheets are still out there. §3 of the SQL doc has
   a select-first sweep — do not blanket-archive, since a sheet with no
   `program_id` may be a legitimate standalone sheet.
2. **Fixed.** "Clients needing programming → Create" (`quickStartProgramForClient`)
   never pre-created a program, so at-home programs started that way were being
   **born `in_gym` on save**. The new `onSaved` hook corrects that path too.
3. **Not fixed — needs a decision.** `lib/data.ts` `listCoachThreads` caps at
   `.limit(50)` against 54 threads, ordered by *thread* `created_at`. Three real
   clients (Acacia Chan, Jen Loving, David Syndicongo) are **currently missing
   entirely from James's inbox**. Consolidating threads will mask this by
   dropping the row count; the limit should still be raised or the ordering
   changed to last-message-time.

## 5. Open decisions for Ryan

- **Announcement threads win the per-client inbox collapse.** After a broadcast,
  every client's inbox row targets their announcement thread, but
  `/client/messages` only reads topic-null threads, so anything James types into
  one of those rows is **invisible to the client**. That is a direct "one
  database, both ways" break. Related: clients cannot see announcements at all
  today, though the Announce modal promises they land in each client's inbox.
- **Deep links to an archived program still open the coach's builder**
  (`?program=<id>`). The client-facing link is dead, which is what was asked.
  Whether James should be blocked from reopening his own deleted program is a
  product call.
- **Hard delete.** Program delete is currently soft. If "delete" should mean
  gone forever, that needs saying.
- **Touch target sizing** on the sheet's relocated delete/duplicate buttons was
  reasoned, not verified: the preview browser does not emulate a coarse pointer.
  Worth James tapping once on his phone.
- `samples/client-materials/workout-sheet.html` is a stale design sample that
  has diverged further from the live `public/workout-sheet.html`. Left alone
  deliberately. Decide whether it should be deleted or resynced.

## 6. Still open from the tracker

In the sheet's own priority order, not started this session:

- **Pause / deactivate clients** (priority 1, "quick win"): pause button where
  "no planned session" shows, unpause with how long they've been paused, and
  split past clients into paused vs deactivated dropdowns with an activate
  button. **Groundwork is already there**: `client_details.lifecycle` already
  carries `active` / `paused` / `inactive` in prod (24 active, 5 inactive, 5
  paused), and `clients-client.tsx` already renders a lifecycle dropdown and
  splits active vs past at lines 795-796. The "how long have they been paused"
  part needs a `paused_at` column — that is a schema change, so it goes to Ryan.
- **XLS backfill items for client profiles** (priority 2). Sheet comment
  suggests a per-person dropdown form that submits, kept as a separate artifact
  to load Supabase history later.
- **Exercise library upload** (priority 3) and **corrective exercise procedures**
  (priority 4). Deep research already ran — see `docs/research/`. Read the
  previous handoff's §2a/§2b: **do not publish anything about rotator
  cuff/shoulder**, that verification run hit a session limit and has zero valid
  votes. Tennis/golfer's elbow, hip tightness/APT, standalone ankle mobility and
  neck pain also have zero verified findings.
- **Mapping review behind the scenes** (priority 6), **change request / slot
  offer check with dashed-line boxes for offered slots** (lower priority).

Postponed by James in the sheet: the pay-band dropdown persistence, template
formatting/per-row set counts, and the phone notes-column item (comment says
check whether it is even a real issue on phone first).

## 7. Test rows left in prod — cleared

Verifying the delete and deferred-creation flows required creating real rows.
All five are now archived (block 2 of the SQL doc was applied), so nothing test
related is visible to a client. The ids are still listed in that doc for the
record.

## 8. How to verify in-browser

Unchanged from the previous handoff and still accurate. Supabase Auth sign-in
isn't scriptable, so impersonate James via the legacy fallback cookie
(`lib/session.ts`), then reload:

```js
document.cookie = "mfc_session=" + encodeURIComponent(JSON.stringify({
  id: "00000000-0000-0000-0000-00000000c0a4",
  name: "James Monroe", role: "coach", email: null
})) + "; path=/";
```

Same trick with a client's profile id and `role:"client"` checks the other side
of a thread, which is how the messages bug was confirmed end to end.

Gotcha that still bites: the in-app preview browser reports
`visibilityState=hidden` and `requestAnimationFrame` never fires there.

## 9. Tracker sheet state

Logged under "Claude" in James' Tracker this session:

- **Row 7** (inbox errors), **row 11** (template first column), **row 14**
  (Recently Saved delete + View) — marked Resolved, dated 2026-07-27, each with
  a plain-English comment for James and a "deploy pending" note.
- **Row 28** added: the coach inbox `.limit(50)` cap that can hide clients.
- Rows 29 and 30 were being added when the session wrapped: the announcement
  thread problem, and the product call on reopening a deleted program via an
  old builder link. **Check whether those two rows exist before re-adding them.**
- **Rows 8 and 9** (session-history x-axis, Week Of / Active Program dropdown)
  were deliberately left Open. That work was still running at the end of the
  session, so nothing was claimed as fixed. Verify the actual state of those two
  before touching either the code or the sheet.

James reads this sheet directly, so comments there are written in plain language
with no jargon, matching the existing "Claude 2026-07-26" entries.
