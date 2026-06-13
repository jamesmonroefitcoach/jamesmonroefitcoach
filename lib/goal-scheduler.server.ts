// Auto-scheduler for goal-tagged personal blocks.
//
// Each category has hard-coded rules (sleep nightly, piano 1-hr holes
// w/ priority Tue+Thu noon, etc.). 'Add to calendar' adds enough new
// blocks to hit the weekly target. 'Reorganize' deletes future planned
// blocks for the goal/category and re-runs add. Past + completed
// blocks are never touched.
//
// Rule defaults documented in the README of this file — adjust as
// James iterates. Each category-matcher is just a string regex over
// the category NAME, so adding a new category in the Goals UI without
// matching rules just means auto-fill won't schedule for it (returns
// 'no rules' as a soft error).

import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";

type AppointmentLite = {
  id: string;
  starts_at: string;
  ends_at: string;
  session_type: "session" | "personal";
  goal_id: string | null;
  status: string;
};

type GoalCategoryLite = {
  id: string;
  name: string;
  goals: { id: string; name: string; kind: string }[];
};

// Monday-anchored start of the week containing `d`.
function weekStartOf(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  return s;
}

function setLocalHours(base: Date, hour: number, minute = 0): Date {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// Does the proposed range collide with anything already on the schedule?
function isBusy(
  start: Date, end: Date,
  busy: { starts_at: string; ends_at: string }[]
): boolean {
  for (const b of busy) {
    if (overlaps(start, end, new Date(b.starts_at), new Date(b.ends_at))) return true;
  }
  return false;
}

// Fetch this week's appointments — what we need to plan around.
async function loadWeekContext(ownerId: string, weekStart: Date) {
  const supabase = createSupabaseAdmin();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  const { data } = await supabase
    .from("appointments")
    .select("id, starts_at, ends_at, session_type, goal_id, status")
    .or(`coach_id.eq.${ownerId},client_id.eq.${ownerId}`)
    .gte("starts_at", weekStart.toISOString())
    .lt("starts_at", weekEnd.toISOString());
  const appts = (data ?? []) as AppointmentLite[];
  return { appts, weekStart, weekEnd };
}

// ── Per-category schedulers ──────────────────────────────────────────
// Each returns a list of proposed { starts_at, ends_at } slots to add.

type Slot = { startsAt: string; endsAt: string };

function scheduleSleep(weekStart: Date, busy: AppointmentLite[]): Slot[] {
  const out: Slot[] = [];
  // For each night Mon..Sun (relative to weekStart), aim for 22:00→06:00.
  for (let day = 0; day < 7; day++) {
    const nightStart = setLocalHours(new Date(weekStart.getTime() + day * 86_400_000), 22);
    const nightEnd = setLocalHours(new Date(nightStart.getTime() + 86_400_000), 6);
    if (nightStart < new Date()) continue; // past
    // If conflict with the standard window, slide 30 min later up to 4×.
    let s = nightStart, e = nightEnd;
    let attempts = 0;
    while (isBusy(s, e, busy) && attempts < 4) {
      s = new Date(s.getTime() + 30 * 60_000);
      e = new Date(e.getTime() + 30 * 60_000);
      attempts++;
    }
    if (!isBusy(s, e, busy)) {
      out.push({ startsAt: s.toISOString(), endsAt: e.toISOString() });
    }
  }
  return out;
}

function schedulePiano(weekStart: Date, busy: AppointmentLite[], targetHours: number): Slot[] {
  const out: Slot[] = [];
  // Priority Tue + Thu 12:00–13:00.
  for (const day of [1, 3]) {
    const s = setLocalHours(new Date(weekStart.getTime() + day * 86_400_000), 12);
    const e = setLocalHours(new Date(weekStart.getTime() + day * 86_400_000), 13);
    if (s < new Date()) continue;
    if (!isBusy(s, e, busy)) out.push({ startsAt: s.toISOString(), endsAt: e.toISOString() });
  }
  // Fill remaining hours by scanning for exact 1-hour gaps between client
  // sessions on weekdays.
  const remainingHrs = Math.max(0, targetHours - out.length);
  if (remainingHrs <= 0) return out;

  // Sort weekday sessions by start time per day to find gaps.
  for (let day = 0; day < 5; day++) {
    if (out.length - 2 >= remainingHrs) break;
    const dayStart = setLocalHours(new Date(weekStart.getTime() + day * 86_400_000), 8);
    const dayEnd = setLocalHours(new Date(weekStart.getTime() + day * 86_400_000), 20);
    const todays = busy
      .filter((b) => {
        const t = new Date(b.starts_at);
        return t >= dayStart && t < dayEnd && b.session_type === "session";
      })
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    for (let i = 0; i < todays.length - 1; i++) {
      const gapStart = new Date(todays[i].ends_at);
      const gapEnd = new Date(todays[i + 1].starts_at);
      const gapMin = (gapEnd.getTime() - gapStart.getTime()) / 60_000;
      if (gapMin === 60) {
        if (gapStart > new Date() && !isBusy(gapStart, gapEnd, busy)) {
          out.push({ startsAt: gapStart.toISOString(), endsAt: gapEnd.toISOString() });
        }
      }
    }
  }
  return out;
}

function scheduleWeeklyHourBlocks(
  weekStart: Date,
  busy: AppointmentLite[],
  targetHours: number,
  blockHours: number,
  preferredWindows: { dayOfWeek: number; hour: number }[],
): Slot[] {
  const out: Slot[] = [];
  let scheduled = 0;
  for (const w of preferredWindows) {
    if (scheduled >= targetHours) break;
    const s = setLocalHours(new Date(weekStart.getTime() + w.dayOfWeek * 86_400_000), w.hour);
    const e = setLocalHours(new Date(s.getTime() + blockHours * 3_600_000), s.getHours() + blockHours);
    e.setMinutes(0);
    if (s < new Date()) continue;
    if (!isBusy(s, e, busy)) {
      out.push({ startsAt: s.toISOString(), endsAt: e.toISOString() });
      scheduled += blockHours;
    }
  }
  return out;
}

function scheduleByCategoryName(
  name: string,
  weekStart: Date,
  busy: AppointmentLite[],
  targetWeekly: number,
): Slot[] {
  const lower = name.toLowerCase();
  if (/sleep/.test(lower)) return scheduleSleep(weekStart, busy);
  if (/piano/.test(lower)) return schedulePiano(weekStart, busy, targetWeekly);
  if (/cook/.test(lower)) {
    return scheduleWeeklyHourBlocks(weekStart, busy, targetWeekly, 2, [
      { dayOfWeek: 6, hour: 15 },  // Sun 3pm
      { dayOfWeek: 2, hour: 19 },  // Wed 7pm
      { dayOfWeek: 4, hour: 17 },  // Fri 5pm
    ]);
  }
  if (/cardio/.test(lower)) {
    return scheduleWeeklyHourBlocks(weekStart, busy, targetWeekly, 1, [
      { dayOfWeek: 1, hour: 7 },  // Tue 7am — count goal so 'hours' here = runs
      { dayOfWeek: 4, hour: 7 },  // Fri 7am
    ]);
  }
  if (/body/.test(lower)) {
    return scheduleWeeklyHourBlocks(weekStart, busy, targetWeekly, 1, [
      { dayOfWeek: 0, hour: 6 },  // Mon 6am
      { dayOfWeek: 2, hour: 6 },  // Wed 6am
      { dayOfWeek: 4, hour: 6 },  // Fri 6am
    ]);
  }
  if (/business|biz/.test(lower)) {
    return scheduleWeeklyHourBlocks(weekStart, busy, targetWeekly, 2, [
      { dayOfWeek: 2, hour: 19 }, // Wed 7pm
      { dayOfWeek: 4, hour: 19 }, // Fri 7pm
    ]);
  }
  return []; // No rules → don't schedule anything.
}

// ── Public entry points ─────────────────────────────────────────────

export type AutoFillResult =
  | { ok: true; added: number }
  | { ok: false; error: string };

/** Schedule blocks for `categoryId` to hit its weekly target. Never
 *  touches past or completed blocks. Adds personal block rows to
 *  appointments. */
export async function autoFillCategoryForWeek(
  ownerId: string,
  category: GoalCategoryLite,
  targetWeekly: number,
): Promise<AutoFillResult> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = createSupabaseAdmin();
  const ws = weekStartOf(new Date());
  const { appts } = await loadWeekContext(ownerId, ws);
  const primaryGoal = category.goals[0];
  if (!primaryGoal) return { ok: false, error: "Category has no goals to tag." };

  const slots = scheduleByCategoryName(category.name, ws, appts, targetWeekly);
  if (slots.length === 0) {
    return { ok: false, error: "No rules for this category yet (or no free slots)." };
  }

  const rows = slots.map((s) => ({
    coach_id: ownerId,
    client_id: null,
    starts_at: s.startsAt,
    ends_at: s.endsAt,
    session_type: "personal" as const,
    personal_label: category.name,
    is_blocking: true,
    status: "scheduled" as const,
    rate: null,
    paid: false,
    goal_id: primaryGoal.id,
  }));
  const { error } = await supabase.from("appointments").insert(rows);
  if (error) return { ok: false, error: error.message };
  return { ok: true, added: rows.length };
}

/** Delete future + non-completed blocks tagged to `category`'s goals
 *  for this week, then re-run autoFill. Past + completed blocks are
 *  preserved. */
export async function reorganizeCategoryForWeek(
  ownerId: string,
  category: GoalCategoryLite,
  targetWeekly: number,
): Promise<AutoFillResult> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = createSupabaseAdmin();
  const ws = weekStartOf(new Date());
  const we = new Date(ws); we.setDate(ws.getDate() + 7);
  const goalIds = category.goals.map((g) => g.id);
  if (goalIds.length === 0) return { ok: false, error: "Category has no goals." };

  // Delete future personal blocks tagged to any of this category's goals.
  // Past blocks (ends_at <= now) and completed status are preserved.
  await supabase
    .from("appointments")
    .delete()
    .in("goal_id", goalIds)
    .eq("session_type", "personal")
    .gt("ends_at", new Date().toISOString())
    .neq("status", "completed");

  return autoFillCategoryForWeek(ownerId, category, targetWeekly);
}
