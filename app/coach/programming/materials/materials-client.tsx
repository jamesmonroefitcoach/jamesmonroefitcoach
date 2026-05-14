"use client";
import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_MATERIALS, MATERIAL_CATEGORIES as CATEGORIES,
  type Material, type MaterialCategory,
} from "@/lib/materials-seed";

// Materials sub-tab content. Each item is a small card the coach can edit
// in-place. Edits are persisted in localStorage today — when the client
// view is built out (right now it shows "coming soon"), this should move
// to a Supabase table so clients can see the same content the coach edits.

// Seed library. James can edit the text on each card; structure is fixed
// in code (add new items here, deploy, then edit text in the UI).

const STORAGE_KEY = "monroe-materials-edits-v1";

type EditMap = Record<string, { title?: string; body?: string }>;

function loadEdits(): EditMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as EditMap;
  } catch {
    return {};
  }
}

function saveEdits(edits: EditMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(edits));
  } catch {
    /* localStorage quota or disabled — silently no-op */
  }
}

export default function MaterialsClient() {
  const [edits, setEdits] = useState<EditMap>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");

  useEffect(() => {
    setEdits(loadEdits());
  }, []);

  // Merge defaults with any per-card overrides from localStorage.
  const materials = useMemo<Material[]>(() => {
    return DEFAULT_MATERIALS.map((m) => {
      const e = edits[m.id];
      if (!e) return m;
      return { ...m, title: e.title ?? m.title, body: e.body ?? m.body };
    });
  }, [edits]);

  function startEdit(m: Material) {
    setEditingId(m.id);
    setDraftTitle(m.title);
    setDraftBody(m.body);
  }
  function cancelEdit() {
    setEditingId(null);
    setDraftTitle("");
    setDraftBody("");
  }
  function commitEdit() {
    if (!editingId) return;
    const next: EditMap = { ...edits, [editingId]: { title: draftTitle.trim(), body: draftBody.trim() } };
    setEdits(next);
    saveEdits(next);
    cancelEdit();
  }
  function resetCard(id: string) {
    if (!confirm("Reset this card to its default text?")) return;
    const next: EditMap = { ...edits };
    delete next[id];
    setEdits(next);
    saveEdits(next);
  }

  return (
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header className="page-hdr">
        <div>
          <span className="badge">Coach</span>
          <h1 style={{ marginTop: "0.5rem" }}>Materials</h1>
          <p className="meta">Reference articles for training, nutrition, and recovery — edit any card inline. Clients will see a curated version with required-review tracking once that view ships.</p>
        </div>
      </header>

      <hr className="divider" />

      <section style={{
        background: "rgba(168,61,43,0.04)",
        border: "1px dashed var(--rust)",
        borderRadius: 4,
        padding: "0.55rem 0.85rem",
        marginBottom: "1.25rem",
        fontSize: "0.78rem",
      }}>
        <strong style={{ color: "var(--rust)" }}>Client view: Coming soon — required reviews.</strong>{" "}
        <span className="meta">Clients will see selected materials with check-off tracking. Your edits today live in this browser until that view is wired to the database.</span>
      </section>

      {CATEGORIES.map((cat) => {
        const items = materials.filter((m) => m.category === cat);
        if (items.length === 0) return null;
        return (
          <section key={cat} style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.55rem", paddingBottom: "0.35rem", borderBottom: "2px solid var(--line)" }}>
              {cat}
              <span style={{ color: "var(--muted)", fontSize: "0.7rem", fontWeight: 400, marginLeft: "0.6rem" }}>{items.length} card{items.length === 1 ? "" : "s"}</span>
            </h2>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "0.7rem",
            }}>
              {items.map((m) => {
                const editing = editingId === m.id;
                const isCustomized = !!edits[m.id];
                return (
                  <div
                    key={m.id}
                    style={{
                      border: "1px solid var(--line)",
                      borderLeft: isCustomized ? "3px solid var(--rust)" : "1px solid var(--line)",
                      borderRadius: 4,
                      padding: "0.6rem 0.75rem",
                      background: editing ? "rgba(168,61,43,0.04)" : "var(--paper)",
                      display: "flex", flexDirection: "column", gap: "0.4rem",
                      minWidth: 0,
                    }}
                  >
                    {editing ? (
                      <>
                        <input
                          className="input"
                          value={draftTitle}
                          onChange={(e) => setDraftTitle(e.target.value)}
                          placeholder="Title"
                          style={{ fontSize: "0.85rem", fontWeight: 700, padding: "0.25rem 0.4rem" }}
                          autoFocus
                        />
                        <textarea
                          className="textarea"
                          rows={6}
                          value={draftBody}
                          onChange={(e) => setDraftBody(e.target.value)}
                          placeholder="Body"
                          style={{ fontSize: "0.78rem", resize: "vertical", minHeight: 120 }}
                        />
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.35rem" }}>
                          <button className="btn btn-ghost" onClick={cancelEdit} style={{ fontSize: "0.72rem", padding: "0.18rem 0.55rem" }}>Cancel</button>
                          <button className="btn btn-primary" onClick={commitEdit} style={{ fontSize: "0.72rem", padding: "0.18rem 0.65rem" }}>Save</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.4rem" }}>
                          <strong style={{ fontSize: "0.88rem", lineHeight: 1.25 }}>{m.title}</strong>
                          <div style={{ display: "flex", gap: "0.18rem", flexShrink: 0 }}>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ fontSize: "0.66rem", padding: "0.1rem 0.35rem", color: "var(--muted)" }}
                              onClick={() => startEdit(m)}
                              title="Edit this card"
                            >✎ Edit</button>
                            {isCustomized && (
                              <button
                                type="button"
                                className="btn btn-ghost"
                                style={{ fontSize: "0.66rem", padding: "0.1rem 0.35rem", color: "var(--muted)" }}
                                onClick={() => resetCard(m.id)}
                                title="Reset to default text"
                              >↺</button>
                            )}
                          </div>
                        </div>
                        <p style={{ margin: 0, fontSize: "0.8rem", lineHeight: 1.4, whiteSpace: "pre-wrap" }}>{m.body}</p>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </main>
  );
}
