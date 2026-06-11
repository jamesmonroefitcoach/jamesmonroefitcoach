import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listMovements } from "@/lib/data";
import ClientExerciseLibraryView from "./client-exercise-library-view";

export default async function ClientExerciseLibraryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "client") redirect("/");

  const movements = await listMovements();
  return <ClientExerciseLibraryView movements={movements} />;
}
