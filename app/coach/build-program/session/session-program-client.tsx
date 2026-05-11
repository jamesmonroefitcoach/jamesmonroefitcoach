"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { ClientRow } from "@/lib/data";
import {
  CATEGORY_LABELS,
  MOVEMENT_LIBRARY,
  EQUIPMENT_OPTIONS,
  EXERTION_LABELS,
  type Category,
  type Equipment,
  type Movement,
  type PastProgramFull,
} from "@/lib/programs";
import { saveProgram } from "../actions";
import { saveAppointment } from "@/app/coach/schedule/actions";

// ── types ─────────────────────────────────────────────────────────────────

type SessionItem = {
  uid: string;
  movement: Movement;
  sets: number;
  reps: string;
  exertion_score: number;
  notes?: string;
  equipment_list: Equipment[];
  equipment_specifics?: string;
};

type DragPayload =
  | { kind: "lib"; movementId: string }
  | { kind: "item"; itemUid: string };

const ALL_CATEGORIES: Category[] = [
  "push", "pull", "hinge", "squat", "core",
  "leg_accessory", "arm_accessory", "shoulder", "cardio", "mobility"
];

function uid() { return `i-${Math.random().toString(36).slice(2)}`; }

function newItem(m: Movement): SessionItem {
  return {
    uid: uid(),
    movement: m,
    sets: 3,
    reps: "8-10",
    exertion_score: 7,
    equipment_list: (m.equipment_list ?? []) as Equipment[],
    equipment_specifics: m.equipment_specifics ?? "",
  };
}

// ── Equipment multi-select ────────────────────────────────────────────────

function EquipmentCell({ item, onChange }: {
  item: SessionItem;
  onChange: (eq: Equipment[], specifics: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasSpecifics = item.equipment_list.some((e) =>
    EQUIPMENT_OPTIONS.find((o) => o.value === e)?.allowsSpecifics
  );
  return (
    <div style={{ position: "relative" }}>
      <button
        className="btn btn-ghost"
        onClick={() => setOpen((o) => !o)}
        style={{ fontSize: "0.72rem", padding: "0.2rem 0.4rem", width: "100%", textAlign: "left" }}
      >
        {item.equipment_list.length ? item.equipment_list.join(", ") : "—"}
      </button>
      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          style={{
            position: "absolute", top: "100%", left: 0, zIndex: 20,
            background: "var(--paper)", border: "1px solid var(--line)",
            borderRadius: 4, padding: "0.5rem", minWidth: 180, boxShadow: "0 4px 12px rgba(0,0,0,0.12)"
          }}
        >
          {EQUIPMENT_OPTIONS.map((opt) => (
            <label key={opt.value} style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontSize: "0.8rem", padding: "0.15rem 0", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={item.equipment_list.includes(opt.value)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...item.equipment_list, opt.value]
                    : item.equipment_list.filter((v) => v !== opt.value);
                  onChange(next, item.equipment_specifics ?? "");
                }}
              />
              {opt.label}
            </label>
          ))}
          {hasSpecifics && (
            <input
              className="input"
              placeholder="Specify…"
              value={item.equipment_specifics ?? ""}
              onChange={(e) => onChange(item.equipment_list, e.target.value)}
              style={{ marginTop: "0.4rem", fontSize: "0.78rem" }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Coverage mini-panel ───────────────────────────────────────────────────

function CoveragePanel({ items }: { items: SessionItem[] }) {
  const usedCats = new Set(items.map((i) => i.movement.category));
  return (
    <div className="card no-print" style={{ padding: "0.75rem 1rem", marginBottom: "0.75rem" }}>
      <div style={{ fontSize: "0.78rem", fontWeight: 700, marginBottom: "0.4rem" }}>Coverage</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
        {ALL_CATEGORIES.map((cat) => {
          const count = items.filter((i) => i.movement.category === cat).length;
          const hit = count > 0;
          return (
            <span key={cat} style={{
              fontSize: "0.7rem", padding: "0.15rem 0.5rem", borderRadius: 3,
              background: hit ? "var(--sage, #5a6b4a)" : "var(--line)",
              color: hit ? "#fff" : "var(--ink)", fontWeight: hit ? 600 : 400,
              border: "1px solid transparent",
            }}>
              {CATEGORY_LABELS[cat]}{count > 0 ? ` ×${count}` : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function SessionProgramClient({
  clientId,
  apptId,
  startsAt,
  client,
  pastPrograms,
}: {
  clientId: string;
  apptId: string;
  startsAt: string;
  client: ClientRow | null;
  pastPrograms: PastProgramFull[];
}) {
  const [items, setItems] = useState<SessionItem[]>([]);
  const [sessionName, setSessionName] = useState(() => {
    if (!startsAt) return "Session";
    return new Date(startsAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) + " Session";
  });
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);
  const [libSearch, setLibSearch] = useState("");
  const [libCat, setLibCat] = useState<Category | "">("");
  const [pastSelId, setPastSelId] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // usage counts for library badges
  const usageCounts = useMemo(() => {
    const m: Record<string, number> = {};
    items.forEach((i) => { m[i.movement.id] = (m[i.movement.id] ?? 0) + 1; });
    return m;
  }, [items]);

  const filteredLib = MOVEMENT_LIBRARY.filter((m) => {
    if (libCat && m.category !== libCat) return false;
    if (libSearch && !m.name.toLowerCase().includes(libSearch.toLowerCase())) return false;
    return true;
  });

  function addMovement(m: Movement) {
    setItems((cur) => [...cur, newItem(m)]);
  }

  function removeItem(uid: string) {
    setItems((cur) => cur.filter((i) => i.uid !== uid));
  }

  function updateItem(uid: string, patch: Partial<SessionItem>) {
    setItems((cur) => cur.map((i) => i.uid === uid ? { ...i, ...patch } : i));
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    if (!dragPayload) return;
    if (dragPayload.kind === "lib") {
      const m = MOVEMENT_LIBRARY.find((x) => x.id === dragPayload.movementId);
      if (m) addMovement(m);
    }
    setDragPayload(null);
  }

  function copyFromPast(prog: PastProgramFull) {
    const allItems: SessionItem[] = prog.days.flatMap((d) =>
      d.items.map((it) => ({
        uid: uid(),
        movement: MOVEMENT_LIBRARY.find((m) => m.name === it.name) ?? {
          id: `custom-${it.name}`, name: it.name, category: it.category,
        },
        sets: it.sets,
        reps: it.reps,
        exertion_score: 7,
        equipment_list: [],
      }))
    );
    setItems(allItems);
  }

  function save() {
    setSaveError(null);
    start(async () => {
      // Save as a single-day in_gym program
      const res = await saveProgram({
        client_id: clientId,
        name: sessionName,
        starts_on: startsAt.slice(0, 10) || new Date().toISOString().slice(0, 10),
        duration_weeks: 0,
        program_kind: "in_gym",
        at_home_cadence: null,
        publish: true,
        days: [{
          day_number: 1,
          title: sessionName,
          items: items.map((i) => ({
            movement_id: i.movement.id,
            movement_name: i.movement.name,
            category: i.movement.category,
            is_warmup: false,
            sets: i.sets,
            reps: i.reps,
            exertion: `RPE ${i.exertion_score}`,
            exertion_score: i.exertion_score,
            notes: i.notes ?? null,
            equipment_list: i.equipment_list,
            equipment_specifics: i.equipment_specifics ?? null,
          })),
        }],
      });
      if (!res.ok) { setSaveError(res.error); return; }

      // Mark the appointment as programmed
      if (apptId) {
        await saveAppointment({
          appt_id: apptId,
          starts_at: startsAt,
          ends_at: new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString(),
          session_type: "session",
          client_id: clientId,
          program_status: "programmed",
          session_program_id: res.data?.id ?? null,
          status: "scheduled",
        });
      }
      setSaved(true);
    });
  }

  return (
    <div>
      {/* session name + copy from past */}
      <div className="card no-print" style={{ marginBottom: "1rem", display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "0.75rem", alignItems: "end" }}>
        <div>
          <label className="stat-label">Session name</label>
          <input className="input" value={sessionName} onChange={(e) => setSessionName(e.target.value)} style={{ marginTop: "0.3rem" }} />
        </div>
        <div>
          <label className="stat-label">Copy from past program</label>
          <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.3rem" }}>
            <select className="select" value={pastSelId} onChange={(e) => setPastSelId(e.target.value)} style={{ flex: 1 }}>
              <option value="">— pick one —</option>
              {pastPrograms.map((p) => (
                <option key={p.id} value={p.id}>{p.name} · {p.day_count}d</option>
              ))}
            </select>
            <button
              className="btn btn-ghost"
              disabled={!pastSelId}
              onClick={() => {
                const p = pastPrograms.find((x) => x.id === pastSelId);
                if (p) copyFromPast(p);
              }}
            >
              Copy all
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button className="btn btn-primary" onClick={save} disabled={pending || items.length === 0}>
            {pending ? "Saving…" : saved ? "Saved ✓" : "Save & mark programmed"}
          </button>
        </div>
      </div>

      {saveError && <p style={{ color: "var(--red)", marginBottom: "0.5rem", fontSize: "0.82rem" }}>{saveError}</p>}
      {saved && (
        <div style={{ background: "#f0faf4", border: "1px solid #4a7c59", borderRadius: 6, padding: "0.6rem 1rem", marginBottom: "1rem", fontSize: "0.82rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Session programmed.</span>
          <Link href="/coach/schedule" className="btn btn-ghost" style={{ fontSize: "0.78rem", padding: "0.2rem 0.5rem" }}>← Back to schedule</Link>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "1rem", alignItems: "start" }}>
        {/* ── Workout block ─────────────────────────────────── */}
        <div>
          <CoveragePanel items={items} />

          <div
            className="card"
            style={{ padding: 0, minHeight: 120 }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
          >
            {items.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary, #888)", fontSize: "0.82rem" }}>
                Drag exercises from the library or click + to add.
              </div>
            ) : (
              <table className="table" style={{ fontSize: "0.8rem" }}>
                <thead>
                  <tr>
                    <th style={{ width: 24 }}></th>
                    <th>Exercise</th>
                    <th style={{ width: 48 }}>Sets</th>
                    <th style={{ width: 80 }}>Reps</th>
                    <th style={{ width: 140 }}>Exertion</th>
                    <th style={{ width: 130 }}>Equipment</th>
                    <th style={{ width: 160 }}>Notes</th>
                    <th style={{ width: 24 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr
                      key={item.uid}
                      draggable
                      onDragStart={() => setDragPayload({ kind: "item", itemUid: item.uid })}
                    >
                      <td style={{ cursor: "grab", color: "var(--text-secondary, #888)", userSelect: "none" }}>⠿</td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{item.movement.name}</div>
                        <div className="meta" style={{ fontSize: "0.7rem" }}>
                          {CATEGORY_LABELS[item.movement.category]}
                          {item.movement.is_core && <span style={{ marginLeft: 4, color: "var(--rust)", fontWeight: 700 }}>CORE</span>}
                        </div>
                      </td>
                      <td>
                        <input
                          className="input"
                          type="number"
                          min={1}
                          value={item.sets}
                          onChange={(e) => updateItem(item.uid, { sets: Number(e.target.value) || 1 })}
                          style={{ width: "100%", fontSize: "0.78rem" }}
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          value={item.reps}
                          onChange={(e) => updateItem(item.uid, { reps: e.target.value })}
                          style={{ width: "100%", fontSize: "0.78rem" }}
                        />
                      </td>
                      <td>
                        <select
                          className="select"
                          value={item.exertion_score}
                          onChange={(e) => updateItem(item.uid, { exertion_score: Number(e.target.value) })}
                          style={{ width: "100%", fontSize: "0.78rem" }}
                        >
                          {Object.entries(EXERTION_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <EquipmentCell
                          item={item}
                          onChange={(eq, sp) => updateItem(item.uid, { equipment_list: eq, equipment_specifics: sp })}
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          value={item.notes ?? ""}
                          onChange={(e) => updateItem(item.uid, { notes: e.target.value })}
                          placeholder="cues…"
                          style={{ width: "100%", fontSize: "0.78rem" }}
                        />
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost"
                          onClick={() => removeItem(item.uid)}
                          style={{ fontSize: "0.7rem", padding: "0.15rem 0.4rem", color: "var(--red)" }}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Library ───────────────────────────────────────── */}
        <div className="card no-print" style={{ padding: "0.75rem", position: "sticky", top: "1rem" }}>
          <div style={{ fontWeight: 700, fontSize: "0.82rem", marginBottom: "0.5rem" }}>Exercise library</div>
          <input
            className="input"
            placeholder="Search…"
            value={libSearch}
            onChange={(e) => setLibSearch(e.target.value)}
            style={{ marginBottom: "0.4rem", fontSize: "0.78rem" }}
          />
          <select
            className="select"
            value={libCat}
            onChange={(e) => setLibCat(e.target.value as Category | "")}
            style={{ marginBottom: "0.6rem", fontSize: "0.78rem" }}
          >
            <option value="">All categories</option>
            {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", maxHeight: 440, overflowY: "auto" }}>
            {filteredLib.map((m) => {
              const count = usageCounts[m.id] ?? 0;
              return (
                <div
                  key={m.id}
                  draggable
                  onDragStart={() => setDragPayload({ kind: "lib", movementId: m.id })}
                  onClick={() => addMovement(m)}
                  style={{
                    padding: "0.3rem 0.5rem",
                    borderRadius: 3,
                    border: "1px solid var(--line)",
                    cursor: "pointer",
                    fontSize: "0.78rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>
                    {m.name}
                    {m.is_core && <span style={{ marginLeft: 4, fontSize: "0.65rem", color: "var(--rust)", fontWeight: 700 }}>CORE</span>}
                  </span>
                  <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    {count > 0 && (
                      <span style={{ fontSize: "0.65rem", background: "var(--ink)", color: "var(--paper)", borderRadius: 2, padding: "0.05rem 0.3rem" }}>
                        ×{count}
                      </span>
                    )}
                    <span className="meta" style={{ fontSize: "0.68rem" }}>+</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
