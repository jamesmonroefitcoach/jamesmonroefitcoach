import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { listAppointmentsForClient, getClient } from "@/lib/data";
import { listClientPersonalEvents } from "@/lib/client-personal-events";
import { fmtMoney } from "@/lib/format";
import ClientUpcoming from "./client-upcoming";
import ClientSchedule from "./client-schedule";

export default async function ClientHome() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "client") redirect("/");

  const me = await getClient(user.id);
  const appts = await listAppointmentsForClient(user.id);
  const upcoming = appts.filter((a) => new Date(a.starts_at) >= new Date());
  const personalEvents = await listClientPersonalEvents(user.id);

  return (
    <main className="shell">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <span className="badge">My Portal</span>
          <h1 style={{ marginTop: "0.5rem" }}>Hi {user.name.split(" ")[0]}</h1>
          <p className="meta">{me?.goals ? `Working toward: ${me.goals}` : "Welcome to Monroe Fit Coach."}</p>
        </div>
        <Link className="btn btn-primary" href="/client/check-ins">Submit check-in</Link>
      </header>

      <hr className="divider" />

      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
        <div className="stat">
          <div className="stat-label">Cadence</div>
          <div className="stat-value">{me?.regular_frequency ?? "—"}</div>
          <div className="stat-sub">sessions / week</div>
        </div>
        <div className="stat">
          <div className="stat-label">Current weight</div>
          <div className="stat-value">{me?.current_weight_lb ?? "—"}</div>
          <div className="stat-sub">{me?.goal_weight_lb ? `goal ${me.goal_weight_lb} lb` : "no goal set"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Balance</div>
          <div className="stat-value" style={{ color: (me?.balance_owed ?? 0) > 0 ? "var(--red)" : "var(--sage)" }}>{fmtMoney(me?.balance_owed)}</div>
          <div className="stat-sub">{(me?.balance_owed ?? 0) > 0 ? "due — see invoices" : "all caught up"}</div>
        </div>
      </section>

      <hr className="divider" />

      <ClientSchedule appointments={appts} events={personalEvents} />

      <ClientUpcoming initial={upcoming} />
    </main>
  );
}
