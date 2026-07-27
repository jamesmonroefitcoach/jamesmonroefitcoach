# Update workflow

How changes flow from James to production. The **"James' Tracker" Google Sheet is
the single source of truth** for bugs/requests (main tab) and long-range ideas
(Roadmap tab). The old "Website Adjustments" doc is retired — its residue lives in
BACKLOG.md.

## Cadence for a work session

1. **Read the tracker** (Drive connector; Ryan's account has access). Diff new rows
   against BACKLOG.md and recent git history — many reports are already fixed but
   untested.
2. **Triage** each open row: already-fixed (point at the commit, mark Resolved,
   note "please test") · small fix · needs-scoping (write a short proposal for
   James) · big build (design doc first).
3. **Present the plan of attack to Ryan before writing feature code.** Ask about
   any design/functionality decision or significant suggestion.
4. **Implement smallest-change-first**, one tracker row per commit where possible.
   Verify: `npx tsc --noEmit`, exercise the flow locally, and review the phone view
   intentionally. DB checks over browser-preview checks (preview is headless).
5. **Log in the tracker under "Claude"**: resolution date + status + comment.
   Only James (or Ryan) flips "Tested & Confirmed".
6. **Don't commit or push until Ryan says so.** SQL changes ship as one paste-ready
   query for Ryan to run in the Supabase SQL editor.

## Statuses

- `Open` → being worked or queued
- `Resolved` → Claude believes fixed/answered; awaiting James's test
- `Tested & Confirmed` column → James's sign-off only

## Sources of truth

- Bugs/requests: James' Tracker, main tab
- Long-range ideas: James' Tracker, Roadmap tab
- What already shipped + why: git log, BACKLOG.md, CLAUDE.md "settled decisions"
- Asked-vs-built history: the May–July session transcripts, summarized in
  BACKLOG.md — the Website Adjustments doc records the *ask*, not the *outcome*
