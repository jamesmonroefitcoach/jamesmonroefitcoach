"use client";
import { useMemo, useState } from "react";
import type { ClientRow } from "@/lib/data";

type Category = "push" | "pull" | "hinge" | "squat" | "core" | "leg_accessory" | "arm_accessory" | "shoulder" | "cardio" | "mobility";

type Movement = {
  id: string;
  name: string;
  category: Category;
  subcategory?: string;
  muscles?: string[];
  equipment?: string;
  demo_url?: string;
  cues?: string;
};

type ProgramItem = Movement & {
  uid: string;
  is_warmup: boolean;
  sets?: number;
  reps?: string;
  weight?: string;
  rest_seconds?: number;
  notes?: string;
};

const STARTER_LIBRARY: Movement[] = [
  { id: "m1", name: "Goblet Squat", category: "squat", muscles: ["quads", "glutes"], equipment: "DB/KB", cues: "Knees track over toes; chest tall" },
  { id: "m2", name: "Romanian Deadlift", category: "hinge", muscles: ["hamstrings", "glutes"], equipment: "Barbell", cues: "Hinge from hips; soft knees" },
  { id: "m3", name: "DB Bench Press", category: "push", muscles: ["pec_major", "triceps", "front_delt"], equipment: "DB" },
  { id: "m4", name: "Chin-up", category: "pull", muscles: ["lats", "biceps"], equipment: "Bar" },
  { id: "m5", name: "Hollow Hold", category: "core", muscles: ["abs"], equipment: "—" },
  { id: "m6", name: "Walking Lunge", category: "leg_accessory", muscles: ["quads", "glutes"], equipment: "DB" },
  { id: "m7", name: "Bicep Curl", category: "arm_accessory", muscles: ["biceps"], equipment: "DB" },
  { id: "m8", name: "Lateral Raise", category: "shoulder", muscles: ["lateral_delt"], equipment: "DB" },
  { id: "m9", name: "Cat-Cow", category: "mobility", muscles: ["spine"], equipment: "—" },
  { id: "m10", name: "Assault Bike Intervals", category: "cardio", equipment: "Bike" }
];

const CATEGORY_LABELS: Record<Category, string> = {
  push: "Push",
  pull: "Pull",
  hinge: "Hinge",
  squat: "Squat / Lunge",
  core: "Core",
  leg_accessory: "Leg accessory",
  arm_accessory: "Arm accessory",
  shoulder: "Shoulder",
  cardio: "Cardio",
  mobility: "Mobility"
};

export default function BuildProgramClient({ clients, initialClientId }: { clients: ClientRow[]; initialClientId?: string }) {
  const [clientId, setClientId] = useState(initialClientId ?? clients[0]?.id ?? "");
  const [dayTitle, setDayTitle] = useState("Day 1 — Lower body");
  const [filter, setFilter] = useState<Category | "all">("all");
  const [items, setItems] = useState<ProgramItem[]>([]);

  const filtered = useMemo(
    () => (filter === "all" ? STARTER_LIBRARY : STARTER_LIBRARY.filter((m) => m.category === filter)),
    [filter]
  );

  const grouped = useMemo(() => {
    const g: Record<string, ProgramItem[]> = {};
    items.forEach((it) => {
      const k = it.is_warmup ? "Warm-up" : CATEGORY_LABELS[it.category];
      (g[k] ??= []).push(it);
    });
    return g;
  }, [items]);

  function addMovement(m: Movement, asWarmup = false) {
    setItems((prev) => [
      ...prev,
      {
        ...m,
        uid: `${m.id}-${Date.now()}`,
        is_warmup: asWarmup,
        sets: 3,
        reps: "8-10",
        weight: "",
        rest_seconds: 60,
        notes: ""
      }
    ]);
  }

  function update(uid: string, patch: Partial<ProgramItem>) {
    setItems((prev) => prev.map((it) => (it.uid === uid ? { ...it, ...patch } : it)));
  }

  function remove(uid: string) {
    setItems((prev) => prev.filter((it) => it.uid !== uid));
  }

  function move(uid: string, dir: -1 | 1) {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.uid === uid);
      if (idx < 0) return prev;
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: "1.25rem" }}>
      <aside className="card no-print" style={{ position: "sticky", top: "1rem", alignSelf: "start" }}>
        <h3>Library</h3>
        <select className="select" value={filter} onChange={(e) => setFilter(e.target.value as Category | "all")} style={{ marginTop: "0.5rem" }}>
          <option value="all">All categories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <hr className="divider" />
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {filtered.map((m) => (
            <li key={m.id} style={{ borderBottom: "1px solid var(--line)", paddingBottom: "0.4rem" }}>
              <div style={{ fontWeight: 600 }}>{m.name}</div>
              <div className="meta" style={{ fontSize: "0.78rem" }}>{CATEGORY_LABELS[m.category]} · {m.equipment ?? "—"}</div>
              <div style={{ marginTop: "0.3rem", display: "flex", gap: "0.3rem" }}>
                <button className="btn btn-ghost" style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem" }} onClick={() => addMovement(m, true)}>+ Warm</button>
                <button className="btn" style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem" }} onClick={() => addMovement(m)}>+ Add</button>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      <section>
        <div className="card no-print" style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "0.75rem", alignItems: "end" }}>
          <div>
            <label className="stat-label">Client</label>
            <select className="select" value={clientId} onChange={(e) => setClientId(e.target.value)} style={{ marginTop: "0.3rem" }}>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="stat-label">Day title</label>
            <input className="input" value={dayTitle} onChange={(e) => setDayTitle(e.target.value)} style={{ marginTop: "0.3rem" }} />
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn btn-ghost" onClick={() => window.print()}>Print</button>
            <button className="btn btn-primary">Publish</button>
          </div>
        </div>

        <div className="card" style={{ marginTop: "1rem" }}>
          <h2>{clients.find((c) => c.id === clientId)?.full_name ?? "—"}</h2>
          <p className="meta">{dayTitle}</p>
          <hr className="divider" />
          {Object.keys(grouped).length === 0 ? (
            <p className="meta">Add movements from the library to start this day.</p>
          ) : (
            Object.entries(grouped).map(([group, list]) => (
              <div key={group} style={{ marginBottom: "1rem" }}>
                <h3>{group}</h3>
                <table className="table">
                  <thead>
                    <tr><th>Movement</th><th>Sets</th><th>Reps</th><th>Weight</th><th>Rest</th><th>Notes</th><th></th></tr>
                  </thead>
                  <tbody>
                    {list.map((it) => (
                      <tr key={it.uid}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{it.name}</div>
                          <div className="meta" style={{ fontSize: "0.75rem" }}>{it.equipment ?? "—"}{it.cues ? ` · ${it.cues}` : ""}</div>
                        </td>
                        <td><input className="input" style={{ width: 60 }} type="number" value={it.sets ?? ""} onChange={(e) => update(it.uid, { sets: Number(e.target.value) || undefined })} /></td>
                        <td><input className="input" style={{ width: 80 }} value={it.reps ?? ""} onChange={(e) => update(it.uid, { reps: e.target.value })} /></td>
                        <td><input className="input" style={{ width: 80 }} value={it.weight ?? ""} onChange={(e) => update(it.uid, { weight: e.target.value })} /></td>
                        <td><input className="input" style={{ width: 70 }} type="number" value={it.rest_seconds ?? ""} onChange={(e) => update(it.uid, { rest_seconds: Number(e.target.value) || undefined })} /></td>
                        <td><input className="input" value={it.notes ?? ""} onChange={(e) => update(it.uid, { notes: e.target.value })} /></td>
                        <td className="no-print" style={{ whiteSpace: "nowrap" }}>
                          <button className="btn btn-ghost" style={{ padding: "0.2rem 0.45rem" }} onClick={() => move(it.uid, -1)}>↑</button>
                          <button className="btn btn-ghost" style={{ padding: "0.2rem 0.45rem" }} onClick={() => move(it.uid, 1)}>↓</button>
                          <button className="btn btn-ghost" style={{ padding: "0.2rem 0.45rem", color: "var(--red)" }} onClick={() => remove(it.uid)}>×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
