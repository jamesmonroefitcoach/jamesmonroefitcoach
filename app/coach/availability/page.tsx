import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listClients, listAppointmentsForWeek, startOfWeek } from "@/lib/data";
import { listSlotOffers } from "./data";
import AvailabilityClient from "./availability-client";

export default async function AvailabilityPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  const [clients, offers, weekAppts] = await Promise.all([
    listClients(user.id),
    listSlotOffers(user.id),
    listAppointmentsForWeek(user.id, startOfWeek(new Date()))
  ]);

  return (
    <main className="shell">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <span className="badge">Coach</span>
          <h1 style={{ marginTop: "0.5rem" }}>Open availability</h1>
          <p className="meta">Open up free hours to specific clients or a tier — change visibility any time.</p>
        </div>
      </header>
      <hr className="divider" />
      <AvailabilityClient clients={clients} initialOffers={offers} weekAppointments={weekAppts} />
    </main>
  );
}
