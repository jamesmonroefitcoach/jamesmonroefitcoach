// Session follow-ups generated for clients to complete the day after a
// session. Stored in localStorage keyed by client_id.

import type { PostAnswers } from "./session-feedback";

export type Followup = {
  id: string;                  // unique
  client_id: string;
  appt_id: string;
  session_label: string;       // e.g. "Tue, May 13 · 7:00 AM"
  session_starts_at: string;   // ISO
  due_at: string;              // ISO — typically session_starts_at + 24h
  status: "pending" | "completed";
  answers?: PostAnswers;
  created_at: string;
};

function key(clientId: string) { return `client_followups_${clientId}`; }

export function listFollowups(clientId: string): Followup[] {
  if (typeof window === "undefined" || !clientId) return [];
  try {
    const raw = localStorage.getItem(key(clientId));
    return raw ? (JSON.parse(raw) as Followup[]) : [];
  } catch { return []; }
}

function writeFollowups(clientId: string, list: Followup[]): void {
  if (typeof window === "undefined" || !clientId) return;
  try { localStorage.setItem(key(clientId), JSON.stringify(list)); } catch {}
}

/**
 * Add a follow-up for the day after this session. If one already exists for
 * the same appt_id, no-op (idempotent — repeatedly completing the same session
 * doesn't generate duplicate follow-ups).
 */
export function queueFollowup(p: {
  client_id: string;
  appt_id: string;
  session_label: string;
  session_starts_at: string;
}): void {
  if (!p.client_id || !p.appt_id) return;
  const list = listFollowups(p.client_id);
  if (list.some((f) => f.appt_id === p.appt_id)) return;
  const due = new Date(p.session_starts_at);
  due.setDate(due.getDate() + 1);
  list.push({
    id: `fu-${p.appt_id}-${Date.now()}`,
    client_id: p.client_id,
    appt_id: p.appt_id,
    session_label: p.session_label,
    session_starts_at: p.session_starts_at,
    due_at: due.toISOString(),
    status: "pending",
    created_at: new Date().toISOString(),
  });
  writeFollowups(p.client_id, list);
}

export function completeFollowup(clientId: string, followupId: string, answers: PostAnswers): void {
  const list = listFollowups(clientId);
  const next = list.map((f) => f.id === followupId ? { ...f, status: "completed" as const, answers } : f);
  writeFollowups(clientId, next);
}
