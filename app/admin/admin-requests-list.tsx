"use client";
import { useState, useTransition } from "react";
import type { AccountRequest } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import { approveAccountRequest, rejectAccountRequest } from "./actions";

export default function AdminRequestsList({ initial }: { initial: AccountRequest[] }) {
  const [requests, setRequests] = useState(initial);
  const [pending, start] = useTransition();
  const [info, setInfo] = useState<string | null>(null);

  function approve(id: string) {
    setInfo(null);
    start(async () => {
      const res = await approveAccountRequest(id);
      if (!res.ok && !res.error.startsWith("Supabase not configured")) {
        setInfo(res.error);
        return;
      }
      setRequests((r) => r.filter((x) => x.id !== id));
    });
  }
  function reject(id: string) {
    setInfo(null);
    start(async () => {
      const res = await rejectAccountRequest(id);
      if (!res.ok && !res.error.startsWith("Supabase not configured")) {
        setInfo(res.error);
        return;
      }
      setRequests((r) => r.filter((x) => x.id !== id));
    });
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      <table className="table">
        <thead>
          <tr><th>Name</th><th>Email</th><th>Phone</th><th>Note</th><th>Submitted</th><th></th></tr>
        </thead>
        <tbody>
          {requests.length === 0 ? (
            <tr><td colSpan={6} className="meta" style={{ padding: "1rem", textAlign: "center" }}>No pending requests.</td></tr>
          ) : requests.map((r) => (
            <tr key={r.id}>
              <td><strong>{r.full_name}</strong></td>
              <td>{r.email}</td>
              <td>{r.phone ?? "—"}</td>
              <td className="meta">{r.message ?? "—"}</td>
              <td>{fmtDate(r.created_at)}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button className="btn btn-primary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem" }} onClick={() => approve(r.id)} disabled={pending}>Approve</button>{" "}
                <button className="btn btn-ghost" style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem", color: "var(--red)" }} onClick={() => reject(r.id)} disabled={pending}>Reject</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {info ? <p style={{ color: "var(--red)", padding: "0.5rem 0.75rem" }}>{info}</p> : null}
    </div>
  );
}
