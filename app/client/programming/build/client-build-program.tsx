"use client";
// Client-side program builder. Mirrors the Programs WIP coach builder
// (Day ↔ Week toggle, library sidebar, exercise rows) but:
//  - no client picker (you're building for yourself)
//  - Import dropdown is limited to YOUR past programs (assigned + created)
//    with a small "coach assigned" badge next to assigned ones
//  - Save writes a real row to Supabase with created_by_client=true and
//    redirects to View Program when done
//  - is_published stays false — publish remains a coach-side action

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MovementRow, ClientProgramRow } from "@/lib/data";
import {
  EQUIPMENT_OPTIONS, EXERTION_LABELS, LIBRARY_HIERARCHY,
  leafToMovement,
  type Category, type Equipment, type Movement,
  type LibraryGroup, type LibraryNode,
} from "@/lib/programs";
import { saveClientProgram } from "../actions";

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
type DayState = { uid: string; title: string; items: ExerciseSlot[] };
type ProgramKind = "day" | "week";
type ProgramState = {
  kind: ProgramKind;
  name: string;
  durationWeeks: number;
  suggestedDaysPerWeek: number;
  dayCount: number;
  days: DayState[];
  weekItems: ExerciseSlot[];
};

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
    name: "My new program",
    durationWeeks: 4,
    suggestedDaysPerWeek: 3,
    dayCount: 3,
    days: [freshDay(1), freshDay(2), freshDay(3)],
    weekItems: [],
  };
}

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

// ─── Hydrate a past program's builder_state into our local ProgramState ───
function hydrateFromBuilderState(bs: any): ProgramState | null {
  if (!bs || typeof bs !== "object") return null;
  const isWeek = bs.kind === "week";
  const base = defaultProgram();
  if (isWeek) {
    const items: ExerciseSlot[] = (Array.isArray(bs.weekItems) ? bs.weekItems : []).map((it: any) => ({
      ...freshSlot(it.movement ?? base.days[0].items[0]?.movement ?? { id: "x", name: "Exercise", category: "push" as Category }),
      sets: it.sets ?? 3,
      reps: it.reps ?? "8-10",
      exertion_score: it.exertion_score ?? 5,
      equipment_list: (it.equipment_list ?? []) as Equipment[],
      equipment_specifics: it.equipment_specifics,
      notes: it.notes,
    }));
    return { ...base, kind: "week", weekItems: items, days: [freshDay(1)], suggestedDaysPerWeek: bs.suggestedDaysPerWeek ?? 3 };
  }
  const days: DayState[] = (Array.isArray(bs.days) ? bs.days : []).map((d: any, i: number) => ({
    uid: `day-${Date.now()}-${i}`,
    title: d.title ?? `Day ${i + 1}`,
    items: (Array.isArray(d.items) ? d.items : []).map((it: any) => ({
      ...freshSlot(it.movement ?? { id: "x", name: "Exercise", category: "push" as Category }),
      sets: it.sets ?? 3,
      reps: it.reps ?? "8-10",
      exertion_score: it.exertion_score ?? 5,
      equipment_list: (it.equipment_list ?? []) as Equipment[],
      equipment_specifics: it.equipment_specifics,
      notes: it.notes,
    })),
  }));
  return {
    ...base,
    kind: "day",
    days: days.length > 0 ? days : base.days,
    dayCount: days.length > 0 ? days.length : base.dayCount,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────
export default function ClientBuildProgram({
  libraryMovements, pastPrograms,
}: {
  libraryMovements: MovementRow[];
  pastPrograms: ClientProgramRow[];
}) {
  const router = useRouter();
  const [program, setProgram] = useState<ProgramState>(defaultProgram());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [importPick, setImportPick] = useState<string>("");

  function applyImport(id: string) {
    const src = pastPrograms.find((p) => p.id === id);
    if (!src) return;
    const hydrated = hydrateFromBuilderState(src.builder_state);
    if (!hydrated) {
      setError("That program doesn't have any saved structure to import.");
      return;
    }
    setError(null);
    setProgram({ ...hydrated, name: `${src.name} (copy)` });
  }

  function setKind(next: ProgramKind) {
    setProgram((p) => {
      if (p.kind === next) return p;
      if (next === "week") {
        const flat = p.days.flatMap((d) => d.items);
        return { ...p, kind: "week", weekItems: flat, days: [freshDay(1)] };
      }
      const day1 = { ...freshDay(1), items: p.weekItems };
      const others: DayState[] = [];
      for (let i = 2; i <= Math.max(1, p.dayCount); i++) others.push(freshDay(i));
      return { ...p, kind: "day", days: [day1, ...others], weekItems: [] };
    });
  }
  function patchProgram(patch: Partial<ProgramState>) { setProgram((p) => ({ ...p, ...patch })); }
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
    setProgram((p) => ({ ...p, days: p.days.map((d) => d.uid === dayUid ? { ...d, items: [...d.items, freshSlot(movement)] } : d) }));
  }
  function addExerciseToWeek(movement: Movement) {
    setProgram((p) => ({ ...p, weekItems: [...p.weekItems, freshSlot(movement)] }));
  }
  function handleAdd(movement: Movement) {
    if (program.kind === "week") return addExerciseToWeek(movement);
    const target = program.days[0];
    if (target) addExerciseToDay(target.uid, movement);
  }
  function patchDay(uid: string, patch: Partial<DayState>) {
    setProgram((p) => ({ ...p, days: p.days.map((d) => d.uid === uid ? { ...d, ...patch } : d) }));
  }
  function patchDayItem(dayUid: string, itemUid: string, patch: Partial<ExerciseSlot>) {
    setProgram((p) => ({ ...p, days: p.days.map((d) => d.uid !== dayUid ? d : { ...d, items: d.items.map((it) => it.uid === itemUid ? { ...it, ...patch } : it) }) }));
  }
  function deleteDayItem(dayUid: string, itemUid: string) {
    setProgram((p) => ({ ...p, days: p.days.map((d) => d.uid !== dayUid ? d : { ...d, items: d.items.filter((it) => it.uid !== itemUid) }) }));
  }
  function moveDayItem(dayUid: string, itemUid: string, dir: -1 | 1) {
    setProgram((p) => ({ ...p, days: p.days.map((d) => {
      if (d.uid !== dayUid) return d;
      const i = d.items.findIndex((it) => it.uid === itemUid);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.items.length) return d;
      const next = [...d.items];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...d, items: next };
    }) }));
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

  function handleSave() {
    setError(null);
    const builder_state = program.kind === "day"
      ? { kind: "day", days: program.days, suggestedDaysPerWeek: program.suggestedDaysPerWeek }
      : { kind: "week", weekItems: program.weekItems, suggestedDaysPerWeek: program.suggestedDaysPerWeek };
    startSave(async () => {
      const res = await saveClientProgram({
        id: editingId ?? undefined,
        name: program.name,
        program_kind: "at_home",
        duration_weeks: program.durationWeeks,
        at_home_cadence: program.kind === "week" ? `${program.suggestedDaysPerWeek}×/week` : null,
        builder_state,
      });
      if (!res.ok) { setError(res.error ?? "Save failed."); return; }
      if (res.id) {
        router.push(`/client/programming/view/${res.id}`);
        router.refresh();
      }
    });
  }

  const totalExercises = program.kind === "day"
    ? program.days.reduce((s, d) => s + d.items.length, 0)
    : program.weekItems.length;

  return (
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header>
        <span className="badge">My Portal</span>
        <h1 style={{ marginTop: "0.5rem" }}>Build Program</h1>
        <p className="meta">Build your own program. Use Import to copy one of your past programs as a starting point.</p>
      </header>
      <hr className="divider" />

      {/* Import row */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <span className="stat-label" style={{ margin: 0, whiteSpace: "nowrap" }}>Import from past program</span>
          <select
            className="select"
            value={importPick}
            onChange={(e) => setImportPick(e.target.value)}
            style={{ flex: 1, maxWidth: 380, fontSize: "0.86rem" }}
          >
            <option value="">— pick one —</option>
            {pastPrograms.length === 0 && <option disabled value="">No past programs yet</option>}
            {pastPrograms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.created_by_client ? "" : " · coach assigned"}
              </option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            disabled={!importPick}
            onClick={() => importPick && applyImport(importPick)}
            style={{ fontSize: "0.82rem", padding: "0.3rem 0.8rem" }}
          >Import</button>
        </div>
      </div>

      {/* Program metadata row */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 0.8fr 1fr", gap: "0.75rem", alignItems: "end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span className="stat-label">Program name</span>
            <input className="input" value={program.name} onChange={(e) => patchProgram({ name: e.target.value })} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span className="stat-label">Duration (wks)</span>
            <input className="input" type="number" min={1} max={26} value={program.durationWeeks}
              onChange={(e) => patchProgram({ durationWeeks: Math.max(1, parseInt(e.target.value, 10) || 1) })} />
          </label>
          {program.kind === "day" ? (
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <span className="stat-label">Days</span>
              <input className="input" type="number" min={1} max={14} value={program.dayCount}
                onChange={(e) => setDayCount(parseInt(e.target.value, 10) || 1)} />
            </label>
          ) : (
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <span className="stat-label">Suggested days/week</span>
              <input className="input" type="number" min={1} max={7} value={program.suggestedDaysPerWeek}
                onChange={(e) => patchProgram({ suggestedDaysPerWeek: Math.max(1, Math.min(7, parseInt(e.target.value, 10) || 1)) })} />
            </label>
          )}
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
                    border: "none", padding: "0.35rem 0.95rem", fontSize: "0.8rem", cursor: "pointer",
                    fontFamily: "inherit", fontWeight: program.kind === k ? 700 : 500,
                  }}
                >{k === "day" ? "Day level" : "Week level"}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Library + body */}
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

      {error && <p style={{ color: "var(--red)", fontSize: "0.82rem", marginTop: "0.75rem" }}>{error}</p>}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1.5rem" }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Program"}
        </button>
      </div>
    </main>
  );
}

// ─── Library sidebar ─────────────────────────────────────────────────────
function LibrarySidebar({ libraryMovements, onAdd }: { libraryMovements: MovementRow[]; onAdd: (m: Movement) => void }) {
  return (
    <aside style={{
      border: "1px solid var(--line)", borderRadius: 4, padding: "0.55rem 0.65rem",
      background: "var(--paper)", fontSize: "0.8rem", maxHeight: "75vh", overflowY: "auto",
      position: "sticky", top: "1rem", alignSelf: "start",
    }}>
      <h3 style={{ margin: "0 0 0.4rem", fontSize: "0.86rem" }}>Library</h3>
      <p className="meta" style={{ fontSize: "0.66rem", marginBottom: "0.5rem" }}>Click any exercise to add it.</p>
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
          {group.nodes.map((n) => <LibraryNodeBlock key={n.id} node={n} libraryMovements={libraryMovements} onAdd={onAdd} />)}
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

// ─── Day card ────────────────────────────────────────────────────────────
function DayCard({ day, onPatchDay, onPatchItem, onDeleteItem, onMoveItem }: {
  day: DayState;
  onPatchDay: (patch: Partial<DayState>) => void;
  onPatchItem: (itemUid: string, patch: Partial<ExerciseSlot>) => void;
  onDeleteItem: (itemUid: string) => void;
  onMoveItem: (itemUid: string, dir: -1 | 1) => void;
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

// ─── Week block ──────────────────────────────────────────────────────────
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
        <span className="meta" style={{ fontSize: "0.72rem" }}>{items.length} exercises</span>
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

// ─── Exercise row ────────────────────────────────────────────────────────
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
        <input className="input" type="number" min={1} value={slot.sets} onChange={(e) => onPatch({ sets: Math.max(1, parseInt(e.target.value, 10) || 1) })} style={{ fontSize: "0.78rem", padding: "0.15rem 0.28rem" }} />
        <input className="input" value={slot.reps} onChange={(e) => onPatch({ reps: e.target.value })} style={{ fontSize: "0.78rem", padding: "0.15rem 0.28rem" }} />
        <select className="select" value={slot.exertion_score} onChange={(e) => onPatch({ exertion_score: Number(e.target.value) })} style={{ fontSize: "0.74rem", padding: "0.14rem 0.22rem" }}>
          {Object.entries(EXERTION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.15rem 0.4rem", fontSize: "0.7rem" }}>
          {EQUIPMENT_OPTIONS.map((opt) => (
            <label key={opt.value} style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem" }}>
              <input type="checkbox" checked={slot.equipment_list.includes(opt.value)} onChange={() => {
                const has = slot.equipment_list.includes(opt.value);
                const next = has ? slot.equipment_list.filter((x) => x !== opt.value) : [...slot.equipment_list, opt.value];
                onPatch({ equipment_list: next });
              }} />
              {opt.label}
            </label>
          ))}
        </div>
        <input className="input" value={slot.notes ?? ""} onChange={(e) => onPatch({ notes: e.target.value })} style={{ fontSize: "0.78rem", padding: "0.15rem 0.28rem" }} placeholder="optional" />
      </div>
      {(slot.equipment_list.includes("machine") || slot.equipment_list.includes("other")) && (
        <div style={{ marginTop: "0.35rem" }}>
          <input className="input" placeholder="Specify machine / other" value={slot.equipment_specifics ?? ""} onChange={(e) => onPatch({ equipment_specifics: e.target.value })} style={{ fontSize: "0.78rem", padding: "0.15rem 0.32rem" }} />
        </div>
      )}
    </div>
  );
}
