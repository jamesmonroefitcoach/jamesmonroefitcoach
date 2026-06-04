import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listWorkoutSheets } from "@/lib/workout-sheets.server";
import SheetsClient from "./sheets-client";

export default async function ClientSheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ sheet?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "client") redirect("/");

  const { sheet: sheetId } = await searchParams;
  const sheets = await listWorkoutSheets({ clientId: user.id, limit: 50 });

  return (
    <SheetsClient
      user={{ id: user.id, name: user.name, role: user.role }}
      sheets={sheets}
      currentSheetId={sheetId ?? null}
    />
  );
}
