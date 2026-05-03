import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listAppointmentsForWeek } from "@/lib/data";
import { fmtMoney } from "@/lib/format";

export default async function AppointmentsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  const appts = await listAppointmentsForWeek(user.id);

  return (
    <main className="shell">
      <header>
        <span className="badge">Coach</span>
        <h1 style={{ marginTop: "0.5rem" }}>Appointments</h1>
        <p className="meta">Approve change requests, mark completed/no-show, log session notes.</p>
      </header>
      <hr className="divider" />
      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr><th>When</th><th>Client</th><th>Status</th><th>Rate</th><th>Paid</th><th>Notes</th><th></th></tr>
          </thead>
          <tbody>
            {appts.map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.starts_at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                <td>{a.client_name}</td>
                <td>
                  {a.status === "change_requested"
                    ? <span className="badge badge-amber">change requested</span>
                    : <span className="badge">{a.status}</span>}
                  {a.change_count > 0 ? <span className="meta" style={{ marginLeft: 6 }}>{a.change_count}× changed</span> : null}
                </td>
                <td>{fmtMoney(a.rate)}</td>
                <td>{a.paid ? <span className="badge badge-sage">paid</span> : <span className="badge badge-red">unpaid</span>}</td>
                <td className="meta">{a.notes ?? "—"}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="btn btn-ghost" style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem" }}>Approve</button>{" "}
                  <button className="btn btn-ghost" style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem" }}>Reschedule</button>{" "}
                  <button className="btn btn-ghost" style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem", color: "var(--red)" }}>Cancel</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
