import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { getClient, listAppointmentsForClient, getClientReminderPrefs, getHighLevelPlan } from "@/lib/data";
import { pastProgramsForClient, isExpiringSoon, CATEGORY_LABELS, type Category, type PastProgramFull } from "@/lib/programs";
import { fmtMoney, fmtDate } from "@/lib/format";
import ClientSettings from "./client-settings";
import { CoachProfileCard, ClientProfileCard, ClientDescriptionCard } from "./client-profile-edit";
import { HighLevelPlanSection } from "./high-level-plan";
import PastPrograms, { type PastSessionItem } from "./past-programs";
import ExercisesLearnedSection from "./exercises-learned-section";
import WorkoutSheetsSection from "./workout-sheets-section";
import { listWorkoutSheets } from "@/lib/workout-sheets.server";
import LogPaymentButton, { type PaymentApptRow } from "./log-payment-modal";
import IntakeFormDisplay from "@/components/intake-form-display";

function ProgramCard({ label, prog, clientId, status }: {
  label: string;
  prog: PastProgramFull | null;
  clientId: string;
  status: "published" | "draft" | "none";
}) {
  if (!prog) {
    return (
      <div className="card" style={{ padding: "0.85rem" }}>
        <span className="badge">{label}</span>
        <p className="meta" style={{ marginTop: "0.5rem" }}>No active {label.toLowerCase()} program. <Link href={`/coach/programming/build?client=${clientId}`}>Build one →</Link></p>
      </div>
    );
  }
  const expiring = isExpiringSoon(prog);
  const tabParam = prog.program_kind === "at_home" ? "program" : "session";
  return (
    <div className="day-card" style={{ borderLeftColor: expiring ? "var(--red)" : status === "draft" ? "var(--amber)" : "var(--rust)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="badge badge-rust">{label}</span>
          {status === "published" && (
            <span className="badge badge-sage" style={{ marginLeft: "0.4rem", fontSize: "0.62rem" }}>published</span>
          )}
          {status === "draft" && (
            <span className="badge badge-amber" style={{ marginLeft: "0.4rem", fontSize: "0.62rem" }}>draft</span>
          )}
          <strong style={{ marginLeft: "0.5rem" }}>{prog.name}</strong>
          {expiring ? <span className="badge badge-red" style={{ marginLeft: "0.5rem" }}>expiring soon</span> : null}
          {prog.program_kind === "at_home" ? (
            <div className="meta" style={{ marginTop: "0.25rem" }}>
              {fmtDate(prog.starts_on)} → {fmtDate(prog.ends_on)} · {prog.duration_weeks ?? "—"} wk
              {prog.at_home_cadence ? ` · ${prog.at_home_cadence}` : ""}
            </div>
          ) : (
            <div className="meta" style={{ marginTop: "0.25rem" }}>
              {prog.day_count} training day{prog.day_count !== 1 ? "s" : ""} · scheduled on calendar
            </div>
          )}
          <div className="meta" style={{ fontSize: "0.78rem", marginTop: "0.2rem" }}>
            {Object.entries(prog.category_counts)
              .map(([k, v]) => `${v} ${CATEGORY_LABELS[k as Category].toLowerCase()}`)
              .join(" · ")}
          </div>
        </div>
        <Link
          className="btn btn-ghost"
          href={`/coach/programming/build?tab=${tabParam}&client=${clientId}${status === "published" ? "&view=plan" : ""}`}
          style={{ padding: "0.3rem 0.6rem", fontSize: "0.74rem" }}
        >view →</Link>
      </div>
    </div>
  );
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach" && user.role !== "admin" && !user.is_admin) redirect("/");

  const { id } = await params;
  const [client, reminderPrefs, highLevelPlan] = await Promise.all([
    getClient(id),
    getClientReminderPrefs(id),
    getHighLevelPlan(id),
  ]);
  if (!client) notFound();
  const appts = await listAppointmentsForClient(id);
  const past = appts.filter((a) => new Date(a.starts_at) < new Date());
  const upcoming = appts.filter((a) => new Date(a.starts_at) >= new Date());
  const programs = pastProgramsForClient(id);
  const pdfSheets = await listWorkoutSheets({ clientId: id, kind: "pdf", limit: 50 });
  const currentInGym = programs.find((p) => p.is_current && p.program_kind === "in_gym") ?? null;
  const currentAtHome = programs.find((p) => p.is_current && p.program_kind === "at_home") ?? null;
  const pastList = programs.filter((p) => !p.is_current);
  // Past session appointments — feed into the two-column "Past programs" view.
  const pastSessions: PastSessionItem[] = past
    .filter((a) => a.session_type === "session" && a.client_id === id)
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
    .map((a) => ({
      id: a.id,
      starts_at: a.starts_at,
      program_status: a.program_status,
      session_program_id: a.session_program_id ?? null,
    }));
  // Sessions to show in the Log Payment modal — every session-type appt for
  // this client, regardless of status. Cancelled sessions still need to be
  // marked paid (cancellation fees, late-cancel policy), so they belong here
  // too. Unpaid sessions bubble up automatically inside the modal.
  const paymentAppts: PaymentApptRow[] = appts
    .filter((a) => a.session_type === "session" && a.client_id === id)
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
    .map((a) => ({
      id: a.id,
      starts_at: a.starts_at,
      status: a.status,
      rate: a.rate,
      paid: a.paid,
    }));

  return (
    <main className="shell">
      <Link href="/coach/clients" className="meta">← All clients</Link>
      <header className="page-hdr" style={{ marginTop: "0.5rem" }}>
        <div>
          <span className="badge">Client</span>
          <h1 style={{ marginTop: "0.5rem" }}>{client.full_name}</h1>
          <p className="meta">
            {client.tier ? `Tier ${client.tier.replace("tier_", "")}` : "—"}
            {client.member_since ? ` · member since ${fmtDate(client.member_since)}` : ""}
            {client.email ? ` · ${client.email}` : ""}
            {client.lifecycle !== "active" && (
              <span style={{
                marginLeft: "0.5rem",
                background: client.lifecycle === "paused" ? "#e8f0fe" : "#fce8e8",
                color: client.lifecycle === "paused" ? "#1a56db" : "var(--red)",
                borderRadius: 4, padding: "0.1rem 0.4rem", fontSize: "0.75rem", fontWeight: 700
              }}>{client.lifecycle}</span>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link className="btn btn-ghost" href={`/coach/messages?client=${client.id}`}>Message</Link>
          <LogPaymentButton clientName={client.full_name} appts={paymentAppts} />
          <Link className="btn btn-primary" href={`/coach/programming/build?client=${client.id}`}>New program</Link>
        </div>
      </header>

      <hr className="divider" />

      <section className="grid-stats">
        <div className="stat">
          <div className="stat-label">Cadence</div>
          <div className="stat-value">{client.regular_frequency ?? "—"}</div>
          <div className="stat-sub">
            {client.regular_frequency && !isNaN(parseFloat(client.regular_frequency))
              ? `~${Math.max(1, Math.round(parseFloat(client.regular_frequency) / 4.33))}×/wk`
              : "sessions / mo"}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Current rate</div>
          <div className="stat-value">{fmtMoney(client.session_rate)}</div>
          <div className="stat-sub">{client.test_rate && client.session_rate && client.test_rate > client.session_rate ? `target ${fmtMoney(client.test_rate)}` : "no rate change"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Weight</div>
          <div className="stat-value">{client.current_weight_lb ?? "—"}</div>
          <div className="stat-sub">
            {client.starting_weight_lb ? `start ${client.starting_weight_lb} · ` : ""}
            {client.goal_weight_lb ? `goal ${client.goal_weight_lb}` : "no goal"}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Owed</div>
          <div className="stat-value" style={{ color: client.balance_owed > 0 ? "var(--red)" : undefined }}>{fmtMoney(client.balance_owed)}</div>
          <div className="stat-sub">{client.balance_owed > 0 ? "open invoices" : "all paid"}</div>
        </div>
      </section>

      <hr className="divider" />

      {/* ── Coach Profile + Client Profile ──────────────────────────── */}
      <div className="grid-2col">
        <CoachProfileCard client={client} />
        <ClientProfileCard client={client} />
      </div>

      {/* ── Client Description — who they are, in James's own words ── */}
      <ClientDescriptionCard client={client} />

      <HighLevelPlanSection
        clientId={client.id}
        initialPlan={highLevelPlan}
        currentMonthlyFreq={client.regular_frequency}
      />

      <hr className="divider" />

      {/* ── Intake Form ────────────────────────────────────────────── */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>Intake Form</h2>
          {client.form_received_at ? (
            <span className="meta" style={{ fontSize: "0.75rem" }}>
              Received {new Date(client.form_received_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          ) : null}
        </div>
        <hr className="divider" />
        <IntakeFormDisplay formData={client.form_data as Record<string, string> | null} />
      </div>

      <hr className="divider" />

      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>Programs</h2>
          <Link className="btn btn-primary" href={`/coach/programming/build?client=${client.id}`} style={{ padding: "0.35rem 0.7rem", fontSize: "0.75rem" }}>+ New program</Link>
        </div>
        <hr className="divider" />

        <div className="grid-2col" style={{ gap: "0.85rem" }}>
          <ProgramCard
            label="Sessions"
            prog={currentInGym}
            clientId={client.id}
            status={currentInGym ? "published" : "none"}
          />
          <ProgramCard
            label="Program"
            prog={currentAtHome}
            clientId={client.id}
            status={currentAtHome ? "published" : "none"}
          />
        </div>

        <PastPrograms
          clientId={client.id}
          sessions={pastSessions}
          programs={pastList.filter((p) => p.program_kind === "at_home")}
          pdfSheets={pdfSheets.map((s) => ({
            id: s.id,
            name: s.name,
            filename: s.pdf_original_filename,
            uploaded_at: s.created_at,
          }))}
        />

        <ExercisesLearnedSection clientId={client.id} />

        <WorkoutSheetsSection clientId={client.id} />
      </section>

      <hr className="divider" />

      <section className="grid-2col" style={{ marginBottom: "1.5rem" }}>
        <ClientSettings client={client} reminderPrefs={reminderPrefs} />
        <div className="card">
          <h2>Check-ins</h2>
          <hr className="divider" />
          <p className="meta">No check-ins submitted yet. Cadence: every 14 days.</p>
          <Link className="btn btn-ghost" href={`/coach/clients/${client.id}/check-ins`}>Open check-in log →</Link>
        </div>
      </section>

      <hr className="divider" />

      <section className="grid-2col">
        <div className="card">
          <h2>Upcoming sessions</h2>
          <hr className="divider" />
          {upcoming.length === 0 ? <p className="meta">No upcoming sessions.</p> : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {upcoming.map((a) => (
                <li key={a.id} className="day-card">
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <strong>{new Date(a.starts_at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</strong>
                    <span className="badge">{a.status}</span>
                  </div>
                  <p className="meta" style={{ margin: "0.25rem 0 0" }}>{fmtMoney(a.rate)} · {a.paid ? "paid" : <span style={{ color: "var(--red)" }}>unpaid</span>}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card">
          <h2>Past sessions</h2>
          <hr className="divider" />
          {past.length === 0 ? <p className="meta">No past sessions on record.</p> : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {past.slice(-8).reverse().map((a) => (
                <li key={a.id} className="day-card">
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <strong>{new Date(a.starts_at).toLocaleString("en-US", { month: "short", day: "numeric" })}</strong>
                    <Link href={`/coach/sessions/${a.id}`} className="meta">see program →</Link>
                  </div>
                  <p style={{ margin: "0.25rem 0 0" }}>{a.notes ?? <span className="meta">no notes</span>}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
