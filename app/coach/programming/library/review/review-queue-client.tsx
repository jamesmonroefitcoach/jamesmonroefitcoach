"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { assignMovementToRow, createMovementFromRow } from "./actions";

type Row = {
  id: string;
  name_text: string | null;
  equipment_text: string | null;
  notes_text: string | null;
  sets: number | null;
  reps: string | null;
  weight: string | null;
  program_id: string;
  program_name: string;
  client_id: string;
  client_name: string;
};
type Library = { id: string; name: string; category: string; equipment: string | null };

export default function ReviewQueueClient({
  rows,
  library,
  categories,
}: {
  rows: Row[];
  library: Library[];
  categories: { value: string; label: string }[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {rows.map((r) => (
        <ReviewRow key={r.id} row={r} library={library} categories={categories} />
      ))}
    </div>
  );
}

function ReviewRow({
  row,
  library,
  categories,
}: {
  row: Row;
  library: Library[];
  categories: { value: string; label: string }[];
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [mode, setMode] = useState<"pick" | "create">("pick");
  const [pickedId, setPickedId] = useState("");
  const [newName, setNewName] = useState(row.name_text ?? "");
  const [newCategory, setNewCategory] = useState(categories[0]?.value ?? "");
  const [newEquipment, setNewEquipment] = useState(row.equipment_text ?? "");

  // Pre-sort the library by token overlap with the typed text so the
  // best candidates float to the top of the dropdown.
  const sortedLibrary = useMemo(() => {
    const text = (row.name_text ?? "").toLowerCase();
    const tokens = new Set(
      text.replace(/[^\w\s]/g, " ").split(/\s+/).filter((t) => t.length > 1)
    );
    return [...library]
      .map((m) => {
        const candTokens = new Set(
          m.name.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter((t) => t.length > 1)
        );
        let overlap = 0;
        for (const t of tokens) if (candTokens.has(t)) overlap += 1;
        return { ...m, _overlap: overlap };
      })
      .sort((a, b) => b._overlap - a._overlap || a.name.localeCompare(b.name));
  }, [library, row.name_text]);

  function assign() {
    if (!pickedId) {
      setErr("Pick a movement first.");
      return;
    }
    start(async () => {
      const res = await assignMovementToRow(row.id, pickedId);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setHidden(true);
    });
  }
  function create() {
    if (!newName.trim()) {
      setErr("Name is required.");
      return;
    }
    start(async () => {
      const res = await createMovementFromRow(row.id, {
        name: newName,
        category: newCategory,
        equipment: newEquipment || null,
      });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setHidden(true);
    });
  }

  if (hidden) return null;

  const inputStyle: React.CSSProperties = {
    fontFamily: "inherit",
    fontSize: "0.86rem",
    padding: "0.32rem 0.45rem",
    border: "1px solid var(--line)",
    borderRadius: 4,
    background: "#fff",
    width: "100%",
  };

  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 6,
        padding: "0.85rem 1rem 0.95rem",
        background: "var(--paper)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: "0.85rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <strong style={{ fontSize: "0.98rem" }}>{row.name_text ?? "—"}</strong>
          {row.equipment_text && (
            <span className="meta" style={{ marginLeft: "0.5rem", fontSize: "0.78rem" }}>
              {row.equipment_text}
            </span>
          )}
        </div>
        <div className="meta" style={{ fontSize: "0.74rem" }}>
          {row.sets ?? "—"} × {row.reps ?? "—"}
          {row.weight ? ` @ ${row.weight}` : ""}
        </div>
      </div>
      <div className="meta" style={{ fontSize: "0.74rem", marginTop: "0.25rem" }}>
        from <Link href={`/coach/clients/${row.client_id}/programs/${row.program_id}`}>{row.client_name} · {row.program_name}</Link>
      </div>

      {/* Mode toggle */}
      <div style={{ marginTop: "0.7rem", display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setMode("pick")}
          className={mode === "pick" ? "btn btn-primary" : "btn btn-ghost"}
          style={{ padding: "0.28rem 0.7rem", fontSize: "0.78rem" }}
        >
          Match to library
        </button>
        <button
          type="button"
          onClick={() => setMode("create")}
          className={mode === "create" ? "btn btn-primary" : "btn btn-ghost"}
          style={{ padding: "0.28rem 0.7rem", fontSize: "0.78rem" }}
        >
          Create new movement
        </button>
      </div>

      {mode === "pick" ? (
        <div style={{ marginTop: "0.55rem", display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={pickedId}
            onChange={(e) => setPickedId(e.target.value)}
            style={{ ...inputStyle, flex: "1 1 280px", minWidth: 200 }}
          >
            <option value="">— Pick a library movement —</option>
            {sortedLibrary.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}{m.equipment ? ` (${m.equipment})` : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary"
            onClick={assign}
            disabled={pending}
            style={{ padding: "0.32rem 0.85rem", fontSize: "0.82rem" }}
          >
            {pending ? "…" : "Assign"}
          </button>
        </div>
      ) : (
        <div style={{ marginTop: "0.55rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.4rem", alignItems: "end" }}>
          <label>
            <div className="stat-label" style={{ fontSize: "0.6rem" }}>Name</div>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label>
            <div className="stat-label" style={{ fontSize: "0.6rem" }}>Category</div>
            <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} style={inputStyle}>
              {categories.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>
          <label>
            <div className="stat-label" style={{ fontSize: "0.6rem" }}>Equipment</div>
            <input
              type="text"
              value={newEquipment}
              onChange={(e) => setNewEquipment(e.target.value)}
              placeholder="optional"
              style={inputStyle}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={create}
            disabled={pending}
            style={{ padding: "0.4rem 0.85rem", fontSize: "0.82rem" }}
          >
            {pending ? "…" : "Create + assign"}
          </button>
        </div>
      )}

      {err && (
        <div style={{ color: "var(--red)", fontSize: "0.78rem", marginTop: "0.45rem" }}>
          {err}
        </div>
      )}
    </div>
  );
}
