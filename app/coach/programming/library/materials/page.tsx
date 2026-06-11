import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import MaterialsClient from "./materials-client";

export default async function MaterialsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");
  return <MaterialsClient />;
}
