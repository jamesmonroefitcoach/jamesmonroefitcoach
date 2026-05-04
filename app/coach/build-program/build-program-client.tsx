"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { ClientRow } from "@/lib/data";
import {
  CATEGORY_LABELS,
  MOVEMENT_LIBRARY,
  type Category,
  type Movement,
  type PastProgramFull,
  pastProgramsForClient,
  currentProgramForClient
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
  // client logs (read-only here, shown for past performance)
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
  const [days, setDays] = useState<ProgramDay[]>([NEW_DAY(1)]);

  const [savePending, startSave] = useTransition();
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // library controls
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCat, setFilterCat] = useState<Category | "all">("all");

  // side-by-side past program viewer
  const [comparePid, setComparePid] = useState<string>("");
  const pastPrograms = useMemo(() => (clientId ? pastProgramsForClient(clientId) : []), [clientId]);
  const baseProgram = useMemo(() => pastPrograms.find((p) => p.id === comparePid) ?? null, [pastPrograms, comparePid]);

  const filteredLibrary = useMemo(() => {
    const t = searchTerm.trim().toLowerCase();
    return MOVEMENT_LIBRARY.filter((m) => {
      if (filterCat !== "all" && m.category !== filterCat) return false;
      if (t && !m.name.toLowerCase().includes(t) && !(m.muscles ?? []).some((x) => x.includes(t))) return false;
      return true;
    });
  }, [searchTerm, filterCat]);

  // ─── day actions ────────────────────────────────────────────────────
  function addDay() {
    setDays((d) => [...d, NEW_DAY(d.length + 1)]);
  }
  function removeDay(uid: string) {
    setDays((d) => d.filter((x) => x.uid !== uid));
  }
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
          uid: `${m.id}-${Date.now()}`,
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
    setDays((d) =>
      d.map((day) => (day.uid === dayUid ? { ...day, items: day.items.filter((it) => it.uid !== itemUid) } : day))
    );
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

  // ─── seed from past program ────────────────────────────────────────
  function seedFromProgram(p: PastProgramFull) {
    setProgramName(`${p.name} — v2`);
    setDurationWeeks(p.duration_weeks ?? 8);
    setDays(
      p.days.map((d, i) => ({
        uid: `seed-${i}-${Date.now()}`,
        title: d.title,
        collapsed: false,
        items: d.items.map((it, j) => {
          const m = MOVEMENT_LIBRARY.find((x) => x.name === it.name) ?? {
            id: `m-${j}`,
            name: it.name,
            category: it.category
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
    if (!clientId) {
      setSaveError("Pick a client first.");
      return;
    }
    setSaveError(null);
    setSaveMessage(null);
    startSave(async () => {
      const res = await saveProgram({
        client_id: clientId,
        name: programName,
        starts_on: startsOn,
        duration_weeks: durationWeeks,
        based_on_program_id: comparePid || null,
        publish,
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

  // ─── summaries ─────────────────────────────────────────────────────
  function daySummary(day: ProgramDay): string {
    if (day.items.length === 0) return "no movements yet";
    const counts: Partial<Record<Category, number>> = {};
    day.items.forEach((it) => { counts[it.movement.category] = (counts[it.movement.category] ?? 0) + 1; });
    return Object.entries(counts)
      .map(([k, v]) => `${v} ${CATEGORY_LABELS[k as Category].toLowerCase()}`)
      .join(" · ");
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: comparePid ? "260px 1fr 1fr" : "260px 1fr", gap: "1.25rem" }}>
      {/* ─── library sidebar ─── */}
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
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {filteredLibrary.length === 0 ? <li className="meta">No matches.</li> : null}
          {filteredLibrary.map((m) => (
            <li key={m.id} style={{ borderBottom: "1px solid var(--line)", paddingBottom: "0.4rem" }}>
              <div style={{ fontWeight: 600 }}>{m.name}</div>
              <div className="meta" style={{ fontSize: "0.78rem" }}>{CATEGORY_LABELS[m.category]} · {m.equipment ?? "—"}</div>
              {/* per-day add: pick the day from a select */}
              <div style={{ marginTop: "0.3rem", display: "flex", gap: "0.3rem", alignItems: "center" }}>
                <select
                  className="select"
                  style={{ padding: "0.25rem 0.4rem", fontSize: "0.72rem" }}
                  defaultValue=""
                  onChange={(e) => {
                    const d = days.find((x) => x.uid === e.target.value);
                    if (d) addMovementToDay(d.uid, m);
                    e.target.value = "";
                  }}
                >
                  <option value="" disabled>+ Add to…</option>
                  {days.map((d) => <option key={d.uid} value={d.uid}>{d.title}</option>)}
                </select>
                <button
                  className="btn btn-ghost"
                  style={{ padding: "0.2rem 0.45rem", fontSize: "0.7rem" }}
                  title="Add as warm-up to first day"
                  onClick={() => days[0] && addMovementToDay(days[0].uid, m, true)}
                >
                  warm
                </button>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      {/* ─── main column ─── */}
      <section>
        {/* program header */}
        <div className="card no-print" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "0.75rem", alignItems: "end" }}>
          <div>
            <label className="stat-label">Client</label>
            <select className="select" value={clientId} onChange={(e) => { setClientId(e.target.value); setComparePid(""); }} style={{ marginTop: "0.3rem" }}>
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
        </div>

        {/* past program controls */}
        <div className="card no-print" style={{ marginTop: "1rem", display: "flex", gap: "0.75rem", alignItems: "end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <label className="stat-label">Use past program as base</label>
            <select className="select" value={comparePid} onChange={(e) => setComparePid(e.target.value)} style={{ marginTop: "0.3rem" }}>
              <option value="">— none —</option>
              {pastPrograms.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.starts_on})</option>
              ))}
            </select>
          </div>
          {baseProgram ? (
            <>
              <button className="btn btn-ghost" onClick={() => setComparePid("")}>Hide split-screen</button>
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
            <div key={day.uid} className="card" style={{ padding: 0 }}>
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
                    <p className="meta">Add movements from the library on the left.</p>
                  ) : (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Movement</th>
                          <th>Sets</th>
                          <th>Reps target</th>
                          <th>Exertion</th>
                          <th>Last logged</th>
                          <th>Notes</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {day.items.map((it) => (
                          <tr key={it.uid} style={it.is_warmup ? { background: "rgba(168,61,43,0.04)" } : undefined}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{it.movement.name}{it.is_warmup ? " · warm-up" : ""}</div>
                              <div className="meta" style={{ fontSize: "0.74rem" }}>
                                {CATEGORY_LABELS[it.movement.category]}{it.movement.equipment ? ` · ${it.movement.equipment}` : ""}
                                {it.movement.cues ? ` · ${it.movement.cues}` : ""}
                              </div>
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
