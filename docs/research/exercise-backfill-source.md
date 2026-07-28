# Exercise Backfill sheet — extraction notes

Source: "Excercise Backfill" tab of James's Google Sheet, "Monroe Fit Caoch
Clients" (`1B1XSaL2lfr-aKxWz8KyZWKRCqvAeKzfDsRozZRusKg4`). Pulled 2026-07-27.
Raw extraction (all 106 rows, header-mapped) is in
[`exercise-backfill-source.json`](exercise-backfill-source.json) in this
folder.

## What's actually in the sheet

106 exercise rows with: **Final Name, Category, Subcategory, Sub-subcategory
(Abs only), Position, Specification, Equipment, If Machine, If Other, "To
add (X)".**

- **0 of 106 rows have Cues, Demo Link, or Muscles Impacted filled in.**
  Those three columns exist in the sheet but are empty on every real row —
  the only content in them is placeholder/instruction text on row 1
  ("*at what level to add these?", "*can have gpt provide and you check
  them off or change them", etc.), which is James/Ryan's own working note
  to figure out scope, not sheet data.
- 8 rows are marked `X` in "To add" — presumably James's shortlist of what
  he specifically wants added next, not the full 106.
- Category breakdown: Upper 33, Lower 17, Middle 13, Yoga 12, Accessories 7,
  Stretch 6, Plyometric 6, SAQ 3, Specialty Skills 1, Abs 1, uncategorized 7.

## Implication for the library backfill task

The sheet gives names/taxonomy but **no coaching content** (cues, muscles,
demo links) — that has to come from the app's existing exercise library
(check for overlap/dupes) plus new deep research, not from this sheet. Don't
treat "106 rows" as "106 done exercises" — it's closer to a name/category
skeleton James wants filled in.

## Coach's own to-do note (found on dashboard, for context)

James's dashboard To Do list already has: *"Generate backfill document for
exercises (RM to assist)"* — confirming this is an open, known task on his
side, not something being sprung on him.
