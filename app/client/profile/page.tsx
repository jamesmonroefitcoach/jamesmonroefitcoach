import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getClient } from "@/lib/data";
import { fmtMoney, fmtDate } from "@/lib/format";
import IntakeFormDisplay from "@/components/intake-form-display";

// Client's view of their own profile. Mirrors what James sees on his side
// EXCEPT for coach-internal classification: tier, test_rate, monthly
// revenue, lifecycle status, and the management flags stay coach-only.
export default async function ClientProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "client") redirect("/");
  const me = await getClient(user.id);

  const balance = me?.balance_owed ?? 0;
  const weightDelta =
    me?.current_weight_lb != null && me?.goal_weight_lb != null
      ? me.current_weight_lb - me.goal_weight_lb
      : null;
  const weightFromStart =
    me?.current_weight_lb != null && me?.starting_weight_lb != null
      ? me.current_weight_lb - me.starting_weight_lb
      : null;

  return (
    <main className="shell">
      <header>
        <span className="badge">Profile</span>
        <h1 style={{ marginTop: "0.5rem" }}>{user.name}</h1>
        <p className="meta">Member since {fmtDate(me?.member_since) || "—"}</p>
      </header>
      <hr className="divider" />

      {/* Goals */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2>Goals</h2>
        <p style={{ whiteSpace: "pre-wrap" }}>{me?.goals ?? "—"}</p>
      </div>

      {/* Body stats */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2>Body</h2>
        <hr className="divider" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "1rem" }}>
          <Stat label="Current weight" value={me?.current_weight_lb != null ? `${me.current_weight_lb} lb` : "—"} />
          <Stat label="Goal weight" value={me?.goal_weight_lb != null ? `${me.goal_weight_lb} lb` : "—"} />
          <Stat label="Starting" value={me?.starting_weight_lb != null ? `${me.starting_weight_lb} lb` : "—"} />
          <Stat
            label="Δ to goal"
            value={weightDelta != null ? `${weightDelta > 0 ? "+" : ""}${weightDelta} lb` : "—"}
          />
          <Stat
            label="Δ from start"
            value={
              weightFromStart != null
                ? `${weightFromStart > 0 ? "+" : ""}${weightFromStart} lb`
                : "—"
            }
          />
        </div>
      </div>

      {/* Training cadence + counts */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2>Training</h2>
        <hr className="divider" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "1rem" }}>
          <Stat label="Cadence" value={me?.regular_frequency ?? "—"} sub="sessions / week" />
          <Stat label="Total sessions" value={`${me?.total_sessions ?? 0}`} />
          <Stat label="This month" value={`${me?.sessions_this_month_completed ?? 0}`} sub="completed" />
          <Stat label="Last session" value={fmtDate(me?.last_session_at) || "—"} />
          <Stat label="Next session" value={fmtDate(me?.next_session_at) || "—"} />
        </div>
      </div>

      {/* Billing */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2>Billing</h2>
        <hr className="divider" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "1rem" }}>
          <Stat label="Session rate" value={fmtMoney(me?.session_rate)} />
          <Stat
            label="Balance"
            value={fmtMoney(balance)}
            sub={balance > 0 ? "due" : "all caught up"}
            valueColor={balance > 0 ? "var(--red)" : "var(--sage)"}
          />
        </div>
      </div>

      {/* Contact + identity */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2>Contact</h2>
        <hr className="divider" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem" }}>
          <Stat label="Email" value={me?.email ?? "—"} />
          <Stat label="Phone" value={(me as { phone?: string | null } | null)?.phone ?? "—"} />
          {me?.age_category && <Stat label="Age range" value={me.age_category} />}
          {me?.gender && <Stat label="Gender" value={me.gender} />}
        </div>
      </div>

      {/* Intake form responses — same render James sees on his side */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>Intake Form</h2>
          {me?.form_received_at && (
            <span className="meta" style={{ fontSize: "0.75rem" }}>
              Submitted {fmtDate(me.form_received_at)}
            </span>
          )}
        </div>
        <hr className="divider" />
        <IntakeFormDisplay
          formData={me?.form_data ?? null}
          emptyText="No intake form on file yet."
        />
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  sub,
  valueColor,
}: {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
}) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div style={{ marginTop: "0.3rem", fontWeight: 600, color: valueColor }}>{value}</div>
      {sub && <div className="stat-sub" style={{ marginTop: "0.1rem", fontSize: "0.74rem" }}>{sub}</div>}
    </div>
  );
}
