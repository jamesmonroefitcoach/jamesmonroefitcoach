"use client";
import { useState, useTransition } from "react";
import { submitSignupRequest } from "@/app/admin/actions";

export default function SignupForm() {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setErr(null);
    start(async () => {
      const res = await submitSignupRequest({
        full_name: String(formData.get("full_name") ?? ""),
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? "") || null,
        message: String(formData.get("message") ?? "") || null
      });
      if (!res.ok) {
        if (res.error.startsWith("Supabase not configured")) {
          setDone(true);
        } else {
          setErr(res.error);
        }
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <p style={{ color: "var(--sage)" }}>
        Thanks — your request is in. James will text or email you soon.
      </p>
    );
  }

  return (
    <form action={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
      <div>
        <label className="stat-label">Your name</label>
        <input name="full_name" className="input" required style={{ marginTop: "0.3rem" }} />
      </div>
      <div>
        <label className="stat-label">Email</label>
        <input name="email" type="email" className="input" required style={{ marginTop: "0.3rem" }} />
      </div>
      <div>
        <label className="stat-label">Phone (optional)</label>
        <input name="phone" className="input" placeholder="512-555-…" style={{ marginTop: "0.3rem" }} />
      </div>
      <div>
        <label className="stat-label">What are you working on?</label>
        <textarea name="message" rows={4} className="textarea" placeholder="Goals, sport, prior training, anything James should know" style={{ marginTop: "0.3rem" }} />
      </div>
      <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "Sending…" : "Submit request"}</button>
      {err ? <p style={{ color: "var(--red)" }}>{err}</p> : null}
    </form>
  );
}
