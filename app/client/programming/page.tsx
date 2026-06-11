import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listProgramsForClient } from "@/lib/data";
import ViewProgramsClient from "./view-programs-client";

// Client Programming → View
// Two collapsibles: Current (anything with is_current=true) and Completed
// (everything else). Tap a Current row → program detail with the
// Sheet vs In-App Inputs completion choice.
export default async function ClientProgrammingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "client") redirect("/");

  const programs = await listProgramsForClient(user.id);
  const current = programs.filter((p) => p.is_current);
  const completed = programs.filter((p) => !p.is_current);

  return <ViewProgramsClient current={current} completed={completed} />;
}
