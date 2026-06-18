import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listClients } from "@/lib/data";
import { listWorkoutSheets } from "@/lib/workout-sheets.server";
import TemplateClient from "@/app/coach/programming/build/template/template-client";

// Top-level Templates page — a thin wrapper over the existing
// TemplateClient (header + recent-sheets grid + embedded workout-sheet
// iframe). Lets James download and use templates without going through
// the Build Program builder, which he isn't ready for yet.
export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  const sp = await searchParams;
  const sheetParam = typeof sp.sheet === "string" ? sp.sheet : null;

  const [clients, sheets] = await Promise.all([
    listClients(user.id),
    listWorkoutSheets({ coachId: user.id, limit: 50 }),
  ]);

  return (
    <TemplateClient
      user={{ id: user.id, name: user.name, role: user.role }}
      clients={clients.map((c) => ({ id: c.id, name: c.full_name }))}
      sheets={sheets}
      currentSheetId={sheetParam}
    />
  );
}
