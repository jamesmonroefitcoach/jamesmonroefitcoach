import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listClients } from "@/lib/data";
import { listWorkoutSheets } from "@/lib/workout-sheets.server";
import TemplateClient from "./template-client";
import type { ClientLite } from "./workout-sheet-embed";

export default async function ProgrammingTemplatePage({
  searchParams,
}: {
  searchParams: Promise<{ sheet?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach" && !user.is_admin) redirect("/");

  const { sheet: sheetId } = await searchParams;
  const [clients, sheets] = await Promise.all([
    listClients(user.id),
    listWorkoutSheets({ coachId: user.id, limit: 30 }),
  ]);
  const clientLite: ClientLite[] = clients
    .filter((c) => c.full_name)
    .map((c) => ({ id: c.id, name: c.full_name }));

  return (
    <TemplateClient
      user={{ id: user.id, name: user.name, role: user.role }}
      clients={clientLite}
      sheets={sheets}
      currentSheetId={sheetId ?? null}
    />
  );
}
