import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { getClient } from "@/lib/data";
import { getProgramForLogging } from "@/lib/program-logger";
import { getOrCreatePairedSheet } from "@/lib/programs-sheets-bridge";
import { fmtDate } from "@/lib/format";

// Coach-side view of a single program — the link target for the completion
// auto-message. Reads the same shape as the client's per-set logger but
// renders read-only with prescribed | actual side-by-side, 🚩 flags on
// every adjusted set, and a per-row note panel.
export default async function CoachProgramViewerPage({
  params,
}: {
  params: Promise<{ id: string; programId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach" && user.role !== "admin" && !user.is_admin) redirect("/");

  const { id: clientId, programId } = await params;
  const [client, program] = await Promise.all([
    getClient(clientId),
    getProgramForLogging(programId, user.id),
  ]);
  if (!client || !program) notFound();

  // Lazy back-fill — ensure the program has a paired sheet row so the
  // Template view auto-renders alongside it. Best-effort.
  try { await getOrCreatePairedSheet(programId); } catch { /* swallow */ }

  // Aggregate completion stats
  let totalSets = 0;
  let doneSets = 0;
  let flaggedSets = 0;
  for (const d of program.days) {
    for (const r of d.rows) {
      for (const s of r.sets) {
        totalSets += 1;
        if (s.done_at) doneSets += 1;
        if (s.adjusted) flaggedSets += 1;
      }
    }
  }

  return (
    <main className="shell" style={{ paddingTop: "1rem", paddingBottom: "3rem" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <span className="badge">Program</span>
          <h1 style={{ marginTop: "0.5rem" }}>{program.name}</h1>
          <p className="meta">
            {client.full_name} · {program.program_kind === "at_home" ? "At-home" : "In-gym"}
            {program.is_current ? " · current" : " · completed"}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link className="btn btn-ghost" href={`/coach/clients/${clientId}`}>← Client profile</Link>
          <Link
            className="btn btn-ghost"
            href={`/coach/programming/build/template?program=${program.id}`}
          >
            Open in Template
          </Link>
        </div>
      </header>

      <hr className="divider" />

      {/* Summary tiles */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "0.75rem",
          marginBottom: "1.25rem",
        }}
      >
        <Stat
          label="Sets logged"
          value={`${doneSets} / ${totalSets}`}
          sub={
            totalSets > 0 ? `${Math.round((doneSets / totalSets) * 100)}% complete` : null
          }
        />
        <Stat
          label="Adjusted"
          value={`${flaggedSets}`}
          sub="flagged differ from prescription"
          color={flaggedSets > 0 ? "var(--rust)" : undefined}
        />
        <Stat label="Days" value={`${program.days.length}`} />
        <Stat
          label="Updated"
          value={fmtDate(new Date().toISOString())}
          sub="—"
        />
      </div>

      {/* Day cards */}
      {program.days.map((day) => (
        <section
          key={day.id}
          style={{
            border: "1px solid var(--line)",
            borderRadius: 6,
            padding: "0.7rem 0.85rem 0.85rem",
            background: "var(--paper)",
            marginBottom: "1rem",
          }}
        >
          <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.55rem" }}>{day.title}</h2>
          {day.rows.length === 0 ? (
            <p className="meta" style={{ fontStyle: "italic", fontSize: "0.84rem" }}>
              No movements on this day.
            </p>
          ) : (
            day.rows.map((row) => <RowSummary key={row.id} row={row} />)
          )}
        </section>
      ))}
    </main>
  );
}

function RowSummary({
  row,
}: {
  row: import("@/lib/program-logger").LoggerRow;
}) {
  const anyAdjusted = row.sets.some((s) => s.adjusted);
  const anyDone = row.sets.some((s) => s.done_at);

  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 5,
        padding: "0.55rem 0.7rem",
        marginBottom: "0.5rem",
        background: anyAdjusted ? "#fdf3ee" : "#fbf7ef",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: "0.5rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <strong style={{ fontSize: "0.92rem" }}>{row.movement_name}</strong>
          {row.equipment && (
            <span className="meta" style={{ marginLeft: "0.45rem", fontSize: "0.74rem" }}>
              {row.equipment}
            </span>
          )}
          {row.is_warmup && (
            <span className="badge" style={{ marginLeft: "0.45rem", fontSize: "0.6rem" }}>
              warmup
            </span>
          )}
          {anyAdjusted && (
            <span
              style={{
                marginLeft: "0.45rem",
                fontSize: "0.62rem",
                color: "var(--rust)",
                fontWeight: 700,
                fontFamily: "Oswald, sans-serif",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
              title="At least one set was adjusted from the prescription"
            >
              🚩 adjusted
            </span>
          )}
        </div>
        <div className="meta" style={{ fontSize: "0.72rem" }}>
          prescribed: {row.prescribed_sets} × {row.prescribed_reps ?? "—"}
          {row.prescribed_weight ? ` @ ${row.prescribed_weight}` : ""}
        </div>
      </div>

      {/* Per-set table */}
      <div
        style={{
          marginTop: "0.5rem",
          display: "grid",
          gridTemplateColumns: "32px 1fr 1fr 28px",
          gap: "0.3rem 0.45rem",
          alignItems: "center",
          fontSize: "0.82rem",
        }}
      >
        <span className="meta" style={{ fontSize: "0.62rem", textAlign: "center" }}>SET</span>
        <span className="meta" style={{ fontSize: "0.62rem" }}>REPS</span>
        <span className="meta" style={{ fontSize: "0.62rem" }}>WT</span>
        <span></span>
        {row.sets.map((s) => (
          <SetSummary key={s.set_index} s={s} prescribedReps={row.prescribed_reps} prescribedWeight={row.prescribed_weight} />
        ))}
      </div>

      {row.note && (
        <div
          style={{
            marginTop: "0.5rem",
            padding: "0.4rem 0.55rem",
            borderLeft: "3px solid var(--clay)",
            background: "#fff",
            fontSize: "0.82rem",
            fontStyle: "italic",
            color: "var(--ink)",
          }}
        >
          {row.note}
        </div>
      )}

      {!anyDone && (
        <p className="meta" style={{ fontSize: "0.7rem", marginTop: "0.4rem", fontStyle: "italic" }}>
          Not yet started.
        </p>
      )}
    </div>
  );
}

function SetSummary({
  s,
  prescribedReps,
  prescribedWeight,
}: {
  s: import("@/lib/program-logger").LoggerSet;
  prescribedReps: string | null;
  prescribedWeight: string | null;
}) {
  const cellBase: React.CSSProperties = {
    padding: "0.18rem 0.4rem",
    border: "1px solid var(--line)",
    borderRadius: 3,
    background: "#fff",
    fontSize: "0.84rem",
  };
  const adjustedCell: React.CSSProperties = s.adjusted
    ? { border: "1px solid var(--rust)", background: "#fdf3ee" }
    : {};
  return (
    <>
      <span className="meta" style={{ textAlign: "center", fontSize: "0.7rem" }}>#{s.set_index + 1}</span>
      <ValueCell cellBase={cellBase} adjustedCell={adjustedCell} actual={s.reps_actual} prescribed={prescribedReps} />
      <ValueCell cellBase={cellBase} adjustedCell={adjustedCell} actual={s.weight_actual} prescribed={prescribedWeight} />
      <span style={{ textAlign: "center", fontSize: "0.9rem" }} title={s.adjusted ? "Adjusted from prescription" : ""}>
        {s.adjusted ? "🚩" : s.done_at ? "✓" : ""}
      </span>
    </>
  );
}

function ValueCell({
  cellBase,
  adjustedCell,
  actual,
  prescribed,
}: {
  cellBase: React.CSSProperties;
  adjustedCell: React.CSSProperties;
  actual: string | null;
  prescribed: string | null;
}) {
  const show = actual ?? prescribed ?? "—";
  const isPrescribedOnly = !actual && prescribed;
  return (
    <span
      style={{
        ...cellBase,
        ...adjustedCell,
        color: isPrescribedOnly ? "var(--muted)" : "var(--ink)",
        fontStyle: isPrescribedOnly ? "italic" : "normal",
      }}
      title={isPrescribedOnly ? "Prescribed value — client hasn't logged this set" : undefined}
    >
      {show}
    </span>
  );
}

function Stat({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string | null;
  color?: string;
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
