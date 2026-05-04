"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import type { ThreadPreview } from "@/lib/data";
import type { ThreadMessage } from "@/lib/messages";
import { sendMessage, announceToAllClients } from "./actions";

export default function MessagesClient({
  threads,
  activeId,
  initialMessages,
  myId
}: {
  threads: ThreadPreview[];
  activeId: string | null;
  initialMessages: ThreadMessage[];
  myId: string;
}) {
  const [active, setActive] = useState<string | null>(activeId);
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages);
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const [showAnnounce, setShowAnnounce] = useState(false);
  const [announceBody, setAnnounceBody] = useState("");
  const [announceTier, setAnnounceTier] = useState<"" | "tier_1" | "tier_2" | "tier_3">("");
  const [info, setInfo] = useState<string | null>(null);

  function pickThread(id: string) {
    setActive(id);
    // demo: just clear; in real app would fetch
    setMessages([]);
  }

  function send() {
    if (!active || !body.trim()) return;
    const text = body.trim();
    setBody("");
    const optimistic: ThreadMessage = {
      id: `tmp-${Date.now()}`,
      thread_id: active,
      sender_id: myId,
      sender_name: "Me",
      body: text,
      created_at: new Date().toISOString(),
      read_at: null
    };
    setMessages((m) => [...m, optimistic]);
    start(async () => {
      const res = await sendMessage(active, text);
      if (!res.ok && !res.error.startsWith("Supabase not configured")) {
        setInfo(res.error);
      }
    });
  }

  function broadcast() {
    if (!announceBody.trim()) return;
    const text = announceBody.trim();
    start(async () => {
      const res = await announceToAllClients(text, announceTier || undefined);
      if (!res.ok) {
        setInfo(res.error.startsWith("Supabase") ? "Saved locally — Supabase not configured yet." : res.error);
        return;
      }
      setInfo(`Announcement sent to ${announceTier || "all clients"}.`);
      setAnnounceBody("");
      setShowAnnounce(false);
    });
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.75rem" }}>
        <button className="btn btn-primary" onClick={() => setShowAnnounce(true)}>+ Announce</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 2fr", gap: "1.25rem" }}>
        <div className="card" style={{ padding: 0, alignSelf: "start" }}>
          {threads.length === 0 ? <p className="meta" style={{ padding: "1rem" }}>No threads yet.</p> : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {threads.map((t) => (
                <li
                  key={t.id}
                  onClick={() => pickThread(t.id)}
                  style={{
                    cursor: "pointer",
                    padding: "0.7rem 0.9rem",
                    borderBottom: "1px solid var(--line)",
                    borderLeft: t.unread ? "3px solid var(--rust)" : "3px solid transparent",
                    background: active === t.id ? "rgba(168,61,43,0.06)" : undefined
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <strong>{t.client_name}</strong>
                    <span className="meta" style={{ fontSize: "0.74rem" }}>{t.last_at ? new Date(t.last_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : ""}</span>
                  </div>
                  <p className="meta" style={{ margin: "0.2rem 0 0", fontSize: "0.8rem" }}>{t.last_message}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column", minHeight: 480 }}>
          {!active ? (
            <p className="meta">Pick a thread to read & reply.</p>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2>{threads.find((t) => t.id === active)?.client_name ?? ""}</h2>
                <Link className="meta" href={`/coach/clients/${threads.find((t) => t.id === active)?.client_id ?? ""}`}>open profile →</Link>
              </div>
              <hr className="divider" />
              <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: "0.5rem", paddingRight: 4 }}>
                {messages.length === 0 ? <p className="meta">No messages yet.</p> : messages.map((m) => {
                  const mine = m.sender_id === myId;
                  return (
                    <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "70%" }}>
                      <div style={{
                        background: mine ? "var(--rust)" : "var(--paper)",
                        color: mine ? "#fff" : undefined,
                        border: mine ? "none" : "1px solid var(--line)",
                        borderRadius: 6,
                        padding: "0.45rem 0.65rem",
                        fontSize: "0.88rem"
                      }}>
                        {m.body}
                      </div>
                      <div className="meta" style={{ fontSize: "0.7rem", marginTop: 2, textAlign: mine ? "right" : "left" }}>
                        {mine ? "" : `${m.sender_name} · `}{new Date(m.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <hr className="divider" />
              <form onSubmit={(e) => { e.preventDefault(); send(); }} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
                <textarea className="textarea" rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a reply…" />
                <button className="btn btn-primary" type="submit" disabled={pending || !body.trim()}>{pending ? "…" : "Send"}</button>
              </form>
              {info ? <p style={{ color: "var(--amber)", fontSize: "0.8rem", margin: "0.4rem 0 0" }}>{info}</p> : null}
            </>
          )}
        </div>
      </div>

      {showAnnounce ? (
        <div className="no-print" style={{ position: "fixed", inset: 0, background: "rgba(23,19,17,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowAnnounce(false)}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: "min(520px, 95vw)" }}>
            <span className="badge">Announce</span>
            <h2 style={{ marginTop: "0.5rem" }}>Broadcast to clients</h2>
            <p className="meta">Lands as a flagged message in each client's inbox.</p>
            <hr className="divider" />
            <div>
              <label className="stat-label">Audience</label>
              <select className="select" value={announceTier} onChange={(e) => setAnnounceTier(e.target.value as any)} style={{ marginTop: "0.3rem" }}>
                <option value="">All clients</option>
                <option value="tier_1">Tier 1 only</option>
                <option value="tier_2">Tier 2 only</option>
                <option value="tier_3">Tier 3 only</option>
              </select>
            </div>
            <div style={{ marginTop: "0.6rem" }}>
              <label className="stat-label">Message</label>
              <textarea className="textarea" rows={4} value={announceBody} onChange={(e) => setAnnounceBody(e.target.value)} style={{ marginTop: "0.3rem" }} placeholder="Gym closed Saturday — see you Monday." />
            </div>
            <div style={{ marginTop: "0.8rem", display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button className="btn btn-ghost" onClick={() => setShowAnnounce(false)} disabled={pending}>Cancel</button>
              <button className="btn btn-primary" onClick={broadcast} disabled={pending || !announceBody.trim()}>{pending ? "Sending…" : "Send announcement"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
