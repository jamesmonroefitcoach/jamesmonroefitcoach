"use client";
import { useEffect, useMemo, useState } from "react";
import { listFollowups, completeFollowup, type Followup } from "@/lib/client-followups";
import { PostFeedbackForm, PostAnswersDisplay, type PostAnswersDraft } from "@/app/coach/programming/build/feedback-forms";

export default function SessionFollowups({ clientId }: { clientId: string }) {
  const [mounted, setMounted] = useState(false);
  const [tick, setTick] = useState(0);
  const [openFor, setOpenFor] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const list = useMemo(() => {
    if (!mounted) return [] as Followup[];
    return listFollowups(clientId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, mounted, tick]);

  const pending = list.filter((f) => f.status === "pending");
  const completed = list.filter((f) => f.status === "completed");

  if (!mounted) return null;
  if (list.length === 0) return null;

  return (
    <section className="card" style={{ borderLeft: "4px solid var(--clay)", marginBottom: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.4rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Session follow-ups</h2>
        <span className="meta" style={{ fontSize: "0.74rem" }}>
          {pending.length} pending · {completed.length} done
        </span>
      </div>
      <hr className="divider" />

      {pending.length === 0 ? (
        <p className="meta" style={{ fontSize: "0.84rem" }}>All caught up.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          {pending.map((f) => {
            const isOpen = openFor === f.id;
            const overdue = new Date(f.due_at).getTime() < Date.now();
            return (
              <div key={f.id} className="day-card" style={{ borderLeftColor: overdue ? "var(--red)" : "var(--clay)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.4rem" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <strong>{f.session_label}</strong>
                    <div className="meta" style={{ fontSize: "0.74rem", marginTop: "0.15rem" }}>
                      due {new Date(f.due_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      {overdue ? <span style={{ color: "var(--red)", marginLeft: "0.4rem" }}>· overdue</span> : null}
                    </div>
                  </div>
                  {!isOpen && (
                    <button
                      className="btn btn-primary"
                      style={{ fontSize: "0.78rem", padding: "0.3rem 0.7rem" }}
                      onClick={() => setOpenFor(f.id)}
                    >Answer</button>
                  )}
                </div>
                {isOpen && (
                  <div style={{ marginTop: "0.6rem" }}>
                    <PostFeedbackForm
                      title="Session Follow-up"
                      onSubmit={(a: PostAnswersDraft) => {
                        completeFollowup(clientId, f.id, { ...a, submitted_at: new Date().toISOString() });
                        setOpenFor(null);
                        setTick((t) => t + 1);
                      }}
                      onCancel={() => setOpenFor(null)}
                      compact
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {completed.length > 0 && (
        <details style={{ marginTop: "0.85rem" }}>
          <summary style={{ cursor: "pointer", fontSize: "0.78rem", color: "var(--muted)" }}>
            Past follow-ups ({completed.length})
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem", marginTop: "0.5rem" }}>
            {completed.map((f) => (
              <div key={f.id} className="day-card" style={{ borderLeftColor: "var(--sage)" }}>
                <strong>{f.session_label}</strong>
                {f.answers && (
                  <div style={{ marginTop: "0.5rem" }}>
                    <PostAnswersDisplay answers={f.answers} title="Submitted" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
