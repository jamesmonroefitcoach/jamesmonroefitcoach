"use client";
import { useState, useEffect } from "react";
import { loadTodosFromDb, saveTodosToDb } from "./todo-actions";

type Section = "today" | "soon" | "longer_term";
const SECTIONS: Section[] = ["today", "soon", "longer_term"];
const SECTION_LABELS: Record<Section, string> = {
  today: "Today",
  soon: "Soon",
  longer_term: "Longer Term",
};

type Todo = {
  id: string;
  text: string;
  section: Section;
  done: boolean;
  doneAt: string | null; // ISO — last time it was checked
};

type BacklogEntry = {
  id: string;
  text: string;
  lastDoneAt: string; // ISO — updated every time the item is re-checked
};

type StoredData = { todos: Todo[]; backlog: BacklogEntry[] };

function load(): StoredData {
  try {
    const raw = localStorage.getItem("monroe-coach-todos");
    if (raw) return JSON.parse(raw);
  } catch {}
  return { todos: [], backlog: [] };
}

function persist(data: StoredData) {
  try { localStorage.setItem("monroe-coach-todos", JSON.stringify(data)); } catch {}
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function TodoBlock() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [backlog, setBacklog] = useState<BacklogEntry[]>([]);
  const [ready, setReady] = useState(false);           // avoid SSR mismatch
  const [addingIn, setAddingIn] = useState<Section | null>(null);
  const [draft, setDraft] = useState("");
  const [showBacklog, setShowBacklog] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overSection, setOverSection] = useState<Section | null>(null);

  useEffect(() => {
    async function init() {
      try {
        // Try Supabase first — syncs across devices
        const { todos: dbTodos, backlog: dbBacklog } = await loadTodosFromDb();
        if (dbTodos.length > 0 || dbBacklog.length > 0) {
          const mapped: Todo[] = dbTodos.map((t) => ({
            id: t.id, text: t.text,
            section: t.section as Section,
            done: t.done, doneAt: t.done_at,
          }));
          const mappedBacklog: BacklogEntry[] = dbBacklog.map((b) => ({
            id: b.id, text: b.text, lastDoneAt: b.last_done_at,
          }));
          setTodos(mapped);
          setBacklog(mappedBacklog);
          persist({ todos: mapped, backlog: mappedBacklog });
          setReady(true);
          return;
        }
      } catch {
        // Supabase unavailable — fall through to localStorage
      }
      // Fall back to localStorage (offline / no DB)
      const { todos: t, backlog: b } = load();
      setTodos(t);
      setBacklog(b);
      setReady(true);
    }
    init();
  }, []);

  function commit(nextTodos: Todo[], nextBacklog: BacklogEntry[]) {
    setTodos(nextTodos);
    setBacklog(nextBacklog);
    persist({ todos: nextTodos, backlog: nextBacklog });
    // Background sync to Supabase so todos appear on all devices
    saveTodosToDb(
      nextTodos.map((t) => ({ id: t.id, text: t.text, section: t.section, done: t.done, done_at: t.doneAt })),
      nextBacklog.map((b) => ({ id: b.id, text: b.text, last_done_at: b.lastDoneAt })),
    ).catch(() => { /* silent — localStorage already updated */ });
  }

  function addItem(section: Section) {
    const text = draft.trim();
    if (!text) return;
    const item: Todo = {
      id: `td-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text,
      section,
      done: false,
      doneAt: null,
    };
    commit([...todos, item], backlog);
    setDraft("");
    setAddingIn(null);
  }

  function toggleDone(id: string) {
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;
    const nowDone = !todo.done;
    const now = new Date().toISOString();
    const nextTodos = todos.map((t) =>
      t.id === id ? { ...t, done: nowDone, doneAt: nowDone ? now : t.doneAt } : t
    );
    let nextBacklog = backlog;
    if (nowDone) {
      const idx = backlog.findIndex((b) => b.id === id);
      nextBacklog =
        idx >= 0
          ? backlog.map((b, i) => (i === idx ? { ...b, lastDoneAt: now } : b))
          : [...backlog, { id, text: todo.text, lastDoneAt: now }];
    }
    commit(nextTodos, nextBacklog);
  }

  function deleteItem(id: string) {
    commit(todos.filter((t) => t.id !== id), backlog);
  }

  function moveToSection(id: string, section: Section) {
    commit(
      todos.map((t) => (t.id === id ? { ...t, section } : t)),
      backlog
    );
  }

  function itemsFor(section: Section): Todo[] {
    const all = todos.filter((t) => t.section === section);
    return [...all.filter((t) => !t.done), ...all.filter((t) => t.done)];
  }

  if (!ready) return null;

  return (
    <>
      <div className="card">
        <h2 style={{ margin: 0 }}>To Do</h2>
        <hr className="divider" />

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {SECTIONS.map((section) => {
            const items = itemsFor(section);
            const isOver = overSection === section;

            return (
              <div key={section}>
                {/* Section header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.28rem" }}>
                  <span style={{
                    fontSize: "0.66rem", fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: "0.09em", color: "var(--muted)",
                  }}>
                    {SECTION_LABELS[section]}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: "0.68rem", padding: "0.04rem 0.3rem", lineHeight: 1 }}
                    onClick={() => { setAddingIn(section); setDraft(""); }}
                  >+</button>
                </div>

                {/* Inline add input */}
                {addingIn === section && (
                  <div style={{ display: "flex", gap: "0.3rem", marginBottom: "0.3rem" }}>
                    <input
                      autoFocus
                      className="input"
                      style={{ flex: 1, fontSize: "0.78rem", padding: "0.2rem 0.38rem" }}
                      value={draft}
                      placeholder="New to-do…"
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addItem(section);
                        if (e.key === "Escape") setAddingIn(null);
                      }}
                    />
                    <button
                      className="btn btn-primary"
                      style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }}
                      onClick={() => addItem(section)}
                    >Add</button>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: "0.72rem", padding: "0.2rem 0.38rem" }}
                      onClick={() => setAddingIn(null)}
                    >✕</button>
                  </div>
                )}

                {/* Drop zone + items */}
                <div
                  onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverSection(section); } }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverSection(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragId) moveToSection(dragId, section);
                    setDragId(null);
                    setOverSection(null);
                  }}
                  style={{
                    minHeight: 22,
                    borderRadius: 3,
                    border: isOver ? "1px dashed var(--sage)" : "1px solid transparent",
                    background: isOver ? "rgba(90,107,74,0.06)" : undefined,
                    padding: isOver ? "0.12rem" : 0,
                    transition: "all 0.1s",
                  }}
                >
                  {items.length === 0 ? (
                    <p className="meta" style={{ fontSize: "0.72rem", margin: 0, padding: "0.08rem 0" }}>—</p>
                  ) : (
                    items.map((item) => (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => {
                          setDragId(item.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => { setDragId(null); setOverSection(null); }}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "0.35rem",
                          padding: "0.18rem 0.12rem",
                          borderRadius: 3,
                          cursor: "grab",
                          opacity: dragId === item.id ? 0.35 : 1,
                        }}
                      >
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={item.done}
                          onChange={() => toggleDone(item.id)}
                          style={{ marginTop: "0.2rem", flexShrink: 0, cursor: "pointer" }}
                        />

                        {/* Label */}
                        <span style={{
                          flex: 1,
                          fontSize: "0.82rem",
                          lineHeight: 1.4,
                          textDecoration: item.done ? "line-through" : undefined,
                          color: item.done ? "var(--muted)" : undefined,
                          wordBreak: "break-word",
                        }}>
                          {item.text}
                        </span>

                        {/* Completion date */}
                        {item.done && item.doneAt && (
                          <span style={{ fontSize: "0.63rem", color: "var(--muted)", flexShrink: 0, paddingTop: "0.2rem", whiteSpace: "nowrap" }}>
                            {fmtDate(item.doneAt)}
                          </span>
                        )}

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => deleteItem(item.id)}
                          title="Delete"
                          style={{
                            background: "none", border: "none", cursor: "pointer",
                            fontSize: "0.7rem", padding: "0.18rem 0.1rem", lineHeight: 1,
                            color: "var(--muted)", flexShrink: 0, opacity: 0.55,
                            transition: "opacity 0.1s",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.55")}
                        >🗑</button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer — view backlog */}
        <div style={{ marginTop: "1rem", paddingTop: "0.6rem", borderTop: "1px solid var(--line)" }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }}
            onClick={() => setShowBacklog(true)}
          >
            View backlog
            {backlog.length > 0 && (
              <span style={{ marginLeft: "0.3rem", opacity: 0.55 }}>({backlog.length})</span>
            )}
          </button>
        </div>
      </div>

      {/* ── Backlog modal ────────────────────────────────────────────── */}
      {showBacklog && (
        <div
          style={{
            position: "fixed", inset: 0,
            background: "rgba(23,19,17,0.45)",
            zIndex: 200,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => setShowBacklog(false)}
        >
          <div
            className="card"
            style={{
              width: "min(480px, 92vw)",
              maxHeight: "72vh",
              display: "flex",
              flexDirection: "column",
              padding: "1.25rem 1.4rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem", flexShrink: 0 }}>
              <h3 style={{ margin: 0 }}>Completed backlog</h3>
              <button
                className="btn btn-ghost"
                style={{ padding: "0.2rem 0.55rem" }}
                onClick={() => setShowBacklog(false)}
              >✕</button>
            </div>

            {/* Modal body */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {backlog.length === 0 ? (
                <p className="meta">No completed items yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {[...backlog]
                    .sort((a, b) => b.lastDoneAt.localeCompare(a.lastDoneAt))
                    .map((entry) => (
                      <div
                        key={entry.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.65rem",
                          padding: "0.42rem 0",
                          borderBottom: "1px solid var(--line)",
                        }}
                      >
                        <span style={{
                          flex: 1,
                          fontSize: "0.84rem",
                          textDecoration: "line-through",
                          color: "var(--muted)",
                        }}>
                          {entry.text}
                        </span>
                        <span style={{
                          fontSize: "0.72rem",
                          color: "var(--muted)",
                          flexShrink: 0,
                          whiteSpace: "nowrap",
                        }}>
                          {fmtDate(entry.lastDoneAt)}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
