"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LoggerProgram, LoggerRow, LoggerSet } from "@/lib/program-logger";
import {
  logSetAction,
  updateRowNoteAction,
  markCompleteAction,
} from "./actions";

// Per-set logger: prescribed values are shown as ghosted labels, the client
// fills in actuals; values that diverge from prescribed get a 🚩 flag so the
// coach sees what changed. Per-row note. Big "Mark Program Complete" at the
// bottom — fires a system message into the coach's Messages inbox.

type RowState = {
  sets: LoggerSet[];
  note: string;
  noteDirty: boolean;
};

export default function PerSetLogger({ program }: { program: LoggerProgram }) {
  const router = useRouter();
  const [rowState, setRowState] = useState<Record<string, RowState>>(() => {
    const out: Record<string, RowState> = {};
    for (const d of program.days) {
      for (const r of d.rows) {
        out[r.id] = { sets: r.sets, note: r.note ?? "", noteDirty: false };
      }
    }
    return out;
  });
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function patchSet(
    rowId: string,
    setIndex: number,
    patch: Partial<LoggerSet>
  ) {
    setRowState((prev) => {
      const cur = prev[rowId];
      if (!cur) return prev;
      const nextSets = cur.sets.map((s) =>
        s.set_index === setIndex ? { ...s, ...patch } : s
      );
      return { ...prev, [rowId]: { ...cur, sets: nextSets } };
    });
  }

  function saveSet(
    row: LoggerRow,
    setIndex: number,
    done: boolean
  ) {
    setError(null);
    const cur = rowState[row.id];
    if (!cur) return;
    const s = cur.sets.find((x) => x.set_index === setIndex);
    if (!s) return;
    start(async () => {
      const res = await logSetAction({
        programMovementId: row.id,
        setIndex,
        repsActual: s.reps_actual,
        weightActual: s.weight_actual,
        done,
      });
      if (!res.ok) setError(res.error);
      else {
        // Reflect server's computed adjusted flag by recomputing locally too
        const adjusted = isAdjusted(row.prescribed_reps, row.prescribed_weight, s.reps_actual, s.weight_actual);
        patchSet(row.id, setIndex, { adjusted, done_at: done ? new Date().toISOString() : null });
      }
    });
  }

  function saveNote(row: LoggerRow) {
    const cur = rowState[row.id];
    if (!cur || !cur.noteDirty) return;
    start(async () => {
      const res = await updateRowNoteAction(row.id, cur.note);
      if (!res.ok) setError(res.error);
      else setRowState((prev) => ({ ...prev, [row.id]: { ...cur, noteDirty: false } }));
    });
  }

  function markComplete() {
    if (!confirm(`Mark "${program.name}" complete? James will get a notification.`)) return;
    start(async () => {
      const res = await markCompleteAction(program.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push("/client/programming");
    });
  }

  const totalSets = Object.values(rowState).reduce((acc, r) => acc + r.sets.length, 0);
  const doneSets = Object.values(rowState).reduce(
    (acc, r) => acc + r.sets.filter((s) => s.done_at).length,
    0
  );

  return (
    <main className="shell" style={{ paddingTop: "1rem", paddingBottom: "5rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <span className="badge">My Portal</span>
          <h1 style={{ marginTop: "0.5rem" }}>{program.name}</h1>
          <p className="meta">
            Per-set logger · {doneSets}/{totalSets} sets logged
          </p>
        </div>
        <Link className="btn btn-ghost" href="/client/programming">← Back to View</Link>
      </header>
      <hr className="divider" />

      {error && (
        <div
          style={{
            background: "#fde6e0",
            border: "1px solid #c0392b",
            color: "#5b1d12",
            padding: "0.55rem 0.8rem",
            borderRadius: 5,
            fontSize: "0.84rem",
            marginBottom: "0.85rem",
          }}
        >
          {error}
        </div>
      )}

      {program.days.map((day) => (
        <section
          key={day.id}
          style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "0.65rem 0.8rem 0.85rem", background: "var(--paper)", marginBottom: "1rem" }}
        >
          <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.4rem" }}>{day.title}</h2>
          {day.rows.length === 0 ? (
            <p className="meta" style={{ fontStyle: "italic", fontSize: "0.84rem" }}>
              No movements on this day.
            </p>
          ) : (
            day.rows.map((row) => (
              <RowCard
                key={row.id}
                row={row}
                state={rowState[row.id]}
                onPatchSet={(setIndex, patch) => patchSet(row.id, setIndex, patch)}
                onSaveSet={(setIndex, done) => saveSet(row, setIndex, done)}
                onNoteChange={(note) =>
                  setRowState((prev) => ({
                    ...prev,
                    [row.id]: { ...prev[row.id], note, noteDirty: true },
                  }))
                }
                onNoteBlur={() => saveNote(row)}
              />
            ))
          )}
        </section>
      ))}

      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: "var(--bg)",
          paddingTop: "0.85rem",
          paddingBottom: "0.85rem",
          borderTop: "1px solid var(--line)",
          display: "flex",
          justifyContent: "flex-end",
          gap: "0.5rem",
        }}
      >
        <button
          className="btn btn-primary"
          onClick={markComplete}
          disabled={pending}
          style={{ fontSize: "0.95rem", padding: "0.55rem 1.1rem" }}
        >
          {pending ? "Saving…" : "Mark Program Complete"}
        </button>
      </div>
    </main>
  );
}

function RowCard({
  row,
  state,
  onPatchSet,
  onSaveSet,
  onNoteChange,
  onNoteBlur,
}: {
  row: LoggerRow;
  state: RowState;
  onPatchSet: (setIndex: number, patch: Partial<LoggerSet>) => void;
  onSaveSet: (setIndex: number, done: boolean) => void;
  onNoteChange: (note: string) => void;
  onNoteBlur: () => void;
}) {
  if (!state) return null;

  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 5,
        padding: "0.55rem 0.7rem",
        marginBottom: "0.5rem",
        background: "#fbf7ef",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap" }}>
        <div>
          <strong style={{ fontSize: "0.92rem" }}>{row.movement_name}</strong>
          {row.equipment && (
            <span className="meta" style={{ marginLeft: "0.45rem", fontSize: "0.74rem" }}>
              {row.equipment}
            </span>
          )}
          {row.is_warmup && (
            <span className="badge" style={{ marginLeft: "0.45rem", fontSize: "0.6rem" }}>warmup</span>
          )}
        </div>
        <div className="meta" style={{ fontSize: "0.72rem" }}>
          prescribed: {row.prescribed_sets} × {row.prescribed_reps ?? "—"}
          {row.prescribed_weight ? ` @ ${row.prescribed_weight}` : ""}
        </div>
      </div>

      <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {state.sets.map((s) => (
          <SetRow
            key={s.set_index}
            s={s}
            prescribedReps={row.prescribed_reps}
            prescribedWeight={row.prescribed_weight}
            onPatch={(patch) => onPatchSet(s.set_index, patch)}
            onSave={(done) => onSaveSet(s.set_index, done)}
          />
        ))}
      </div>

      <div style={{ marginTop: "0.5rem" }}>
        <input
          type="text"
          value={state.note}
          onChange={(e) => onNoteChange(e.target.value)}
          onBlur={onNoteBlur}
          placeholder="Notes (e.g. shoulder felt good, bumped weight)"
          style={{
            width: "100%",
            fontFamily: "inherit",
            fontSize: "0.82rem",
            padding: "0.3rem 0.45rem",
            border: "1px solid var(--line)",
            borderRadius: 4,
            background: "#fff",
          }}
        />
      </div>
    </div>
  );
}

function SetRow({
  s,
  prescribedReps,
  prescribedWeight,
  onPatch,
  onSave,
}: {
  s: LoggerSet;
  prescribedReps: string | null;
  prescribedWeight: string | null;
  onPatch: (patch: Partial<LoggerSet>) => void;
  onSave: (done: boolean) => void;
}) {
  const inputStyle: React.CSSProperties = {
    fontFamily: "inherit",
    fontSize: "0.86rem",
    padding: "0.28rem 0.4rem",
    border: "1px solid var(--line)",
    borderRadius: 4,
    background: "#fff",
    width: "100%",
    textAlign: "center",
  };
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "32px 1fr 1fr 28px 60px",
        gap: "0.4rem",
        alignItems: "center",
      }}
    >
      <span className="meta" style={{ fontSize: "0.72rem", textAlign: "center" }}>#{s.set_index + 1}</span>
      <input
        type="text"
        inputMode="numeric"
        value={s.reps_actual ?? ""}
        placeholder={prescribedReps ?? "reps"}
        onChange={(e) => onPatch({ reps_actual: e.target.value || null })}
        onBlur={() => onSave(!!s.done_at)}
        style={inputStyle}
      />
      <input
        type="text"
        inputMode="decimal"
        value={s.weight_actual ?? ""}
        placeholder={prescribedWeight ?? "wt"}
        onChange={(e) => onPatch({ weight_actual: e.target.value || null })}
        onBlur={() => onSave(!!s.done_at)}
        style={inputStyle}
      />
      <span style={{ fontSize: "0.95rem", textAlign: "center", color: "var(--rust)" }} title={s.adjusted ? "Adjusted from prescription — your coach will see this flag" : ""}>
        {s.adjusted ? "🚩" : ""}
      </span>
      <button
        type="button"
        onClick={() => onSave(!s.done_at)}
        style={{
          padding: "0.32rem 0.55rem",
          border: "1px solid var(--line)",
          borderRadius: 3,
          background: s.done_at ? "var(--sage)" : "transparent",
          color: s.done_at ? "#fff" : "var(--muted)",
          cursor: "pointer",
          fontSize: "0.74rem",
          fontFamily: "inherit",
        }}
      >
        {s.done_at ? "✓ done" : "log"}
      </button>
    </div>
  );
}

// Mirror of the server-side flag logic — same rules so the UI's flag matches
// what the coach sees once it's saved.
function isAdjusted(
  prescribedReps: string | null,
  prescribedWeight: string | null,
  actualReps: string | null,
  actualWeight: string | null
): boolean {
  const norm = (s: string | null) => (s ?? "").trim();
  const weightAdjusted = norm(prescribedWeight) !== "" && norm(prescribedWeight) !== norm(actualWeight);
  const repsAdjusted = norm(prescribedReps) !== "" && norm(prescribedReps) !== norm(actualReps);
  return weightAdjusted || repsAdjusted;
}
