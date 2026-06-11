import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listMovements, listProgramsForClient } from "@/lib/data";
import ClientBuildProgram from "../client-build-program";

// In App Build — the structured Day/Week builder (mirrors the coach's
// in-app builder, scoped to the client building for themselves).
export default async function ClientInAppBuildPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "client") redirect("/");

  const [libraryMovements, pastPrograms] = await Promise.all([
    listMovements(),
    listProgramsForClient(user.id),
  ]);

  return (
    <ClientBuildProgram
      libraryMovements={libraryMovements}
      pastPrograms={pastPrograms}
    />
  );
}
