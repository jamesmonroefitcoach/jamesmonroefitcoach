import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import WorkoutSheetEmbed from "./workout-sheet-embed";

export default async function ProgrammingTemplatePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");
  return <WorkoutSheetEmbed />;
}
