"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GoalCategoryWithGoals, GoalKind, GoalRow } from "@/lib/goals";
import { targetLabel, progressPct } from "@/lib/goals";
import {
  createCategory, updateCategory, deleteCategory,
  createGoal, updateGoal, deleteGoal,
} from "@/app/goals/actions";

// Simpler goals view — small category sections, each goal as a one-line
// row with a thin progress bar. Edits expand inline. Replaces the dense
// spreadsheet layout, which surfaced too many controls at once.

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

  const totalGoals = useMemo(() => categories.reduce((s, c) => s + c.goals.length, 0), [categories]);

  function run<T>(p: Promise<{ ok: true; data?: T } | { ok: false; error: string }>): Promise<void> {
    return new Promise((resolve) => {
      start(async () => {
        const res = await p;
        if (!res.ok) setErr(res.error);
        else { setErr(null); router.refresh(); }
        resolve();
      });
    });
  }

  return (
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header>
        <span className="badge">Goals</span>
        <h1 style={{ marginTop: "0.5rem" }}>{ownerLabel}&rsquo;s goals</h1>
        <p className="meta">
          {totalGoals} goal{totalGoals === 1 ? "" : "s"} in {categories.length} categor{categories.length === 1 ? "y" : "ies"}.
        </p>
      </header>
      <hr className="divider" />

      {err && <ErrBox msg={err} />}

      {categories.length === 0 ? (
        <p className="meta" style={{ fontStyle: "italic", padding: "0.85rem 0.4rem" }}>
          No categories yet. Add one to get started.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
          {categories.map((cat) => (
            <CategoryBlock key={cat.id} cat={cat} onAction={run} pending={pending} />
          ))}
        </div>
      )}

      <div style={{ marginTop: "1.4rem" }}>
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

// ── Category block ──────────────────────────────────────────────────

function CategoryBlock({
  cat, onAction, pending,
}: {
  cat: GoalCategoryWithGoals;
  onAction: <T>(p: Promise<{ ok: true; data?: T } | { ok: false; error: string }>) => Promise<void>;
  pending: boolean;
}) {
  const [editingCat, setEditingCat] = useState(false);
  const [addingGoal, setAddingGoal] = useState(false);
  const topGoals = cat.goals.filter((g) => !g.parent_goal_id);
  const subsByParent = useMemo(() => {
    const m = new Map<string, GoalRow[]>();
    for (const g of cat.goals) {
      if (g.parent_goal_id) {
        const arr = m.get(g.parent_goal_id) ?? [];
        arr.push(g);
        m.set(g.parent_goal_id, arr);
      }
    }
    return m;
  }, [cat.goals]);

  return (
    <section style={{
      border: "1px solid var(--line)",
      borderLeft: `4px solid ${cat.color}`,
      borderRadius: 3,
      background: "var(--paper)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "0.55rem",
        padding: "0.55rem 0.9rem",
        background: `${cat.color}10`,
        borderBottom: "1px solid var(--line)",
      }}>
        {editingCat ? (
          <CategoryEditForm cat={cat} onClose={() => setEditingCat(false)} onAction={onAction} pending={pending} />
        ) : (
          <>
            <strong style={{
              color: cat.color,
              fontFamily: "var(--font-heading), Oswald, sans-serif",
              fontSize: "0.96rem",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}>{cat.name}</strong>
            <span className="meta" style={{ fontSize: "0.72rem" }}>
              {cat.goals.length} goal{cat.goals.length === 1 ? "" : "s"}
            </span>
            <div style={{ marginLeft: "auto", display: "flex", gap: "0.15rem" }}>
              <button type="button" onClick={() => setEditingCat(true)} title="Edit category" style={iconBtn}>✎</button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete category "${cat.name}" and all its goals?`)) onAction(deleteCategory(cat.id));
                }}
                title="Delete category"
                style={{ ...iconBtn, color: "var(--red)" }}
              >×</button>
            </div>
          </>
        )}
      </div>

      {/* Goal rows */}
      {topGoals.length === 0 ? (
        <p className="meta" style={{ padding: "0.7rem 0.9rem", fontStyle: "italic", margin: 0 }}>
          No goals yet.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {topGoals.map((g) => (
            <GoalListItem
              key={g.id}
              goal={g}
              subs={subsByParent.get(g.id) ?? []}
              categoryColor={cat.color}
              categoryId={cat.id}
              onAction={onAction}
              pending={pending}
            />
          ))}
        </ul>
      )}

      {/* Add goal */}
      <div style={{ borderTop: "1px solid var(--line)", padding: "0.45rem 0.9rem", background: "var(--bg)" }}>
        {addingGoal ? (
          <NewGoalForm
            onCancel={() => setAddingGoal(false)}
            onSubmit={(input) =>
              onAction(createGoal({ category_id: cat.id, ...input })).then(() => setAddingGoal(false))
            }
            pending={pending}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAddingGoal(true)}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontSize: "0.78rem",
              color: cat.color,
              fontWeight: 600,
            }}
          >+ add goal</button>
        )}
      </div>
    </section>
  );
}

// ── Goal row ────────────────────────────────────────────────────────

function GoalListItem({
  goal, subs, categoryColor, categoryId, onAction, pending,
}: {
  goal: GoalRow;
  subs: GoalRow[];
  categoryColor: string;
  categoryId: string;
  onAction: <T>(p: Promise<{ ok: true; data?: T } | { ok: false; error: string }>) => Promise<void>;
  pending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [addingSub, setAddingSub] = useState(false);
  const pct = progressPct(goal);
  const showProgress = pct != null && goal.kind !== "one_time";
  const isOneTime = goal.kind === "one_time";

  return (
    <li style={{ borderTop: "1px solid var(--line)", padding: "0.55rem 0.9rem" }}>
      {editing ? (
        <GoalEditForm goal={goal} onClose={() => setEditing(false)} onAction={onAction} pending={pending} />
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
            {isOneTime && (
              <button
                type="button"
                onClick={() => onAction(updateGoal(goal.id, { is_achieved: !goal.is_achieved }))}
                title={goal.is_achieved ? "Mark not done" : "Mark done"}
                style={{
                  background: goal.is_achieved ? "var(--sage)" : "transparent",
                  color: goal.is_achieved ? "#fff" : "var(--muted)",
                  border: `1px solid ${goal.is_achieved ? "var(--sage)" : "var(--line)"}`,
                  borderRadius: 3,
                  width: 16, height: 16,
                  fontSize: "0.7rem",
                  cursor: "pointer",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  flex: "none",
                }}
              >{goal.is_achieved ? "✓" : ""}</button>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontWeight: 500,
                fontSize: "0.92rem",
                textDecoration: goal.is_achieved && isOneTime ? "line-through" : "none",
                color: goal.is_achieved && isOneTime ? "var(--muted)" : "var(--ink)",
              }}>
                {goal.name}
              </div>
              {goal.notes && (
                <div className="meta" style={{ fontSize: "0.72rem", fontStyle: "italic", marginTop: "0.1rem" }}>
                  {goal.notes}
                </div>
              )}
            </div>
            {!isOneTime && (
              <div style={{
                textAlign: "right",
                fontSize: "0.8rem",
                whiteSpace: "nowrap",
                color: "var(--muted)",
              }}>
                <strong style={{ color: "var(--ink)" }}>{goal.current_value ?? 0}</strong>
                {" "}/{" "}
                {targetLabel(goal)}
              </div>
            )}
            <div style={{ display: "flex", gap: "0.1rem" }}>
              <button type="button" onClick={() => setEditing(true)} title="Edit goal" style={iconBtn}>✎</button>
              <button
                type="button"
                onClick={() => { if (confirm(`Delete goal "${goal.name}"?`)) onAction(deleteGoal(goal.id)); }}
                title="Delete"
                style={{ ...iconBtn, color: "var(--red)" }}
              >×</button>
            </div>
          </div>

          {/* Progress bar (only for trackable goals) */}
          {showProgress && (
            <div style={{
              marginTop: "0.45rem",
              height: 4,
              background: "rgba(0,0,0,0.06)",
              borderRadius: 999,
              overflow: "hidden",
            }}>
              <div style={{
                width: `${pct}%`,
                height: "100%",
                background: categoryColor,
              }} />
            </div>
          )}
        </>
      )}

      {/* Sub-goals */}
      {subs.length > 0 && (
        <ul style={{
          listStyle: "none",
          padding: "0.4rem 0 0",
          margin: "0.4rem 0 0 1.1rem",
          borderLeft: `2px solid ${categoryColor}33`,
        }}>
          {subs.map((s) => (
            <SubGoalItem key={s.id} sub={s} onAction={onAction} />
          ))}
        </ul>
      )}

      {/* Add sub-goal */}
      <div style={{ marginTop: subs.length > 0 ? "0.4rem" : "0.5rem", paddingLeft: "1.1rem" }}>
        {addingSub ? (
          <NewSubGoalForm
            onCancel={() => setAddingSub(false)}
            onSubmit={(name) =>
              onAction(createGoal({
                category_id: categoryId, parent_goal_id: goal.id, name, kind: "one_time",
              })).then(() => setAddingSub(false))
            }
            pending={pending}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAddingSub(true)}
            style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", fontSize: "0.7rem", color: "var(--muted)" }}
          >+ sub-goal</button>
        )}
      </div>
    </li>
  );
}

function SubGoalItem({
  sub, onAction,
}: {
  sub: GoalRow;
  onAction: <T>(p: Promise<{ ok: true; data?: T } | { ok: false; error: string }>) => Promise<void>;
}) {
  return (
    <li style={{
      display: "flex",
      alignItems: "center",
      gap: "0.4rem",
      padding: "0.2rem 0 0.2rem 0.55rem",
      fontSize: "0.84rem",
    }}>
      <button
        type="button"
        onClick={() => onAction(updateGoal(sub.id, { is_achieved: !sub.is_achieved }))}
        title={sub.is_achieved ? "Mark not done" : "Mark done"}
        style={{
          background: sub.is_achieved ? "var(--sage)" : "transparent",
          color: sub.is_achieved ? "#fff" : "var(--muted)",
          border: `1px solid ${sub.is_achieved ? "var(--sage)" : "var(--line)"}`,
          borderRadius: 3,
          width: 14, height: 14,
          fontSize: "0.62rem",
          cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          flex: "none",
        }}
      >{sub.is_achieved ? "✓" : ""}</button>
      <span style={{
        flex: 1,
        textDecoration: sub.is_achieved ? "line-through" : "none",
        color: sub.is_achieved ? "var(--muted)" : "var(--ink)",
      }}>
        {sub.name}
      </span>
      <button
        type="button"
        onClick={() => { if (confirm(`Delete sub-goal "${sub.name}"?`)) onAction(deleteGoal(sub.id)); }}
        title="Delete"
        style={{ ...iconBtn, fontSize: "0.78rem", color: "var(--red)" }}
      >×</button>
    </li>
  );
}

// ── Forms ───────────────────────────────────────────────────────────

const iconBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  padding: "0.1rem 0.4rem",
  fontSize: "0.86rem",
  lineHeight: 1,
  cursor: "pointer",
  color: "var(--muted)",
};

function ErrBox({ msg }: { msg: string }) {
  return (
    <div style={{
      marginBottom: "0.8rem", padding: "0.5rem 0.75rem",
      background: "rgba(192,57,43,0.08)", border: "1px solid var(--red)",
      color: "var(--red)", borderRadius: 4, fontSize: "0.82rem",
    }}>{msg}</div>
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
    <div style={{ display: "flex", gap: "0.3rem", alignItems: "center", flexWrap: "wrap", flex: 1 }}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ padding: "0.25rem 0.45rem", border: "1px solid var(--line)", borderRadius: 4, flex: "1 1 160px", fontSize: "0.84rem", minWidth: 0 }}
      />
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        style={{ width: 30, height: 26, padding: 0, border: "1px solid var(--line)", borderRadius: 4, background: "transparent" }}
      />
      <button
        type="button"
        className="btn btn-primary"
        style={{ padding: "0.22rem 0.65rem", fontSize: "0.74rem" }}
        disabled={pending}
        onClick={() => onAction(updateCategory(cat.id, { name, color })).then(onClose)}
      >Save</button>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ padding: "0.22rem 0.55rem", fontSize: "0.74rem" }}
        onClick={onClose}
      >×</button>
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
      padding: "0.55rem 0.75rem", border: "1px dashed var(--line)", borderRadius: 4, flexWrap: "wrap",
    }}>
      <input
        autoFocus
        placeholder="Category name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ padding: "0.3rem 0.5rem", border: "1px solid var(--line)", borderRadius: 4, flex: "1 1 200px", fontSize: "0.84rem" }}
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
        style={{ padding: "0.32rem 0.85rem", fontSize: "0.8rem" }}
        disabled={pending || !name.trim()}
        onClick={() => onSubmit(name, color)}
      >Create</button>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ padding: "0.32rem 0.7rem", fontSize: "0.8rem" }}
        onClick={onCancel}
      >Cancel</button>
    </div>
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
    background: "var(--bg)",
    minWidth: 0,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ ...inputStyle, width: "100%" }}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))", gap: "0.3rem" }}>
        <select value={kind} onChange={(e) => setKind(e.target.value as GoalKind)} style={inputStyle}>
          <option value="weekly_hours">Weekly hrs</option>
          <option value="weekly_count">Weekly ct</option>
          <option value="per_night">Per night</option>
          <option value="pr">PR</option>
          <option value="one_time">One-time</option>
        </select>
        <input placeholder="Target" value={target} onChange={(e) => setTarget(e.target.value)} style={inputStyle} />
        <input placeholder="Low" value={low} onChange={(e) => setLow(e.target.value)} style={inputStyle} />
        <input placeholder="High" value={high} onChange={(e) => setHigh(e.target.value)} style={inputStyle} />
        <input placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} style={inputStyle} />
        <input placeholder="Current" value={current} onChange={(e) => setCurrent(e.target.value)} style={inputStyle} />
      </div>
      <input
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        style={{ ...inputStyle, width: "100%" }}
      />
      <div style={{ display: "flex", gap: "0.3rem", justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: "0.22rem 0.6rem", fontSize: "0.74rem" }}
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
          style={{ padding: "0.22rem 0.55rem", fontSize: "0.74rem" }}
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
  const [unit, setUnit] = useState("hr");
  const inputStyle: React.CSSProperties = {
    padding: "0.28rem 0.45rem",
    border: "1px solid var(--line)",
    borderRadius: 4,
    fontSize: "0.82rem",
    fontFamily: "inherit",
    background: "var(--bg)",
    minWidth: 0,
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 90px 70px auto auto", gap: "0.3rem", alignItems: "center" }}>
      <input autoFocus placeholder="Goal name" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
      <select value={kind} onChange={(e) => setKind(e.target.value as GoalKind)} style={inputStyle}>
        <option value="weekly_hours">Weekly hrs</option>
        <option value="weekly_count">Weekly ct</option>
        <option value="per_night">Per night</option>
        <option value="pr">PR</option>
        <option value="one_time">One-time</option>
      </select>
      <input placeholder="Target" value={target} onChange={(e) => setTarget(e.target.value)} style={inputStyle} />
      <input placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} style={inputStyle} />
      <button
        type="button"
        className="btn btn-primary"
        style={{ padding: "0.28rem 0.7rem", fontSize: "0.76rem" }}
        disabled={pending || !name.trim()}
        onClick={() => {
          const toNum = (v: string) => v.trim() === "" ? null : Number(v);
          onSubmit({ name, kind, target_value: toNum(target), target_unit: unit.trim() || null });
        }}
      >Add</button>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ padding: "0.28rem 0.55rem", fontSize: "0.76rem" }}
        onClick={onCancel}
      >×</button>
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
    <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
      <input
        autoFocus
        placeholder="Sub-goal"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ padding: "0.2rem 0.4rem", border: "1px solid var(--line)", borderRadius: 4, fontSize: "0.78rem", flex: 1, minWidth: 0 }}
      />
      <button
        type="button"
        className="btn btn-primary"
        style={{ padding: "0.18rem 0.5rem", fontSize: "0.72rem" }}
        disabled={pending || !name.trim()}
        onClick={() => onSubmit(name)}
      >+</button>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ padding: "0.18rem 0.45rem", fontSize: "0.72rem" }}
        onClick={onCancel}
      >×</button>
    </div>
  );
}
