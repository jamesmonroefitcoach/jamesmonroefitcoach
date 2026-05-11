import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.is_admin || user.role === "admin") redirect("/admin");
  if (user.role === "coach") redirect("/coach");
  redirect("/client");
}
