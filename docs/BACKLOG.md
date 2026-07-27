# Backlog — distilled from James's "Website Adjustments" doc

Source: Google Doc "Website Adjustments" (owner coachjamesmonroe@gmail.com), read 2026-07-26.
The doc is a reverse-chronological prompt log (May 3 → June 28, 2026). Most of it has
already shipped; this file is the filtered residue. **Do not re-implement anything in
"Done" without checking the commit first.** New items from James now come in via his
xls bug/request log (see WORKFLOW.md) — this file covers only the word doc era.

Status legend: `OPEN` not built · `VERIFY` probably built, confirm in app · `DONE (commit)` shipped.

## Open items (newest first)

- **OPEN — Sheet data → database parsing (Batch 4, Jun 28).** Parse logged sheet
  values into structured per-exercise tracking so history/PRs can be computed.
  Big item; needs design (see "Exercise tracking" ideas below before starting).
- **OPEN — Client day-by-day sheet splitting (Batch 2, Jun 28).** Idea: split the
  template into per-day editable pages (weeks → days), each submittable, with James
  notified and able to view on the profile. Doc says "confirm this makes sense and
  suggest how" — still a design conversation, not a spec.
- **VERIFY — Schedule "edit series" more options (Batch 1, Jun 28).** Wants: change
  time for all vs. just one session. Extending a series shipped (2c6e3e6, d04dd6f);
  the per-occurrence vs. whole-series time change may not have.
- **VERIFY — View Programs: all sections collapsed on open except Programs (Jun 22).**
- **VERIFY — Template/sheet formatting (Jun 22):** small date/weight/sleep inputs +
  wider name field; text wrap on all columns; per-row set counts (3 sets on one row,
  6 on another, no blank padding); narrower sets/reps columns; "+ set" affordance in
  the right border per row. Some sheet polish shipped (8905b73, eb1be94) — check
  which of these specifically.
- **VERIFY — Optional "day name" row in the program (Jun 18).**
- **VERIFY — Phone: notes column cut off in template view when adding sets (Jun 18).**

## Older ideas never built (park until James asks again)

- Growth plan subtab under Goals: editable gantt to year-end targeting $150k/yr,
  price-increase markers, per-client rows, what-if analysis via Client Value Index (Jun 16).
- Dashboard inbox surfacing: new testimonial / consultation request / reschedule ·
  cancel · schedule requests / DMs (Jun 16). Custom announce lists + "today's clients"
  / "this week's clients" dropdowns.
- Repeating-goal engine (recurring calendar goals).
- Body Mastery PR auto-pull from workout actuals.
- "Old Way" soft-deprecate tag.
- Sprint 2 client-access wishlist: community group chat, referrals, workshop polls,
  client-built programs, payments view for clients, diet tracking, progress photos,
  video review submissions, configurable materials.
- Exercise explorer / demo videos per exercise (uploads — where stored? supabase).
- "Demystifying Exercises and Nutrition" client education content (James to supply copy).
- Canned GPT prompt form from client info; Canva case-study templates.
- Check-in question flow (soreness at start; summary with new exercises, PRs, volume,
  intensity 1–10) — partially shipped as session feedback (see lib/session-feedback.ts);
  verify against the doc's full list.

## Done (spot-checked against git; keep for provenance)

- Batch 1 (Jun 28): save-status registration, program name save, live
  clients-needing-programming list, client name prefill → b211d99. Phone view
  persistence → 21bc331. Series extension → 2c6e3e6.
- Batch 2 (Jun 28): start/end date pickers → 0c0820a (+ 103a6ca, eb1be94);
  client-side freeze of published values, weight/notes editable → f099aa5, a831525.
- Batch 3 (Jun 28): programmed → View, Build↔View by status → 06648aa, f7cde4b, f2d6caa.
- Jun 16: cancellation reason codes → d4f6a0d + lib/cancel-reasons.ts; colorblind-safe
  schedule colors, editable session status/rate, totals incl. no-show paid — all in
  the June dash/schedule work (verify only if James re-reports).
- Inbox/messages: one row per person, unread badges, live conversation → 8d84ff9,
  b30a598, 3f22b3a, b8a2620.
- Delete workout sheets, sheet PDF filename, template page for downloads, day logging
  persisting to coach view → f566f57, 016adff, c8e013b, a3b2e51.
- Everything under "5/3–5/14 Prompting" predates the Build-Program rework and the
  archive of legacy Build surfaces (70c0e74, a2c0972); treat as superseded history.
