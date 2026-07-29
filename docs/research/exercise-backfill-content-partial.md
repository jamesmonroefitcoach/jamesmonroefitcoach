# Exercise library content generation — PARTIAL (90 of 106)

Source: workflow run `wf_d5da78f1-287` (task `wohwdx1za`), 2026-07-28.
Full content is in [`exercise-backfill-content-partial.json`](exercise-backfill-content-partial.json)
in this folder — 90 of the 106 exercises from
[`exercise-backfill-source.json`](exercise-backfill-source.json) (array
indexes 0-89), each with generated cues, muscles, and a candidate YouTube
demo link.

## What happened

The workflow generates content in batches of 10, then runs an independent
verify pass on each batch's demo links (confirm the video exists and
actually matches). It hit the session's usage limit partway through:
9 of 11 batches (90 exercises) got past **generation**, but the **verify**
stage failed on all of them before it could confirm/correct the links —
and because a pipeline stage failure drops that item, the workflow's own
final result was empty. I recovered the pre-verify generation output
directly from the run's journal rather than let it be thrown away; the
last 16 exercises (indexes 90-105) never even reached generation.

**Consequence: none of the `demo_url` values in the JSON have been
independently checked.** They're a single agent's search result each, not
verified to exist or to match the exercise. Cues and muscles are more
likely reliable (that's the model's own domain knowledge, not a
fetch-and-check step) but weren't cross-checked either.

## Before using this

1. Run the verify stage on the 90 recovered entries (batches of 10, same
   prompt shape as generation) — confirms/replaces demo links.
2. Generate + verify the missing 16 (indexes 90-105).
3. Only then diff against the app's existing 31-movement library
   (`docs/research/exercise-backfill-source.md` has the DB dump reference)
   to avoid duplicate entries before writing an import SQL script for
   Ryan.

Re-launch with:
```
Workflow({scriptPath: "<see prior run for path>", resumeFromRunId: "wf_d5da78f1-287"})
```
completed generation batches replay from cache; only the failed verify
calls and the missing 90-105 range re-run live.
