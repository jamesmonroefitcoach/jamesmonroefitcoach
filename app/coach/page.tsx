import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { listClients, listAppointmentsForWeek, countOpenRequests, listCoachThreads, startOfWeek } from "@/lib/data";
import { fmtMoney } from "@/lib/format";
import { pastProgramsForClient } from "@/lib/programs";
import TodoBlock from "./todo-block";
import WeekBanners from "./week-banners";
import type { WeekSessionItem, WeekProgramItem, NoSessionClient } from "./week-banners";

function fmtDaysAway(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `in ${days}d`;
}

export default async function CoachDashboard() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  const [clients, appts, openReq, threads] = await Promise.all([
    listClients(user.id),
    listAppointmentsForWeek(user.id),
    countOpenRequests(user.id),
    listCoachThreads(user.id)
  ]);

  const hours = appts.reduce((acc, a) => {
    const ms = new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime();
    return acc + ms / (1000 * 60 * 60);
  }, 0);
  const dollars = appts.reduce((acc, a) => acc + (a.rate ?? 0), 0);
  const weekStart = startOfWeek(new Date());
  const weekStartLabel = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  // Build a map of client_id → current at-home program end info (for Program column)
  const now = Date.now();
  const clientProgramInfo = new Map<string, { endsOn: string | null; daysLeft: number | null; name: string | null }>();
  for (const c of clients) {
    const current = pastProgramsForClient(c.id).find(
      (p) => p.is_current && p.program_kind === "at_home"
    ) ?? null;
    const daysLeft = current?.ends_on
      ? Math.ceil((new Date(current.ends_on).getTime() - now) / 86400000)
      : null;
    clientProgramInfo.set(c.id, {
      endsOn: current?.ends_on ?? null,
      daysLeft,
      name: current?.name ?? null,
    });
  }

  // ── Banner datasets ────────────────────────────────────────────────────────

  const weekSessions: WeekSessionItem[] = appts
    .filter((a) => a.session_type === "session" && a.status !== "cancelled" && a.status !== "no_show" && !!a.client_id)
    .map((a) => ({
      id: a.id,
      client_id: a.client_id!,
      client_name: a.client_name,
      starts_at: a.starts_at,
      is_programmed: a.program_status === "programmed" || !!a.session_program_id,
    }))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const activeClients = clients.filter((c) => c.lifecycle === "active");

  const weekProgramItems: WeekProgramItem[] = activeClients.map((c) => {
    const current = pastProgramsForClient(c.id).find(
      (p) => p.is_current && p.program_kind === "at_home"
    ) ?? null;
    const daysUntilEnd = current?.ends_on
      ? Math.ceil((new Date(current.ends_on).getTime() - now) / 86400000)
      : null;
    return {
      clientId: c.id,
      clientName: c.full_name,
      programName: current?.name ?? null,
      endsOn: current?.ends_on ?? null,
      daysUntilEnd,
      hasCurrent: !!current,
    };
  });

  const sessionClientIds = new Set(weekSessions.map((s) => s.client_id));
  const noSessionClients: NoSessionClient[] = activeClients
    .filter((c) => !sessionClientIds.has(c.id))
    .map((c) => ({ id: c.id, name: c.full_name }));

  return (
    <main className="shell">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <span className="badge">Coach Dashboard</span>
          <h1 style={{ marginTop: "0.5rem" }}>Week of {weekStartLabel}</h1>
          <p className="meta">Hi {user.name.split(" ")[0]} — here's what's on the floor.</p>
        </div>
      </header>

      <hr className="divider" />

      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
        <div className="stat">
          <div className="stat-label">Hours this week</div>
          <div className="stat-value">{hours.toFixed(1)}</div>
          <div className="stat-sub">{appts.length} sessions booked</div>
        </div>
        <div className="stat">
          <div className="stat-label">Revenue this week</div>
          <div className="stat-value">{fmtMoney(dollars)}</div>
          <div className="stat-sub">at booked rates</div>
        </div>
        <div className="stat">
          <div className="stat-label">Active Clients</div>
          <div className="stat-value">{clients.filter((c) => c.lifecycle === "active").length}</div>
          <div className="stat-sub">{clients.filter((c) => c.balance_owed > 0).length} with balance</div>
        </div>
        <div className="stat">
          <div className="stat-label">Open requests</div>
          <div className="stat-value" style={{ color: openReq > 0 ? "var(--rust)" : undefined }}>{openReq}</div>
          <div className="stat-sub">change requests + DMs</div>
        </div>
      </section>

      <hr className="divider" />

      <section style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1.25rem" }}>
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2>This week</h2>
            <Link href="/coach/schedule" className="meta">Full schedule →</Link>
          </div>
          <hr className="divider" />
          <WeekBanners
            sessions={weekSessions}
            programs={weekProgramItems}
            noSessions={noSessionClients}
          />
          {appts.length === 0 ? (
            <p className="meta">No sessions booked yet this week.</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>When</th><th>Client</th><th>Rate</th><th>Status</th><th>Program</th></tr>
              </thead>
              <tbody>
                {appts.map((a) => {
                  const isProgrammed = a.program_status === "programmed" || !!a.session_program_id;
                  const isSession = a.session_type === "session" && !!a.client_id;
                  const sessionDate = new Date(a.starts_at);
                  const prog = a.client_id ? clientProgramInfo.get(a.client_id) : null;
                  return (
                  <tr key={a.id}>
                    <td>
                      {sessionDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      <br /><span className="meta">{sessionDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                    </td>
                    <td>{a.client_name ?? <span className="meta">{a.personal_label ?? "—"}</span>}</td>
                    <td>{fmtMoney(a.rate)}</td>
                    <td>
                      <div className="meta" style={{ fontSize: "0.7rem", marginBottom: "0.25rem" }}>
                        {sessionDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {fmtDaysAway(sessionDate)}
                      </div>
                      {a.change_count > 0 ? <span className="badge badge-amber">{a.change_count}× changed</span> : <span className="badge">{a.status}</span>}
                    </td>
                    <td>
                      {isSession ? (
                        <>
                          {prog ? (
                            <div className="meta" style={{ fontSize: "0.7rem", marginBottom: "0.25rem", whiteSpace: "nowrap" }}>
                              {prog.endsOn
                                ? <>
                                    {new Date(prog.endsOn).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                    {" · "}
                                    <span style={{ color: prog.daysLeft !== null && prog.daysLeft <= 7 ? "var(--amber)" : undefined }}>
                                      {prog.daysLeft !== null
                                        ? prog.daysLeft <= 0 ? "expired" : `${prog.daysLeft}d left`
                                        : "no end"}
                                    </span>
                                  </>
                                : <span style={{ color: "var(--muted)" }}>No current program</span>
                              }
                            </div>
                          ) : null}
                          <Link
                            href={`/coach/build-program?tab=session&client=${a.client_id}&appt=${a.id}`}
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: 600,
                              padding: "0.15rem 0.45rem",
                              borderRadius: 3,
                              border: `1px solid ${isProgrammed ? "var(--sage)" : "var(--amber)"}`,
                              color: isProgrammed ? "var(--sage)" : "var(--amber)",
                              background: isProgrammed ? "rgba(90,107,74,0.07)" : "rgba(217,119,6,0.07)",
                              textDecoration: "none",
                              whiteSpace: "nowrap",
                              display: "inline-block",
                            }}
                          >
                            {isProgrammed ? "Programmed →" : "Not Programmed →"}
                          </Link>
                        </>
                      ) : <span className="meta">—</span>}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2>Inbox</h2>
              <Link href="/coach/messages" className="meta">All →</Link>
            </div>
            <hr className="divider" />
            {threads.length === 0 ? (
              <p className="meta">No messages.</p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                {threads.slice(0, 6).map((t) => (
                  <li key={t.id} style={{ borderLeft: t.unread ? "3px solid var(--rust)" : "3px solid transparent", paddingLeft: "0.6rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <strong>{t.client_name}</strong>
                      <span className="meta">{t.last_at ? new Date(t.last_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : ""}</span>
                    </div>
                    <p style={{ margin: 0 }} className="meta">{t.last_message}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <TodoBlock />
        </div>
      </section>
    </main>
  );
}
