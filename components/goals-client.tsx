"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GoalCategoryWithGoals, GoalKind, GoalRow } from "@/lib/goals";
import { targetLabel, progressPct } from "@/lib/goals";
import {
  createCategory, updateCategory, deleteCategory,
  createGoal, updateGoal, deleteGoal,
} from "@/app/goals/actions";

// Goals page — spreadsheet-row layout. One row per goal, columns:
//   Category · Goal · Kind · Current · Target · Progress · Actions
// Rows are grouped by category with a colored left-edge accent and a
// thin category header row above each block. Sub-goals indent under
// their parent with a ↳ glyph.

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
  // Inline-edit state lives per-row keyed by id so multiple edits don't
  // conflict and the row layout stays stable.
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [addingGoalCatId, setAddingGoalCatId] = useState<string | null>(null);
  const [addingSubForGoalId, setAddingSubForGoalId] = useState<string | null>(null);

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
        <div className="table-scroll-wrap" style={{ marginTop: "0.4rem", overflowX: "auto" }}>
          <table
            className="table"
            style={{
              minWidth: 760,
              width: "100%",
              borderCollapse: "separate",
              borderSpacing: 0,
              fontSize: "0.86rem",
            }}
          >
            <thead>
              <tr style={{ background: "rgba(0,0,0,0.025)" }}>
                <th style={thStyle(120)}>Category</th>
                <th style={thStyle(0)}>Goal</th>
                <th style={thStyle(110)}>Kind</th>
                <th style={thStyle(80)}>Current</th>
                <th style={thStyle(90)}>Target</th>
                <th style={thStyle(160)}>Progress</th>
                <th style={{ ...thStyle(110), textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => {
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
                  <CategoryGroup
                    key={cat.id}
                    cat={cat}
                    topGoals={top}
                    subsByParent={subsByParent}
                    isEditingCat={editingCatId === cat.id}
                    onEditCatOpen={() => setEditingCatId(cat.id)}
                    onEditCatClose={() => setEditingCatId(null)}
                    editingGoalId={editingGoalId}
                    setEditingGoalId={setEditingGoalId}
                    addingGoalHere={addingGoalCatId === cat.id}
                    setAddingGoalHere={(b) => setAddingGoalCatId(b ? cat.id : null)}
                    addingSubForGoalId={addingSubForGoalId}
                    setAddingSubForGoalId={setAddingSubForGoalId}
                    onAction={run}
                    pending={pending}
                  />
                );
              })}
            </tbody>
          </table>
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

const thStyle = (minW: number): React.CSSProperties => ({
  padding: "0.45rem 0.6rem",
  textAlign: "left",
  fontSize: "0.7rem",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--muted)",
  fontWeight: 700,
  borderBottom: "1px solid var(--line)",
  minWidth: minW || undefined,
  whiteSpace: "nowrap",
});

const tdStyle = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  padding: "0.4rem 0.6rem",
  borderBottom: "1px solid var(--line)",
  verticalAlign: "middle",
  ...extra,
});

const iconBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  padding: "0.12rem 0.35rem",
  fontSize: "0.86rem",
  lineHeight: 1,
  cursor: "pointer",
  color: "var(--muted)",
};

// ── Category group ──────────────────────────────────────────────────

function CategoryGroup({
  cat, topGoals, subsByParent,
  isEditingCat, onEditCatOpen, onEditCatClose,
  editingGoalId, setEditingGoalId,
  addingGoalHere, setAddingGoalHere,
  addingSubForGoalId, setAddingSubForGoalId,
  onAction, pending,
}: {
  cat: GoalCategoryWithGoals;
  topGoals: GoalRow[];
  subsByParent: Map<string, GoalRow[]>;
  isEditingCat: boolean;
  onEditCatOpen: () => void;
  onEditCatClose: () => void;
  editingGoalId: string | null;
  setEditingGoalId: (id: string | null) => void;
  addingGoalHere: boolean;
  setAddingGoalHere: (b: boolean) => void;
  addingSubForGoalId: string | null;
  setAddingSubForGoalId: (id: string | null) => void;
  onAction: <T>(p: Promise<{ ok: true; data?: T } | { ok: false; error: string }>) => Promise<void>;
  pending: boolean;
}) {
  return (
    <>
      {/* Category header row */}
      <tr style={{ background: `${cat.color}10`, borderLeft: `4px solid ${cat.color}` }}>
        <td colSpan={7} style={{
          padding: "0.45rem 0.6rem",
          borderTop: "2px solid var(--line)",
          borderBottom: "1px solid var(--line)",
        }}>
          {isEditingCat ? (
            <CategoryEditForm cat={cat} onClose={onEditCatClose} onAction={onAction} pending={pending} />
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
              <span style={{
                width: 11, height: 11, borderRadius: 2, background: cat.color, flex: "none",
              }} />
              <strong style={{ fontSize: "0.92rem", color: cat.color }}>{cat.name}</strong>
              <span className="meta" style={{ fontSize: "0.72rem" }}>
                {cat.goals.length} goal{cat.goals.length === 1 ? "" : "s"}
              </span>
              <div style={{ marginLeft: "auto", display: "flex", gap: "0.2rem" }}>
                <button
                  type="button"
                  onClick={onEditCatOpen}
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
            </div>
          )}
        </td>
      </tr>

      {/* Goal rows */}
      {topGoals.length === 0 ? (
        <tr>
          <td colSpan={7} style={{ ...tdStyle({ borderLeft: `4px solid ${cat.color}` }), fontStyle: "italic", color: "var(--muted)" }}>
            No goals yet in this category.
          </td>
        </tr>
      ) : (
        topGoals.map((g) => (
          <GoalRowAndSubs
            key={g.id}
            cat={cat}
            goal={g}
            subs={subsByParent.get(g.id) ?? []}
            isEditing={editingGoalId === g.id}
            onEditOpen={() => setEditingGoalId(g.id)}
            onEditClose={() => setEditingGoalId(null)}
            isAddingSub={addingSubForGoalId === g.id}
            setAddingSub={(b) => setAddingSubForGoalId(b ? g.id : null)}
            onAction={onAction}
            pending={pending}
          />
        ))
      )}

      {/* Add-goal row at the bottom of the category */}
      <tr>
        <td colSpan={7} style={{ ...tdStyle({ borderLeft: `4px solid ${cat.color}`, padding: "0.3rem 0.6rem" }) }}>
          {addingGoalHere ? (
            <NewGoalForm
              onCancel={() => setAddingGoalHere(false)}
              onSubmit={(input) =>
                onAction(createGoal({ category_id: cat.id, ...input })).then(() => setAddingGoalHere(false))
              }
              pending={pending}
            />
          ) : (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: "0.2rem 0.55rem", fontSize: "0.72rem", color: "var(--muted)" }}
              onClick={() => setAddingGoalHere(true)}
            >+ goal</button>
          )}
        </td>
      </tr>
    </>
  );
}

// ── Goal row + its sub-goals ────────────────────────────────────────

function GoalRowAndSubs({
  cat, goal, subs,
  isEditing, onEditOpen, onEditClose,
  isAddingSub, setAddingSub,
  onAction, pending,
}: {
  cat: GoalCategoryWithGoals;
  goal: GoalRow;
  subs: GoalRow[];
  isEditing: boolean;
  onEditOpen: () => void;
  onEditClose: () => void;
  isAddingSub: boolean;
  setAddingSub: (b: boolean) => void;
  onAction: <T>(p: Promise<{ ok: true; data?: T } | { ok: false; error: string }>) => Promise<void>;
  pending: boolean;
}) {
  const pct = progressPct(goal);
  const showProgress = pct != null && goal.kind !== "one_time";
  const currentLabel = goal.kind === "one_time"
    ? (goal.is_achieved ? "✓ done" : "open")
    : (goal.current_value ?? 0).toString() + (goal.target_unit ? ` ${goal.target_unit}` : "");
  const tgtLabel = targetLabel(goal);

  if (isEditing) {
    return (
      <tr>
        <td colSpan={7} style={{ ...tdStyle({ borderLeft: `4px solid ${cat.color}` }) }}>
          <GoalEditForm goal={goal} onClose={onEditClose} onAction={onAction} pending={pending} />
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr>
        <td style={{ ...tdStyle({ borderLeft: `4px solid ${cat.color}` }) }}>
          <span className="meta" style={{ fontSize: "0.74rem" }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: cat.color, marginRight: "0.35rem", verticalAlign: "middle" }} />
            {cat.name}
          </span>
        </td>
        <td style={tdStyle()}>
          <span style={{ fontWeight: 500 }}>
            {goal.name}
            {goal.is_achieved && (
              <span style={{ marginLeft: "0.4rem", color: "var(--sage)", fontSize: "0.72rem" }}>✓</span>
            )}
          </span>
          {goal.notes && (
            <div className="meta" style={{ fontSize: "0.7rem", marginTop: "0.15rem", fontStyle: "italic" }}>
              {goal.notes}
            </div>
          )}
        </td>
        <td style={{ ...tdStyle({ whiteSpace: "nowrap" }), fontSize: "0.78rem", color: "var(--muted)" }}>
          {kindLabel(goal.kind)}
        </td>
        <td style={{ ...tdStyle({ whiteSpace: "nowrap" }), fontWeight: 600 }}>
          {currentLabel}
        </td>
        <td style={{ ...tdStyle({ whiteSpace: "nowrap" }) }}>
          {tgtLabel}
        </td>
        <td style={tdStyle()}>
          {showProgress ? (
            <div style={{
              height: 6, background: "rgba(0,0,0,0.06)",
              borderRadius: 999, overflow: "hidden", minWidth: 100,
            }}>
              <div style={{
                width: `${pct}%`, height: "100%", background: cat.color,
              }} />
            </div>
          ) : (
            <span className="meta" style={{ fontSize: "0.72rem" }}>—</span>
          )}
        </td>
        <td style={{ ...tdStyle({ whiteSpace: "nowrap", textAlign: "right" }) }}>
          {goal.kind === "one_time" && (
            <button
              type="button"
              title={goal.is_achieved ? "Mark not done" : "Mark done"}
              onClick={() => onAction(updateGoal(goal.id, { is_achieved: !goal.is_achieved }))}
              style={{ ...iconBtnStyle, color: goal.is_achieved ? "var(--muted)" : "var(--sage)" }}
            >{goal.is_achieved ? "↺" : "✓"}</button>
          )}
          <button
            type="button"
            onClick={onEditOpen}
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
        </td>
      </tr>

      {/* Sub-goals indented under parent */}
      {subs.map((s) => (
        <SubGoalRow
          key={s.id}
          cat={cat}
          sub={s}
          onAction={onAction}
        />
      ))}

      {/* Add-sub row */}
      <tr>
        <td colSpan={7} style={{ ...tdStyle({ borderLeft: `4px solid ${cat.color}`, padding: "0.25rem 0.6rem 0.3rem 2.5rem" }) }}>
          {isAddingSub ? (
            <NewSubGoalForm
              onCancel={() => setAddingSub(false)}
              onSubmit={(name) =>
                onAction(createGoal({
                  category_id: cat.id, parent_goal_id: goal.id, name, kind: "one_time",
                })).then(() => setAddingSub(false))
              }
              pending={pending}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAddingSub(true)}
              style={{ ...iconBtnStyle, fontSize: "0.7rem", color: "var(--muted)" }}
            >+ sub-goal</button>
          )}
        </td>
      </tr>
    </>
  );
}

function SubGoalRow({
  cat, sub, onAction,
}: {
  cat: GoalCategoryWithGoals;
  sub: GoalRow;
  onAction: <T>(p: Promise<{ ok: true; data?: T } | { ok: false; error: string }>) => Promise<void>;
}) {
  return (
    <tr style={{ background: "rgba(0,0,0,0.015)" }}>
      <td style={{ ...tdStyle({ borderLeft: `4px solid ${cat.color}` }) }}>
        <span className="meta" style={{ fontSize: "0.72rem", color: "var(--muted)" }}>↳ sub</span>
      </td>
      <td style={{ ...tdStyle({ paddingLeft: "1.8rem" }) }}>
        <span style={{ fontSize: "0.82rem" }}>
          {sub.name}
          {sub.is_achieved && (
            <span style={{ marginLeft: "0.4rem", color: "var(--sage)", fontSize: "0.7rem" }}>✓</span>
          )}
        </span>
      </td>
      <td style={{ ...tdStyle({ whiteSpace: "nowrap" }), fontSize: "0.74rem", color: "var(--muted)" }}>
        {kindLabel(sub.kind)}
      </td>
      <td style={{ ...tdStyle({ whiteSpace: "nowrap" }), fontSize: "0.78rem" }}>
        {sub.is_achieved ? "✓ done" : "open"}
      </td>
      <td style={{ ...tdStyle({ whiteSpace: "nowrap" }), fontSize: "0.78rem", color: "var(--muted)" }}>
        —
      </td>
      <td style={tdStyle()}>
        <span className="meta" style={{ fontSize: "0.7rem" }}>—</span>
      </td>
      <td style={{ ...tdStyle({ whiteSpace: "nowrap", textAlign: "right" }) }}>
        <button
          type="button"
          title={sub.is_achieved ? "Mark not done" : "Mark done"}
          onClick={() => onAction(updateGoal(sub.id, { is_achieved: !sub.is_achieved }))}
          style={{ ...iconBtnStyle, fontSize: "0.78rem", color: sub.is_achieved ? "var(--muted)" : "var(--sage)" }}
        >{sub.is_achieved ? "↺" : "✓"}</button>
        <button
          type="button"
          onClick={() => { if (confirm(`Delete sub-goal "${sub.name}"?`)) onAction(deleteGoal(sub.id)); }}
          title="Delete"
          style={{ ...iconBtnStyle, fontSize: "0.78rem", color: "var(--red)" }}
        >×</button>
      </td>
    </tr>
  );
}

function kindLabel(kind: GoalKind): string {
  switch (kind) {
    case "weekly_hours": return "wk hours";
    case "weekly_count": return "wk count";
    case "per_night":    return "per night";
    case "pr":           return "PR";
    case "one_time":     return "milestone";
  }
}

// ── Category forms ──────────────────────────────────────────────────

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
    <div style={{ display: "flex", gap: "0.3rem", alignItems: "center", flexWrap: "wrap" }}>
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

// ── Goal forms ──────────────────────────────────────────────────────

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
        style={{ padding: "0.18rem 0.35rem", border: "1px solid var(--line)", borderRadius: 4, fontSize: "0.78rem", flex: 1, minWidth: 0 }}
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
