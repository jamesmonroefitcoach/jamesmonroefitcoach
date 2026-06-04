"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { fmtDate } from "@/lib/format";
import type { PastProgramFull } from "@/lib/programs";
import { sendProgramFeedback } from "./program-feedback-actions";

export type PastSessionItem = {
  id: string;
  starts_at: string;
  program_status: "programmed" | "draft" | "needs_programming" | "n/a";
  session_program_id: string | null;
};

function fmtSessionTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function monthKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function StatusBadge({ status }: { status: PastSessionItem["program_status"] }) {
  if (status === "programmed") return <span className="badge badge-sage" style={{ fontSize: "0.6rem" }}>published</span>;
  if (status === "draft") return <span className="badge badge-amber" style={{ fontSize: "0.6rem" }}>draft</span>;
  if (status === "needs_programming") return <span className="badge" style={{ fontSize: "0.6rem", color: "var(--muted)" }}>not programmed</span>;
  return null;
}

function MonthGroup({ clientId, month, sessions }: {
  clientId: string;
  month: string;
  sessions: PastSessionItem[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 3, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", background: "rgba(0,0,0,0.025)", border: "none",
          padding: "0.35rem 0.55rem", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontFamily: "inherit",
        }}
      >
        <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>{open ? "▾" : "▸"} {month}</span>
        <span className="meta" style={{ fontSize: "0.68rem" }}>{sessions.length}</span>
      </button>
      {open && (
        <div style={{ padding: "0.3rem 0.4rem", display: "flex", flexDirection: "column", gap: "0.18rem" }}>
          {sessions.map((s) => {
            const viewParam = s.program_status === "programmed" ? "&view=plan" : "";
            return (
              <Link
                key={s.id}
                href={`/coach/programming/build?tab=session&client=${clientId}&appt=${s.id}${viewParam}`}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.4rem",
                  padding: "0.22rem 0.4rem", borderRadius: 3,
                  textDecoration: "none", color: "var(--ink)",
                  fontSize: "0.76rem",
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>{fmtSessionTime(s.starts_at)}</span>
                <StatusBadge status={s.program_status} />
                <span style={{ color: "var(--rust)", flexShrink: 0 }}>→</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export type PdfSheetItem = {
  id: string;
  name: string;
  filename: string | null;
  uploaded_at: string;
};

export default function PastPrograms({
  clientId,
  sessions,
  programs,
  pdfSheets = [],
}: {
  clientId: string;
  sessions: PastSessionItem[];
  programs: PastProgramFull[];
  pdfSheets?: PdfSheetItem[];
}) {
  const [open, setOpen] = useState(false);

  const sessionsByMonth = useMemo(() => {
    // sessions are passed already sorted DESC by starts_at
    const map = new Map<string, PastSessionItem[]>();
    for (const s of sessions) {
      const k = monthKey(s.starts_at);
      const cur = map.get(k) ?? [];
      cur.push(s);
      map.set(k, cur);
    }
    return Array.from(map.entries());
  }, [sessions]);

  if (sessions.length === 0 && programs.length === 0 && pdfSheets.length === 0) return null;

  return (
    <div style={{ marginTop: "1rem" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", background: "none", border: "none",
          borderTop: "1px dashed var(--line)",
          padding: "0.45rem 0",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontFamily: "inherit",
        }}
      >
        <span style={{ fontSize: "0.74rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted)" }}>
          {open ? "▾" : "▸"} Past programs
        </span>
        <span className="meta" style={{ fontSize: "0.72rem" }}>
          {sessions.length} session{sessions.length !== 1 ? "s" : ""} · {programs.length} program{programs.length !== 1 ? "s" : ""}
          {pdfSheets.length > 0 ? ` · ${pdfSheets.length} PDF${pdfSheets.length !== 1 ? "s" : ""}` : ""}
        </span>
      </button>

      {open && (
        <div className="banner-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem", marginTop: "0.6rem" }}>
          {/* Left: Sessions grouped by Month Year */}
          <div>
            <div style={{
              fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.07em", color: "var(--rust)",
              paddingBottom: "0.3rem", borderBottom: "1px solid var(--line)",
              marginBottom: "0.5rem",
            }}>Sessions</div>
            {sessionsByMonth.length === 0 ? (
              <p className="meta" style={{ fontSize: "0.74rem" }}>No past sessions.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {sessionsByMonth.map(([month, items]) => (
                  <MonthGroup key={month} clientId={clientId} month={month} sessions={items} />
                ))}
              </div>
            )}
          </div>

          {/* Right: Programs split into Coach Assigned + Client Created */}
          <div>
            <div style={{
              fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.07em", color: "var(--rust)",
              paddingBottom: "0.3rem", borderBottom: "1px solid var(--line)",
              marginBottom: "0.5rem",
            }}>Programs</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <ProgramGroupCollapsible
                title="Coach Assigned"
                clientId={clientId}
                items={programs.filter((p) => !p.created_by_client)}
                allowFeedback={false}
              />
              <ProgramGroupCollapsible
                title="Client Created"
                clientId={clientId}
                items={programs.filter((p) => p.created_by_client)}
                allowFeedback={true}
              />
              <PdfSheetsCollapsible items={pdfSheets} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PdfSheetsCollapsible({ items }: { items: PdfSheetItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 3, overflow: "hidden" }} id="pdf-sheets">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", background: "rgba(0,0,0,0.025)", border: "none",
          padding: "0.35rem 0.55rem", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontFamily: "inherit",
        }}
      >
        <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>{open ? "▾" : "▸"} PDF Sheets</span>
        <span className="meta" style={{ fontSize: "0.68rem" }}>{items.length}</span>
      </button>
      {open && (
        <div style={{ padding: "0.3rem 0.4rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          {items.length === 0 ? (
            <p className="meta" style={{ fontSize: "0.72rem", fontStyle: "italic", margin: "0.2rem 0.1rem" }}>
              None yet — upload one from the Workout Sheets section below.
            </p>
          ) : (
            items.map((p) => (
              <Link
                key={p.id}
                href={`/api/workout-sheets/${p.id}/pdf`}
                target="_blank"
                rel="noopener"
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  border: "1px solid var(--line)",
                  borderRadius: 3,
                  padding: "0.4rem 0.55rem",
                  background: "var(--paper)",
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                }}
              >
                <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                  {p.name}
                  {p.filename && p.filename !== p.name ? (
                    <span style={{ fontWeight: 400, color: "var(--muted)", marginLeft: "0.45rem", fontSize: "0.72rem" }}>
                      {p.filename}
                    </span>
                  ) : null}
                </span>
                <span style={{ fontSize: "0.7rem", color: "var(--muted)", whiteSpace: "nowrap" }}>
                  {fmtDate(p.uploaded_at)}
                </span>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ProgramGroupCollapsible({
  title, clientId, items, allowFeedback,
}: {
  title: string;
  clientId: string;
  items: PastProgramFull[];
  allowFeedback?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 3, overflow: "hidden" }} id="programs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", background: "rgba(0,0,0,0.025)", border: "none",
          padding: "0.35rem 0.55rem", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontFamily: "inherit",
        }}
      >
        <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>{open ? "▾" : "▸"} {title}</span>
        <span className="meta" style={{ fontSize: "0.68rem" }}>{items.length}</span>
      </button>
      {open && (
        <div style={{ padding: "0.3rem 0.4rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          {items.length === 0 ? (
            <p className="meta" style={{ fontSize: "0.72rem", fontStyle: "italic", margin: "0.2rem 0.1rem" }}>
              None yet.
            </p>
          ) : items.map((p) => (
            <ProgramListRow
              key={p.id}
              program={p}
              clientId={clientId}
              allowFeedback={allowFeedback ?? false}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProgramListRow({ program, clientId, allowFeedback }: {
  program: PastProgramFull;
  clientId: string;
  allowFeedback: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      background: "var(--paper)",
      border: "1px solid var(--line)",
      borderRadius: 3,
      overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.3rem 0.45rem" }}>
        <Link
          href={`/coach/programming/build?tab=program&client=${clientId}`}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem",
            textDecoration: "none", color: "var(--ink)", flex: 1, minWidth: 0,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: "0.78rem" }}>{program.name}</div>
            <div className="meta" style={{ fontSize: "0.66rem" }}>
              {fmtDate(program.starts_on)} → {fmtDate(program.ends_on)}
            </div>
          </div>
          <span style={{ color: "var(--rust)", fontSize: "0.76rem", flexShrink: 0 }}>→</span>
        </Link>
        {allowFeedback && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="btn btn-ghost"
            style={{ fontSize: "0.66rem", padding: "0.12rem 0.4rem", whiteSpace: "nowrap" }}
            title="Send feedback to this client about this program"
          >{open ? "▾ Feedback" : "▸ Feedback"}</button>
        )}
      </div>
      {allowFeedback && open && <FeedbackForm programId={program.id} />}
    </div>
  );
}

function FeedbackForm({ programId }: { programId: string }) {
  const [body, setBody] = useState("");
  const [sending, startSend] = useTransition();
  const [status, setStatus] = useState<{ kind: "idle" } | { kind: "ok" } | { kind: "err"; msg: string }>({ kind: "idle" });

  function submit() {
    if (!body.trim()) { setStatus({ kind: "err", msg: "Write a message first." }); return; }
    setStatus({ kind: "idle" });
    startSend(async () => {
      const res = await sendProgramFeedback({ programId, body });
      if (res.ok) {
        setStatus({ kind: "ok" });
        setBody("");
      } else {
        setStatus({ kind: "err", msg: res.error ?? "Send failed." });
      }
    });
  }

  return (
    <div style={{ borderTop: "1px solid var(--line)", padding: "0.4rem 0.5rem", background: "rgba(168,61,43,0.03)" }}>
      <textarea
        className="textarea"
        rows={3}
        placeholder="Write feedback for the client — what's working, what to adjust, anything to watch."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        style={{ fontSize: "0.78rem", padding: "0.28rem 0.4rem", resize: "vertical", width: "100%" }}
      />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "0.35rem", gap: "0.5rem" }}>
        <div style={{ fontSize: "0.72rem" }}>
          {status.kind === "ok" && <span style={{ color: "var(--sage)" }}>✓ Sent — they&apos;ll see it in Messages.</span>}
          {status.kind === "err" && <span style={{ color: "var(--red)" }}>{status.msg}</span>}
        </div>
        <button
          className="btn btn-primary"
          onClick={submit}
          disabled={sending || !body.trim()}
          style={{ fontSize: "0.74rem", padding: "0.2rem 0.65rem" }}
        >{sending ? "Sending…" : "Submit feedback"}</button>
      </div>
    </div>
  );
}
