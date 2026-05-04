import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listAppointmentsForWeek, listAppointmentsForMonth, startOfWeek } from "@/lib/data";
import AppointmentsClient from "./appointments-client";

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  // Pull a generous window: current month + previous month + this week, dedupe.
  const weekStart = startOfWeek(new Date());
  const thisMonth = new Date();
  const prevMonth = new Date();
  prevMonth.setMonth(prevMonth.getMonth() - 1);

  const [week, monthA, monthB] = await Promise.all([
    listAppointmentsForWeek(user.id, weekStart),
    listAppointmentsForMonth(user.id, prevMonth),
    listAppointmentsForMonth(user.id, thisMonth)
  ]);

  const seen = new Set<string>();
  const all = [...week, ...monthA, ...monthB].filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });

  const sp = await searchParams;
  return (
    <main className="shell">
      <header>
        <span className="badge">Coach</span>
        <h1 style={{ marginTop: "0.5rem" }}>Appointments</h1>
        <p className="meta">Approve change requests, mark completed/no-show, and review history.</p>
      </header>
      <hr className="divider" />
      <AppointmentsClient initial={all} initialTab={(sp.tab === "future" || sp.tab === "past" || sp.tab === "requests") ? sp.tab : "requests"} />
    </main>
  );
}
