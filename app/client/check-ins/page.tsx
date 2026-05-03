import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";

export default async function ClientCheckInsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "client") redirect("/");

  return (
    <main className="shell">
      <header>
        <span className="badge">Check-in</span>
        <h1 style={{ marginTop: "0.5rem" }}>How are things going?</h1>
        <p className="meta">This replaces the Google Form survey. James reviews these every {`<cadence>`} days.</p>
      </header>
      <hr className="divider" />
      <form className="card" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <label className="stat-label">Current weight (lb)</label>
          <input className="input" type="number" inputMode="decimal" placeholder="e.g. 178" style={{ marginTop: "0.3rem" }} />
        </div>
        <div>
          <label className="stat-label">Sleep & recovery (1–5)</label>
          <input className="input" type="number" min={1} max={5} style={{ marginTop: "0.3rem" }} />
        </div>
        <div>
          <label className="stat-label">Satisfaction with training so far (1–5)</label>
          <input className="input" type="number" min={1} max={5} style={{ marginTop: "0.3rem" }} />
        </div>
        <div>
          <label className="stat-label">Any new injuries / pain / limitations?</label>
          <textarea className="textarea" rows={3} style={{ marginTop: "0.3rem" }} />
        </div>
        <div>
          <label className="stat-label">What's gotten in the way recently?</label>
          <textarea className="textarea" rows={3} style={{ marginTop: "0.3rem" }} />
        </div>
        <div>
          <label className="stat-label">Progress photos</label>
          <p className="meta" style={{ marginTop: "0.3rem" }}>Front · Back · Left · Right (optional). Wired up next phase.</p>
          <input className="input" type="file" multiple accept="image/*" style={{ marginTop: "0.3rem" }} disabled />
        </div>
        <button className="btn btn-primary" type="button">Submit check-in</button>
      </form>
    </main>
  );
}
