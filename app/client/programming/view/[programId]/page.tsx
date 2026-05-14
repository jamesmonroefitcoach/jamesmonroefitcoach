import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getProgramForClient } from "@/lib/data";
import ClientProgramLogView from "./client-program-log-view";

export default async function ClientProgramViewPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "client") redirect("/");

  const { programId } = await params;
  const prog = await getProgramForClient(programId, user.id);
  if (!prog) return notFound();

  return <ClientProgramLogView program={prog} clientId={user.id} />;
}
