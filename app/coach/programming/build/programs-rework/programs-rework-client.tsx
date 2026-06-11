"use client";
// Programs Rework WIP — sandboxed at-home program builder with a Day ↔ Week
// toggle. Day mode mirrors the existing at-home Program tab (day cards, each
// with their own exercises). Week mode is a single flat block plus a
// "suggested days/week" input that the client uses to decide pace.
//
// Switching modes is preserving-but-flattening:
//   Day → Week: every day's exercises concatenate in order into one block.
//   Week → Day: everything lands in Day 1.
//
// All state lives in localStorage keyed by client id. Supabase is intentionally
// untouched on this WIP tab.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ClientRow, MovementRow } from "@/lib/data";
import {
  EQUIPMENT_OPTIONS, EXERTION_LABELS, LIBRARY_HIERARCHY,
  leafToMovement,
  type Category, type Equipment, type Movement,
  type LibraryGroup, type LibraryNode, type LibraryLeaf,
} from "@/lib/programs";
import { fmtDate } from "@/lib/format";
import type { ClientProgramItem } from "../page";

type Variation = "stretch" | "plyometric" | "isometric" | "single_sided" | "bilateral" | "dropset";

type ExerciseSlot = {
  uid: string;
  movement: Movement;
  sets: number;
  reps: string;
  exertion_score: number;
  variations: Variation[];
  equipment_list: Equipment[];
  equipment_specifics?: string;
  notes?: string;
};

type DayState = {
  uid: string;
  title: string;
  items: ExerciseSlot[];
};

type ProgramKind = "day" | "week";

type ProgramState = {
  kind: ProgramKind;
  name: string;
  durationWeeks: number;
  suggestedDaysPerWeek: number;
  dayCount: number;
  startsOn: string;          // YYYY-MM-DD
  days: DayState[];        // active when kind=day
  weekItems: ExerciseSlot[]; // active when kind=week
};

// Compute the end date from a YYYY-MM-DD start + week count.
function computeEndsOn(startsOn: string, durationWeeks: number): string | null {
  if (!startsOn || durationWeeks <= 0) return null;
  const d = new Date(startsOn + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + durationWeeks * 7);
  return d.toISOString().slice(0, 10);
}
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── storage ────────────────────────────────────────────────────────────────
const STORAGE_PREFIX = "monroe-programs-rework-";
function storageKey(clientId: string) { return `${STORAGE_PREFIX}${clientId || "noclient"}`; }
function loadProgram(clientId: string): ProgramState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(clientId));
    return raw ? (JSON.parse(raw) as ProgramState) : null;
  } catch { return null; }
}
function saveProgram(clientId: string, p: ProgramState) {
  try { localStorage.setItem(storageKey(clientId), JSON.stringify(p)); } catch {}
}
function clearProgram(clientId: string) {
  try { localStorage.removeItem(storageKey(clientId)); } catch {}
}

// ── helpers ────────────────────────────────────────────────────────────────
function freshSlot(movement: Movement): ExerciseSlot {
  return {
    uid: `ex-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    movement,
    sets: 3,
    reps: "8-10",
    exertion_score: 5,
    variations: [],
    equipment_list: (movement.equipment_list ?? []) as Equipment[],
    equipment_specifics: movement.equipment_specifics,
  };
}
function freshDay(n: number): DayState {
  return { uid: `day-${Date.now()}-${n}`, title: `Day ${n}`, items: [] };
}

function defaultProgram(): ProgramState {
  return {
    kind: "day",
    name: "New program",
    durationWeeks: 4,
    suggestedDaysPerWeek: 3,
    dayCount: 3,
    startsOn: todayISO(),
    days: [freshDay(1), freshDay(2), freshDay(3)],
    weekItems: [],
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Main component
// ───────────────────────────────────────────────────────────────────────────
export default function ProgramsReworkClient({
  clients, initialClientId, libraryMovements, clientProgramSummary, hideTabs = false,
}: {
  clients: ClientRow[];
  initialClientId: string;
  libraryMovements: MovementRow[];
  clientProgramSummary: ClientProgramItem[];
  /** When embedded in the In App Build page, the WIP-cross-link tabs are
   *  redundant with the Session/Program toggle. */
  hideTabs?: boolean;
}) {
  const [clientId, setClientId] = useState(initialClientId);
  const selectedClient = useMemo(() => clients.find((c) => c.id === clientId) ?? null, [clients, clientId]);

  const [program, setProgram] = useState<ProgramState>(defaultProgram());
  const [hydrated, setHydrated] = useState(false);

  // Hydrate when clientId changes
  useEffect(() => {
    if (!clientId) { setHydrated(true); return; }
    const saved = loadProgram(clientId);
    setProgram(saved ?? defaultProgram());
    setHydrated(true);
  }, [clientId]);

  // Persist whenever program changes (after hydrate)
  useEffect(() => {
    if (!hydrated || !clientId) return;
    saveProgram(clientId, program);
  }, [program, hydrated, clientId]);

  // ── toggle Day ↔ Week ───────────────────────────────────────────────────
  function setKind(next: ProgramKind) {
    setProgram((p) => {
      if (p.kind === next) return p;
      if (next === "week") {
        // Day → Week: flatten all days' items in order into weekItems
        const flat = p.days.flatMap((d) => d.items);
        return { ...p, kind: "week", weekItems: flat, days: [freshDay(1)] };
      }
      // Week → Day: everything to Day 1, rebuild day cards based on dayCount
      const day1 = { ...freshDay(1), items: p.weekItems };
      const others: DayState[] = [];
      for (let i = 2; i <= Math.max(1, p.dayCount); i++) others.push(freshDay(i));
      return { ...p, kind: "day", days: [day1, ...others], weekItems: [] };
    });
  }

  function patchProgram(patch: Partial<ProgramState>) {
    setProgram((p) => ({ ...p, ...patch }));
  }

  // ── day-mode mutations ──────────────────────────────────────────────────
  function setDayCount(n: number) {
    const clamped = Math.max(1, Math.min(14, n));
    setProgram((p) => {
      if (p.kind !== "day") return { ...p, dayCount: clamped };
      const cur = p.days;
      let nextDays: DayState[];
      if (cur.length < clamped) {
        const add: DayState[] = [];
        for (let i = cur.length + 1; i <= clamped; i++) add.push(freshDay(i));
        nextDays = [...cur, ...add];
      } else {
        nextDays = cur.slice(0, clamped);
      }
      return { ...p, dayCount: clamped, days: nextDays };
    });
  }

  function addExerciseToDay(dayUid: string, movement: Movement) {
    setProgram((p) => ({
      ...p,
      days: p.days.map((d) => d.uid === dayUid ? { ...d, items: [...d.items, freshSlot(movement)] } : d),
    }));
  }
  function patchDay(uid: string, patch: Partial<DayState>) {
    setProgram((p) => ({ ...p, days: p.days.map((d) => d.uid === uid ? { ...d, ...patch } : d) }));
  }
  function patchDayItem(dayUid: string, itemUid: string, patch: Partial<ExerciseSlot>) {
    setProgram((p) => ({
      ...p,
      days: p.days.map((d) =>
        d.uid !== dayUid ? d :
        { ...d, items: d.items.map((it) => it.uid === itemUid ? { ...it, ...patch } : it) }
      ),
    }));
  }
  function deleteDayItem(dayUid: string, itemUid: string) {
    setProgram((p) => ({
      ...p,
      days: p.days.map((d) =>
        d.uid !== dayUid ? d :
        { ...d, items: d.items.filter((it) => it.uid !== itemUid) }
      ),
    }));
  }
  function moveDayItem(dayUid: string, itemUid: string, dir: -1 | 1) {
    setProgram((p) => ({
      ...p,
      days: p.days.map((d) => {
        if (d.uid !== dayUid) return d;
        const i = d.items.findIndex((it) => it.uid === itemUid);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= d.items.length) return d;
        const next = [...d.items];
        [next[i], next[j]] = [next[j], next[i]];
        return { ...d, items: next };
      }),
    }));
  }

  // ── week-mode mutations ─────────────────────────────────────────────────
  function addExerciseToWeek(movement: Movement) {
    setProgram((p) => ({ ...p, weekItems: [...p.weekItems, freshSlot(movement)] }));
  }
  function patchWeekItem(itemUid: string, patch: Partial<ExerciseSlot>) {
    setProgram((p) => ({ ...p, weekItems: p.weekItems.map((it) => it.uid === itemUid ? { ...it, ...patch } : it) }));
  }
  function deleteWeekItem(itemUid: string) {
    setProgram((p) => ({ ...p, weekItems: p.weekItems.filter((it) => it.uid !== itemUid) }));
  }
  function moveWeekItem(itemUid: string, dir: -1 | 1) {
    setProgram((p) => {
      const i = p.weekItems.findIndex((it) => it.uid === itemUid);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= p.weekItems.length) return p;
      const next = [...p.weekItems];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...p, weekItems: next };
    });
  }

  // ── derived ─────────────────────────────────────────────────────────────
  const totalExercises = program.kind === "day"
    ? program.days.reduce((s, d) => s + d.items.length, 0)
    : program.weekItems.length;

  // ── handlers ────────────────────────────────────────────────────────────
  function handleAdd(movement: Movement) {
    if (program.kind === "week") return addExerciseToWeek(movement);
    // Day mode: target the first day with the fewest items, or just Day 1
    const target = program.days[0];
    if (target) addExerciseToDay(target.uid, movement);
  }
  function handleSaveDraft() {
    if (!clientId) return;
    saveProgram(clientId, program);
    alert("Draft saved (sandboxed in this browser).");
  }
  function handleReset() {
    if (!confirm("Clear this draft and start over?")) return;
    if (clientId) clearProgram(clientId);
    setProgram(defaultProgram());
  }

  if (!clientId) {
    return (
      <>
        {!hideTabs && <TabsHeader />}
        <div className="card" style={{ maxWidth: 480 }}>
          <h2 style={{ margin: 0 }}>Pick a client</h2>
          <hr className="divider" />
          <select className="select" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">— pick a client —</option>
            {clients.filter((c) => c.lifecycle === "active").map((c) => (
              <option key={c.id} value={c.id}>{c.full_name}{c.needs_at_home_programming ? " · flagged for programming" : ""}</option>
            ))}
          </select>
        </div>
      </>
    );
  }

  return (
    <>
      {!hideTabs && <TabsHeader />}

      {/* Client picker + ClientProgramsBanner (flagged clients only) */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <span className="stat-label">Client</span>
            <select
              className="select"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              style={{ marginTop: "0.2rem", minWidth: 220 }}
            >
              {clients.filter((c) => c.lifecycle === "active").map((c) => (
                <option key={c.id} value={c.id}>{c.full_name}{c.needs_at_home_programming ? " · flagged" : ""}</option>
              ))}
            </select>
          </div>
          {selectedClient && (
            <Link href={`/coach/clients/${selectedClient.id}`} className="btn btn-ghost" style={{ fontSize: "0.74rem", padding: "0.3rem 0.7rem" }}>
              full profile →
            </Link>
          )}
        </div>
      </div>

      {/* Client Programs dropdown banner — only flagged clients */}
      {clientProgramSummary.length > 0 && (
        <ClientProgramsDropdown items={clientProgramSummary} onSelect={(id) => setClientId(id)} />
      )}

      {/* Client summary block — Programming for + goals + injuries */}
      {selectedClient && (
        <div className="card" style={{ marginBottom: "1rem", borderLeft: "4px solid var(--rust)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
            <div>
              <span className="badge">Programming for</span>
              <h2 style={{ marginTop: "0.35rem", marginBottom: "0.15rem" }}>{selectedClient.full_name}</h2>
              <div className="meta" style={{ fontSize: "0.82rem" }}>
                {selectedClient.tier?.replace("_", " ") ?? "—"} · {selectedClient.regular_frequency ?? "—"} sessions/wk · since {fmtDate(selectedClient.member_since)}
              </div>
            </div>
            <Link className="btn btn-ghost" href={`/coach/clients/${selectedClient.id}`} style={{ padding: "0.35rem 0.7rem", fontSize: "0.72rem" }}>
              full profile →
            </Link>
          </div>
          <div style={{ marginTop: "0.7rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem" }}>
            <div>
              <div className="stat-label">Goals</div>
              <p style={{ marginTop: "0.25rem", fontSize: "0.88rem" }}>{selectedClient.goals ?? <span className="meta">No goals on file</span>}</p>
            </div>
            <div>
              <div className="stat-label" style={{ color: selectedClient.injuries ? "var(--red)" : undefined }}>Injuries / cautions</div>
              <p style={{ marginTop: "0.25rem", fontSize: "0.88rem", color: selectedClient.injuries ? "var(--red)" : undefined }}>
                {selectedClient.injuries ?? <span className="meta">None reported</span>}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Program metadata row */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 0.75fr 0.9fr 0.9fr 0.7fr 1fr", gap: "0.65rem", alignItems: "end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span className="stat-label">Program name</span>
            <input
              className="input"
              value={program.name}
              onChange={(e) => patchProgram({ name: e.target.value })}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span className="stat-label">Duration (wks)</span>
            <input
              className="input"
              type="number" min={1} max={26}
              value={program.durationWeeks}
              onChange={(e) => patchProgram({ durationWeeks: Math.max(1, parseInt(e.target.value, 10) || 1) })}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span className="stat-label">Start date</span>
            <input
              className="input"
              type="date"
              value={program.startsOn}
              onChange={(e) => patchProgram({ startsOn: e.target.value })}
            />
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span className="stat-label">End date</span>
            <div className="input" style={{ background: "rgba(0,0,0,0.04)", display: "flex", alignItems: "center", minHeight: "1.85rem", padding: "0.2rem 0.5rem", color: "var(--muted)", fontSize: "0.86rem" }}>
              {(() => {
                const end = computeEndsOn(program.startsOn, program.durationWeeks);
                return end ? new Date(end + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
              })()}
            </div>
          </div>
          {program.kind === "day" ? (
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <span className="stat-label">Days</span>
              <input
                className="input"
                type="number" min={1} max={14}
                value={program.dayCount}
                onChange={(e) => setDayCount(parseInt(e.target.value, 10) || 1)}
              />
            </label>
          ) : (
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <span className="stat-label">Days/wk suggested</span>
              <input
                className="input"
                type="number" min={1} max={7}
                value={program.suggestedDaysPerWeek}
                onChange={(e) => patchProgram({ suggestedDaysPerWeek: Math.max(1, Math.min(7, parseInt(e.target.value, 10) || 1)) })}
              />
            </label>
          )}

          {/* Day/Week toggle */}
          <div>
            <span className="stat-label">Structure</span>
            <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 999, overflow: "hidden", marginTop: "0.2rem" }}>
              {(["day", "week"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  style={{
                    background: program.kind === k ? "var(--rust)" : "transparent",
                    color: program.kind === k ? "#fff" : "var(--muted)",
                    border: "none", padding: "0.3rem 0.7rem", fontSize: "0.76rem", cursor: "pointer",
                    fontFamily: "inherit", fontWeight: program.kind === k ? 700 : 500,
                  }}
                >{k === "day" ? "Day" : "Week"}</button>
              ))}
            </div>
          </div>
        </div>
        <p className="meta" style={{ marginTop: "0.55rem", fontSize: "0.74rem" }}>
          {program.kind === "day"
            ? "Each day has its own exercises. The client logs one day at a time."
            : "All exercises live in one weekly block. The client picks which to do on which day until each is checked off for the week."}
        </p>
      </div>

      {/* Two-col layout: library sidebar | program body */}
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: "1rem" }}>
        <LibrarySidebar libraryMovements={libraryMovements} onAdd={handleAdd} />

        <section style={{ minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.5rem" }}>
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{program.name}</h2>
            <span className="meta" style={{ fontSize: "0.76rem" }}>{totalExercises} exercise{totalExercises === 1 ? "" : "s"}</span>
          </div>

          {program.kind === "day" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
              {program.days.map((day) => (
                <DayCard
                  key={day.uid}
                  day={day}
                  onPatchDay={(patch) => patchDay(day.uid, patch)}
                  onPatchItem={(itemUid, patch) => patchDayItem(day.uid, itemUid, patch)}
                  onDeleteItem={(itemUid) => deleteDayItem(day.uid, itemUid)}
                  onMoveItem={(itemUid, dir) => moveDayItem(day.uid, itemUid, dir)}
                  onAdd={(m) => addExerciseToDay(day.uid, m)}
                  libraryMovements={libraryMovements}
                />
              ))}
            </div>
          ) : (
            <WeekBlock
              items={program.weekItems}
              suggestedDaysPerWeek={program.suggestedDaysPerWeek}
              onPatchItem={patchWeekItem}
              onDeleteItem={deleteWeekItem}
              onMoveItem={moveWeekItem}
            />
          )}
        </section>
      </div>

      {/* Bottom action bar */}
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", marginTop: "1.5rem" }}>
        <button className="btn btn-ghost" onClick={handleReset} style={{ color: "var(--red)" }}>Reset draft</button>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-primary" onClick={handleSaveDraft}>Save Draft</button>
        </div>
      </div>

      <p className="meta no-print" style={{ marginTop: "1rem", fontSize: "0.72rem", fontStyle: "italic" }}>
        Sandbox — this page persists per-client to localStorage only. The full publish-to-client flow is being built next.
      </p>
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Tab header — copy/paste from Sessions Rework with "programs" highlighted
// ───────────────────────────────────────────────────────────────────────────
function TabsHeader() {
  const TABS = [
    { id: "rework",   label: "Sessions Rework WIP", href: "/coach/programming/build/rework" },
    { id: "programs", label: "Programs WIP",        href: "/coach/programming/build/programs-rework" },
    { id: "session",  label: "Sessions",            href: "/coach/programming/build?tab=session" },
    { id: "program",  label: "Program",             href: "/coach/programming/build?tab=program" },
  ];
  return (
    <div className="no-print" style={{ borderBottom: "2px solid var(--line)", marginBottom: "1.5rem", display: "flex", alignItems: "flex-end" }}>
      {TABS.map((t) => {
        const active = t.id === "programs";
        return (
          <Link
            key={t.id}
            href={t.href}
            style={{
              padding: "0.55rem 1.4rem",
              borderBottom: active ? "2px solid var(--rust)" : "2px solid transparent",
              marginBottom: "-2px",
              fontSize: "0.95rem", fontWeight: active ? 700 : 400,
              color: active ? "var(--rust)" : "var(--muted)",
              textDecoration: "none",
              letterSpacing: active ? "0.01em" : undefined,
            }}
          >{t.label}</Link>
        );
      })}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Library sidebar — three-tier tree, click to add to active scope
// ───────────────────────────────────────────────────────────────────────────
function leafExercisesFor(node: LibraryNode, libraryMovements: MovementRow[]) {
  if (node.children && node.children.length > 0) {
    return node.children.map((c) => ({ id: `leaf-${c.id}`, label: c.label, movement: leafToMovement(c) }));
  }
  const matches = libraryMovements.filter(
    (m) => (m.subcategory ?? "").trim().toLowerCase() === node.label.trim().toLowerCase()
  );
  if (matches.length > 0) {
    return matches.map((m) => ({
      id: `mv-${m.id}`,
      label: m.name,
      movement: {
        id: m.id, name: m.name, category: m.category as Category,
        subcategory: m.subcategory ?? node.label,
        muscles: m.muscles ?? [],
        equipment_list: (m.equipment_list ?? []) as Equipment[],
        equipment_specifics: m.equipment_specifics ?? undefined,
        cues: m.cues ?? undefined,
        is_core: m.is_core,
      },
    }));
  }
  return [{ id: `node-${node.id}`, label: node.label, movement: leafToMovement({ id: node.id, label: node.label, category: node.category, is_core: node.is_core }) }];
}

function LibrarySidebar({ libraryMovements, onAdd }: { libraryMovements: MovementRow[]; onAdd: (m: Movement) => void }) {
  return (
    <aside style={{
      border: "1px solid var(--line)", borderRadius: 4, padding: "0.55rem 0.65rem",
      background: "var(--paper)", fontSize: "0.8rem", maxHeight: "75vh", overflowY: "auto",
      position: "sticky", top: "1rem", alignSelf: "start",
    }}>
      <h3 style={{ margin: "0 0 0.4rem", fontSize: "0.86rem" }}>Library</h3>
      <p className="meta" style={{ fontSize: "0.66rem", marginBottom: "0.5rem" }}>
        Click any exercise to add it.
      </p>
      {(LIBRARY_HIERARCHY as LibraryGroup[]).map((g) => (
        <LibraryGroupBlock key={g.id} group={g} libraryMovements={libraryMovements} onAdd={onAdd} />
      ))}
    </aside>
  );
}

function LibraryGroupBlock({ group, libraryMovements, onAdd }: { group: LibraryGroup; libraryMovements: MovementRow[]; onAdd: (m: Movement) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: "0.35rem" }}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.2rem 0", width: "100%" }}>
        <span style={{ fontSize: "0.66rem", color: "var(--muted)", width: 10 }}>{open ? "▾" : "▸"}</span>
        <strong style={{ fontSize: "0.78rem" }}>{group.label}</strong>
      </button>
      {open && (
        <div style={{ paddingLeft: "0.75rem" }}>
          {group.nodes.map((n) => (
            <LibraryNodeBlock key={n.id} node={n} libraryMovements={libraryMovements} onAdd={onAdd} />
          ))}
        </div>
      )}
    </div>
  );
}

function LibraryNodeBlock({ node, libraryMovements, onAdd }: { node: LibraryNode; libraryMovements: MovementRow[]; onAdd: (m: Movement) => void }) {
  const [open, setOpen] = useState(false);
  const leaves = useMemo(() => leafExercisesFor(node, libraryMovements), [node, libraryMovements]);
  return (
    <div style={{ marginBottom: "0.15rem" }}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.15rem 0", width: "100%" }}>
        <span style={{ fontSize: "0.62rem", color: "var(--muted)", width: 10 }}>{open ? "▾" : "▸"}</span>
        <span style={{ fontSize: "0.74rem", fontWeight: open ? 600 : 400 }}>{node.label}</span>
      </button>
      {open && (
        <div style={{ paddingLeft: "0.75rem", display: "flex", flexDirection: "column", gap: "0.12rem" }}>
          {leaves.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => onAdd(l.movement)}
              style={{
                background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit",
                textAlign: "left", padding: "0.18rem 0.32rem", fontSize: "0.74rem",
                borderRadius: 3, color: "var(--ink)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(168,61,43,0.07)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >+ {l.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Day card (Day mode)
// ───────────────────────────────────────────────────────────────────────────
function DayCard({ day, onPatchDay, onPatchItem, onDeleteItem, onMoveItem, onAdd, libraryMovements }: {
  day: DayState;
  onPatchDay: (patch: Partial<DayState>) => void;
  onPatchItem: (itemUid: string, patch: Partial<ExerciseSlot>) => void;
  onDeleteItem: (itemUid: string) => void;
  onMoveItem: (itemUid: string, dir: -1 | 1) => void;
  onAdd: (m: Movement) => void;
  libraryMovements: MovementRow[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: "0.55rem 0.7rem", display: "flex", alignItems: "center", gap: "0.5rem", borderBottom: "1px solid var(--line)" }}>
        <button type="button" className="btn btn-ghost" style={{ padding: "0.1rem 0.35rem", fontSize: "0.66rem", color: "var(--muted)" }}
          onClick={() => setCollapsed((v) => !v)}>{collapsed ? "▶" : "▼"}</button>
        <input
          className="input"
          style={{ flex: 1, fontWeight: 700, fontSize: "0.88rem", border: "none", background: "transparent", padding: "0.15rem 0" }}
          value={day.title}
          onChange={(e) => onPatchDay({ title: e.target.value })}
        />
        <span className="meta" style={{ fontSize: "0.7rem" }}>{day.items.length} exercise{day.items.length === 1 ? "" : "s"}</span>
      </div>
      {!collapsed && (
        <div style={{ padding: "0.5rem 0.7rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {day.items.length === 0 ? (
            <p className="meta" style={{ fontSize: "0.78rem", fontStyle: "italic" }}>No exercises yet — click items in the library on the left to add.</p>
          ) : (
            day.items.map((it) => (
              <ExerciseRow
                key={it.uid}
                slot={it}
                onPatch={(p) => onPatchItem(it.uid, p)}
                onDelete={() => onDeleteItem(it.uid)}
                onMoveUp={() => onMoveItem(it.uid, -1)}
                onMoveDown={() => onMoveItem(it.uid, 1)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Week block (Week mode)
// ───────────────────────────────────────────────────────────────────────────
function WeekBlock({ items, suggestedDaysPerWeek, onPatchItem, onDeleteItem, onMoveItem }: {
  items: ExerciseSlot[];
  suggestedDaysPerWeek: number;
  onPatchItem: (itemUid: string, patch: Partial<ExerciseSlot>) => void;
  onDeleteItem: (itemUid: string) => void;
  onMoveItem: (itemUid: string, dir: -1 | 1) => void;
}) {
  return (
    <div className="card" style={{ padding: "0.55rem 0.75rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
        <strong style={{ fontSize: "0.92rem" }}>Week plan</strong>
        <span className="badge" style={{ fontSize: "0.62rem" }}>{suggestedDaysPerWeek}/wk suggested</span>
        <span className="meta" style={{ fontSize: "0.72rem" }}>{items.length} exercises — client picks pace</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {items.length === 0 ? (
          <p className="meta" style={{ fontSize: "0.78rem", fontStyle: "italic" }}>No exercises yet — click items in the library on the left to add.</p>
        ) : (
          items.map((it) => (
            <ExerciseRow
              key={it.uid}
              slot={it}
              onPatch={(p) => onPatchItem(it.uid, p)}
              onDelete={() => onDeleteItem(it.uid)}
              onMoveUp={() => onMoveItem(it.uid, -1)}
              onMoveDown={() => onMoveItem(it.uid, 1)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Exercise row — shared between Day and Week modes
// ───────────────────────────────────────────────────────────────────────────
function ExerciseRow({ slot, onPatch, onDelete, onMoveUp, onMoveDown }: {
  slot: ExerciseSlot;
  onPatch: (p: Partial<ExerciseSlot>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 4, padding: "0.45rem 0.6rem", background: "var(--paper)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.45rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <button type="button" className="btn btn-ghost" style={{ padding: "0.1rem 0.32rem", fontSize: "0.7rem" }} onClick={onMoveUp}>↑</button>
          <button type="button" className="btn btn-ghost" style={{ padding: "0.1rem 0.32rem", fontSize: "0.7rem" }} onClick={onMoveDown}>↓</button>
          <strong style={{ fontSize: "0.86rem" }}>{slot.movement.name}</strong>
        </div>
        <button type="button" className="btn btn-ghost" style={{ fontSize: "0.68rem", padding: "0.1rem 0.4rem", color: "var(--red)" }} onClick={onDelete}>✕</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "60px 70px 70px 130px 1fr", gap: "0.35rem 0.5rem", alignItems: "center", marginTop: "0.4rem" }}>
        <label className="meta" style={{ fontSize: "0.64rem" }}>Sets</label>
        <label className="meta" style={{ fontSize: "0.64rem" }}>Reps</label>
        <label className="meta" style={{ fontSize: "0.64rem" }}>RPE</label>
        <label className="meta" style={{ fontSize: "0.64rem" }}>Equipment</label>
        <label className="meta" style={{ fontSize: "0.64rem" }}>Notes</label>

        <input className="input" type="number" min={1} value={slot.sets}
          onChange={(e) => onPatch({ sets: Math.max(1, parseInt(e.target.value, 10) || 1) })}
          style={{ fontSize: "0.78rem", padding: "0.15rem 0.28rem" }} />
        <input className="input" value={slot.reps}
          onChange={(e) => onPatch({ reps: e.target.value })}
          style={{ fontSize: "0.78rem", padding: "0.15rem 0.28rem" }} />
        <select className="select" value={slot.exertion_score}
          onChange={(e) => onPatch({ exertion_score: Number(e.target.value) })}
          style={{ fontSize: "0.74rem", padding: "0.14rem 0.22rem" }}>
          {Object.entries(EXERTION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.15rem 0.4rem", fontSize: "0.7rem" }}>
          {EQUIPMENT_OPTIONS.map((opt) => (
            <label key={opt.value} style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem" }}>
              <input type="checkbox"
                checked={slot.equipment_list.includes(opt.value)}
                onChange={() => {
                  const has = slot.equipment_list.includes(opt.value);
                  const next = has ? slot.equipment_list.filter((x) => x !== opt.value) : [...slot.equipment_list, opt.value];
                  onPatch({ equipment_list: next });
                }} />
              {opt.label}
            </label>
          ))}
        </div>
        <input className="input" value={slot.notes ?? ""}
          onChange={(e) => onPatch({ notes: e.target.value })}
          style={{ fontSize: "0.78rem", padding: "0.15rem 0.28rem" }}
          placeholder="optional" />
      </div>
      {(slot.equipment_list.includes("machine") || slot.equipment_list.includes("other")) && (
        <div style={{ marginTop: "0.35rem" }}>
          <input
            className="input"
            placeholder="Specify machine / other"
            value={slot.equipment_specifics ?? ""}
            onChange={(e) => onPatch({ equipment_specifics: e.target.value })}
            style={{ fontSize: "0.78rem", padding: "0.15rem 0.32rem" }}
          />
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Client Programs dropdown — collapsible banner of flagged clients with
// active vs needs-program split. Clicking a client jumps the picker to them.
// ───────────────────────────────────────────────────────────────────────────
function ClientProgramsDropdown({
  items, onSelect,
}: {
  items: ClientProgramItem[];
  onSelect: (clientId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = items.filter((i) => i.hasCurrent);
  const needs = items.filter((i) => !i.hasCurrent);
  function daysLabel(d: number | null) {
    if (d === null) return "no end date";
    if (d < 0) return `expired ${Math.abs(d)}d ago`;
    if (d === 0) return "expires today";
    return `${d}d left`;
  }
  return (
    <div className="card no-print" style={{ marginBottom: "1rem" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", background: "none", border: "none", padding: 0,
          cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "space-between", fontFamily: "inherit",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "0.86rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
          {open ? "▾" : "▸"} Client Programs
        </h3>
        <span className="meta" style={{ fontSize: "0.74rem" }}>
          {active.length} active · {needs.length} need programming
        </span>
      </button>
      {open && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem", marginTop: "0.65rem" }}>
          <div>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--sage)", borderBottom: "2px solid var(--sage)", paddingBottom: "0.3rem", marginBottom: "0.4rem" }}>
              ✓ Active <span style={{ fontWeight: 400, opacity: 0.7 }}>({active.length})</span>
            </div>
            {active.length === 0 ? (
              <p className="meta" style={{ fontSize: "0.76rem" }}>None yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.28rem" }}>
                {active.map((item) => (
                  <button
                    key={item.clientId}
                    type="button"
                    onClick={() => onSelect(item.clientId)}
                    className="btn btn-ghost"
                    style={{
                      width: "100%", textAlign: "left",
                      padding: "0.28rem 0.45rem", fontSize: "0.78rem",
                      background: (item.daysUntilEnd !== null && item.daysUntilEnd <= 14) ? "rgba(217,119,6,0.06)" : "rgba(90,107,74,0.06)",
                      borderColor: "transparent",
                      display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem",
                    }}
                  >
                    <strong>{item.clientName}</strong>
                    <span style={{ fontSize: "0.7rem", color: (item.daysUntilEnd !== null && item.daysUntilEnd <= 14) ? "var(--amber)" : "var(--muted)" }}>
                      {daysLabel(item.daysUntilEnd)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--amber)", borderBottom: "2px solid var(--amber)", paddingBottom: "0.3rem", marginBottom: "0.4rem" }}>
              ⚠ Needs Program <span style={{ fontWeight: 400, opacity: 0.7 }}>({needs.length})</span>
            </div>
            {needs.length === 0 ? (
              <p className="meta" style={{ fontSize: "0.76rem" }}>All flagged clients are programmed 🎉</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.28rem" }}>
                {needs.map((item) => (
                  <button
                    key={item.clientId}
                    type="button"
                    onClick={() => onSelect(item.clientId)}
                    style={{
                      width: "100%", textAlign: "left", background: "rgba(217,119,6,0.07)",
                      border: "1px solid rgba(217,119,6,0.2)", borderRadius: 3,
                      padding: "0.28rem 0.45rem", cursor: "pointer", fontFamily: "inherit",
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem",
                    }}
                    title="Click to start a new program for this client"
                  >
                    <strong style={{ fontSize: "0.78rem" }}>{item.clientName}</strong>
                    <span style={{ fontSize: "0.7rem", color: "var(--amber)" }}>tap to program →</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
