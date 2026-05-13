"use client";
import { useMemo, useState, useTransition } from "react";
import { markApptPaid } from "@/app/coach/schedule/actions";
import { fmtMoney } from "@/lib/format";

export type PaymentApptRow = {
  id: string;
  starts_at: string;
  status: "scheduled" | "completed" | "no_show" | "cancelled" | "change_requested";
  rate: number | null;
  paid: boolean;
};

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default function LogPaymentButton({
  clientName,
  appts,
}: {
  clientName: string;
  appts: PaymentApptRow[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => setOpen(true)}
        style={{ whiteSpace: "nowrap" }}
        title="Mark sessions as paid"
      >💵 Log Payment</button>
      {open && (
        <LogPaymentModal
          clientName={clientName}
          appts={appts}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function LogPaymentModal({
  clientName,
  appts,
  onClose,
}: {
  clientName: string;
  appts: PaymentApptRow[];
  onClose: () => void;
}) {
  // Local optimistic paid state, seeded from the server-rendered appts.
  const [paidMap, setPaidMap] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    for (const a of appts) m[a.id] = a.paid;
    return m;
  });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startSave] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Sort: unpaid first (newest unpaid at top), then paid below (most recent first).
  const sorted = useMemo(() => {
    return [...appts].sort((a, b) => {
      const pA = paidMap[a.id] ? 1 : 0;
      const pB = paidMap[b.id] ? 1 : 0;
      if (pA !== pB) return pA - pB;            // unpaid (0) before paid (1)
      return b.starts_at.localeCompare(a.starts_at);   // then newest first
    });
  }, [appts, paidMap]);

  const unpaid = sorted.filter((a) => !paidMap[a.id]);
  const totalOwed = unpaid.reduce((sum, a) => sum + (a.rate ?? 0), 0);

  function toggle(apptId: string, checked: boolean) {
    setPaidMap((m) => ({ ...m, [apptId]: checked }));
    setPendingId(apptId);
    setErr(null);
    startSave(async () => {
      const res = await markApptPaid(apptId, checked);
      if (!res.ok && !res.error?.startsWith("Supabase not configured")) {
        // Roll back optimistic change on failure
        setPaidMap((m) => ({ ...m, [apptId]: !checked }));
        setErr(res.error ?? "Failed to update");
      }
      setPendingId(null);
    });
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(23,19,17,0.45)",
        zIndex: 1100,
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "2rem 1rem",
        overflowY: "auto",
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: "min(620px, 96vw)", padding: "1.1rem 1.25rem" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.6rem", gap: "0.5rem", flexWrap: "wrap" }}>
          <div>
            <span className="badge">Payment</span>
            <h2 style={{ margin: "0.35rem 0 0.15rem" }}>Log Payment</h2>
            <p className="meta" style={{ fontSize: "0.78rem", margin: 0 }}>
              {clientName} · {unpaid.length} unpaid · owed {fmtMoney(totalOwed)}
            </p>
          </div>
          <button className="btn btn-ghost" style={{ fontSize: "0.78rem" }} onClick={onClose}>✕ Close</button>
        </div>

        {err && (
          <div className="meta" style={{ color: "var(--red)", fontSize: "0.78rem", marginBottom: "0.4rem" }}>
            {err}
          </div>
        )}

        <hr className="divider" />

        {sorted.length === 0 ? (
          <p className="meta">No sessions on file for this client.</p>
        ) : (
          <div className="table-scroll-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 64, textAlign: "center" }}>Paid</th>
                  <th>When</th>
                  <th style={{ textAlign: "right" }}>Rate</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((a) => {
                  const isPaid = !!paidMap[a.id];
                  const isPending = pendingId === a.id;
                  return (
                    <tr
                      key={a.id}
                      style={{
                        background: isPaid ? "rgba(90,107,74,0.05)" : "rgba(192,57,43,0.045)",
                      }}
                    >
                      <td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={isPaid}
                          disabled={isPending}
                          onChange={(e) => toggle(a.id, e.target.checked)}
                          style={{ cursor: isPending ? "wait" : "pointer", width: 15, height: 15, accentColor: "var(--sage)" }}
                        />
                      </td>
                      <td style={{ fontSize: "0.82rem" }}>{fmtWhen(a.starts_at)}</td>
                      <td style={{ textAlign: "right", fontSize: "0.82rem" }}>{fmtMoney(a.rate)}</td>
                      <td>
                        <span className="badge" style={{ fontSize: "0.66rem" }}>{a.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="meta" style={{ fontSize: "0.7rem", marginTop: "0.65rem", fontStyle: "italic" }}>
          Changes save instantly and reflect in Dashboard · All Sessions, Schedule, and the Roster.
        </p>
      </div>
    </div>
  );
}
