"use client";
import { useState, useTransition } from "react";
import { submitCheckIn, uploadProgressPhoto } from "./actions";

export default function CheckInForm() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setMsg(null);
    setErr(null);
    start(async () => {
      const res = await submitCheckIn({
        weight_lb: numOrNull(formData.get("weight_lb")),
        sleep_recovery: numOrNull(formData.get("sleep_recovery")),
        satisfaction: numOrNull(formData.get("satisfaction")),
        nutrition_conf: numOrNull(formData.get("nutrition_conf")),
        commitment: numOrNull(formData.get("commitment")),
        injuries: strOrNull(formData.get("injuries")),
        challenges: strOrNull(formData.get("challenges")),
        improvement_text: strOrNull(formData.get("improvement_text")),
        goals_text: strOrNull(formData.get("goals_text"))
      });
      if (!res.ok) {
        if (res.error.startsWith("Supabase not configured")) {
          setMsg("Saved locally — Supabase not configured yet, but the form works.");
        } else {
          setErr(res.error);
        }
        return;
      }
      const checkInId = res.data.id;

      // Upload any photos
      const files = formData.getAll("photos") as File[];
      for (const f of files) {
        if (!(f instanceof File) || f.size === 0) continue;
        const fd = new FormData();
        fd.set("file", f);
        fd.set("view", inferViewFromName(f.name));
        fd.set("check_in_id", checkInId);
        await uploadProgressPhoto(fd);
      }
      setMsg("Check-in submitted. Thanks!");
    });
  }

  return (
    <form action={onSubmit} className="card" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div>
        <label className="stat-label">Current weight (lb)</label>
        <input className="input" name="weight_lb" type="number" inputMode="decimal" placeholder="e.g. 178" style={{ marginTop: "0.3rem" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.6rem" }}>
        <div>
          <label className="stat-label">Sleep & recovery (1–5)</label>
          <input className="input" name="sleep_recovery" type="number" min={1} max={5} style={{ marginTop: "0.3rem" }} />
        </div>
        <div>
          <label className="stat-label">Satisfaction (1–5)</label>
          <input className="input" name="satisfaction" type="number" min={1} max={5} style={{ marginTop: "0.3rem" }} />
        </div>
        <div>
          <label className="stat-label">Commitment (1–10)</label>
          <input className="input" name="commitment" type="number" min={1} max={10} style={{ marginTop: "0.3rem" }} />
        </div>
      </div>
      <div>
        <label className="stat-label">New injuries / pain / limitations?</label>
        <textarea className="textarea" name="injuries" rows={2} style={{ marginTop: "0.3rem" }} />
      </div>
      <div>
        <label className="stat-label">What's gotten in the way recently?</label>
        <textarea className="textarea" name="challenges" rows={2} style={{ marginTop: "0.3rem" }} />
      </div>
      <div>
        <label className="stat-label">Where do you want more support?</label>
        <textarea className="textarea" name="improvement_text" rows={2} style={{ marginTop: "0.3rem" }} />
      </div>
      <div>
        <label className="stat-label">Progress photos (front · back · left · right)</label>
        <p className="meta" style={{ marginTop: "0.3rem", fontSize: "0.78rem" }}>Optional. Filename hints "front/back/left/right" auto-tag the view.</p>
        <input className="input" name="photos" type="file" multiple accept="image/*" style={{ marginTop: "0.3rem" }} />
      </div>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Submitting…" : "Submit check-in"}
      </button>
      {msg ? <p style={{ color: "var(--sage)", margin: 0 }}>{msg}</p> : null}
      {err ? <p style={{ color: "var(--red)", margin: 0 }}>{err}</p> : null}
    </form>
  );
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function strOrNull(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}
function inferViewFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("front")) return "front";
  if (lower.includes("back")) return "back";
  if (lower.includes("left")) return "left";
  if (lower.includes("right")) return "right";
  return "other";
}
