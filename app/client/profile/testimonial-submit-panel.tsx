"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitTestimonial, type Testimonial, type TestimonialStatus } from "@/app/testimonials/actions";

// Client-side testimonial submitter + status of prior submissions.
// Lives on the client profile page. Anything they write goes to James for
// approval before it can appear publicly — the status pill makes that
// crystal clear.

const STATUS_LABELS: Record<TestimonialStatus, string> = {
  new:      "Awaiting James",
  approved: "Published",
  declined: "Declined",
  hidden:   "Hidden",
};

const STATUS_COLORS: Record<TestimonialStatus, string> = {
  new:      "#3e6079",
  approved: "#5a6b4a",
  declined: "#7a6f63",
  hidden:   "#7a6f63",
};

export default function TestimonialSubmitPanel({ mine }: { mine: Testimonial[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [meta, setMeta] = useState("");
  const [before, setBefore] = useState("");
  const [after, setAfter] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setErr(null);
    start(async () => {
      const res = await submitTestimonial({
        body, meta_line: meta,
        before_image_url: before,
        after_image_url: after,
      });
      if (!res.ok) { setErr(res.error); return; }
      setBody(""); setMeta(""); setBefore(""); setAfter("");
      setDone(true);
      router.refresh();
      setTimeout(() => { setDone(false); setOpen(false); }, 2200);
    });
  }

  return (
    <div className="card" style={{ marginTop: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Share feedback</h2>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close form" : "+ Submit testimonial"}
        </button>
      </div>
      <hr className="divider" />

      <p className="meta" style={{ fontSize: "0.86rem", marginBottom: "0.6rem" }}>
        Your words help future clients decide. James reviews each one before it goes public on
        the website — no surprise publishing.
      </p>

      {open && (
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.4rem" }}>
          {done && (
            <div style={{
              padding: "0.55rem 0.75rem",
              background: "rgba(90, 107, 74, 0.12)",
              border: "1px solid var(--sage)",
              color: "#3f4d34",
              borderRadius: 3,
              fontSize: "0.86rem",
            }}>Sent to James. Thanks!</div>
          )}
          {err && (
            <div style={{
              padding: "0.55rem 0.75rem",
              background: "rgba(192,57,43,0.08)",
              border: "1px solid var(--red)",
              color: "var(--red)",
              borderRadius: 3,
              fontSize: "0.86rem",
            }}>{err}</div>
          )}

          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span style={labelStyle}>Your feedback</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              required
              placeholder="What's coaching with James been like? What changed? What would you tell a friend thinking about reaching out?"
              style={inputStyle}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span style={labelStyle}>Short subtitle <em>(optional)</em></span>
            <input
              value={meta}
              onChange={(e) => setMeta(e.target.value)}
              placeholder='e.g. "Down 18 lb · Deadlift 365" or "Boxing — sparring ready"'
              style={inputStyle}
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <span style={labelStyle}>Before photo URL <em>(optional)</em></span>
              <input
                type="url"
                value={before}
                onChange={(e) => setBefore(e.target.value)}
                placeholder="https://…"
                style={inputStyle}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <span style={labelStyle}>After photo URL <em>(optional)</em></span>
              <input
                type="url"
                value={after}
                onChange={(e) => setAfter(e.target.value)}
                placeholder="https://…"
                style={inputStyle}
              />
            </label>
          </div>

          <p className="meta" style={{ fontSize: "0.76rem", marginTop: "0.2rem" }}>
            Paste image links if you already have them online. (Direct upload coming soon — for now,
            you can also just write the feedback and send photos to James separately.)
          </p>

          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >Cancel</button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={pending}
            >{pending ? "Sending…" : "Send to James"}</button>
          </div>
        </form>
      )}

      {/* Status of previously-submitted testimonials */}
      {mine.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <h3 style={{ fontSize: "0.78rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "0.5rem" }}>
            Your past submissions
          </h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {mine.map((t) => (
              <li key={t.id} style={{
                background: "var(--paper)",
                border: "1px solid var(--line)",
                borderRadius: 3,
                padding: "0.55rem 0.7rem",
                fontSize: "0.86rem",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <span style={{
                    display: "inline-flex",
                    background: STATUS_COLORS[t.status],
                    color: "var(--bg)",
                    fontSize: "0.7rem",
                    padding: "0.1rem 0.45rem",
                    borderRadius: 2,
                    fontFamily: "var(--font-heading), Oswald, sans-serif",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}>{STATUS_LABELS[t.status]}</span>
                  <span className="meta" style={{ fontSize: "0.74rem" }}>
                    {new Date(t.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div style={{ marginTop: "0.3rem", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{t.body}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: "0.72rem",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--muted)",
  fontFamily: "var(--font-heading), Oswald, sans-serif",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg)",
  border: "1px solid var(--line)",
  borderRadius: 3,
  padding: "0.5rem 0.65rem",
  font: "inherit",
  color: "var(--ink)",
  fontSize: "0.92rem",
};
