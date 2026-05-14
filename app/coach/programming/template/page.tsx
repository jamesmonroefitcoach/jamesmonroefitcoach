import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import TemplatePrintout from "./template-printout";

export default async function ProgrammingTemplatePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");
  return <TemplatePrintout />;
}
