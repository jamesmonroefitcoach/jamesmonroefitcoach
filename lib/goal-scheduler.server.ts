// Auto-scheduler for goal-tagged personal blocks.
//
// Per-category rules below match James's stated prefs (2026-06-13):
//   Work        — NOT auto-scheduled. Client sessions on the calendar
//                 are the actual work; progress comes from completed
//                 sessions, not from add-to-cal.
//   Sleep       — nightly 22:00 → 06:00 (slides on conflict). Adds a
//                 60 min midday nap the day after any night < 7 hr.
//   Piano       — Tue + Thu 12:00–13:00 priority, then exact 1-hr
//                 holes between client sessions.
//   Cook        — flexible 1–2 hour windows, any time of day, slotted
//                 into the largest free gaps first.
//   Cardio      — evening / sunset, 60 min: Sun 17:00, Wed 18:00,
//                 Fri 18:00 by default.
//   Body        — fits 1-hr and 30-min gaps between client sessions
//                 (gym holes). Single-exercise focus blocks are
//                 30 min.
//   Business    — 30 min daily Mon–Fri. Finds an open 30 min hole
//                 in the day; defaults to 19:00 if no hole exists.

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

function isBusy(
  start: Date, end: Date,
  busy: { starts_at: string; ends_at: string }[]
): boolean {
  for (const b of busy) {
    if (overlaps(start, end, new Date(b.starts_at), new Date(b.ends_at))) return true;
  }
  return false;
}

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

type Slot = { startsAt: string; endsAt: string };

/** Sleep — nightly 22:00 → 06:00 with up-to-4×30-min shift on conflict.
 *  After each scheduled night, check duration; if < 7 hr, add a 60 min
 *  nap (13:00–14:00) the next day. Past nights already < 7 hr that
 *  haven't had a nap yet also get one. */
function scheduleSleep(weekStart: Date, busy: AppointmentLite[]): Slot[] {
  const out: Slot[] = [];
  const SEVEN_HR_MS = 7 * 3_600_000;
  const now = new Date();

  // 1) Future-night planning.
  for (let day = 0; day < 7; day++) {
    const dayBase = new Date(weekStart.getTime() + day * 86_400_000);
    const nightStart = setLocalHours(dayBase, 22);
    const nightEnd = setLocalHours(new Date(nightStart.getTime() + 86_400_000), 6);
    if (nightStart < now) continue;
    let s = nightStart, e = nightEnd, attempts = 0;
    while (isBusy(s, e, busy) && attempts < 4) {
      s = new Date(s.getTime() + 30 * 60_000);
      e = new Date(e.getTime() + 30 * 60_000);
      attempts++;
    }
    if (!isBusy(s, e, busy)) {
      out.push({ startsAt: s.toISOString(), endsAt: e.toISOString() });
    }
  }

  // 2) Nap detection — for each existing sleep block (past or in our
  //    out[] queue) shorter than 7 hr, plan a midday nap the next day.
  type CombinedBlock = { starts_at: string; ends_at: string };
  const allSleep: CombinedBlock[] = [
    ...out.map((s) => ({ starts_at: s.startsAt, ends_at: s.endsAt })),
    ...busy.filter((b) => b.session_type === "personal" && /sleep/i.test(String(b.status))),
  ];
  // We don't know which past blocks are sleep without category — so
  // just inspect each personal block tagged with any goal_id and check
  // if its duration is < 7 hr; treat as 'maybe sleep' if the block
  // spans a 22:00–06:00-ish window.
  const lateNightCandidates = busy.filter((b) => {
    if (b.session_type !== "personal" || !b.goal_id) return false;
    const s = new Date(b.starts_at);
    return s.getHours() >= 20 || s.getHours() <= 6;
  });
  for (const candidate of lateNightCandidates) {
    const dur = new Date(candidate.ends_at).getTime() - new Date(candidate.starts_at).getTime();
    if (dur < SEVEN_HR_MS) {
      const wakeDay = new Date(candidate.ends_at);
      const napStart = setLocalHours(wakeDay, 13);
      const napEnd = setLocalHours(wakeDay, 14);
      if (napStart < now) continue;
      if (!isBusy(napStart, napEnd, busy)) {
        out.push({ startsAt: napStart.toISOString(), endsAt: napEnd.toISOString() });
      }
    }
  }
  // Also nap the day after any short night we just planned.
  for (const s of allSleep) {
    const dur = new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime();
    if (dur < SEVEN_HR_MS) {
      const wake = new Date(s.ends_at);
      const napStart = setLocalHours(wake, 13);
      const napEnd = setLocalHours(wake, 14);
      if (napStart < now) continue;
      if (!isBusy(napStart, napEnd, busy)) {
        out.push({ startsAt: napStart.toISOString(), endsAt: napEnd.toISOString() });
      }
    }
  }
  return out;
}

/** Piano — Tue + Thu 12:00–13:00 priority, then exact-1-hr gaps
 *  between weekday client sessions. */
function schedulePiano(weekStart: Date, busy: AppointmentLite[], targetHours: number): Slot[] {
  const out: Slot[] = [];
  for (const day of [1, 3]) {
    const s = setLocalHours(new Date(weekStart.getTime() + day * 86_400_000), 12);
    const e = setLocalHours(new Date(weekStart.getTime() + day * 86_400_000), 13);
    if (s < new Date()) continue;
    if (!isBusy(s, e, busy)) out.push({ startsAt: s.toISOString(), endsAt: e.toISOString() });
  }
  const remainingHrs = Math.max(0, targetHours - out.length);
  if (remainingHrs <= 0) return out;

  // No weekend rule difference — scan all 7 days for 1-hr session gaps.
  for (let day = 0; day < 7; day++) {
    if (out.length - 2 >= remainingHrs) break;
    const dayStart = setLocalHours(new Date(weekStart.getTime() + day * 86_400_000), 6);
    const dayEnd = setLocalHours(new Date(weekStart.getTime() + day * 86_400_000), 22);
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
      if (gapMin === 60 && gapStart > new Date() && !isBusy(gapStart, gapEnd, busy)) {
        out.push({ startsAt: gapStart.toISOString(), endsAt: gapEnd.toISOString() });
      }
    }
  }
  return out;
}

/** Cook — flexible 1–2 hr windows anywhere. Slots into the largest
 *  free gaps first so the bigger chunks of free time get prep.
 *  No work-hour bounds: any time of day is fair game. */
function scheduleCook(weekStart: Date, busy: AppointmentLite[], targetHours: number): Slot[] {
  const out: Slot[] = [];
  let scheduled = 0;
  type DayGap = { day: number; gapStart: Date; gapEnd: Date };
  const gaps: DayGap[] = [];
  for (let day = 0; day < 7; day++) {
    const dayStart = setLocalHours(new Date(weekStart.getTime() + day * 86_400_000), 6);
    const dayEnd = setLocalHours(new Date(weekStart.getTime() + day * 86_400_000), 22);
    const todays = busy
      .filter((b) => {
        const t = new Date(b.starts_at);
        return t >= dayStart && t < dayEnd;
      })
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    let cursor = dayStart;
    for (const a of todays) {
      const aStart = new Date(a.starts_at);
      if (aStart > cursor) gaps.push({ day, gapStart: cursor, gapEnd: aStart });
      const aEnd = new Date(a.ends_at);
      if (aEnd > cursor) cursor = aEnd;
    }
    if (cursor < dayEnd) gaps.push({ day, gapStart: cursor, gapEnd: dayEnd });
  }
  // Sort gaps largest first.
  gaps.sort((a, b) =>
    (b.gapEnd.getTime() - b.gapStart.getTime()) - (a.gapEnd.getTime() - a.gapStart.getTime())
  );
  for (const g of gaps) {
    if (scheduled >= targetHours) break;
    if (g.gapStart < new Date()) continue;
    const lengthHr = (g.gapEnd.getTime() - g.gapStart.getTime()) / 3_600_000;
    if (lengthHr < 1) continue;
    // Use 2 hr if the gap allows; else 1 hr.
    const useHr = lengthHr >= 2 ? 2 : 1;
    const s = g.gapStart;
    const e = new Date(s.getTime() + useHr * 3_600_000);
    if (!isBusy(s, e, busy)) {
      out.push({ startsAt: s.toISOString(), endsAt: e.toISOString() });
      scheduled += useHr;
    }
  }
  return out;
}

/** Cardio — 30 min runs (2 mi @ easy pace lands here). Evening preferred,
 *  then afternoon, then midday. Priority passes guarantee every eligible
 *  evening slot across the week is exhausted before any afternoon
 *  candidate is considered (and afternoon before midday). */
function scheduleCardio(weekStart: Date, busy: AppointmentLite[], targetRuns: number): Slot[] {
  const out: Slot[] = [];
  const now = new Date();
  const taken = new Set<number>();
  const DURATION_MIN = 30;

  function tryAdd(s: Date): boolean {
    if (s < now) return false;
    if (taken.has(s.getTime())) return false;
    const e = new Date(s.getTime() + DURATION_MIN * 60_000);
    if (isBusy(s, e, busy)) return false;
    out.push({ startsAt: s.toISOString(), endsAt: e.toISOString() });
    taken.add(s.getTime());
    return true;
  }

  // Pass 1 — sunset preferences. Start times split into :00 and :30
  // so a packed top-of-hour can still slot a half-past run.
  const preferred: { dayOfWeek: number; hour: number; minute: number }[] = [
    { dayOfWeek: 6, hour: 17, minute: 0 }, // Sun 5pm
    { dayOfWeek: 2, hour: 18, minute: 0 }, // Wed 6pm
    { dayOfWeek: 4, hour: 18, minute: 0 }, // Fri 6pm
  ];
  for (const p of preferred) {
    if (out.length >= targetRuns) break;
    const s = setLocalHours(new Date(weekStart.getTime() + p.dayOfWeek * 86_400_000), p.hour, p.minute);
    tryAdd(s);
  }

  // Priority-ordered time-of-day passes. Half-hour candidates so 30-min
  // runs slot more flexibly than a one-hour grid would allow.
  const passes: { label: string; starts: { h: number; m: number }[] }[] = [
    { label: "evening",   starts: makeHalfHours(17, 19) },
    { label: "afternoon", starts: makeHalfHours(14, 16) },
    { label: "midday",    starts: makeHalfHours(11, 13) },
  ];
  for (const pass of passes) {
    if (out.length >= targetRuns) break;
    for (let day = 0; day < 7 && out.length < targetRuns; day++) {
      for (const t of pass.starts) {
        if (out.length >= targetRuns) break;
        const s = setLocalHours(new Date(weekStart.getTime() + day * 86_400_000), t.h, t.m);
        tryAdd(s);
      }
    }
  }
  return out;
}

function makeHalfHours(hStart: number, hEnd: number): { h: number; m: number }[] {
  const out: { h: number; m: number }[] = [];
  for (let h = hStart; h <= hEnd; h++) {
    out.push({ h, m: 0 });
    out.push({ h, m: 30 });
  }
  return out;
}

/** Body Mastery — fits into 1-hr and 30-min gaps between client sessions
 *  (gym holes). 60 min = full workout; 30 min = single-exercise focus. */
function scheduleBodyMastery(weekStart: Date, busy: AppointmentLite[], targetHours: number): Slot[] {
  const out: Slot[] = [];
  let scheduledHrs = 0;
  for (let day = 0; day < 7; day++) {
    if (scheduledHrs >= targetHours) break;
    const dayStart = setLocalHours(new Date(weekStart.getTime() + day * 86_400_000), 6);
    const dayEnd = setLocalHours(new Date(weekStart.getTime() + day * 86_400_000), 21);
    const todays = busy
      .filter((b) => {
        const t = new Date(b.starts_at);
        return t >= dayStart && t < dayEnd && b.session_type === "session";
      })
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    if (todays.length < 2) continue; // need gaps between sessions
    for (let i = 0; i < todays.length - 1; i++) {
      if (scheduledHrs >= targetHours) break;
      const gapStart = new Date(todays[i].ends_at);
      const gapEnd = new Date(todays[i + 1].starts_at);
      const gapMin = (gapEnd.getTime() - gapStart.getTime()) / 60_000;
      if (gapStart < new Date()) continue;
      // Use full hour if 60+ min; else 30 min if 30+; else skip.
      let useHr = 0;
      if (gapMin >= 60) useHr = 1;
      else if (gapMin >= 30) useHr = 0.5;
      else continue;
      const s = gapStart;
      const e = new Date(s.getTime() + useHr * 3_600_000);
      if (!isBusy(s, e, busy)) {
        out.push({ startsAt: s.toISOString(), endsAt: e.toISOString() });
        scheduledHrs += useHr;
      }
    }
  }
  return out;
}

/** Business — 30 min daily, all 7 days (no weekend rule difference).
 *  Tries to slot into a free 30 min hole between client sessions;
 *  falls back to 19:00 if none. */
function scheduleBusiness(weekStart: Date, busy: AppointmentLite[], targetHours: number): Slot[] {
  const out: Slot[] = [];
  let scheduledHrs = 0;
  for (let day = 0; day < 7; day++) {
    if (scheduledHrs >= targetHours) break;
    const dayStart = setLocalHours(new Date(weekStart.getTime() + day * 86_400_000), 6);
    const dayEnd = setLocalHours(new Date(weekStart.getTime() + day * 86_400_000), 23);
    const todays = busy
      .filter((b) => {
        const t = new Date(b.starts_at);
        return t >= dayStart && t < dayEnd && b.session_type === "session";
      })
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    let slotted = false;
    for (let i = 0; i < todays.length - 1; i++) {
      const gapStart = new Date(todays[i].ends_at);
      const gapEnd = new Date(todays[i + 1].starts_at);
      const gapMin = (gapEnd.getTime() - gapStart.getTime()) / 60_000;
      if (gapMin >= 30 && gapStart > new Date()) {
        const s = gapStart;
        const e = new Date(s.getTime() + 30 * 60_000);
        if (!isBusy(s, e, busy)) {
          out.push({ startsAt: s.toISOString(), endsAt: e.toISOString() });
          scheduledHrs += 0.5;
          slotted = true;
          break;
        }
      }
    }
    if (!slotted) {
      // Fallback: 19:00–19:30 same day.
      const s = setLocalHours(new Date(weekStart.getTime() + day * 86_400_000), 19);
      const e = setLocalHours(s, 19, 30);
      e.setMinutes(30);
      if (s < new Date()) continue;
      if (!isBusy(s, e, busy)) {
        out.push({ startsAt: s.toISOString(), endsAt: e.toISOString() });
        scheduledHrs += 0.5;
      }
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
  if (/work/.test(lower)) return []; // Work = client sessions; not auto-scheduled.
  if (/sleep/.test(lower)) return scheduleSleep(weekStart, busy);
  if (/piano/.test(lower)) return schedulePiano(weekStart, busy, targetWeekly);
  if (/cook|prep/.test(lower)) return scheduleCook(weekStart, busy, targetWeekly);
  if (/cardio|run/.test(lower)) return scheduleCardio(weekStart, busy, targetWeekly);
  if (/body/.test(lower)) return scheduleBodyMastery(weekStart, busy, targetWeekly);
  if (/business|biz/.test(lower)) return scheduleBusiness(weekStart, busy, targetWeekly);
  return [];
}

// ── Public entry points ─────────────────────────────────────────────

export type AutoFillResult =
  | { ok: true; added: number }
  | { ok: false; error: string };

export async function autoFillCategoryForWeek(
  ownerId: string,
  category: GoalCategoryLite,
  targetWeekly: number,
): Promise<AutoFillResult> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  // Work is sessions, not personal blocks — refuse to schedule.
  if (/work/i.test(category.name)) {
    return { ok: false, error: "Work is filled by client sessions, not auto-scheduled." };
  }
  const supabase = createSupabaseAdmin();
  const ws = weekStartOf(new Date());
  const { appts } = await loadWeekContext(ownerId, ws);
  const primaryGoal = category.goals[0];
  if (!primaryGoal) return { ok: false, error: "Category has no goals to tag." };

  const slots = scheduleByCategoryName(category.name, ws, appts, targetWeekly);
  if (slots.length === 0) {
    // Count existing future blocks for this category so the message can
    // tell the user which is true: already booked vs. genuinely no room.
    const futureExisting = appts.filter((a) => {
      if (a.session_type !== "personal") return false;
      if (!a.goal_id) return false;
      if (!category.goals.some((g) => g.id === a.goal_id)) return false;
      return new Date(a.starts_at) > new Date();
    }).length;
    if (futureExisting >= targetWeekly) {
      return { ok: false, error: `Already booked ${futureExisting} for this week (target ${targetWeekly}).` };
    }
    return {
      ok: false,
      error: futureExisting > 0
        ? `Booked ${futureExisting}/${targetWeekly}; no free preferred slots for the rest. Try Reorg or move existing appointments.`
        : "No free slots match the rules for this category this week.",
    };
  }

  // Sleep blocks get a time-range label so they read at a glance even
  // though the calendar only shows 6a–1a. Everything else uses the
  // category name.
  const isSleep = /sleep/i.test(category.name);
  const rows = slots.map((s) => {
    let label = category.name;
    if (isSleep) {
      const st = new Date(s.startsAt);
      const en = new Date(s.endsAt);
      const durHr = Math.max(0, (en.getTime() - st.getTime()) / 3_600_000);
      const dur = Math.round(durHr * 10) / 10;
      const fmt = (d: Date) => {
        const hr24 = d.getHours();
        const min = d.getMinutes();
        const hr12 = hr24 % 12 === 0 ? 12 : hr24 % 12;
        const ampm = hr24 < 12 ? "a" : "p";
        return min === 0 ? `${hr12}${ampm}` : `${hr12}:${String(min).padStart(2, "0")}${ampm}`;
      };
      // Distinguish nap (under 3 hr) from full night.
      const tag = durHr < 3 ? "Nap" : "Sleep";
      label = `${tag} ${fmt(st)}–${fmt(en)} · ${dur}h`;
    }
    return {
      coach_id: ownerId,
      client_id: null,
      starts_at: s.startsAt,
      ends_at: s.endsAt,
      session_type: "personal" as const,
      personal_label: label,
      is_blocking: true,
      status: "scheduled" as const,
      rate: null,
      paid: false,
      goal_id: primaryGoal.id,
    };
  });
  const { error } = await supabase.from("appointments").insert(rows);
  if (error) return { ok: false, error: error.message };
  return { ok: true, added: rows.length };
}

export async function reorganizeCategoryForWeek(
  ownerId: string,
  category: GoalCategoryLite,
  targetWeekly: number,
): Promise<AutoFillResult> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  if (/work/i.test(category.name)) {
    return { ok: false, error: "Work is filled by client sessions, not auto-scheduled." };
  }
  const supabase = createSupabaseAdmin();
  const goalIds = category.goals.map((g) => g.id);
  if (goalIds.length === 0) return { ok: false, error: "Category has no goals." };

  await supabase
    .from("appointments")
    .delete()
    .in("goal_id", goalIds)
    .eq("session_type", "personal")
    .gt("ends_at", new Date().toISOString())
    .neq("status", "completed");

  return autoFillCategoryForWeek(ownerId, category, targetWeekly);
}
