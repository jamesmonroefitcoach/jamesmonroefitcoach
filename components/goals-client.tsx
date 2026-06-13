"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GoalCategoryWithGoals, GoalKind, GoalRow } from "@/lib/goals";
import { targetLabel, cadenceLabel, progressPct } from "@/lib/goals";
import {
  createCategory, updateCategory, deleteCategory,
  createGoal, updateGoal, deleteGoal,
} from "@/app/goals/actions";

// Renders the Goals page for both /coach/goals and /client/goals — same
// schema, same CRUD. Categories are top-level collapsible groups; goals
// live inside; sub-goals nest one level under their parent.
export default function GoalsClient({
  ownerLabel, categories,
}: {
  ownerLabel: string;
  categories: GoalCategoryWithGoals[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [addingCat, setAddingCat] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);

  function refresh() { router.refresh(); }

  function run<T>(p: Promise<{ ok: true; data?: T } | { ok: false; error: string }>): Promise<void> {
    return new Promise((resolve) => {
      start(async () => {
        const res = await p;
        if (!res.ok) setErr(res.error);
        else { setErr(null); refresh(); }
        resolve();
      });
    });
  }

  const totalGoals = useMemo(() => categories.reduce((s, c) => s + c.goals.length, 0), [categories]);

  return (
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header>
        <span className="badge">Goals</span>
        <h1 style={{ marginTop: "0.5rem" }}>{ownerLabel}&rsquo;s goals</h1>
        <p className="meta">
          {totalGoals} goal{totalGoals === 1 ? "" : "s"} across {categories.length} categor{categories.length === 1 ? "y" : "ies"}.
          Edit, reorder, regroup — everything saves immediately.
        </p>
      </header>
      <hr className="divider" />

      {err && (
        <div style={{
          marginBottom: "0.8rem", padding: "0.5rem 0.75rem",
          background: "rgba(192,57,43,0.08)", border: "1px solid var(--red)",
          color: "var(--red)", borderRadius: 4, fontSize: "0.82rem",
        }}>
          {err}
        </div>
      )}

      {categories.length === 0 ? (
        <p className="meta" style={{ fontStyle: "italic", padding: "0.85rem 0.4rem" }}>
          No categories yet. Add one to get started.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {categories.map((cat) => (
            <CategoryCard
              key={cat.id}
              cat={cat}
              isEditing={editingCatId === cat.id}
              onEditOpen={() => setEditingCatId(cat.id)}
              onEditClose={() => setEditingCatId(null)}
              onAction={run}
              pending={pending}
            />
          ))}
        </div>
      )}

      {/* Add category */}
      <div style={{ marginTop: "1rem" }}>
        {addingCat ? (
          <NewCategoryForm
            onCancel={() => setAddingCat(false)}
            onSubmit={(name, color) => run(createCategory({ name, color })).then(() => setAddingCat(false))}
            pending={pending}
          />
        ) : (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: "0.4rem 0.95rem", fontSize: "0.84rem" }}
            onClick={() => setAddingCat(true)}
          >
            + New category
          </button>
        )}
      </div>
    </main>
  );
}

// ── Category card ────────────────────────────────────────────────────

function CategoryCard({
  cat, isEditing, onEditOpen, onEditClose, onAction, pending,
}: {
  cat: GoalCategoryWithGoals;
  isEditing: boolean;
  onEditOpen: () => void;
  onEditClose: () => void;
  onAction: <T>(p: Promise<{ ok: true; data?: T } | { ok: false; error: string }>) => Promise<void>;
  pending: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);

  // Partition goals into top-level + sub-goal map for nested render.
  const top = cat.goals.filter((g) => !g.parent_goal_id);
  const subsByParent = new Map<string, GoalRow[]>();
  for (const g of cat.goals) {
    if (g.parent_goal_id) {
      const arr = subsByParent.get(g.parent_goal_id) ?? [];
      arr.push(g);
      subsByParent.set(g.parent_goal_id, arr);
    }
  }

  return (
    <section
      className="card"
      style={{
        padding: 0, overflow: "hidden",
        borderLeft: `4px solid ${cat.color}`,
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: "0.6rem",
        padding: "0.65rem 0.95rem", background: "rgba(0,0,0,0.015)",
        borderBottom: open ? "1px solid var(--line)" : "none",
      }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: "0.82rem", color: "var(--muted)" }}
        >
          {open ? "▾" : "▸"}
        </button>
        <span style={{
          width: 12, height: 12, borderRadius: 3, background: cat.color, flex: "none",
        }} />
        {isEditing ? (
          <CategoryEditForm cat={cat} onClose={onEditClose} onAction={onAction} pending={pending} />
        ) : (
          <>
            <strong style={{ fontSize: "1rem" }}>{cat.name}</strong>
            <span className="meta" style={{ fontSize: "0.74rem" }}>
              {cat.goals.length} goal{cat.goals.length === 1 ? "" : "s"}
            </span>
            <div style={{ marginLeft: "auto", display: "flex", gap: "0.3rem" }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: "0.22rem 0.6rem", fontSize: "0.72rem" }}
                onClick={onEditOpen}
              >Edit</button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: "0.22rem 0.6rem", fontSize: "0.72rem", color: "var(--red)" }}
                onClick={() => {
                  if (confirm(`Delete category "${cat.name}" and all its goals?`)) {
                    onAction(deleteCategory(cat.id));
                  }
                }}
              >Delete</button>
            </div>
          </>
        )}
      </div>

      {/* Goals list */}
      {open && (
        <div>
          {top.length === 0 ? (
            <p className="meta" style={{ padding: "0.65rem 0.95rem", fontStyle: "italic", fontSize: "0.8rem", margin: 0 }}>
              No goals yet in this category.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {top.map((g) => (
                <GoalListItem
                  key={g.id}
                  goal={g}
                  subs={subsByParent.get(g.id) ?? []}
                  categoryId={cat.id}
                  categoryColor={cat.color}
                  onAction={onAction}
                  pending={pending}
                />
              ))}
            </ul>
          )}

          {/* Add goal */}
          <div style={{ padding: "0.55rem 0.95rem", borderTop: "1px solid var(--line)" }}>
            {adding ? (
              <NewGoalForm
                onCancel={() => setAdding(false)}
                onSubmit={(input) => onAction(createGoal({ category_id: cat.id, ...input })).then(() => setAdding(false))}
                pending={pending}
              />
            ) : (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: "0.32rem 0.85rem", fontSize: "0.78rem" }}
                onClick={() => setAdding(true)}
              >
                + Goal
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function CategoryEditForm({
  cat, onClose, onAction, pending,
}: {
  cat: GoalCategoryWithGoals;
  onClose: () => void;
  onAction: <T>(p: Promise<{ ok: true; data?: T } | { ok: false; error: string }>) => Promise<void>;
  pending: boolean;
}) {
  const [name, setName] = useState(cat.name);
  const [color, setColor] = useState(cat.color);
  return (
    <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flex: 1, flexWrap: "wrap" }}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ padding: "0.3rem 0.5rem", border: "1px solid var(--line)", borderRadius: 4, flex: "1 1 160px", fontSize: "0.86rem" }}
      />
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        style={{ width: 32, height: 28, padding: 0, border: "1px solid var(--line)", borderRadius: 4, background: "transparent" }}
      />
      <button
        type="button"
        className="btn btn-primary"
        style={{ padding: "0.3rem 0.7rem", fontSize: "0.78rem" }}
        disabled={pending}
        onClick={() => onAction(updateCategory(cat.id, { name, color })).then(onClose)}
      >Save</button>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ padding: "0.3rem 0.7rem", fontSize: "0.78rem" }}
        onClick={onClose}
      >Cancel</button>
    </div>
  );
}

function NewCategoryForm({
  onCancel, onSubmit, pending,
}: {
  onCancel: () => void;
  onSubmit: (name: string, color: string) => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#7a6f63");
  return (
    <div style={{
      display: "flex", gap: "0.4rem", alignItems: "center",
      padding: "0.6rem 0.85rem", border: "1px dashed var(--line)", borderRadius: 4, flexWrap: "wrap",
    }}>
      <input
        autoFocus
        placeholder="Category name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ padding: "0.32rem 0.5rem", border: "1px solid var(--line)", borderRadius: 4, flex: "1 1 200px", fontSize: "0.86rem" }}
      />
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        style={{ width: 32, height: 28, padding: 0, border: "1px solid var(--line)", borderRadius: 4, background: "transparent" }}
      />
      <button
        type="button"
        className="btn btn-primary"
        style={{ padding: "0.34rem 0.85rem", fontSize: "0.82rem" }}
        disabled={pending || !name.trim()}
        onClick={() => onSubmit(name, color)}
      >Create</button>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ padding: "0.34rem 0.7rem", fontSize: "0.82rem" }}
        onClick={onCancel}
      >Cancel</button>
    </div>
  );
}

// ── Goal row ─────────────────────────────────────────────────────────

function GoalListItem({
  goal, subs, categoryId, categoryColor, onAction, pending,
}: {
  goal: GoalRow;
  subs: GoalRow[];
  categoryId: string;
  categoryColor: string;
  onAction: <T>(p: Promise<{ ok: true; data?: T } | { ok: false; error: string }>) => Promise<void>;
  pending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [addingSub, setAddingSub] = useState(false);
  const pct = progressPct(goal);

  return (
    <li style={{ borderBottom: "1px solid var(--line)" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: "0.6rem",
        padding: "0.55rem 0.95rem",
      }}>
        {editing ? (
          <GoalEditForm
            goal={goal}
            onClose={() => setEditing(false)}
            onAction={onAction}
            pending={pending}
          />
        ) : (
          <>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.45rem", flexWrap: "wrap" }}>
                <strong style={{ fontSize: "0.92rem" }}>{goal.name}</strong>
                <span className="meta" style={{ fontSize: "0.7rem" }}>
                  {targetLabel(goal)} · {cadenceLabel(goal)}
                </span>
                {goal.is_achieved && (
                  <span className="badge" style={{
                    fontSize: "0.58rem", color: "var(--sage)", borderColor: "var(--sage)",
                  }}>
                    ✓ done
                  </span>
                )}
              </div>
              {/* Progress display */}
              {pct != null && goal.kind !== "one_time" && (
                <div style={{
                  display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.3rem",
                }}>
                  <div style={{
                    flex: 1, height: 6, background: "rgba(0,0,0,0.06)",
                    borderRadius: 999, overflow: "hidden",
                  }}>
                    <div style={{
                      width: `${pct}%`, height: "100%", background: categoryColor,
                    }} />
                  </div>
                  <span className="meta" style={{ fontSize: "0.7rem", whiteSpace: "nowrap" }}>
                    {goal.current_value ?? 0}/{goal.target_value ?? "—"}{goal.target_unit ? ` ${goal.target_unit}` : ""}
                  </span>
                </div>
              )}
              {goal.notes && (
                <div className="meta" style={{ fontSize: "0.7rem", marginTop: "0.25rem", fontStyle: "italic" }}>
                  {goal.notes}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: "0.3rem", flex: "none" }}>
              {goal.kind === "one_time" && !goal.is_achieved && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: "0.22rem 0.55rem", fontSize: "0.72rem", color: "var(--sage)" }}
                  onClick={() => onAction(updateGoal(goal.id, { is_achieved: true }))}
                >✓ Mark done</button>
              )}
              {goal.kind === "one_time" && goal.is_achieved && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: "0.22rem 0.55rem", fontSize: "0.72rem" }}
                  onClick={() => onAction(updateGoal(goal.id, { is_achieved: false }))}
                >Undo</button>
              )}
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: "0.22rem 0.55rem", fontSize: "0.72rem" }}
                onClick={() => setEditing(true)}
              >Edit</button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: "0.22rem 0.55rem", fontSize: "0.72rem", color: "var(--red)" }}
                onClick={() => {
                  if (confirm(`Delete goal "${goal.name}"?`)) onAction(deleteGoal(goal.id));
                }}
              >Delete</button>
            </div>
          </>
        )}
      </div>

      {/* Sub-goals */}
      {subs.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, background: "rgba(0,0,0,0.015)" }}>
          {subs.map((s) => (
            <li key={s.id} style={{
              display: "flex", alignItems: "center", gap: "0.4rem",
              padding: "0.35rem 0.95rem 0.35rem 2.05rem",
              borderTop: "1px solid var(--line)",
            }}>
              <span style={{ color: "var(--muted)", fontSize: "0.7rem" }}>↳</span>
              <span style={{ fontSize: "0.82rem", flex: 1 }}>{s.name}</span>
              {s.is_achieved ? (
                <span className="badge" style={{ fontSize: "0.56rem", color: "var(--sage)", borderColor: "var(--sage)" }}>
                  ✓ done
                </span>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: "0.18rem 0.5rem", fontSize: "0.68rem", color: "var(--sage)" }}
                  onClick={() => onAction(updateGoal(s.id, { is_achieved: true }))}
                >✓</button>
              )}
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: "0.18rem 0.5rem", fontSize: "0.68rem", color: "var(--red)" }}
                onClick={() => {
                  if (confirm(`Delete sub-goal "${s.name}"?`)) onAction(deleteGoal(s.id));
                }}
              >×</button>
            </li>
          ))}
        </ul>
      )}

      {/* Add sub-goal */}
      <div style={{ padding: "0.3rem 0.95rem 0.5rem 2.05rem", background: "rgba(0,0,0,0.015)" }}>
        {addingSub ? (
          <NewSubGoalForm
            onCancel={() => setAddingSub(false)}
            onSubmit={(name) => onAction(createGoal({
              category_id: categoryId, parent_goal_id: goal.id, name, kind: "one_time",
            })).then(() => setAddingSub(false))}
            pending={pending}
          />
        ) : (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: "0.18rem 0.55rem", fontSize: "0.68rem", color: "var(--muted)" }}
            onClick={() => setAddingSub(true)}
          >+ Sub-goal</button>
        )}
      </div>
    </li>
  );
}

function GoalEditForm({
  goal, onClose, onAction, pending,
}: {
  goal: GoalRow;
  onClose: () => void;
  onAction: <T>(p: Promise<{ ok: true; data?: T } | { ok: false; error: string }>) => Promise<void>;
  pending: boolean;
}) {
  const [name, setName] = useState(goal.name);
  const [kind, setKind] = useState<GoalKind>(goal.kind);
  const [target, setTarget] = useState<string>(goal.target_value?.toString() ?? "");
  const [low, setLow] = useState<string>(goal.target_range_low?.toString() ?? "");
  const [high, setHigh] = useState<string>(goal.target_range_high?.toString() ?? "");
  const [unit, setUnit] = useState<string>(goal.target_unit ?? "");
  const [current, setCurrent] = useState<string>(goal.current_value?.toString() ?? "");
  const [notes, setNotes] = useState(goal.notes ?? "");

  const inputStyle: React.CSSProperties = {
    padding: "0.28rem 0.45rem",
    border: "1px solid var(--line)",
    borderRadius: 4,
    fontSize: "0.82rem",
    fontFamily: "inherit",
    background: "#fff",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", flex: 1 }}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ ...inputStyle, width: "100%" }}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "0.35rem" }}>
        <select value={kind} onChange={(e) => setKind(e.target.value as GoalKind)} style={inputStyle}>
          <option value="weekly_hours">Weekly hours</option>
          <option value="weekly_count">Weekly count</option>
          <option value="per_night">Per night</option>
          <option value="pr">PR / max</option>
          <option value="one_time">One-time</option>
        </select>
        <input placeholder="Target" value={target} onChange={(e) => setTarget(e.target.value)} style={inputStyle} />
        <input placeholder="Range low" value={low} onChange={(e) => setLow(e.target.value)} style={inputStyle} />
        <input placeholder="Range high" value={high} onChange={(e) => setHigh(e.target.value)} style={inputStyle} />
        <input placeholder="Unit (hr/reps/...)" value={unit} onChange={(e) => setUnit(e.target.value)} style={inputStyle} />
        <input placeholder="Current" value={current} onChange={(e) => setCurrent(e.target.value)} style={inputStyle} />
      </div>
      <input
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        style={{ ...inputStyle, width: "100%" }}
      />
      <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: "0.3rem 0.8rem", fontSize: "0.78rem" }}
          disabled={pending}
          onClick={() => {
            const toNum = (v: string) => v.trim() === "" ? null : Number(v);
            onAction(updateGoal(goal.id, {
              name, kind,
              target_value: toNum(target),
              target_range_low: toNum(low),
              target_range_high: toNum(high),
              target_unit: unit.trim() || null,
              current_value: toNum(current),
              notes: notes.trim() || null,
            })).then(onClose);
          }}
        >Save</button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ padding: "0.3rem 0.7rem", fontSize: "0.78rem" }}
          onClick={onClose}
        >Cancel</button>
      </div>
    </div>
  );
}

function NewGoalForm({
  onCancel, onSubmit, pending,
}: {
  onCancel: () => void;
  onSubmit: (input: {
    name: string; kind: GoalKind;
    target_value?: number | null;
    target_range_low?: number | null;
    target_range_high?: number | null;
    target_unit?: string | null;
  }) => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<GoalKind>("weekly_hours");
  const [target, setTarget] = useState("");
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");
  const [unit, setUnit] = useState("hr");
  const inputStyle: React.CSSProperties = {
    padding: "0.32rem 0.5rem",
    border: "1px solid var(--line)",
    borderRadius: 4,
    fontSize: "0.84rem",
    fontFamily: "inherit",
    background: "#fff",
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "0.35rem" }}>
      <input
        autoFocus
        placeholder="Goal name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ ...inputStyle, gridColumn: "1 / -1" }}
      />
      <select value={kind} onChange={(e) => setKind(e.target.value as GoalKind)} style={inputStyle}>
        <option value="weekly_hours">Weekly hours</option>
        <option value="weekly_count">Weekly count</option>
        <option value="per_night">Per night</option>
        <option value="pr">PR / max</option>
        <option value="one_time">One-time</option>
      </select>
      <input placeholder="Target" value={target} onChange={(e) => setTarget(e.target.value)} style={inputStyle} />
      <input placeholder="Low" value={low} onChange={(e) => setLow(e.target.value)} style={inputStyle} />
      <input placeholder="High" value={high} onChange={(e) => setHigh(e.target.value)} style={inputStyle} />
      <input placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} style={inputStyle} />
      <div style={{ gridColumn: "1 / -1", display: "flex", gap: "0.35rem", justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: "0.32rem 0.85rem", fontSize: "0.82rem" }}
          disabled={pending || !name.trim()}
          onClick={() => {
            const toNum = (v: string) => v.trim() === "" ? null : Number(v);
            onSubmit({
              name, kind,
              target_value: toNum(target),
              target_range_low: toNum(low),
              target_range_high: toNum(high),
              target_unit: unit.trim() || null,
            });
          }}
        >Create</button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ padding: "0.32rem 0.7rem", fontSize: "0.82rem" }}
          onClick={onCancel}
        >Cancel</button>
      </div>
    </div>
  );
}

function NewSubGoalForm({
  onCancel, onSubmit, pending,
}: {
  onCancel: () => void;
  onSubmit: (name: string) => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  return (
    <div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
      <input
        autoFocus
        placeholder="Sub-goal"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ padding: "0.22rem 0.45rem", border: "1px solid var(--line)", borderRadius: 4, fontSize: "0.78rem", flex: 1 }}
      />
      <button
        type="button"
        className="btn btn-primary"
        style={{ padding: "0.2rem 0.55rem", fontSize: "0.7rem" }}
        disabled={pending || !name.trim()}
        onClick={() => onSubmit(name)}
      >+</button>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ padding: "0.2rem 0.55rem", fontSize: "0.7rem" }}
        onClick={onCancel}
      >×</button>
    </div>
  );
}
