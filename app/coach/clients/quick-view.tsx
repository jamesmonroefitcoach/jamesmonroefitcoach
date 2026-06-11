"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { ClientRow } from "@/lib/data";
import { fmtMoney, fmtDate } from "@/lib/format";

// Collapsible Quick View on the Clients page.
// Coach picks a client from the dropdown → an inline profile preview renders
// below (active/inactive status, weight delta, last/next session, balance,
// session counts) with a "Go to profile" button at the bottom that opens the
// full client profile.

const TIER_LABEL: Record<string, string> = { tier_1: "Tier 1", tier_2: "Tier 2", tier_3: "Tier 3" };

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

export default function QuickView({ clients }: { clients: ClientRow[] }) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");

  // Sort by full_name for the dropdown
  const sorted = useMemo(
    () => [...clients].sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [clients]
  );
  const grouped = useMemo(() => {
    const g: Record<string, ClientRow[]> = { active: [], online: [], past: [], potential: [] };
    sorted.forEach((c) => {
      const bucket =
        c.lifecycle === "active" ? "active"
        : c.lifecycle === "online" ? "online"
        : c.lifecycle === "prospective" ? "potential"
        : "past";
      (g[bucket] ??= []).push(c);
    });
    return g;
  }, [sorted]);

  const selected = useMemo(() => sorted.find((c) => c.id === selectedId) ?? null, [sorted, selectedId]);

  return (
    <section
      style={{
        border: "1px solid var(--line)",
        borderRadius: 6,
        marginBottom: "1.25rem",
        overflow: "hidden",
        background: "var(--paper)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: "100%",
          background: "rgba(0,0,0,0.025)",
          border: "none",
          padding: "0.55rem 0.85rem",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: "inherit",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-heading), Oswald, sans-serif",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontSize: "0.7rem",
            fontWeight: 700,
            color: "var(--ink)",
          }}
        >
          {open ? "▾" : "▸"} Quick View
        </span>
        <span className="meta" style={{ fontSize: "0.72rem" }}>
          {selected ? selected.full_name : "Pick a client to preview"}
        </span>
      </button>

      {open && (
        <div style={{ padding: "0.85rem 1rem 1rem" }}>
          <label
            htmlFor="quickview-select"
            style={{
              display: "block",
              fontFamily: "Oswald, sans-serif",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              fontSize: "0.62rem",
              fontWeight: 600,
              color: "var(--muted)",
              marginBottom: "0.25rem",
            }}
          >
            Client
          </label>
          <select
            id="quickview-select"
            className="select"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            style={{ width: "100%", maxWidth: 420 }}
          >
            <option value="">— Pick a client —</option>
            {(["active", "online", "potential", "past"] as const).map((bucket) =>
              (grouped[bucket] ?? []).length > 0 ? (
                <optgroup key={bucket} label={bucket.toUpperCase()}>
                  {grouped[bucket]!.map((c) => (
                    <option key={c.id} value={c.id}>{c.full_name}</option>
                  ))}
                </optgroup>
              ) : null
            )}
          </select>

          {selected && <PreviewCard client={selected} />}
        </div>
      )}
    </section>
  );
}

function PreviewCard({ client: c }: { client: ClientRow }) {
  const last = daysAgo(c.last_session_at);
  const next = daysUntil(c.next_session_at);
  const weightDelta =
    c.current_weight_lb != null && c.goal_weight_lb != null
      ? c.current_weight_lb - c.goal_weight_lb
      : null;

  const statusColor =
    c.lifecycle === "active" || c.lifecycle === "online"
      ? "var(--sage)"
      : c.lifecycle === "prospective"
      ? "var(--clay)"
      : "var(--muted)";

  return (
    <div
      style={{
        marginTop: "0.85rem",
        border: "1px solid var(--line)",
        borderRadius: 5,
        padding: "0.85rem 1rem 0.95rem",
        background: "#fbf7ef",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.75rem", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: "1.05rem" }}>{c.full_name}</h3>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {c.tier && (
            <span style={{ fontSize: "0.66rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--rust)", fontWeight: 600 }}>
              {TIER_LABEL[c.tier] ?? c.tier}
            </span>
          )}
          <span style={{ fontSize: "0.66rem", textTransform: "uppercase", letterSpacing: "0.08em", color: statusColor, fontWeight: 600 }}>
            {c.lifecycle ?? "—"}
          </span>
        </div>
      </div>

      <dl
        style={{
          marginTop: "0.7rem",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "0.6rem 1rem",
          fontSize: "0.85rem",
        }}
      >
        <Stat label="Weight" value={c.current_weight_lb != null ? `${c.current_weight_lb} lb` : "—"} sub={c.goal_weight_lb != null ? `goal ${c.goal_weight_lb}` : null} />
        <Stat label="Δ to goal" value={weightDelta != null ? `${weightDelta > 0 ? "+" : ""}${weightDelta} lb` : "—"} />
        <Stat
          label="Last session"
          value={last == null ? "—" : last === 0 ? "today" : `${last}d ago`}
          sub={c.last_session_at ? fmtDate(c.last_session_at) : null}
        />
        <Stat
          label="Next session"
          value={next == null ? "—" : next <= 0 ? "today" : `in ${next}d`}
          sub={c.next_session_at ? fmtDate(c.next_session_at) : null}
        />
        <Stat label="Sessions" value={`${c.total_sessions}`} sub={`${c.sessions_this_month_completed} this month`} />
        <Stat label="Balance" value={c.balance_owed > 0 ? fmtMoney(c.balance_owed) : "$0"} sub={c.balance_owed > 0 ? "owed" : null} />
      </dl>

      {c.goals && (
        <p
          className="meta"
          style={{
            marginTop: "0.75rem",
            fontSize: "0.78rem",
            fontStyle: "italic",
            color: "var(--muted)",
            borderTop: "1px solid var(--line)",
            paddingTop: "0.5rem",
          }}
        >
          {c.goals.length > 200 ? c.goals.slice(0, 200) + "…" : c.goals}
        </p>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.85rem" }}>
        <Link href={`/coach/clients/${c.id}`} className="btn btn-primary">
          Go to profile →
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "Oswald, sans-serif",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontSize: "0.58rem",
          fontWeight: 600,
          color: "var(--muted)",
        }}
      >
        {label}
      </div>
      <div style={{ fontWeight: 600 }}>{value}</div>
      {sub && <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>{sub}</div>}
    </div>
  );
}
