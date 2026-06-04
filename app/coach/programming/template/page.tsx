import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listClients } from "@/lib/data";
import WorkoutSheetEmbed, { type ClientLite } from "./workout-sheet-embed";

export default async function ProgrammingTemplatePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach" && !user.is_admin) redirect("/");

  const clients = await listClients(user.id);
  const clientLite: ClientLite[] = clients
    .filter((c) => c.full_name)
    .map((c) => ({ id: c.id, name: c.full_name }));

  return (
    <WorkoutSheetEmbed
      user={{ id: user.id, name: user.name, role: user.role }}
      clients={clientLite}
      sessions={[]}
    />
  );
}
