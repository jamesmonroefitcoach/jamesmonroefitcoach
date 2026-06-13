"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GoalCategoryWithGoals, GoalKind, GoalRow } from "@/lib/goals";
import { targetLabel, progressPct } from "@/lib/goals";
import {
  createCategory, updateCategory, deleteCategory,
  createGoal, updateGoal, deleteGoal,
} from "@/app/goals/actions";

// Goals page — compact column layout. Categories tile side-by-side in
// a responsive grid; each category is a header strip with a colored dot
// + name and a vertical list of goal rows underneath, each row showing
// goal name, current/target, and inline Edit / Delete buttons. No nested
// card boxes — every category is a single panel with a thin divider
// between rows.
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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "0.95rem",
          }}
        >
          {categories.map((cat) => (
            <CategoryColumn
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

// ── Category column ──────────────────────────────────────────────────

function CategoryColumn({
  cat, isEditing, onEditOpen, onEditClose, onAction, pending,
}: {
  cat: GoalCategoryWithGoals;
  isEditing: boolean;
  onEditOpen: () => void;
  onEditClose: () => void;
  onAction: <T>(p: Promise<{ ok: true; data?: T } | { ok: false; error: string }>) => Promise<void>;
  pending: boolean;
}) {
  const [adding, setAdding] = useState(false);

  // Partition goals into top-level + sub-goals for nested render.
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
    <section style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      {/* Header strip — colored dot + name, edit/delete inline */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          paddingBottom: "0.45rem",
          borderBottom: `2px solid ${cat.color}`,
          marginBottom: "0.5rem",
        }}
      >
        <span style={{
          width: 10, height: 10, borderRadius: 2, background: cat.color, flex: "none",
        }} />
        {isEditing ? (
          <CategoryEditForm cat={cat} onClose={onEditClose} onAction={onAction} pending={pending} />
        ) : (
          <>
            <strong style={{ fontSize: "0.95rem", color: cat.color, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
              {cat.name}
            </strong>
            <span className="meta" style={{ fontSize: "0.7rem" }}>
              {cat.goals.length}
            </span>
            <div style={{ marginLeft: "auto", display: "flex", gap: "0.2rem" }}>
              <button
                type="button"
                onClick={onEditOpen}
                title="Edit category"
                style={iconBtnStyle}
              >✎</button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete category "${cat.name}" and all its goals?`)) {
                    onAction(deleteCategory(cat.id));
                  }
                }}
                title="Delete category"
                style={{ ...iconBtnStyle, color: "var(--red)" }}
              >×</button>
            </div>
          </>
        )}
      </div>

      {/* Goal rows */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {top.length === 0 ? (
          <p className="meta" style={{ fontStyle: "italic", fontSize: "0.78rem", margin: "0 0 0.45rem" }}>
            No goals yet.
          </p>
        ) : (
          top.map((g) => (
            <GoalRowItem
              key={g.id}
              goal={g}
              subs={subsByParent.get(g.id) ?? []}
              categoryId={cat.id}
              categoryColor={cat.color}
              onAction={onAction}
              pending={pending}
            />
          ))
        )}

        {/* Add goal — sits beneath the rows */}
        {adding ? (
          <div style={{ paddingTop: "0.5rem", borderTop: "1px solid var(--line)" }}>
            <NewGoalForm
              onCancel={() => setAdding(false)}
              onSubmit={(input) =>
                onAction(createGoal({ category_id: cat.id, ...input })).then(() => setAdding(false))
              }
              pending={pending}
            />
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-ghost"
            style={{
              alignSelf: "flex-start", marginTop: "0.35rem",
              padding: "0.22rem 0.55rem", fontSize: "0.72rem", color: "var(--muted)",
            }}
            onClick={() => setAdding(true)}
          >+ goal</button>
        )}
      </div>
    </section>
  );
}

const iconBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  padding: "0.1rem 0.35rem",
  fontSize: "0.85rem",
  lineHeight: 1,
  cursor: "pointer",
  color: "var(--muted)",
};

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
    <div style={{ display: "flex", gap: "0.3rem", alignItems: "center", flex: 1, flexWrap: "wrap" }}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ padding: "0.22rem 0.4rem", border: "1px solid var(--line)", borderRadius: 4, flex: "1 1 120px", fontSize: "0.82rem", minWidth: 0 }}
      />
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        style={{ width: 28, height: 24, padding: 0, border: "1px solid var(--line)", borderRadius: 4, background: "transparent" }}
      />
      <button
        type="button"
        className="btn btn-primary"
        style={{ padding: "0.2rem 0.55rem", fontSize: "0.72rem" }}
        disabled={pending}
        onClick={() => onAction(updateCategory(cat.id, { name, color })).then(onClose)}
      >Save</button>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ padding: "0.2rem 0.5rem", fontSize: "0.72rem" }}
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

// ── Goal row ─────────────────────────────────────────────────────────

function GoalRowItem({
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
  const showProgress = pct != null && goal.kind !== "one_time";

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      padding: "0.42rem 0",
      borderBottom: "1px solid var(--line)",
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
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
            <span style={{ fontSize: "0.86rem", fontWeight: 500, flex: 1, minWidth: 0 }}>
              {goal.name}
              {goal.is_achieved && (
                <span style={{ marginLeft: "0.4rem", color: "var(--sage)", fontSize: "0.7rem" }} title="Completed">✓</span>
              )}
            </span>
            {/* Right-aligned numeric — target only or current/target depending on kind */}
            <span className="meta" style={{ fontSize: "0.72rem", whiteSpace: "nowrap" }}>
              {goal.kind === "one_time"
                ? (goal.is_achieved ? "done" : "open")
                : (
                  <>
                    <span style={{ color: "var(--ink)", fontWeight: 600 }}>
                      {goal.current_value ?? 0}
                    </span>
                    /<span>{targetLabel(goal)}</span>
                  </>
                )}
            </span>
            {/* Inline action buttons — compact icons */}
            <div style={{ display: "flex", gap: "0.05rem" }}>
              {goal.kind === "one_time" && (
                <button
                  type="button"
                  title={goal.is_achieved ? "Mark not done" : "Mark done"}
                  onClick={() =>
                    onAction(updateGoal(goal.id, { is_achieved: !goal.is_achieved }))
                  }
                  style={{ ...iconBtnStyle, color: goal.is_achieved ? "var(--muted)" : "var(--sage)" }}
                >{goal.is_achieved ? "↺" : "✓"}</button>
              )}
              <button
                type="button"
                onClick={() => setEditing(true)}
                title="Edit goal"
                style={iconBtnStyle}
              >✎</button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete goal "${goal.name}"?`)) onAction(deleteGoal(goal.id));
                }}
                title="Delete goal"
                style={{ ...iconBtnStyle, color: "var(--red)" }}
              >×</button>
            </div>
          </div>
          {showProgress && (
            <div style={{
              marginTop: "0.25rem", height: 3,
              background: "rgba(0,0,0,0.06)",
              borderRadius: 999, overflow: "hidden",
            }}>
              <div style={{
                width: `${pct}%`, height: "100%", background: categoryColor,
              }} />
            </div>
          )}
          {goal.notes && (
            <div className="meta" style={{ fontSize: "0.7rem", marginTop: "0.18rem", fontStyle: "italic" }}>
              {goal.notes}
            </div>
          )}
        </>
      )}

      {/* Sub-goals — compact bulleted list */}
      {subs.length > 0 && (
        <ul style={{ listStyle: "none", margin: "0.25rem 0 0", padding: "0 0 0 0.85rem", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
          {subs.map((s) => (
            <li key={s.id} style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.76rem" }}>
              <span style={{ color: "var(--muted)", fontSize: "0.65rem" }}>↳</span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.name}
                {s.is_achieved && (
                  <span style={{ marginLeft: "0.3rem", color: "var(--sage)" }}>✓</span>
                )}
              </span>
              <button
                type="button"
                title={s.is_achieved ? "Mark not done" : "Mark done"}
                onClick={() => onAction(updateGoal(s.id, { is_achieved: !s.is_achieved }))}
                style={{ ...iconBtnStyle, fontSize: "0.7rem", color: s.is_achieved ? "var(--muted)" : "var(--sage)" }}
              >{s.is_achieved ? "↺" : "✓"}</button>
              <button
                type="button"
                onClick={() => { if (confirm(`Delete sub-goal "${s.name}"?`)) onAction(deleteGoal(s.id)); }}
                title="Delete"
                style={{ ...iconBtnStyle, fontSize: "0.7rem", color: "var(--red)" }}
              >×</button>
            </li>
          ))}
        </ul>
      )}

      {/* Add sub-goal */}
      <div style={{ paddingLeft: "0.85rem" }}>
        {addingSub ? (
          <div style={{ marginTop: "0.2rem" }}>
            <NewSubGoalForm
              onCancel={() => setAddingSub(false)}
              onSubmit={(name) => onAction(createGoal({
                category_id: categoryId, parent_goal_id: goal.id, name, kind: "one_time",
              })).then(() => setAddingSub(false))}
              pending={pending}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingSub(true)}
            style={{ ...iconBtnStyle, fontSize: "0.66rem", marginTop: "0.1rem", color: "var(--muted)" }}
          >+ sub</button>
        )}
      </div>
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
    padding: "0.22rem 0.4rem",
    border: "1px solid var(--line)",
    borderRadius: 4,
    fontSize: "0.78rem",
    fontFamily: "inherit",
    background: "#fff",
    minWidth: 0,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
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
        placeholder="Notes"
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
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");
  const [unit, setUnit] = useState("hr");
  const inputStyle: React.CSSProperties = {
    padding: "0.24rem 0.4rem",
    border: "1px solid var(--line)",
    borderRadius: 4,
    fontSize: "0.78rem",
    fontFamily: "inherit",
    background: "#fff",
    minWidth: 0,
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(70px, 1fr))", gap: "0.25rem" }}>
      <input
        autoFocus
        placeholder="Goal name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ ...inputStyle, gridColumn: "1 / -1" }}
      />
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
      <div style={{ gridColumn: "1 / -1", display: "flex", gap: "0.3rem", justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: "0.22rem 0.6rem", fontSize: "0.76rem" }}
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
        >Add</button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ padding: "0.22rem 0.55rem", fontSize: "0.76rem" }}
          onClick={onCancel}
        >×</button>
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
    <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
      <input
        autoFocus
        placeholder="Sub-goal"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ padding: "0.18rem 0.35rem", border: "1px solid var(--line)", borderRadius: 4, fontSize: "0.74rem", flex: 1, minWidth: 0 }}
      />
      <button
        type="button"
        className="btn btn-primary"
        style={{ padding: "0.16rem 0.45rem", fontSize: "0.7rem" }}
        disabled={pending || !name.trim()}
        onClick={() => onSubmit(name)}
      >+</button>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ padding: "0.16rem 0.4rem", fontSize: "0.7rem" }}
        onClick={onCancel}
      >×</button>
    </div>
  );
}
