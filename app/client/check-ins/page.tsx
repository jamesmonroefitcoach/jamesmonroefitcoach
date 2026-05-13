import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import CheckInForm from "./check-in-form";
import SessionFollowups from "./session-followups";

export default async function ClientCheckInsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "client") redirect("/");

  return (
    <main className="shell">
      <header>
        <span className="badge">Check-in</span>
        <h1 style={{ marginTop: "0.5rem" }}>How are things going?</h1>
        <p className="meta">This replaces the Google Form survey. James reviews these on your check-in cadence.</p>
      </header>
      <hr className="divider" />
      <SessionFollowups clientId={user.id} />
      <CheckInForm />
    </main>
  );
}
