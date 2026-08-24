import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import WeekPlanEmbed from "./week-plan-embed";

// Coach-only printable week plan. Deliberately not exposed to clients: this
// is the sheet James types up and sends to people who don't use the portal.
export default async function CoachWeekPlanPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  return (
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header className="no-print">
        <span className="badge">Coach</span>
        <h1 style={{ marginTop: "0.5rem" }}>Week Plan</h1>
        <p className="meta">
          A blank Monday through Sunday sheet you fill in yourself. Type the week, hit Save PDF,
          then email or text it. The file goes out flat, so nobody can change it on their end.{" "}
          <a href="/week-plan.html" target="_blank" rel="noopener noreferrer">
            Open in its own tab
          </a>
          .
        </p>
      </header>
      <WeekPlanEmbed />
    </main>
  );
}
