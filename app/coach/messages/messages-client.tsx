"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ThreadPreview } from "@/lib/data";
import type { ThreadMessage } from "@/lib/messages";
import { sendMessage, announceToAllClients, startThreadWithClient } from "./actions";

type ClientPick = { id: string; full_name: string };

// Audience mode for the broadcast. "all" + tier_* delegate to the server's
// own tier filter; "today" / "week" / "custom" send the resolved client IDs
// down with the message.
type AudienceMode = "all" | "tier_1" | "tier_2" | "tier_3" | "today" | "week" | "custom";

export default function MessagesClient({
  threads,
  activeId,
  initialMessages,
  myId,
  clients,
  todayClientIds,
  weekClientIds,
}: {
  threads: ThreadPreview[];
  activeId: string | null;
  initialMessages: ThreadMessage[];
  myId: string;
  clients: ClientPick[];
  todayClientIds: string[];
  weekClientIds: string[];
}) {
  const router = useRouter();
  const [active, setActive] = useState<string | null>(activeId);
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages);
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const [showAnnounce, setShowAnnounce] = useState(false);
  const [announceBody, setAnnounceBody] = useState("");
  const [audience, setAudience] = useState<AudienceMode>("all");
  const [customIds, setCustomIds] = useState<Set<string>>(new Set());
  const [customSearch, setCustomSearch] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  // New-message modal state
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [newClientId, setNewClientId] = useState<string>("");
  const [newClientSearch, setNewClientSearch] = useState("");

  // Filtered + sorted client list for the new-message picker
  const filteredClients = useMemo(() => {
    const q = newClientSearch.trim().toLowerCase();
    const list = q
      ? clients.filter((c) => c.full_name.toLowerCase().includes(q))
      : clients.slice();
    return list.sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [clients, newClientSearch]);

  // Recipient preview for the announce modal — counts (and names) of who
  // will actually receive it given the audience selection. Lets the coach
  // spot a missing/extra client before broadcasting.
  const audienceCount = useMemo(() => {
    if (audience === "today") return todayClientIds.length;
    if (audience === "week") return weekClientIds.length;
    if (audience === "custom") return customIds.size;
    // For "all" + tier_*, the server resolves recipients — we only know
    // the upper bound (total clients visible to this coach).
    return clients.length;
  }, [audience, customIds, clients, todayClientIds, weekClientIds]);

  // Clients filtered for the custom-list picker.
  const customFiltered = useMemo(() => {
    const q = customSearch.trim().toLowerCase();
    const list = q
      ? clients.filter((c) => c.full_name.toLowerCase().includes(q))
      : clients.slice();
    return list.sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [clients, customSearch]);

  function toggleCustom(id: string) {
    setCustomIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startNewMessage() {
    if (!newClientId) return;
    start(async () => {
      const res = await startThreadWithClient(newClientId);
      if (res.ok) {
        setShowNewMessage(false);
        setNewClientId("");
        setNewClientSearch("");
        router.push(`/coach/messages?thread=${res.thread_id}`);
        router.refresh();
      } else {
        setInfo(res.error);
      }
    });
  }

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
    let tier: "tier_1" | "tier_2" | "tier_3" | undefined;
    let recipientIds: string[] | undefined;
    let label = "all clients";
    if (audience === "tier_1" || audience === "tier_2" || audience === "tier_3") {
      tier = audience;
      label = audience.replace("_", " ");
    } else if (audience === "today") {
      recipientIds = todayClientIds;
      label = "today's clients";
    } else if (audience === "week") {
      recipientIds = weekClientIds;
      label = "this week's clients";
    } else if (audience === "custom") {
      recipientIds = Array.from(customIds);
      label = `${recipientIds.length} selected client${recipientIds.length === 1 ? "" : "s"}`;
    }
    if ((audience === "today" || audience === "week" || audience === "custom") && (!recipientIds || recipientIds.length === 0)) {
      setInfo("No clients match that audience.");
      return;
    }
    start(async () => {
      const res = await announceToAllClients(text, tier, recipientIds);
      if (!res.ok) {
        setInfo(res.error.startsWith("Supabase") ? "Saved locally — Supabase not configured yet." : res.error);
        return;
      }
      setInfo(`Announcement sent to ${label}.`);
      setAnnounceBody("");
      setShowAnnounce(false);
    });
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <button className="btn btn-ghost" onClick={() => setShowNewMessage(true)}>+ New message</button>
        <button className="btn btn-primary" onClick={() => setShowAnnounce(true)}>+ Announce</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, 1fr) 2fr", gap: "0.85rem" }}>
        <div className="card" style={{ padding: 0, alignSelf: "start", maxHeight: 360, overflowY: "auto" }}>
          {threads.length === 0 ? <p className="meta" style={{ padding: "0.6rem 0.7rem", fontSize: "0.78rem" }}>No threads yet.</p> : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {threads.map((t) => (
                <li
                  key={t.id}
                  onClick={() => pickThread(t.id)}
                  style={{
                    cursor: "pointer",
                    padding: "0.4rem 0.55rem",
                    borderBottom: "1px solid var(--line)",
                    borderLeft: t.unread ? "3px solid var(--rust)" : "3px solid transparent",
                    background: active === t.id ? "rgba(168,61,43,0.06)" : undefined
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.4rem", alignItems: "center" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.35rem", minWidth: 0 }}>
                      <strong style={{ fontSize: "0.82rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.client_name}</strong>
                      {t.unread_count > 0 && (
                        <span
                          title={`${t.unread_count} unread`}
                          style={{
                            flexShrink: 0,
                            minWidth: 16, height: 16, padding: "0 4px",
                            borderRadius: 999, background: "var(--rust)", color: "#fff",
                            fontSize: "0.6rem", fontWeight: 700, lineHeight: "16px",
                            textAlign: "center",
                          }}
                        >{t.unread_count}</span>
                      )}
                    </span>
                    <span className="meta" style={{ fontSize: "0.68rem", whiteSpace: "nowrap", flexShrink: 0 }}>{t.last_at ? new Date(t.last_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : ""}</span>
                  </div>
                  <p className="meta" style={{ margin: "0.1rem 0 0", fontSize: "0.72rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.last_message}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column", maxHeight: 360, padding: "0.65rem 0.85rem" }}>
          {!active ? (
            <p className="meta" style={{ fontSize: "0.82rem" }}>Pick a thread to read &amp; reply.</p>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ fontSize: "1rem", margin: 0 }}>{threads.find((t) => t.id === active)?.client_name ?? ""}</h2>
                <Link className="meta" style={{ fontSize: "0.72rem" }} href={`/coach/clients/${threads.find((t) => t.id === active)?.client_id ?? ""}`}>open profile →</Link>
              </div>
              <hr className="divider" style={{ margin: "0.4rem 0" }} />
              <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: "0.35rem", paddingRight: 4 }}>
                {messages.length === 0 ? <p className="meta" style={{ fontSize: "0.78rem" }}>No messages yet.</p> : messages.map((m) => {
                  const mine = m.sender_id === myId;
                  if (m.is_system) {
                    return (
                      <div key={m.id} style={{ alignSelf: "center", maxWidth: "92%" }}>
                        <div style={{
                          background: "#fbf7ef",
                          border: "1px dashed var(--line)",
                          borderRadius: 5,
                          padding: "0.36rem 0.55rem",
                          fontSize: "0.78rem",
                          lineHeight: 1.35,
                          fontStyle: "italic",
                          color: "var(--muted)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "0.6rem",
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
                                fontSize: "0.62rem",
                                fontWeight: 600,
                                color: "var(--rust)",
                                border: "1px solid var(--rust)",
                                padding: "0.18rem 0.55rem",
                                borderRadius: 3,
                                textDecoration: "none",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {m.link_label ?? "View"} →
                            </Link>
                          )}
                        </div>
                        <div className="meta" style={{ fontSize: "0.6rem", marginTop: 1, textAlign: "center", fontStyle: "italic" }}>
                          {new Date(m.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "70%" }}>
                      <div style={{
                        background: mine ? "var(--rust)" : "var(--paper)",
                        color: mine ? "#fff" : undefined,
                        border: mine ? "none" : "1px solid var(--line)",
                        borderRadius: 5,
                        padding: "0.32rem 0.5rem",
                        fontSize: "0.8rem",
                        lineHeight: 1.35,
                      }}>
                        {m.body}
                      </div>
                      <div className="meta" style={{ fontSize: "0.66rem", marginTop: 1, textAlign: mine ? "right" : "left" }}>
                        {mine ? "" : `${m.sender_name} · `}{new Date(m.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <hr className="divider" style={{ margin: "0.4rem 0" }} />
              <form onSubmit={(e) => { e.preventDefault(); send(); }} style={{ display: "flex", gap: "0.4rem", alignItems: "flex-end" }}>
                <textarea className="textarea" rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a reply…" style={{ fontSize: "0.82rem", padding: "0.3rem 0.45rem" }} />
                <button className="btn btn-primary" type="submit" disabled={pending || !body.trim()} style={{ fontSize: "0.78rem", padding: "0.3rem 0.7rem" }}>{pending ? "…" : "Send"}</button>
              </form>
              {info ? <p style={{ color: "var(--amber)", fontSize: "0.74rem", margin: "0.3rem 0 0" }}>{info}</p> : null}
            </>
          )}
        </div>
      </div>

      {showAnnounce ? (
        <div className="no-print" style={{ position: "fixed", inset: 0, background: "rgba(23,19,17,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowAnnounce(false)}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: "min(520px, 95vw)" }}>
            <span className="badge">Announce</span>
            <h2 style={{ marginTop: "0.5rem" }}>Broadcast to clients</h2>
            <p className="meta">Lands as a flagged message in each client&apos;s inbox.</p>
            <hr className="divider" />
            <div>
              <label className="stat-label">Audience</label>
              <select className="select" value={audience} onChange={(e) => setAudience(e.target.value as AudienceMode)} style={{ marginTop: "0.3rem" }}>
                <option value="all">All clients ({clients.length})</option>
                <option value="today">Today&apos;s clients ({todayClientIds.length})</option>
                <option value="week">This week&apos;s clients ({weekClientIds.length})</option>
                <option value="tier_1">Tier 1 only</option>
                <option value="tier_2">Tier 2 only</option>
                <option value="tier_3">Tier 3 only</option>
                <option value="custom">Custom list…</option>
              </select>
              <p className="meta" style={{ fontSize: "0.72rem", marginTop: "0.35rem" }}>
                {audience === "today" ? "Clients with a live session scheduled today."
                  : audience === "week" ? "Clients with at least one live session this week."
                  : audience === "custom" ? "Pick exactly who hears this. " + (customIds.size > 0 ? `${customIds.size} selected.` : "")
                  : "Goes to every client whose record either has you as their coach or has no coach assigned."}
              </p>
              {audience === "custom" ? (
                <div style={{ marginTop: "0.45rem" }}>
                  <input
                    className="input"
                    placeholder="Search clients…"
                    value={customSearch}
                    onChange={(e) => setCustomSearch(e.target.value)}
                  />
                  <div style={{ maxHeight: 180, overflowY: "auto", marginTop: "0.4rem", border: "1px solid var(--line)", borderRadius: 3 }}>
                    {customFiltered.length === 0 ? (
                      <p className="meta" style={{ padding: "0.5rem 0.7rem", margin: 0, fontSize: "0.78rem" }}>No matches.</p>
                    ) : (
                      customFiltered.map((c) => {
                        const on = customIds.has(c.id);
                        return (
                          <label
                            key={c.id}
                            style={{
                              display: "flex", alignItems: "center", gap: "0.5rem",
                              padding: "0.4rem 0.7rem",
                              borderBottom: "1px solid var(--line)",
                              cursor: "pointer",
                              background: on ? "rgba(168,61,43,0.08)" : "transparent",
                              fontSize: "0.82rem",
                              fontWeight: on ? 700 : 400,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggleCustom(c.id)}
                            />
                            <span>{c.full_name}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.35rem" }}>
                    <button type="button" className="btn btn-ghost" style={{ fontSize: "0.72rem", padding: "0.25rem 0.55rem" }}
                      onClick={() => setCustomIds(new Set(customFiltered.map((c) => c.id)))}>
                      Select shown
                    </button>
                    <button type="button" className="btn btn-ghost" style={{ fontSize: "0.72rem", padding: "0.25rem 0.55rem" }}
                      onClick={() => setCustomIds(new Set())}>
                      Clear
                    </button>
                  </div>
                </div>
              ) : null}
              <p className="meta" style={{ fontSize: "0.72rem", marginTop: "0.45rem" }}>
                Will reach <strong style={{ color: "var(--ink)" }}>{audienceCount}</strong> {audienceCount === 1 ? "client" : "clients"}.
              </p>
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

      {/* ── New Message modal ─────────────────────────────────────────── */}
      {showNewMessage ? (
        <div className="no-print" style={{ position: "fixed", inset: 0, background: "rgba(23,19,17,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowNewMessage(false)}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: "min(440px, 95vw)" }}>
            <span className="badge">New DM</span>
            <h2 style={{ marginTop: "0.5rem" }}>Start a conversation</h2>
            <p className="meta">Open (or create) a direct message thread with a client.</p>
            <hr className="divider" />
            <div>
              <label className="stat-label">Client</label>
              <input
                className="input"
                placeholder="Search clients…"
                value={newClientSearch}
                onChange={(e) => setNewClientSearch(e.target.value)}
                style={{ marginTop: "0.3rem" }}
              />
              <div style={{ maxHeight: 240, overflowY: "auto", marginTop: "0.4rem", border: "1px solid var(--line)", borderRadius: 3 }}>
                {filteredClients.length === 0 ? (
                  <p className="meta" style={{ padding: "0.6rem 0.75rem", margin: 0, fontSize: "0.78rem" }}>No matches.</p>
                ) : (
                  filteredClients.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setNewClientId(c.id)}
                      style={{
                        display: "block", width: "100%", textAlign: "left",
                        padding: "0.45rem 0.7rem",
                        background: newClientId === c.id ? "rgba(168,61,43,0.08)" : "transparent",
                        border: "none",
                        borderBottom: "1px solid var(--line)",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        fontSize: "0.85rem",
                        fontWeight: newClientId === c.id ? 700 : 400,
                        color: "var(--ink)",
                      }}
                    >
                      {c.full_name}
                    </button>
                  ))
                )}
              </div>
            </div>
            <div style={{ marginTop: "0.85rem", display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button className="btn btn-ghost" onClick={() => { setShowNewMessage(false); setNewClientId(""); setNewClientSearch(""); }} disabled={pending}>Cancel</button>
              <button className="btn btn-primary" onClick={startNewMessage} disabled={pending || !newClientId}>{pending ? "Opening…" : "Open thread →"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
