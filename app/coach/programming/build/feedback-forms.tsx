"use client";
import { useState } from "react";

// ─── Pre-session block (How do you feel, are you sore) ───────────────────────
export function PreSessionForm({
  initial,
  onSubmit,
}: {
  initial?: { feel?: string; sore?: string; submitted_at?: string };
  onSubmit: (a: { feel: string; sore: string }) => void;
}) {
  const [feel, setFeel] = useState(initial?.feel ?? "");
  const [sore, setSore] = useState(initial?.sore ?? "");
  const [editing, setEditing] = useState(!initial?.submitted_at);

  if (!editing && initial?.submitted_at) {
    return (
      <div className="card" style={{ borderLeft: "4px solid var(--clay)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem", flexWrap: "wrap" }}>
          <div>
            <span className="badge" style={{ background: "var(--clay)", color: "#fff", border: "none" }}>Pre-session</span>
            <div className="meta" style={{ fontSize: "0.7rem", marginTop: "0.25rem" }}>
              submitted {new Date(initial.submitted_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </div>
          </div>
          <button className="btn btn-ghost" style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }} onClick={() => setEditing(true)}>✎ Edit</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "0.35rem 0.85rem", marginTop: "0.6rem", fontSize: "0.84rem" }}>
          <span className="meta">Feel</span><span>{initial.feel || "—"}</span>
          <span className="meta">Sore</span><span>{initial.sore || "—"}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ borderLeft: "4px solid var(--clay)" }}>
      <span className="badge" style={{ background: "var(--clay)", color: "#fff", border: "none" }}>Pre-session</span>
      <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <label style={{ fontSize: "0.82rem" }}>
          <div className="stat-label" style={{ marginBottom: "0.2rem" }}>How do you feel today?</div>
          <textarea
            className="textarea"
            rows={2}
            value={feel}
            onChange={(e) => setFeel(e.target.value)}
            style={{ fontSize: "0.84rem", padding: "0.35rem 0.5rem", resize: "vertical" }}
          />
        </label>
        <label style={{ fontSize: "0.82rem" }}>
          <div className="stat-label" style={{ marginBottom: "0.2rem" }}>Are you sore? If so, where?</div>
          <textarea
            className="textarea"
            rows={2}
            value={sore}
            onChange={(e) => setSore(e.target.value)}
            style={{ fontSize: "0.84rem", padding: "0.35rem 0.5rem", resize: "vertical" }}
          />
        </label>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.4rem" }}>
          {initial?.submitted_at && (
            <button className="btn btn-ghost" style={{ fontSize: "0.78rem" }} onClick={() => setEditing(false)}>Cancel</button>
          )}
          <button
            className="btn btn-primary"
            style={{ fontSize: "0.78rem" }}
            onClick={() => { onSubmit({ feel: feel.trim(), sore: sore.trim() }); setEditing(false); }}
          >Submit</button>
        </div>
      </div>
    </div>
  );
}

// ─── Post-completion (intensity, hardest, comments) ──────────────────────────
export type PostAnswersDraft = { intensity: string; hardest: string; comments: string };

export function PostFeedbackForm({
  title = "Feedback",
  onSubmit,
  onCancel,
  compact = false,
}: {
  title?: string;
  onSubmit: (a: PostAnswersDraft) => void;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const [intensity, setIntensity] = useState<string>("");
  const [hardest, setHardest] = useState("");
  const [comments, setComments] = useState("");

  function handleSubmit() {
    onSubmit({ intensity: intensity.trim(), hardest: hardest.trim(), comments: comments.trim() });
  }

  return (
    <div className="card" style={{ borderLeft: "4px solid var(--sage)", padding: compact ? "0.85rem 1rem" : undefined }}>
      <span className="badge badge-sage">{title}</span>
      <div style={{ marginTop: "0.65rem", display: "flex", flexDirection: "column", gap: "0.55rem" }}>
        <label style={{ fontSize: "0.82rem" }}>
          <div className="stat-label" style={{ marginBottom: "0.2rem" }}>Rate intensity (1-10)</div>
          <input
            className="input"
            type="number"
            min={1}
            max={10}
            value={intensity}
            onChange={(e) => setIntensity(e.target.value)}
            style={{ width: 90, fontSize: "0.84rem", padding: "0.3rem 0.5rem" }}
          />
        </label>
        <label style={{ fontSize: "0.82rem" }}>
          <div className="stat-label" style={{ marginBottom: "0.2rem" }}>What was the hardest and why?</div>
          <textarea
            className="textarea"
            rows={2}
            value={hardest}
            onChange={(e) => setHardest(e.target.value)}
            style={{ fontSize: "0.84rem", padding: "0.35rem 0.5rem", resize: "vertical" }}
          />
        </label>
        <label style={{ fontSize: "0.82rem" }}>
          <div className="stat-label" style={{ marginBottom: "0.2rem" }}>Any additional questions or comments?</div>
          <textarea
            className="textarea"
            rows={2}
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            style={{ fontSize: "0.84rem", padding: "0.35rem 0.5rem", resize: "vertical" }}
          />
        </label>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.4rem" }}>
          {onCancel && <button className="btn btn-ghost" style={{ fontSize: "0.78rem" }} onClick={onCancel}>Cancel</button>}
          <button
            className="btn btn-primary"
            style={{ fontSize: "0.78rem" }}
            onClick={handleSubmit}
          >Submit</button>
        </div>
      </div>
    </div>
  );
}

// ─── Read-only display of submitted post answers ─────────────────────────────
export function PostAnswersDisplay({
  answers,
  title = "Feedback",
}: {
  answers: { intensity: string; hardest: string; comments: string; submitted_at: string };
  title?: string;
}) {
  return (
    <div className="card" style={{ borderLeft: "4px solid var(--sage)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span className="badge badge-sage">{title}</span>
        <span className="meta" style={{ fontSize: "0.7rem" }}>
          submitted {new Date(answers.submitted_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "0.35rem 0.85rem", marginTop: "0.6rem", fontSize: "0.84rem" }}>
        <span className="meta">Intensity</span><span>{answers.intensity || "—"}{answers.intensity ? " / 10" : ""}</span>
        <span className="meta">Hardest</span><span>{answers.hardest || "—"}</span>
        <span className="meta">Comments</span><span>{answers.comments || "—"}</span>
      </div>
    </div>
  );
}
