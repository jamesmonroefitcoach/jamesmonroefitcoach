"use client";
// Client-side per-program log view. Reads the published builder_state (or
// reconstructs a minimal day list) and lets the client log a Day at a time
// (Day mode) or pick any exercise from the week's pool (Week mode, with
// completed exercises drifting to the bottom).
//
// Logs persist to localStorage today. When the client log tables ship in
// Supabase this hook is the spot to swap.

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { ClientProgramRow } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import { sendProgramFeedback } from "@/app/coach/clients/[id]/program-feedback-actions";
import { submitProgramDayLog, type DayLogEntry } from "@/app/client/programming/log-actions";

// ── Minimal builder_state shape we care about ────────────────────────────
type StateExercise = {
  uid?: string;
  movement?: { id?: string; name?: string };
  sets?: number;
  reps?: string;
  exertion_score?: number;
  notes?: string;
  equipment_list?: string[];
  equipment_specifics?: string;
};
type StateDay = {
  uid?: string;
  title?: string;
  items?: StateExercise[];
};
type ProgramBuilderState = {
  // Sessions Rework / coach builder shape
  days?: StateDay[];
  // Programs Rework Week mode shape
  kind?: "day" | "week";
  weekItems?: StateExercise[];
  suggestedDaysPerWeek?: number;
};

// ── Log model ─────────────────────────────────────────────────────────────
type ExerciseLog = {
  done: boolean;
  weights: string[];     // per set
  actualReps: string[];  // per set
  notes: string;
};
type DayLog = {
  exercises: Record<string, ExerciseLog>;   // keyed by exercise key
  postSessionNote?: string;
  completedAt?: string;                     // ISO when "Complete" hit
};
type ProgramLogState = {
  // Day mode → keyed by day index
  byDay?: Record<number, DayLog>;
  // Week mode → single log
  week?: DayLog;
};

const LOG_KEY_PREFIX = "monroe-client-program-log-";
function logKey(programId: string): string { return `${LOG_KEY_PREFIX}${programId}`; }
function loadLog(programId: string): ProgramLogState {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(logKey(programId));
    return raw ? (JSON.parse(raw) as ProgramLogState) : {};
  } catch { return {}; }
}
function saveLog(programId: string, state: ProgramLogState) {
  try { localStorage.setItem(logKey(programId), JSON.stringify(state)); } catch {}
}

function exerciseKey(d: number | "week", idx: number, ex: StateExercise): string {
  return `${d}::${idx}::${ex.movement?.id ?? ex.movement?.name ?? `ex-${idx}`}`;
}
function blankLog(setCount: number): ExerciseLog {
  return {
    done: false,
    weights: Array(setCount).fill(""),
    actualReps: Array(setCount).fill(""),
    notes: "",
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Main view
// ──────────────────────────────────────────────────────────────────────────
export default function ClientProgramLogView({
  program, clientId,
}: {
  program: ClientProgramRow;
  clientId: string;
}) {
  const bs: ProgramBuilderState = (program.builder_state ?? {}) as ProgramBuilderState;
  // Treat any program whose builder_state declares week mode as Week, else Day.
  const isWeekMode = bs.kind === "week";
  const days: StateDay[] = isWeekMode
    ? [{ title: "Week plan", items: bs.weekItems ?? [] }]
    : (bs.days ?? []);

  const [log, setLog] = useState<ProgramLogState>({});
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setLog(loadLog(program.id));
    setHydrated(true);
  }, [program.id]);
  useEffect(() => {
    if (!hydrated) return;
    saveLog(program.id, log);
  }, [log, hydrated, program.id]);

  const [activeDay, setActiveDay] = useState<number | null>(isWeekMode ? 0 : null);
  const [showPost, setShowPost] = useState<number | "week" | null>(null);

  function patchExerciseLog(dayIdx: number, exKey: string, patch: Partial<ExerciseLog>, setCount: number) {
    setLog((cur) => {
      if (isWeekMode) {
        const w = cur.week ?? { exercises: {} };
        const cur1 = w.exercises[exKey] ?? blankLog(setCount);
        return { ...cur, week: { ...w, exercises: { ...w.exercises, [exKey]: { ...cur1, ...patch } } } };
      }
      const byDay = cur.byDay ?? {};
      const d = byDay[dayIdx] ?? { exercises: {} };
      const cur1 = d.exercises[exKey] ?? blankLog(setCount);
      return { ...cur, byDay: { ...byDay, [dayIdx]: { ...d, exercises: { ...d.exercises, [exKey]: { ...cur1, ...patch } } } } };
    });
  }

  function completeDay(dayIdx: number) {
    setLog((cur) => {
      const byDay = cur.byDay ?? {};
      const d = byDay[dayIdx] ?? { exercises: {} };
      return { ...cur, byDay: { ...byDay, [dayIdx]: { ...d, completedAt: new Date().toISOString() } } };
    });
    setShowPost(dayIdx);
  }
  function completeWeek() {
    setLog((cur) => ({ ...cur, week: { ...(cur.week ?? { exercises: {} }), completedAt: new Date().toISOString() } }));
    setShowPost("week");
  }
  function setPostNote(target: number | "week", text: string) {
    setLog((cur) => {
      if (target === "week") return { ...cur, week: { ...(cur.week ?? { exercises: {} }), postSessionNote: text } };
      const byDay = cur.byDay ?? {};
      const d = byDay[target] ?? { exercises: {} };
      return { ...cur, byDay: { ...byDay, [target]: { ...d, postSessionNote: text } } };
    });
  }

  // ── Submit a completed day/week to James (persists to the DB) ──────────
  const [loggedDate, setLoggedDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [submitting, startSubmit] = useTransition();
  const [sentKeys, setSentKeys] = useState<Set<string>>(new Set());

  function buildEntries(target: number | "week"): Record<string, DayLogEntry> {
    const items = target === "week" ? (days[0]?.items ?? []) : (days[target]?.items ?? []);
    const dl = target === "week" ? log.week : log.byDay?.[target];
    const out: Record<string, DayLogEntry> = {};
    items.forEach((ex, i) => {
      const key = exerciseKey(target, i, ex);
      const el = dl?.exercises?.[key];
      out[key] = {
        name: ex.movement?.name ?? `Exercise ${i + 1}`,
        weights: el?.weights ?? [],
        reps: el?.actualReps ?? [],
        done: !!el?.done,
        notes: el?.notes ?? "",
      };
    });
    return out;
  }

  function submitTarget(target: number | "week") {
    startSubmit(async () => {
      const note = target === "week" ? (log.week?.postSessionNote ?? "") : (log.byDay?.[target]?.postSessionNote ?? "");
      const title = target === "week" ? "Week" : (days[target]?.title || `Day ${target + 1}`);
      const res = await submitProgramDayLog({
        programId: program.id,
        dayIndex: target === "week" ? 0 : target,
        dayTitle: title,
        loggedDate,
        entries: buildEntries(target),
        note,
      });
      setSentKeys((s) => new Set(s).add(String(target)));
      setShowPost(null);
      // The day is always saved locally; only surface genuinely unexpected
      // errors (not "no DB" / pre-migration "table missing").
      if (!res.ok && !/not configured|program_day_logs|does not exist|schema cache/i.test(res.error)) {
        alert(res.error);
      }
    });
  }

  // Days[idx].items default
  const activeDayObj = activeDay != null ? days[activeDay] : null;
  const activeDayItems = activeDayObj?.items ?? [];

  // Week mode sorts completed exercises to the bottom
  const sortedWeekItems = useMemo<{ ex: StateExercise; i: number }[]>(() => {
    if (!isWeekMode) return [];
    const weekLog = log.week ?? { exercises: {} };
    return activeDayItems
      .map((ex, i) => ({ ex, i, key: exerciseKey("week", i, ex), done: !!weekLog.exercises[exerciseKey("week", i, ex)]?.done }))
      .sort((a, b) => Number(a.done) - Number(b.done))
      .map(({ ex, i }) => ({ ex, i }));
  }, [isWeekMode, activeDayItems, log.week]);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <Link href="/client/programming" className="meta" style={{ fontSize: "0.74rem" }}>← Back to View Program</Link>
          <h1 style={{ margin: "0.3rem 0 0.2rem" }}>{program.name}</h1>
          <p className="meta" style={{ fontSize: "0.82rem", margin: 0 }}>
            {program.program_kind === "at_home" ? "At-home" : "In-gym session"} ·
            {isWeekMode
              ? <> Week mode · {bs.suggestedDaysPerWeek ?? "?"} suggested days/week</>
              : <> Day mode · {days.length} day{days.length === 1 ? "" : "s"}</>}
            {program.starts_on ? ` · ${fmtDate(program.starts_on)}${program.ends_on ? ` → ${fmtDate(program.ends_on)}` : ""}` : ""}
          </p>
        </div>
        <RequestFeedbackBox programId={program.id} />
      </header>
      <hr className="divider" />

      {days.length === 0 ? (
        <p className="meta" style={{ fontStyle: "italic" }}>This program doesn&apos;t have any exercises yet.</p>
      ) : isWeekMode ? (
        <WeekLog
          items={sortedWeekItems}
          weekLog={log.week ?? { exercises: {} }}
          onPatch={(exKey, patch, setCount) => patchExerciseLog(0, exKey, patch, setCount)}
          onComplete={completeWeek}
        />
      ) : (
        <DayLogger
          days={days}
          activeDay={activeDay}
          setActiveDay={setActiveDay}
          byDay={log.byDay ?? {}}
          onPatch={(dayIdx, exKey, patch, setCount) => patchExerciseLog(dayIdx, exKey, patch, setCount)}
          onCompleteDay={completeDay}
        />
      )}

      {showPost != null && (
        <PostSessionPrompt
          note={showPost === "week" ? (log.week?.postSessionNote ?? "") : (log.byDay?.[showPost]?.postSessionNote ?? "")}
          onChange={(t) => setPostNote(showPost, t)}
          onClose={() => setShowPost(null)}
          label={showPost === "week" ? "How was the week?" : `How was Day ${(showPost as number) + 1}?`}
          loggedDate={loggedDate}
          onChangeDate={setLoggedDate}
          onSubmit={() => submitTarget(showPost)}
          submitting={submitting}
        />
      )}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Request feedback box — sends a message to James about this program
// ──────────────────────────────────────────────────────────────────────────
function RequestFeedbackBox({ programId }: { programId: string }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [sending, startSend] = useTransition();
  const [status, setStatus] = useState<{ kind: "idle" } | { kind: "ok" } | { kind: "err"; msg: string }>({ kind: "idle" });

  function submit() {
    if (!body.trim()) { setStatus({ kind: "err", msg: "Add a note first." }); return; }
    setStatus({ kind: "idle" });
    startSend(async () => {
      const res = await sendProgramFeedback({ programId, body });
      if (res.ok) {
        setStatus({ kind: "ok" });
        setBody("");
      } else {
        setStatus({ kind: "err", msg: res.error ?? "Send failed." });
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => setOpen(true)}
        style={{ fontSize: "0.78rem", padding: "0.3rem 0.7rem" }}
      >💬 Request feedback</button>
    );
  }

  return (
    <div className="card" style={{ width: "min(360px, 100%)", padding: "0.55rem 0.7rem", borderLeft: "4px solid var(--rust)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontSize: "0.88rem" }}>Request feedback</strong>
        <button className="btn btn-ghost" onClick={() => { setOpen(false); setStatus({ kind: "idle" }); }} style={{ fontSize: "0.72rem" }}>✕</button>
      </div>
      <p className="meta" style={{ fontSize: "0.72rem", margin: "0.2rem 0 0.4rem" }}>
        Send James a note about this program. A link to it gets included automatically.
      </p>
      <textarea
        className="textarea"
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What would you like feedback on?"
        style={{ fontSize: "0.82rem", padding: "0.3rem 0.42rem", resize: "vertical", width: "100%" }}
      />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "0.4rem", gap: "0.5rem" }}>
        <div style={{ fontSize: "0.72rem" }}>
          {status.kind === "ok" && <span style={{ color: "var(--sage)" }}>✓ Sent — check Messages.</span>}
          {status.kind === "err" && <span style={{ color: "var(--red)" }}>{status.msg}</span>}
        </div>
        <button
          className="btn btn-primary"
          onClick={submit}
          disabled={sending || !body.trim()}
          style={{ fontSize: "0.78rem", padding: "0.25rem 0.7rem" }}
        >{sending ? "Sending…" : "Submit"}</button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Day mode logger — pick a day, log exercises, complete day
// ──────────────────────────────────────────────────────────────────────────
function DayLogger({
  days, activeDay, setActiveDay, byDay, onPatch, onCompleteDay,
}: {
  days: StateDay[];
  activeDay: number | null;
  setActiveDay: (n: number | null) => void;
  byDay: Record<number, DayLog>;
  onPatch: (dayIdx: number, exKey: string, patch: Partial<ExerciseLog>, setCount: number) => void;
  onCompleteDay: (dayIdx: number) => void;
}) {
  if (activeDay == null) {
    return (
      <section>
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>Pick a day to log</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
          {days.map((d, i) => {
            const dayLog = byDay[i];
            const exItems = d.items ?? [];
            const done = dayLog?.completedAt != null;
            const inProgress = !done && dayLog && Object.values(dayLog.exercises ?? {}).some((e) => e.done);
            return (
              <button
                key={i}
                type="button"
                onClick={() => setActiveDay(i)}
                className="card"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "0.55rem 0.8rem", textAlign: "left",
                  cursor: "pointer", fontFamily: "inherit",
                  background: done ? "rgba(90,107,74,0.07)" : inProgress ? "rgba(217,119,6,0.05)" : undefined,
                  borderLeft: done ? "4px solid var(--sage)" : inProgress ? "4px solid var(--amber)" : undefined,
                }}
              >
                <div>
                  <strong style={{ fontSize: "0.92rem" }}>{d.title ?? `Day ${i + 1}`}</strong>
                  <div className="meta" style={{ fontSize: "0.74rem", marginTop: "0.1rem" }}>
                    {exItems.length} exercise{exItems.length === 1 ? "" : "s"}
                    {done ? " · ✓ logged" : inProgress ? " · in progress" : ""}
                  </div>
                </div>
                <span style={{ color: "var(--rust)", fontSize: "0.86rem", fontWeight: 600 }}>
                  {done ? "Review →" : inProgress ? "Continue →" : "Log day →"}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  const day = days[activeDay];
  const dayLog = byDay[activeDay] ?? { exercises: {} };
  const exItems = day?.items ?? [];
  const done = dayLog.completedAt != null;
  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.65rem" }}>
        <div>
          <button type="button" onClick={() => setActiveDay(null)} className="btn btn-ghost" style={{ fontSize: "0.78rem" }}>← All days</button>
        </div>
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{day?.title ?? `Day ${activeDay + 1}`}</h2>
        <div style={{ width: 100 }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
        {exItems.map((ex, i) => (
          <ExerciseLogRow
            key={i}
            ex={ex}
            exKey={exerciseKey(activeDay, i, ex)}
            log={dayLog.exercises[exerciseKey(activeDay, i, ex)]}
            onPatch={(patch, setCount) => onPatch(activeDay, exerciseKey(activeDay, i, ex), patch, setCount)}
          />
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
        {done ? (
          <span className="badge badge-sage">Logged · {new Date(dayLog.completedAt!).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
        ) : (
          <button className="btn btn-primary" onClick={() => onCompleteDay(activeDay)}>✓ Complete Day</button>
        )}
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Week mode logger — flat list, completed exercises drift to bottom
// ──────────────────────────────────────────────────────────────────────────
function WeekLog({
  items, weekLog, onPatch, onComplete,
}: {
  items: { ex: StateExercise; i: number }[];
  weekLog: DayLog;
  onPatch: (exKey: string, patch: Partial<ExerciseLog>, setCount: number) => void;
  onComplete: () => void;
}) {
  const done = weekLog.completedAt != null;
  return (
    <section>
      <p className="meta" style={{ fontSize: "0.8rem", marginBottom: "0.55rem" }}>
        Check off exercises as you do them. Completed ones drop to the bottom so it&apos;s easy to see what&apos;s left.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
        {items.map(({ ex, i }) => (
          <ExerciseLogRow
            key={i}
            ex={ex}
            exKey={exerciseKey("week", i, ex)}
            log={weekLog.exercises[exerciseKey("week", i, ex)]}
            onPatch={(patch, setCount) => onPatch(exerciseKey("week", i, ex), patch, setCount)}
          />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
        {done ? (
          <span className="badge badge-sage">Logged · {new Date(weekLog.completedAt!).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
        ) : (
          <button className="btn btn-primary" onClick={onComplete}>✓ Complete Week</button>
        )}
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Single exercise log row
// ──────────────────────────────────────────────────────────────────────────
function ExerciseLogRow({
  ex, exKey, log, onPatch,
}: {
  ex: StateExercise;
  exKey: string;
  log: ExerciseLog | undefined;
  onPatch: (patch: Partial<ExerciseLog>, setCount: number) => void;
}) {
  const setCount = Math.max(1, ex.sets ?? 1);
  const cur = log ?? blankLog(setCount);
  const ensureLen = (arr: string[]) => Array.from({ length: setCount }, (_, i) => arr[i] ?? "");
  const weights = ensureLen(cur.weights);
  const reps = ensureLen(cur.actualReps);

  return (
    <div
      className="card"
      style={{
        padding: "0.55rem 0.7rem",
        background: cur.done ? "rgba(90,107,74,0.06)" : undefined,
        borderLeft: cur.done ? "4px solid var(--sage)" : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.45rem", cursor: "pointer", flex: 1, minWidth: 0 }}>
          <input
            type="checkbox"
            checked={cur.done}
            onChange={(e) => onPatch({ done: e.target.checked }, setCount)}
            style={{ accentColor: "var(--sage)", width: 16, height: 16, flexShrink: 0 }}
          />
          <strong style={{ fontSize: "0.92rem" }}>{ex.movement?.name ?? "Exercise"}</strong>
        </label>
        <span className="meta" style={{ fontSize: "0.72rem" }}>
          {ex.sets ?? "—"}× {ex.reps ?? ""}
          {ex.equipment_list && ex.equipment_list.length > 0 ? ` · ${ex.equipment_list.join(", ")}` : ""}
        </span>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "auto repeat(2, minmax(0, 1fr))",
        gap: "0.25rem 0.45rem", marginTop: "0.4rem", alignItems: "center",
      }}>
        <span />
        <span className="meta" style={{ fontSize: "0.66rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Weight</span>
        <span className="meta" style={{ fontSize: "0.66rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Reps</span>
        {Array.from({ length: setCount }, (_, si) => (
          <div key={si} style={{ display: "contents" }}>
            <span style={{ fontSize: "0.74rem", color: "var(--muted)" }}>Set {si + 1}</span>
            <input
              className="input"
              value={weights[si]}
              onChange={(e) => {
                const next = [...weights]; next[si] = e.target.value;
                onPatch({ weights: next }, setCount);
              }}
              placeholder="lb"
              style={{ fontSize: "0.78rem", padding: "0.18rem 0.32rem" }}
            />
            <input
              className="input"
              value={reps[si]}
              onChange={(e) => {
                const next = [...reps]; next[si] = e.target.value;
                onPatch({ actualReps: next }, setCount);
              }}
              placeholder={String(ex.reps ?? "")}
              style={{ fontSize: "0.78rem", padding: "0.18rem 0.32rem" }}
            />
          </div>
        ))}
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", marginTop: "0.45rem" }}>
        <span className="meta" style={{ fontSize: "0.66rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Notes</span>
        <textarea
          className="textarea"
          rows={2}
          value={cur.notes}
          onChange={(e) => onPatch({ notes: e.target.value }, setCount)}
          style={{ fontSize: "0.82rem", padding: "0.28rem 0.4rem", resize: "vertical" }}
          placeholder="optional"
        />
      </label>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Post-session prompt (modal)
// ──────────────────────────────────────────────────────────────────────────
function PostSessionPrompt({ note, onChange, onClose, label, loggedDate, onChangeDate, onSubmit, submitting }: {
  note: string;
  onChange: (t: string) => void;
  onClose: () => void;
  label: string;
  loggedDate: string;
  onChangeDate: (d: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(23,19,17,0.45)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}
      onClick={onClose}
    >
      <div className="card" style={{ width: "min(440px, 96vw)", padding: "1rem 1.2rem" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0 }}>Post-session check-in</h3>
        <hr className="divider" />
        <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", marginBottom: "0.7rem" }}>
          <span className="meta" style={{ fontSize: "0.78rem" }}>Date trained</span>
          <input
            type="date"
            className="input"
            value={loggedDate}
            onChange={(e) => onChangeDate(e.target.value)}
            style={{ fontSize: "0.86rem", padding: "0.35rem 0.5rem" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          <span className="meta" style={{ fontSize: "0.78rem" }}>{label}</span>
          <textarea
            className="textarea"
            rows={5}
            value={note}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Anything to tell James? How you felt, what was off, what to push next time…"
            style={{ fontSize: "0.86rem", padding: "0.4rem 0.5rem", resize: "vertical" }}
          />
        </label>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", marginTop: "0.85rem" }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>Close</button>
          <button className="btn btn-primary" onClick={onSubmit} disabled={submitting}>
            {submitting ? "Sending…" : "Send to James"}
          </button>
        </div>
      </div>
    </div>
  );
}
