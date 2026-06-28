import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { getClient, listAppointmentsForClient, getClientReminderPrefs, getHighLevelPlan, listProgramsForClient } from "@/lib/data";
import { fmtMoney } from "@/lib/format";
import ClientSettings from "./client-settings";
import { CoachProfileCard, ClientProfileCard, ClientDescriptionCard } from "./client-profile-edit";
import { HighLevelPlanSection } from "./high-level-plan";
import PastPrograms, { type PastSessionItem } from "./past-programs";
import ExercisesLearnedSection from "./exercises-learned-section";
import WorkoutSheetsSection from "./workout-sheets-section";
import LogPaymentButton, { type PaymentApptRow } from "./log-payment-modal";
import IntakeFormDisplay from "@/components/intake-form-display";
import ProgramsSection from "./programs-section";
import ProgramDayLogsSection from "./program-logs-section";
import { listProgramDayLogsForClient } from "@/app/client/programming/log-actions";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach" && user.role !== "admin" && !user.is_admin) redirect("/");

  const { id } = await params;
  const [client, reminderPrefs, highLevelPlan, programs, appts, dayLogs] = await Promise.all([
    getClient(id),
    getClientReminderPrefs(id),
    getHighLevelPlan(id),
    listProgramsForClient(id),
    listAppointmentsForClient(id),
    listProgramDayLogsForClient(id),
  ]);
  if (!client) notFound();

  const past = appts.filter((a) => new Date(a.starts_at) < new Date());
  const upcoming = appts.filter((a) => new Date(a.starts_at) >= new Date());

  const pastSessions: PastSessionItem[] = past
    .filter((a) => a.session_type === "session" && a.client_id === id)
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
    .map((a) => ({
      id: a.id,
      starts_at: a.starts_at,
      program_status: a.program_status,
      session_program_id: a.session_program_id ?? null,
    }));

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
            {client.member_since ? ` · member since ${new Date(client.member_since).toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : ""}
            {client.email ? ` · ${client.email}` : ""}
            {client.lifecycle !== "active" && (
              <span style={{
                marginLeft: "0.5rem",
                background: client.lifecycle === "paused" ? "#e8f0fe" : "#fce8e8",
                color: client.lifecycle === "paused" ? "#1a56db" : "var(--red)",
                borderRadius: 4, padding: "0.1rem 0.4rem", fontSize: "0.75rem", fontWeight: 700,
              }}>{client.lifecycle}</span>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link className="btn btn-ghost" href={`/coach/messages?client=${client.id}`}>Message</Link>
          <LogPaymentButton clientName={client.full_name} appts={paymentAppts} />
          <Link className="btn btn-primary" href={`/coach/programming/build/new-way?type=program&client=${client.id}`}>New program</Link>
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

      <div className="grid-2col">
        <CoachProfileCard client={client} />
        <ClientProfileCard client={client} />
      </div>

      <ClientDescriptionCard client={client} />

      <HighLevelPlanSection
        clientId={client.id}
        initialPlan={highLevelPlan}
        currentMonthlyFreq={client.regular_frequency}
      />

      <hr className="divider" />

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
          <Link
            className="btn btn-primary"
            href={`/coach/programming/build/new-way?type=program&client=${client.id}`}
            style={{ padding: "0.35rem 0.7rem", fontSize: "0.75rem" }}
          >+ New program</Link>
        </div>
        <hr className="divider" />

        <ProgramsSection clientId={client.id} initialPrograms={programs} />

        <ProgramDayLogsSection logs={dayLogs} />

        {pastSessions.length > 0 && (
          <div style={{ marginTop: "1.25rem" }}>
            <PastPrograms
              clientId={client.id}
              sessions={pastSessions}
              programs={[]}
              pdfSheets={[]}
            />
          </div>
        )}

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
                    {a.session_program_id ? (
                      <Link
                        href={`/coach/programming/build/new-way?type=session&appt=${a.id}&client=${id}&view=plan`}
                        className="meta"
                      >see program →</Link>
                    ) : (
                      <Link
                        href={`/coach/programming/build/new-way?type=session&appt=${a.id}&client=${id}`}
                        className="meta"
                      >build →</Link>
                    )}
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
