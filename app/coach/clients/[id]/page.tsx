import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { getClient, listAppointmentsForClient, getClientReminderPrefs } from "@/lib/data";
import { pastProgramsForClient, isExpiringSoon, CATEGORY_LABELS, PROGRAM_KIND_LABEL, type Category, type PastProgramFull } from "@/lib/programs";
import { fmtMoney, fmtDate } from "@/lib/format";
import ClientSettings from "./client-settings";
import { CoachProfileCard, ClientProfileCard } from "./client-profile-edit";

const FORM_SECTIONS: { title: string; keys: string[] }[] = [
  {
    title: "General Info",
    keys: ["Phone", "Birthday"],
  },
  {
    title: "Goals & Progress",
    keys: [
      "Training goals",
      "Primary goal / motivation",
      "Strengths / most improved",
      "Needs most improvement",
      "Satisfaction with training (1-5)",
      "Exercises to learn / work on",
      "Commitment (1-10)",
    ],
  },
  {
    title: "Nutrition, Injuries & Weight",
    keys: [
      "Nutrition confidence (1-5)",
      "Nutrition tracking",
      "Activity level outside training (1-5)",
      "Self-exercise days per week",
      "Sleep / recovery (1-5)",
      "Injuries / limitations",
      "Height",
      "Starting weight (lbs)",
      "Current weight (lbs)",
    ],
  },
  {
    title: "Scheduling",
    keys: [
      "Sessions per month (preferred)",
      "Available days",
      "Available times",
      "Ideal session times",
      "Preferred coaching style",
      "Past consistency barriers",
      "Time frame",
    ],
  },
  {
    title: "Additional Feedback",
    keys: ["Additional requests / notes", "Questions / feedback"],
  },
];

function ProgramCard({ label, prog, clientId }: { label: string; prog: PastProgramFull | null; clientId: string }) {
  if (!prog) {
    return (
      <div className="card" style={{ padding: "0.85rem" }}>
        <span className="badge">{label}</span>
        <p className="meta" style={{ marginTop: "0.5rem" }}>No active {label.toLowerCase()} program. <Link href={`/coach/build-program?client=${clientId}`}>Build one →</Link></p>
      </div>
    );
  }
  const expiring = isExpiringSoon(prog);
  return (
    <div className="day-card" style={{ borderLeftColor: expiring ? "var(--red)" : "var(--rust)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="badge badge-rust">{label}</span>
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
        <Link className="btn btn-ghost" href={`/coach/build-program?client=${clientId}`} style={{ padding: "0.3rem 0.6rem", fontSize: "0.74rem" }}>edit</Link>
      </div>
    </div>
  );
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach" && user.role !== "admin") redirect("/");

  const { id } = await params;
  const [client, reminderPrefs] = await Promise.all([
    getClient(id),
    getClientReminderPrefs(id),
  ]);
  if (!client) notFound();
  const appts = await listAppointmentsForClient(id);
  const past = appts.filter((a) => new Date(a.starts_at) < new Date());
  const upcoming = appts.filter((a) => new Date(a.starts_at) >= new Date());
  const programs = pastProgramsForClient(id);
  const currentInGym = programs.find((p) => p.is_current && p.program_kind === "in_gym") ?? null;
  const currentAtHome = programs.find((p) => p.is_current && p.program_kind === "at_home") ?? null;
  const pastList = programs.filter((p) => !p.is_current);

  return (
    <main className="shell">
      <Link href="/coach/clients" className="meta">← All clients</Link>
      <header style={{ marginTop: "0.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <span className="badge">Client</span>
          <h1 style={{ marginTop: "0.5rem" }}>{client.full_name}</h1>
          <p className="meta">
            {client.tier?.replace("_", " ") ?? "—"}
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
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link className="btn btn-ghost" href={`/coach/messages?client=${client.id}`}>Message</Link>
          <Link className="btn btn-primary" href={`/coach/build-program?client=${client.id}`}>New program</Link>
        </div>
      </header>

      <hr className="divider" />

      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
        <div className="stat">
          <div className="stat-label">Cadence</div>
          <div className="stat-value">{client.regular_frequency ?? "—"}</div>
          <div className="stat-sub">sessions / week</div>
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", alignItems: "start" }}>
        <CoachProfileCard client={client} />
        <ClientProfileCard client={client} />
      </div>

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
        {!client.form_data ? (
          <p className="meta" style={{ fontStyle: "italic" }}>No form received yet.</p>
        ) : (
          <details open>
            <summary style={{ cursor: "pointer", fontSize: "0.82rem", fontWeight: 600, color: "var(--rust)", userSelect: "none" }}>
              View full response ▾
            </summary>
            <div style={{ margin: "0.85rem 0 0", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {FORM_SECTIONS.map(({ title, keys }) => {
                const entries = keys
                  .filter((k) => (client.form_data as Record<string, string>)[k] != null && (client.form_data as Record<string, string>)[k] !== "")
                  .map((k) => [k, (client.form_data as Record<string, string>)[k]] as [string, string]);
                if (entries.length === 0) return null;
                return (
                  <div key={title}>
                    <div style={{
                      fontSize: "0.69rem", fontWeight: 700, textTransform: "uppercase",
                      letterSpacing: "0.08em", color: "var(--rust)", marginBottom: "0.5rem",
                      paddingBottom: "0.25rem", borderBottom: "1px solid var(--line)",
                    }}>
                      {title}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "0.35rem 2rem" }}>
                      {entries.map(([q, a]) => (
                        <div key={q} style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "0.2rem 0.65rem", alignItems: "baseline" }}>
                          <span className="meta" style={{ fontSize: "0.74rem", whiteSpace: "nowrap" }}>{q}</span>
                          <span style={{ fontSize: "0.84rem" }}>{a}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {/* Catch-all: any keys not covered by a defined section */}
              {(() => {
                const covered = new Set(FORM_SECTIONS.flatMap((s) => s.keys));
                const extra = Object.entries(client.form_data as Record<string, string>)
                  .filter(([k]) => !covered.has(k) && k !== "Phone" && k !== "Birthday");
                if (extra.length === 0) return null;
                return (
                  <div key="other">
                    <div style={{
                      fontSize: "0.69rem", fontWeight: 700, textTransform: "uppercase",
                      letterSpacing: "0.08em", color: "var(--rust)", marginBottom: "0.5rem",
                      paddingBottom: "0.25rem", borderBottom: "1px solid var(--line)",
                    }}>
                      Other
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "0.35rem 2rem" }}>
                      {extra.map(([q, a]) => (
                        <div key={q} style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "0.2rem 0.65rem", alignItems: "baseline" }}>
                          <span className="meta" style={{ fontSize: "0.74rem", whiteSpace: "nowrap" }}>{q}</span>
                          <span style={{ fontSize: "0.84rem" }}>{a}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </details>
        )}
      </div>

      <hr className="divider" />

      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>Programs</h2>
          <Link className="btn btn-primary" href={`/coach/build-program?client=${client.id}`} style={{ padding: "0.35rem 0.7rem", fontSize: "0.75rem" }}>+ New program</Link>
        </div>
        <hr className="divider" />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem", alignItems: "start" }}>
          <ProgramCard label="Sessions" prog={currentInGym} clientId={client.id} />
          <ProgramCard label="Program" prog={currentAtHome} clientId={client.id} />
        </div>

        {pastList.length > 0 ? (
          <>
            <h3 style={{ marginTop: "1rem", fontSize: "0.75rem" }}>Past programs</h3>
            <table className="table">
              <thead>
                <tr><th>Program</th><th>Type</th><th>Window</th><th>Days</th><th>Mix</th></tr>
              </thead>
              <tbody>
                {pastList.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong></td>
                    <td className="meta" style={{ fontSize: "0.78rem" }}>{PROGRAM_KIND_LABEL[p.program_kind]}</td>
                    <td className="meta">
                      {p.program_kind === "at_home"
                        ? `${fmtDate(p.starts_on)} → ${fmtDate(p.ends_on)}`
                        : <span style={{ fontStyle: "italic" }}>on schedule</span>}
                    </td>
                    <td>{p.day_count}</td>
                    <td className="meta" style={{ fontSize: "0.78rem" }}>
                      {Object.entries(p.category_counts).map(([k, v]) => `${v} ${CATEGORY_LABELS[k as Category].toLowerCase()}`).join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}
      </section>

      <hr className="divider" />

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", marginBottom: "1.5rem", alignItems: "start" }}>
        <ClientSettings client={client} reminderPrefs={reminderPrefs} />
        <div className="card">
          <h2>Check-ins</h2>
          <hr className="divider" />
          <p className="meta">No check-ins submitted yet. Cadence: every 14 days.</p>
          <Link className="btn btn-ghost" href={`/coach/clients/${client.id}/check-ins`}>Open check-in log →</Link>
        </div>
      </section>

      <hr className="divider" />

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
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
