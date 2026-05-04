"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { ClientRow } from "@/lib/data";
import {
  CATEGORY_LABELS,
  MOVEMENT_LIBRARY,
  PROGRAM_KIND_LABEL,
  type Category,
  type Movement,
  type PastProgramFull,
  type ProgramKind,
  pastProgramsForClient
} from "@/lib/programs";
import { saveProgram } from "./actions";

type ProgramItem = {
  uid: string;
  movement: Movement;
  is_warmup: boolean;
  sets: number;
  reps: string;
  exertion: string;
  rest_seconds?: number;
  notes?: string;
  last_log?: { reps: number; weight_lb: number };
};

type ProgramDay = {
  uid: string;
  title: string;
  focus?: string;
  collapsed: boolean;
  items: ProgramItem[];
};

const NEW_DAY = (n: number): ProgramDay => ({
  uid: `day-${n}-${Date.now()}`,
  title: `Day ${n}`,
  collapsed: false,
  items: []
});

const ALL_CATEGORIES: Category[] = [
  "push", "pull", "hinge", "squat", "core",
  "leg_accessory", "arm_accessory", "shoulder", "cardio", "mobility"
];

type DragPayload =
  | { kind: "lib"; movementId: string }
  | { kind: "item"; dayUid: string; itemUid: string };

export default function BuildProgramClient({
  clients,
  initialClientId
}: {
  clients: ClientRow[];
  initialClientId?: string;
}) {
  const [clientId, setClientId] = useState(initialClientId ?? clients[0]?.id ?? "");
  const [programName, setProgramName] = useState("New program");
  const [startsOn, setStartsOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [durationWeeks, setDurationWeeks] = useState(8);
  const [programKind, setProgramKind] = useState<ProgramKind>("in_gym");
  const [atHomeCadence, setAtHomeCadence] = useState("3x/week");
  const [days, setDays] = useState<ProgramDay[]>([NEW_DAY(1)]);

  const [savePending, startSave] = useTransition();
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // library controls
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCat, setFilterCat] = useState<Category | "all">("all");
  const [openCats, setOpenCats] = useState<Set<Category>>(new Set([]));

  // drag state — single global object so library and items share
  const [drag, setDrag] = useState<DragPayload | null>(null);

  const comparePid = useState<string>("")[0];
  const [compareSel, setCompareSel] = useState<string>("");
  const pastPrograms = useMemo(() => (clientId ? pastProgramsForClient(clientId) : []), [clientId]);
  const baseProgram = useMemo(() => pastPrograms.find((p) => p.id === compareSel) ?? null, [pastPrograms, compareSel]);

  // search + category filter for library accordion
  const libraryByCat = useMemo(() => {
    const t = searchTerm.trim().toLowerCase();
    const map = new Map<Category, Movement[]>();
    for (const cat of ALL_CATEGORIES) {
      const items = MOVEMENT_LIBRARY.filter((m) => {
        if (m.category !== cat) return false;
        if (filterCat !== "all" && m.category !== filterCat) return false;
        if (!t) return true;
        return m.name.toLowerCase().includes(t) || (m.muscles ?? []).some((x) => x.includes(t));
      });
      if (items.length) map.set(cat, items);
    }
    return map;
  }, [searchTerm, filterCat]);

  // count of how many times each movement appears in the program (across days)
  const inProgramCount = useMemo(() => {
    const counts: Record<string, number> = {};
    days.forEach((d) => d.items.forEach((it) => { counts[it.movement.id] = (counts[it.movement.id] ?? 0) + 1; }));
    return counts;
  }, [days]);

  // ─── day actions ────────────────────────────────────────────────
  function addDay() { setDays((d) => [...d, NEW_DAY(d.length + 1)]); }
  function removeDay(uid: string) { setDays((d) => d.filter((x) => x.uid !== uid)); }
  function toggleCollapse(uid: string) {
    setDays((d) => d.map((x) => (x.uid === uid ? { ...x, collapsed: !x.collapsed } : x)));
  }
  function patchDay(uid: string, patch: Partial<ProgramDay>) {
    setDays((d) => d.map((x) => (x.uid === uid ? { ...x, ...patch } : x)));
  }

  function addMovementToDay(dayUid: string, m: Movement, asWarmup = false) {
    setDays((d) =>
      d.map((day) => {
        if (day.uid !== dayUid) return day;
        const item: ProgramItem = {
          uid: `${m.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          movement: m,
          is_warmup: asWarmup,
          sets: 3,
          reps: "8-10",
          exertion: "RPE 7",
          rest_seconds: 60
        };
        return { ...day, items: [...day.items, item], collapsed: false };
      })
    );
  }

  function patchItem(dayUid: string, itemUid: string, patch: Partial<ProgramItem>) {
    setDays((d) =>
      d.map((day) =>
        day.uid === dayUid
          ? { ...day, items: day.items.map((it) => (it.uid === itemUid ? { ...it, ...patch } : it)) }
          : day
      )
    );
  }

  function removeItem(dayUid: string, itemUid: string) {
    setDays((d) => d.map((day) => (day.uid === dayUid ? { ...day, items: day.items.filter((it) => it.uid !== itemUid) } : day)));
  }

  function moveItem(dayUid: string, itemUid: string, dir: -1 | 1) {
    setDays((d) =>
      d.map((day) => {
        if (day.uid !== dayUid) return day;
        const idx = day.items.findIndex((it) => it.uid === itemUid);
        const j = idx + dir;
        if (idx < 0 || j < 0 || j >= day.items.length) return day;
        const copy = day.items.slice();
        [copy[idx], copy[j]] = [copy[j], copy[idx]];
        return { ...day, items: copy };
      })
    );
  }

  // Move an item from one day to another, dropped at `targetIndex` (or end)
  function moveItemAcross(srcDayUid: string, itemUid: string, dstDayUid: string, targetIndex?: number) {
    setDays((d) => {
      const src = d.find((x) => x.uid === srcDayUid);
      const item = src?.items.find((it) => it.uid === itemUid);
      if (!src || !item) return d;
      // remove
      const without = d.map((day) =>
        day.uid === srcDayUid ? { ...day, items: day.items.filter((it) => it.uid !== itemUid) } : day
      );
      // insert
      return without.map((day) => {
        if (day.uid !== dstDayUid) return day;
        const idx = targetIndex ?? day.items.length;
        const next = day.items.slice();
        next.splice(Math.max(0, Math.min(idx, next.length)), 0, item);
        return { ...day, items: next };
      });
    });
  }

  function reorderWithinDay(dayUid: string, itemUid: string, targetIndex: number) {
    setDays((d) => d.map((day) => {
      if (day.uid !== dayUid) return day;
      const cur = day.items.findIndex((it) => it.uid === itemUid);
      if (cur < 0) return day;
      const copy = day.items.slice();
      const [taken] = copy.splice(cur, 1);
      const ix = Math.max(0, Math.min(targetIndex, copy.length));
      copy.splice(ix > cur ? ix - 1 : ix, 0, taken);
      return { ...day, items: copy };
    }));
  }

  function seedFromProgram(p: PastProgramFull) {
    setProgramName(`${p.name} — v2`);
    setDurationWeeks(p.duration_weeks ?? 8);
    setProgramKind(p.program_kind);
    if (p.program_kind === "at_home" && p.at_home_cadence) setAtHomeCadence(p.at_home_cadence);
    setDays(
      p.days.map((d, i) => ({
        uid: `seed-${i}-${Date.now()}`,
        title: d.title,
        collapsed: false,
        items: d.items.map((it, j) => {
          const m = MOVEMENT_LIBRARY.find((x) => x.name === it.name) ?? {
            id: `m-${j}`, name: it.name, category: it.category
          };
          return {
            uid: `${m.id}-${Date.now()}-${j}`,
            movement: m as Movement,
            is_warmup: false,
            sets: it.sets,
            reps: it.reps,
            exertion: it.exertion,
            notes: it.notes
          } satisfies ProgramItem;
        })
      }))
    );
  }

  function persist(publish: boolean) {
    if (!clientId) { setSaveError("Pick a client first."); return; }
    setSaveError(null);
    setSaveMessage(null);
    startSave(async () => {
      const res = await saveProgram({
        client_id: clientId,
        name: programName,
        starts_on: startsOn,
        duration_weeks: durationWeeks,
        based_on_program_id: compareSel || null,
        publish,
        program_kind: programKind,
        at_home_cadence: programKind === "at_home" ? atHomeCadence : null,
        days: days.map((d, idx) => ({
          day_number: idx + 1,
          title: d.title,
          focus: d.focus,
          items: d.items.map((it) => ({
            movement_id: MOVEMENT_LIBRARY.some((m) => m.id === it.movement.id) ? it.movement.id : undefined,
            movement_name: it.movement.name,
            category: it.movement.category,
            is_warmup: it.is_warmup,
            sets: it.sets,
            reps: it.reps,
            exertion: it.exertion,
            rest_seconds: it.rest_seconds ?? null,
            notes: it.notes ?? null
          }))
        }))
      });
      if (!res.ok) {
        if (res.error.startsWith("Supabase not configured")) {
          setSaveMessage(`${publish ? "Published" : "Saved"} locally — Supabase not configured yet.`);
        } else {
          setSaveError(res.error);
        }
        return;
      }
      setSaveMessage(publish ? "Published. Visible on the client's portal." : "Saved as draft.");
    });
  }

  function daySummary(day: ProgramDay): string {
    if (day.items.length === 0) return "no movements yet";
    const counts: Partial<Record<Category, number>> = {};
    day.items.forEach((it) => { counts[it.movement.category] = (counts[it.movement.category] ?? 0) + 1; });
    return Object.entries(counts)
      .map(([k, v]) => `${v} ${CATEGORY_LABELS[k as Category].toLowerCase()}`)
      .join(" · ");
  }

  function toggleCat(cat: Category) {
    setOpenCats((cur) => {
      const n = new Set(cur);
      n.has(cat) ? n.delete(cat) : n.add(cat);
      return n;
    });
  }

  // ─── DnD handlers (HTML5) ───────────────────────────────────────
  function onDragStartLib(m: Movement, e: React.DragEvent) {
    setDrag({ kind: "lib", movementId: m.id });
    e.dataTransfer.effectAllowed = "copy";
  }
  function onDragStartItem(dayUid: string, itemUid: string, e: React.DragEvent) {
    setDrag({ kind: "item", dayUid, itemUid });
    e.dataTransfer.effectAllowed = "move";
  }
  function onDayDrop(dstDayUid: string, e: React.DragEvent) {
    e.preventDefault();
    if (!drag) return;
    if (drag.kind === "lib") {
      const m = MOVEMENT_LIBRARY.find((x) => x.id === drag.movementId);
      if (m) addMovementToDay(dstDayUid, m, false);
    } else if (drag.kind === "item") {
      if (drag.dayUid === dstDayUid) {
        // dropped on day card body — append to end
        // (within-day reorder happens via row-drop handlers)
      } else {
        moveItemAcross(drag.dayUid, drag.itemUid, dstDayUid);
      }
    }
    setDrag(null);
  }
  function onRowDrop(dstDayUid: string, targetIndex: number, e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!drag) return;
    if (drag.kind === "lib") {
      const m = MOVEMENT_LIBRARY.find((x) => x.id === drag.movementId);
      if (m) {
        addMovementToDay(dstDayUid, m, false);
        // move newly-added item to targetIndex
        setDays((d) => d.map((day) => {
          if (day.uid !== dstDayUid) return day;
          const last = day.items[day.items.length - 1];
          if (!last) return day;
          const without = day.items.slice(0, -1);
          const ix = Math.max(0, Math.min(targetIndex, without.length));
          without.splice(ix, 0, last);
          return { ...day, items: without };
        }));
      }
    } else if (drag.kind === "item") {
      if (drag.dayUid === dstDayUid) reorderWithinDay(dstDayUid, drag.itemUid, targetIndex);
      else moveItemAcross(drag.dayUid, drag.itemUid, dstDayUid, targetIndex);
    }
    setDrag(null);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: baseProgram ? "280px 1fr 1fr" : "280px 1fr", gap: "1.25rem" }}>
      {/* ─── library accordion ─── */}
      <aside className="card no-print" style={{ position: "sticky", top: "1rem", alignSelf: "start", maxHeight: "calc(100vh - 2rem)", overflow: "auto" }}>
        <h3>Library</h3>
        <input
          className="input"
          placeholder="Search movements / muscles…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ marginTop: "0.4rem" }}
        />
        <select
          className="select"
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value as Category | "all")}
          style={{ marginTop: "0.4rem" }}
        >
          <option value="all">All categories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <hr className="divider" />
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          {ALL_CATEGORIES.map((cat) => {
            const items = libraryByCat.get(cat);
            if (!items) return null;
            const open = openCats.has(cat) || !!searchTerm;
            return (
              <div key={cat} style={{ borderBottom: "1px solid var(--line)", paddingBottom: "0.3rem" }}>
                <button
                  type="button"
                  onClick={() => toggleCat(cat)}
                  style={{
                    width: "100%", textAlign: "left", background: "transparent", border: "none",
                    padding: "0.35rem 0", cursor: "pointer", display: "flex", alignItems: "center",
                    gap: "0.4rem", fontFamily: "inherit", fontWeight: 600
                  }}
                >
                  <span>{open ? "▾" : "▸"}</span>
                  <span style={{ flex: 1 }}>{CATEGORY_LABELS[cat]}</span>
                  <span className="meta" style={{ fontSize: "0.74rem" }}>{items.length}</span>
                </button>
                {open ? (
                  <ul style={{ listStyle: "none", margin: 0, padding: "0 0 0 0.4rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                    {items.map((m) => {
                      const usageCount = inProgramCount[m.id] ?? 0;
                      const inProgram = usageCount > 0;
                      return (
                        <li
                          key={m.id}
                          draggable
                          onDragStart={(e) => onDragStartLib(m, e)}
                          onDragEnd={() => setDrag(null)}
                          style={{ padding: "0.3rem 0.4rem", borderRadius: 3, background: inProgram ? "rgba(168,61,43,0.06)" : undefined, cursor: "grab" }}
                          title="Drag into a day, or click + Add"
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                            <input type="checkbox" readOnly checked={inProgram} aria-label="In program" />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                {m.name}
                                {usageCount > 0 ? <span className="badge badge-rust" style={{ fontSize: "0.62rem", padding: "0.05rem 0.4rem" }}>×{usageCount}</span> : null}
                              </div>
                              <div className="meta" style={{ fontSize: "0.72rem" }}>{m.equipment ?? "—"}{m.muscles?.length ? ` · ${m.muscles.slice(0,2).join(", ")}` : ""}</div>
                            </div>
                          </div>
                          <div style={{ marginTop: "0.25rem", display: "flex", gap: "0.3rem", alignItems: "center" }}>
                            <select
                              className="select"
                              style={{ padding: "0.2rem 0.35rem", fontSize: "0.7rem", flex: 1 }}
                              defaultValue=""
                              onChange={(e) => {
                                if (!e.target.value) return;
                                const d = days.find((x) => x.uid === e.target.value);
                                if (d) addMovementToDay(d.uid, m);
                                e.target.value = "";
                              }}
                            >
                              <option value="" disabled>+ Add to…</option>
                              {days.map((d) => <option key={d.uid} value={d.uid}>{d.title}</option>)}
                            </select>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ padding: "0.18rem 0.4rem", fontSize: "0.66rem" }}
                              title="Add as warm-up to first day"
                              onClick={() => days[0] && addMovementToDay(days[0].uid, m, true)}
                            >warm</button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            );
          })}
          {libraryByCat.size === 0 ? <p className="meta" style={{ fontSize: "0.78rem" }}>No matches.</p> : null}
        </div>
      </aside>

      {/* ─── main column ─── */}
      <section>
        <div className="card no-print">
          <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.7rem" }}>
            {(["in_gym", "at_home"] as const).map((k) => (
              <button
                key={k}
                type="button"
                className="btn"
                onClick={() => setProgramKind(k)}
                style={{
                  padding: "0.4rem 0.85rem",
                  background: programKind === k ? "var(--ink)" : "transparent",
                  color: programKind === k ? "var(--paper)" : undefined,
                  border: programKind === k ? "1px solid var(--ink)" : "1px solid var(--line)",
                  fontSize: "0.78rem"
                }}
              >
                {PROGRAM_KIND_LABEL[k]}
              </button>
            ))}
            <span className="meta" style={{ fontSize: "0.74rem", alignSelf: "center", marginLeft: "0.4rem" }}>
              {programKind === "in_gym"
                ? "Day-by-day plan James leads in person at Hyde Park."
                : "Self-guided plan the client follows on their own time."}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: programKind === "at_home" ? "1fr 1fr 1fr 1fr 1fr" : "1fr 1fr 1fr 1fr", gap: "0.75rem", alignItems: "end" }}>
            <div>
              <label className="stat-label">Client</label>
              <select className="select" value={clientId} onChange={(e) => { setClientId(e.target.value); setCompareSel(""); }} style={{ marginTop: "0.3rem" }}>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="stat-label">Program name</label>
              <input className="input" value={programName} onChange={(e) => setProgramName(e.target.value)} style={{ marginTop: "0.3rem" }} />
            </div>
            <div>
              <label className="stat-label">Starts on</label>
              <input className="input" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} style={{ marginTop: "0.3rem" }} />
            </div>
            <div>
              <label className="stat-label">Time frame (weeks)</label>
              <input className="input" type="number" min={1} max={52} value={durationWeeks} onChange={(e) => setDurationWeeks(Number(e.target.value) || 0)} style={{ marginTop: "0.3rem" }} />
            </div>
            {programKind === "at_home" ? (
              <div>
                <label className="stat-label">Cadence</label>
                <input className="input" value={atHomeCadence} onChange={(e) => setAtHomeCadence(e.target.value)} placeholder="3x/week" style={{ marginTop: "0.3rem" }} />
              </div>
            ) : null}
          </div>
        </div>

        <div className="card no-print" style={{ marginTop: "1rem", display: "flex", gap: "0.75rem", alignItems: "end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <label className="stat-label">Use past program as base</label>
            <select className="select" value={compareSel} onChange={(e) => setCompareSel(e.target.value)} style={{ marginTop: "0.3rem" }}>
              <option value="">— none —</option>
              {pastPrograms.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.starts_on})</option>
              ))}
            </select>
          </div>
          {baseProgram ? (
            <>
              <button className="btn btn-ghost" onClick={() => setCompareSel("")}>Hide split-screen</button>
              <button className="btn btn-primary" onClick={() => seedFromProgram(baseProgram)}>Seed from this program</button>
            </>
          ) : null}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button className="btn btn-ghost" onClick={() => window.print()}>Print</button>
            <button className="btn btn-ghost" onClick={() => persist(false)} disabled={savePending}>{savePending ? "…" : "Save draft"}</button>
            <button className="btn btn-primary" onClick={() => persist(true)} disabled={savePending}>{savePending ? "Publishing…" : "Publish"}</button>
          </div>
        </div>
        {saveMessage ? <p style={{ color: "var(--sage)", marginTop: "0.5rem" }}>{saveMessage}</p> : null}
        {saveError ? <p style={{ color: "var(--red)", marginTop: "0.5rem" }}>{saveError}</p> : null}

        {/* days */}
        <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {days.map((day) => (
            <div
              key={day.uid}
              className="card"
              style={{ padding: 0 }}
              onDragOver={(e) => { if (drag) e.preventDefault(); }}
              onDrop={(e) => onDayDrop(day.uid, e)}
            >
              <div style={{ padding: "0.7rem 1rem", display: "flex", alignItems: "center", gap: "0.6rem", borderBottom: day.collapsed ? "none" : "1px solid var(--line)" }}>
                <button className="btn btn-ghost no-print" style={{ padding: "0.2rem 0.5rem", fontSize: "0.8rem" }} onClick={() => toggleCollapse(day.uid)}>
                  {day.collapsed ? "▸" : "▾"}
                </button>
                <input
                  className="input"
                  style={{ flex: 1, fontWeight: 600, fontSize: "1rem", border: "none", background: "transparent", padding: "0.2rem 0" }}
                  value={day.title}
                  onChange={(e) => patchDay(day.uid, { title: e.target.value })}
                />
                <span className="meta" style={{ fontSize: "0.78rem" }}>{daySummary(day)}</span>
                <button className="btn btn-ghost no-print" style={{ padding: "0.2rem 0.5rem", fontSize: "0.7rem", color: "var(--red)" }} onClick={() => removeDay(day.uid)}>Delete day</button>
              </div>

              {day.collapsed ? null : (
                <div style={{ padding: "0.5rem 1rem 1rem" }}>
                  {day.items.length === 0 ? (
                    <p className="meta">Drag movements here, or use "+ Add to…" in the library.</p>
                  ) : (
                    <table className="table">
                      <thead>
                        <tr>
                          <th style={{ width: 18 }}></th>
                          <th>Movement</th>
                          <th>Equipment</th>
                          <th>Sets</th>
                          <th>Reps target</th>
                          <th>Exertion</th>
                          <th>Last logged</th>
                          <th>Notes</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {day.items.map((it, idx) => (
                          <tr
                            key={it.uid}
                            draggable
                            onDragStart={(e) => onDragStartItem(day.uid, it.uid, e)}
                            onDragOver={(e) => { if (drag) e.preventDefault(); }}
                            onDrop={(e) => onRowDrop(day.uid, idx, e)}
                            onDragEnd={() => setDrag(null)}
                            style={{
                              cursor: "grab",
                              background: it.is_warmup ? "rgba(168,61,43,0.04)" : undefined
                            }}
                          >
                            <td className="no-print" style={{ color: "var(--muted)", userSelect: "none" }}>⋮⋮</td>
                            <td>
                              <div style={{ fontWeight: 600 }}>{it.movement.name}{it.is_warmup ? " · warm-up" : ""}</div>
                              <div className="meta" style={{ fontSize: "0.74rem" }}>
                                {CATEGORY_LABELS[it.movement.category]}{it.movement.cues ? ` · ${it.movement.cues}` : ""}
                              </div>
                            </td>
                            <td>
                              <input
                                className="input"
                                style={{ width: 110, fontSize: "0.78rem" }}
                                value={it.movement.equipment ?? ""}
                                onChange={(e) => patchItem(day.uid, it.uid, { movement: { ...it.movement, equipment: e.target.value } })}
                              />
                            </td>
                            <td><input className="input" style={{ width: 60 }} type="number" value={it.sets} onChange={(e) => patchItem(day.uid, it.uid, { sets: Number(e.target.value) || 0 })} /></td>
                            <td><input className="input" style={{ width: 100 }} value={it.reps} onChange={(e) => patchItem(day.uid, it.uid, { reps: e.target.value })} /></td>
                            <td><input className="input" style={{ width: 110 }} value={it.exertion} placeholder="RPE 7 / hard" onChange={(e) => patchItem(day.uid, it.uid, { exertion: e.target.value })} /></td>
                            <td className="meta" style={{ fontSize: "0.78rem", whiteSpace: "nowrap" }}>
                              {it.last_log ? `${it.last_log.reps} × ${it.last_log.weight_lb} lb` : <span style={{ color: "var(--muted)" }}>—</span>}
                            </td>
                            <td><input className="input" value={it.notes ?? ""} onChange={(e) => patchItem(day.uid, it.uid, { notes: e.target.value })} /></td>
                            <td className="no-print" style={{ whiteSpace: "nowrap" }}>
                              <button className="btn btn-ghost" style={{ padding: "0.2rem 0.4rem" }} onClick={() => moveItem(day.uid, it.uid, -1)}>↑</button>
                              <button className="btn btn-ghost" style={{ padding: "0.2rem 0.4rem" }} onClick={() => moveItem(day.uid, it.uid, 1)}>↓</button>
                              <button className="btn btn-ghost" style={{ padding: "0.2rem 0.4rem", color: "var(--red)" }} onClick={() => removeItem(day.uid, it.uid)}>×</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}

          <button className="btn btn-ghost no-print" onClick={addDay} style={{ alignSelf: "flex-start" }}>+ Add day</button>
        </div>
      </section>

      {/* ─── side-by-side past program viewer ─── */}
      {baseProgram ? (
        <aside className="card no-print" style={{ position: "sticky", top: "1rem", alignSelf: "start", maxHeight: "calc(100vh - 2rem)", overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="badge">Past program</span>
            <Link href={`/coach/clients/${baseProgram.client_id}`} className="meta">client →</Link>
          </div>
          <h3 style={{ marginTop: "0.5rem" }}>{baseProgram.name}</h3>
          <p className="meta" style={{ fontSize: "0.78rem" }}>{baseProgram.starts_on} → {baseProgram.ends_on ?? "open"} · {baseProgram.duration_weeks ?? "—"} wk</p>
          <hr className="divider" />
          {baseProgram.days.map((d) => (
            <div key={d.day_number} style={{ marginBottom: "0.75rem" }}>
              <strong style={{ fontSize: "0.85rem" }}>{d.title}</strong>
              <ul style={{ listStyle: "none", margin: "0.3rem 0 0", padding: 0, fontSize: "0.78rem" }}>
                {d.items.map((it, i) => (
                  <li key={i} style={{ padding: "0.2rem 0", borderBottom: "1px dashed var(--line)" }}>
                    <span style={{ fontWeight: 600 }}>{it.name}</span>
                    <br />
                    <span className="meta">{it.sets} × {it.reps} · {it.exertion}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>
      ) : null}
    </div>
  );
}
