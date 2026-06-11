"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import type { ThreadMessage } from "@/lib/messages";
import { sendMessage } from "@/app/coach/messages/actions";

export default function ClientMessagesView({ threadId, initial, myId }: { threadId: string | null; initial: ThreadMessage[]; myId: string }) {
  const [messages, setMessages] = useState<ThreadMessage[]>(initial);
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const [info, setInfo] = useState<string | null>(null);

  function send() {
    if (!threadId || !body.trim()) return;
    const text = body.trim();
    setBody("");
    setMessages((m) => [...m, {
      id: `tmp-${Date.now()}`,
      thread_id: threadId,
      sender_id: myId,
      sender_name: "Me",
      body: text,
      created_at: new Date().toISOString(),
      read_at: null
    }]);
    start(async () => {
      const res = await sendMessage(threadId, text);
      if (!res.ok && !res.error.startsWith("Supabase not configured")) {
        setInfo(res.error);
      }
    });
  }

  return (
    <>
      <div className="card" style={{ minHeight: 320, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {messages.length === 0 ? <p className="meta">No messages yet. Send the first one below.</p> : messages.map((m) => {
          const mine = m.sender_id === myId;
          if (m.is_system) {
            return (
              <div key={m.id} style={{ alignSelf: "center", maxWidth: "92%" }}>
                <div style={{
                  background: "#fbf7ef",
                  border: "1px dashed var(--line)",
                  borderRadius: 6,
                  padding: "0.45rem 0.7rem",
                  fontSize: "0.86rem",
                  lineHeight: 1.4,
                  fontStyle: "italic",
                  color: "var(--muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.6rem",
                  flexWrap: "wrap",
                }}>
                  <span>{m.body}</span>
                  {m.link_url && (
                    <Link
                      href={m.link_url}
                      style={{
                        fontStyle: "normal",
                        fontFamily: "Oswald, sans-serif",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        fontSize: "0.65rem",
                        fontWeight: 600,
                        color: "var(--rust)",
                        border: "1px solid var(--rust)",
                        padding: "0.2rem 0.6rem",
                        borderRadius: 3,
                        textDecoration: "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {m.link_label ?? "View"} →
                    </Link>
                  )}
                </div>
                <div className="meta" style={{ fontSize: "0.66rem", marginTop: 2, textAlign: "center", fontStyle: "italic" }}>
                  {new Date(m.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </div>
              </div>
            );
          }
          return (
            <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "75%" }}>
              <div style={{
                background: mine ? "var(--rust)" : "var(--paper)",
                color: mine ? "#fff" : undefined,
                border: mine ? "none" : "1px solid var(--line)",
                borderRadius: 6,
                padding: "0.45rem 0.65rem",
                fontSize: "0.9rem"
              }}>{m.body}</div>
              <div className="meta" style={{ fontSize: "0.7rem", marginTop: 2, textAlign: mine ? "right" : "left" }}>
                {mine ? "" : `${m.sender_name} · `}{new Date(m.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="card" style={{ marginTop: "1rem", display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
        <textarea className="textarea" rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message to James..." />
        <button className="btn btn-primary" type="submit" disabled={pending || !body.trim()}>{pending ? "…" : "Send"}</button>
      </form>
      {info ? <p style={{ color: "var(--amber)", fontSize: "0.8rem" }}>{info}</p> : null}
    </>
  );
}
