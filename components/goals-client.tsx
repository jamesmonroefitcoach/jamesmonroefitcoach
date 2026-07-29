"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GoalCategoryWithGoals, GoalKind, GoalRow } from "@/lib/goals";
import { targetLabel, progressPct } from "@/lib/goals";
import {
  createCategory, updateCategory, deleteCategory,
  createGoal, updateGoal, deleteGoal, saveWeeklyCheckin,
} from "@/app/goals/actions";

// Simpler goals view — small category sections, each goal as a one-line
// row with a thin progress bar. Edits expand inline. Replaces the dense
// spreadsheet layout, which surfaced too many controls at once.

export default function GoalsClient({
  ownerLabel, categories, checkin,
}: {
  ownerLabel: string;
  categories: GoalCategoryWithGoals[];
  /** Weekly self-survey data (coach side only). Absent = card hidden. */
  checkin?: {
    weekStart: string;
    entries: Record<string, { value: number | null; stars: number | null }>;
    tableMissing: boolean;
  };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [addingCat, setAddingCat] = useState(false);

  const totalGoals = useMemo(() => categories.reduce((s, c) => s + c.goals.length, 0), [categories]);

  // Flatten goals into two ordered lists:
  //   • Annual / high-level — every one_time goal across all categories
  //   • Weekly — every recurring goal (weekly_count, per_night, etc.)
  // Each carries its parent category color/id so a row can render a
  // color stripe and pass category info to the edit/add forms.
  const flat = useMemo(() => {
    const annual: { goal: GoalRow; cat: GoalCategoryWithGoals; subs: GoalRow[] }[] = [];
    const weekly: { goal: GoalRow; cat: GoalCategoryWithGoals; subs: GoalRow[] }[] = [];
    for (const cat of categories) {
      const subsByParent = new Map<string, GoalRow[]>();
      for (const g of cat.goals) {
        if (g.parent_goal_id) {
          const arr = subsByParent.get(g.parent_goal_id) ?? [];
          arr.push(g);
          subsByParent.set(g.parent_goal_id, arr);
        }
      }
      for (const g of cat.goals) {
        if (g.parent_goal_id) continue;
        const entry = { goal: g, cat, subs: subsByParent.get(g.id) ?? [] };
        if (g.kind === "one_time") annual.push(entry); else weekly.push(entry);
      }
    }
    return { annual, weekly };
  }, [categories]);

  const [showCategories, setShowCategories] = useState(false);

  // Weekly-hours rollup — for the summary strip under the Weekly card.
  // Per goal-kind hours/week conversion:
  //   • weekly_hours → target as-is
  //   • weekly_count → assume 1hr per occurrence (default block length)
  //   • per_night    → target × 7 nights
  //   • pr / one_time→ skipped (no recurring weekly footprint)
  const weeklyHoursRollup = useMemo(() => {
    let lo = 0, hi = 0;
    for (const { goal } of flat.weekly) {
      if (goal.kind === "pr" || goal.kind === "one_time") continue;
      const lowRaw = goal.target_range_low ?? goal.target_value;
      const highRaw = goal.target_range_high ?? goal.target_value;
      if (lowRaw == null && highRaw == null) continue;
      const lowV = lowRaw ?? highRaw!;
      const highV = highRaw ?? lowRaw!;
      const m = goal.kind === "per_night" ? 7 : 1;
      lo += lowV * m;
      hi += highV * m;
    }
    return { lo, hi };
  }, [flat.weekly]);

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
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* ── Weekly check-in survey (coach side) ─────────────── */}
          {checkin && (
            <WeeklyCheckinCard
              weekStart={checkin.weekStart}
              entries={checkin.entries}
              tableMissing={checkin.tableMissing}
              items={flat.weekly}
              onAction={run}
              pending={pending}
            />
          )}

          {/* ── Annual / high-level ────────────────────────────── */}
          <FlatGoalsCard
            title="Annual / high-level"
            empty="No annual goals yet."
            items={flat.annual}
            onAction={run}
            pending={pending}
          />

          {/* ── Weekly — grouped by category subsections (one view) ── */}
          <FlatGoalsCard
            title="Weekly"
            empty="No weekly goals yet."
            items={flat.weekly}
            onAction={run}
            pending={pending}
            groupByCategory
          />

          {/* Weekly-hours rollup — what % of the 168-hour week the
              weekly goals would occupy at their low / high ends, plus
              the estimated free hours for wiggle. */}
          {(weeklyHoursRollup.lo > 0 || weeklyHoursRollup.hi > 0) && (
            <WeeklyHoursStrip lo={weeklyHoursRollup.lo} hi={weeklyHoursRollup.hi} />
          )}
        </div>
      )}

      {/* Footer: category management — collapsed by default so the
          main view stays "just the two lists." Expand to add / rename /
          delete categories or to add a new goal to a specific category. */}
      <div style={{ marginTop: "1.4rem" }}>
        <button
          type="button"
          onClick={() => setShowCategories((v) => !v)}
          style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "var(--muted)", fontSize: "0.78rem", letterSpacing: "0.04em" }}
        >
          {showCategories ? "▾ Categories" : "▸ Manage categories"}
        </button>
        {showCategories && (
          <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.7rem" }}>
            <div style={{ columnWidth: 320, columnGap: "0.7rem" }}>
              {categories.map((cat) => (
                <div key={cat.id} style={{ breakInside: "avoid", marginBottom: "0.7rem" }}>
                  <CategoryBlock cat={cat} onAction={run} pending={pending} />
                </div>
              ))}
            </div>
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
                style={{ padding: "0.4rem 0.95rem", fontSize: "0.84rem", alignSelf: "flex-start" }}
                onClick={() => setAddingCat(true)}
              >
                + New category
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

// ── Weekly-hours summary strip ──────────────────────────────────────

function WeeklyHoursStrip({ lo, hi }: { lo: number; hi: number }) {
  const WEEK = 168;
  const sameLoHi = Math.abs(hi - lo) < 0.05;
  const pctLo = Math.round((lo / WEEK) * 100);
  const pctHi = Math.round((hi / WEEK) * 100);
  // Wiggle = leftover after the goals are accounted for. The "low end"
  // of wiggle hours assumes goals run at their high target (less slack);
  // the "high end" assumes goals run at their low target (more slack).
  const wiggleLo = Math.max(0, Math.round(WEEK - hi));
  const wiggleHi = Math.max(0, Math.round(WEEK - lo));
  const overbookedAtHigh = hi > WEEK;
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
      gap: "0.6rem",
      padding: "0.55rem 0.7rem",
      border: "1px solid var(--line)",
      borderRadius: 3,
      background: "var(--paper)",
    }}>
      <Cell label="Low end" value={`${Math.round(lo)} hr`} sub={`${pctLo}% of week`} />
      <Cell
        label="High end"
        value={`${Math.round(hi)} hr`}
        sub={`${pctHi}% of week`}
        accent={overbookedAtHigh ? "var(--red)" : undefined}
      />
      <Cell
        label="Free for wiggles"
        value={sameLoHi ? `${wiggleLo} hr` : `${wiggleLo}–${wiggleHi} hr`}
        sub={overbookedAtHigh ? "high end overbooks the week" : "of 168 / wk"}
        accent={overbookedAtHigh ? "var(--red)" : "var(--sage)"}
      />
    </div>
  );
}

function Cell({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: "0.6rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: "1rem", fontWeight: 700, color: accent ?? "var(--ink)" }}>{value}</div>
      {sub && <div style={{ fontSize: "0.66rem", color: "var(--muted)" }}>{sub}</div>}
    </div>
  );
}

// ── Flat list card (Annual / Weekly) ────────────────────────────────

// ── Weekly check-in survey ──────────────────────────────────────────
// James scores each weekly goal once a week: goals with a numeric target
// get a "type the latest number" input; the rest get a 1-5 star self-score
// (Ryan's spec, Jul 2026). Rows save individually via saveWeeklyCheckin.

type CheckinEntry = { value: number | null; stars: number | null };

function goalIsNumeric(g: GoalRow): boolean {
  return g.kind !== "one_time" &&
    (g.target_value != null || g.target_range_low != null || g.target_range_high != null);
}

function WeeklyCheckinCard({
  weekStart, entries, tableMissing, items, onAction, pending,
}: {
  weekStart: string;
  entries: Record<string, CheckinEntry>;
  tableMissing: boolean;
  items: { goal: GoalRow; cat: GoalCategoryWithGoals; subs: GoalRow[] }[];
  onAction: <T>(p: Promise<{ ok: true; data?: T } | { ok: false; error: string }>) => Promise<void>;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const done = items.filter(({ goal }) => {
    const e = entries[goal.id];
    return e && (e.value != null || e.stars != null);
  }).length;
  const weekLabel = new Date(weekStart + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <section style={{ border: "1px solid var(--line)", borderRadius: 3, background: "var(--paper)", overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: "0.5rem",
          padding: "0.4rem 0.7rem", background: "var(--bg)", border: "none",
          borderBottom: open ? "1px solid var(--line)" : "none", cursor: "pointer",
          fontFamily: "var(--font-heading), Oswald, sans-serif", textTransform: "uppercase",
          letterSpacing: "0.06em", fontSize: "0.74rem", color: "var(--muted)", fontWeight: 700,
        }}
      >
        <span style={{ fontSize: "0.66rem" }}>{open ? "▾" : "▸"}</span>
        Weekly check-in · week of {weekLabel}
        <span style={{ marginLeft: "auto", fontWeight: 600, fontSize: "0.68rem", textTransform: "none", letterSpacing: 0 }}>
          {done}/{items.length} scored
        </span>
      </button>
      {open && (
        tableMissing ? (
          <p className="meta" style={{ padding: "0.6rem 0.7rem", margin: 0, fontSize: "0.78rem", fontStyle: "italic" }}>
            Check-in storage isn&rsquo;t set up yet (migration 0035). Scores can&rsquo;t be saved until it runs.
          </p>
        ) : items.length === 0 ? (
          <p className="meta" style={{ padding: "0.6rem 0.7rem", margin: 0, fontSize: "0.78rem", fontStyle: "italic" }}>
            No weekly goals to score yet.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {items.map(({ goal, cat }) => (
              <li key={goal.id} style={{ borderLeft: `3px solid ${cat.color}`, borderBottom: "1px solid var(--line)" }}>
                <CheckinRow
                  goal={goal}
                  weekStart={weekStart}
                  entry={entries[goal.id]}
                  onAction={onAction}
                  pending={pending}
                />
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  );
}

function CheckinRow({
  goal, weekStart, entry, onAction, pending,
}: {
  goal: GoalRow;
  weekStart: string;
  entry: CheckinEntry | undefined;
  onAction: <T>(p: Promise<{ ok: true; data?: T } | { ok: false; error: string }>) => Promise<void>;
  pending: boolean;
}) {
  const numeric = goalIsNumeric(goal);
  const [draft, setDraft] = useState(entry?.value != null ? String(entry.value) : "");

  function saveNumber() {
    const v = draft.trim() === "" ? null : parseFloat(draft);
    if (v == null || Number.isNaN(v)) return;
    if (entry?.value === v) return;
    void onAction(saveWeeklyCheckin(goal.id, weekStart, { value: v }));
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.4rem 0.7rem", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 140 }}>
        <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>{goal.name}</div>
        <div className="meta" style={{ fontSize: "0.66rem" }}>
          {numeric ? <>target {targetLabel(goal)}</> : "rate your week"}
        </div>
      </div>
      {numeric ? (
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            value={draft}
            placeholder={goal.current_value != null ? String(goal.current_value) : "—"}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={saveNumber}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            disabled={pending}
            style={{ width: 74, padding: "0.25rem 0.4rem", fontSize: "0.82rem", textAlign: "right" }}
          />
          {goal.target_unit && <span className="meta" style={{ fontSize: "0.72rem" }}>{goal.target_unit}</span>}
          {entry?.value != null && (
            <span style={{ color: "var(--sage)", fontSize: "0.78rem", fontWeight: 700 }} title="Saved for this week">✓</span>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", gap: "0.1rem" }}>
          {[1, 2, 3, 4, 5].map((s) => {
            const filled = (entry?.stars ?? 0) >= s;
            return (
              <button
                key={s}
                type="button"
                disabled={pending}
                onClick={() => { if (entry?.stars !== s) void onAction(saveWeeklyCheckin(goal.id, weekStart, { stars: s })); }}
                aria-label={`${s} star${s === 1 ? "" : "s"}`}
                style={{
                  background: "transparent", border: "none", cursor: "pointer",
                  fontSize: "1.15rem", lineHeight: 1, padding: "0.1rem",
                  color: filled ? "var(--rust)" : "var(--muted)",
                }}
              >
                {filled ? "★" : "☆"}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FlatGoalsCard({
  title, empty, items, onAction, pending, groupByCategory = false,
}: {
  title: string;
  empty: string;
  items: { goal: GoalRow; cat: GoalCategoryWithGoals; subs: GoalRow[] }[];
  onAction: <T>(p: Promise<{ ok: true; data?: T } | { ok: false; error: string }>) => Promise<void>;
  pending: boolean;
  /** Group rows under per-category subheaders (text, not colour-only —
   *  the stripe alone isn't distinguishable for James) instead of one
   *  flat mixed list. */
  groupByCategory?: boolean;
}) {
  // Category order preserved as first-seen in items.
  const groups: { cat: GoalCategoryWithGoals; rows: typeof items }[] = [];
  if (groupByCategory) {
    const byId = new Map<string, { cat: GoalCategoryWithGoals; rows: typeof items }>();
    for (const it of items) {
      let g = byId.get(it.cat.id);
      if (!g) { g = { cat: it.cat, rows: [] }; byId.set(it.cat.id, g); groups.push(g); }
      g.rows.push(it);
    }
  }
  return (
    <section style={{
      border: "1px solid var(--line)",
      borderRadius: 3,
      background: "var(--paper)",
      overflow: "hidden",
    }}>
      <div style={{
        padding: "0.4rem 0.7rem",
        background: "var(--bg)",
        borderBottom: "1px solid var(--line)",
        fontFamily: "var(--font-heading), Oswald, sans-serif",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        fontSize: "0.74rem",
        color: "var(--muted)",
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
      }}>
        {title}
        <span style={{ fontSize: "0.66rem", color: "var(--muted)", opacity: 0.7 }}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="meta" style={{ padding: "0.5rem 0.7rem", fontStyle: "italic", margin: 0, fontSize: "0.78rem" }}>{empty}</p>
      ) : groupByCategory ? (
        groups.map(({ cat, rows }) => (
          <div key={cat.id}>
            <div style={{
              padding: "0.3rem 0.7rem",
              borderTop: "1px solid var(--line)",
              borderLeft: `3px solid ${cat.color}`,
              fontSize: "0.68rem",
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--muted)",
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
            }}>
              {cat.name}
              <span style={{ fontWeight: 400, opacity: 0.7 }}>{rows.length}</span>
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {rows.map(({ goal, cat: rowCat, subs }) => (
                <div key={goal.id} style={{ borderLeft: `3px solid ${rowCat.color}` }}>
                  <GoalListItem
                    goal={goal}
                    subs={subs}
                    categoryColor={rowCat.color}
                    categoryId={rowCat.id}
                    onAction={onAction}
                    pending={pending}
                  />
                </div>
              ))}
            </ul>
          </div>
        ))
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {items.map(({ goal, cat, subs }) => (
            <div key={goal.id} style={{ borderLeft: `3px solid ${cat.color}` }}>
              <GoalListItem
                goal={goal}
                subs={subs}
                categoryColor={cat.color}
                categoryId={cat.id}
                onAction={onAction}
                pending={pending}
              />
            </div>
          ))}
        </ul>
      )}
    </section>
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
  // Annual (one_time, checkbox-style) goals first, then weekly/recurring.
  // Within each group, original insertion order is preserved by the
  // stable .sort.
  const topGoals = cat.goals
    .filter((g) => !g.parent_goal_id)
    .map((g, idx) => ({ g, idx }))
    .sort((a, b) => {
      const aRank = a.g.kind === "one_time" ? 0 : 1;
      const bRank = b.g.kind === "one_time" ? 0 : 1;
      if (aRank !== bRank) return aRank - bRank;
      return a.idx - b.idx;
    })
    .map(({ g }) => g);
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
        gap: "0.5rem",
        padding: "0.35rem 0.7rem",
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
              fontSize: "0.84rem",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}>{cat.name}</strong>
            <span className="meta" style={{ fontSize: "0.68rem" }}>
              {cat.goals.length}
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
        <p className="meta" style={{ padding: "0.4rem 0.7rem", fontStyle: "italic", margin: 0, fontSize: "0.78rem" }}>
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
      <div style={{ borderTop: "1px solid var(--line)", padding: "0.3rem 0.7rem", background: "var(--bg)" }}>
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
              fontSize: "0.72rem",
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
  // Each row collapses to title + status by default. Notes, sub-goals,
  // and the add-sub-goal control only render when the row is expanded
  // or being edited. Click the title area (or the chevron) to toggle.
  const [expanded, setExpanded] = useState(false);
  const pct = progressPct(goal);
  const showProgress = pct != null && goal.kind !== "one_time";
  const isOneTime = goal.kind === "one_time";
  const hasDetails = !!goal.notes || subs.length > 0;

  return (
    <li style={{ borderTop: "1px solid var(--line)", padding: "0.35rem 0.7rem" }}>
      {editing ? (
        <GoalEditForm goal={goal} onClose={() => setEditing(false)} onAction={onAction} pending={pending} />
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
            {isOneTime && (
              <button
                type="button"
                onClick={(ev) => { ev.stopPropagation(); onAction(updateGoal(goal.id, { is_achieved: !goal.is_achieved })); }}
                title={goal.is_achieved ? "Mark not done" : "Mark done"}
                style={{
                  background: goal.is_achieved ? "var(--sage)" : "transparent",
                  color: goal.is_achieved ? "#fff" : "var(--muted)",
                  border: `1px solid ${goal.is_achieved ? "var(--sage)" : "var(--line)"}`,
                  borderRadius: 3,
                  width: 14, height: 14,
                  fontSize: "0.62rem",
                  cursor: "pointer",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  flex: "none",
                }}
              >{goal.is_achieved ? "✓" : ""}</button>
            )}
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              style={{
                flex: 1, minWidth: 0, textAlign: "left",
                background: "transparent", border: "none", padding: 0, cursor: "pointer",
              }}
              title={expanded ? "Collapse" : "Expand"}
            >
              <div style={{
                fontWeight: 500,
                fontSize: "0.82rem",
                lineHeight: 1.25,
                textDecoration: goal.is_achieved && isOneTime ? "line-through" : "none",
                color: goal.is_achieved && isOneTime ? "var(--muted)" : "var(--ink)",
              }}>
                {goal.name}
              </div>
            </button>
            {!isOneTime && (
              <div style={{
                textAlign: "right",
                fontSize: "0.72rem",
                whiteSpace: "nowrap",
                color: "var(--muted)",
              }}>
                <strong style={{ color: "var(--ink)" }}>{goal.current_value ?? 0}</strong>
                {" / "}
                {targetLabel(goal)}
              </div>
            )}
            <div style={{ display: "flex", gap: "0.05rem", alignItems: "center" }}>
              {hasDetails && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  title={expanded ? "Collapse" : "Expand details"}
                  style={{ ...iconBtn, color: "var(--muted)" }}
                >{expanded ? "▾" : "▸"}</button>
              )}
              <button type="button" onClick={() => { setExpanded(true); setEditing(true); }} title="Edit goal" style={iconBtn}>✎</button>
              <button
                type="button"
                onClick={() => { if (confirm(`Delete goal "${goal.name}"?`)) onAction(deleteGoal(goal.id)); }}
                title="Delete"
                style={{ ...iconBtn, color: "var(--red)" }}
              >×</button>
            </div>
          </div>

          {/* Progress bar — always visible for trackable goals; it's a
              3px sliver so it doesn't read as "detail" the way notes do. */}
          {showProgress && (
            <div style={{
              marginTop: "0.3rem",
              height: 3,
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

          {expanded && goal.notes && (
            <div className="meta" style={{ fontSize: "0.66rem", fontStyle: "italic", marginTop: "0.3rem" }}>
              {goal.notes}
            </div>
          )}
        </>
      )}

      {/* Sub-goals — only visible when row is expanded. */}
      {expanded && subs.length > 0 && (
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

      {/* Add sub-goal — only visible when expanded. */}
      {expanded && (
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
      )}
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
