import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listMovements } from "@/lib/data";
import ExerciseLibraryClient from "./exercise-library-client";

export default async function ExerciseLibraryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach" && !user.is_admin) redirect("/");

  const movements = await listMovements();

  return <ExerciseLibraryClient movements={movements} />;
}
