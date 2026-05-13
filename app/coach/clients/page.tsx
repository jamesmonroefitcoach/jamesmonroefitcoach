import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listClients, listProspects, listAppointmentsForWeek, startOfWeek } from "@/lib/data";
import ClientsClient from "./clients-client";

export type NextSessionStatus = Record<string, {
  apptId: string;
  programmed: boolean;
  status: "programmed" | "draft" | "needs_programming";
}>;

export default async function ClientsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach" && user.role !== "admin" && !user.is_admin) redirect("/");

  const coachId = user.role === "coach" ? user.id : undefined;

  const thisWeekStart = startOfWeek(new Date());
  const nextWeekStart = new Date(thisWeekStart);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);

  const [clients, prospects, thisWeekAppts, nextWeekAppts] = await Promise.all([
    listClients(coachId),
    listProspects(coachId),
    listAppointmentsForWeek(coachId ?? "", thisWeekStart),
    listAppointmentsForWeek(coachId ?? "", nextWeekStart),
  ]);

  // Build a map: clientId -> the soonest upcoming session's { apptId, programmed }
  const now = new Date().toISOString();
  const nextSessionStatus: NextSessionStatus = {};
  [...thisWeekAppts, ...nextWeekAppts]
    .filter((a) =>
      a.session_type === "session" &&
      a.status !== "cancelled" &&
      a.status !== "no_show" &&
      a.client_id &&
      a.starts_at >= now
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .forEach((a) => {
      if (a.client_id && !nextSessionStatus[a.client_id]) {
        const status: "programmed" | "draft" | "needs_programming" =
          a.program_status === "programmed" ? "programmed"
          : a.program_status === "draft" ? "draft"
          : a.session_program_id ? "draft"
          : "needs_programming";
        nextSessionStatus[a.client_id] = {
          apptId: a.id,
          programmed: status === "programmed",
          status,
        };
      }
    });

  return <ClientsClient clients={clients} prospects={prospects} nextSessionStatus={nextSessionStatus} />;
}
