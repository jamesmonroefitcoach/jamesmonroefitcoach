"use client";
import { useState } from "react";
import Link from "next/link";

export type WeekSessionItem = {
  id: string;
  client_id: string;
  client_name: string | null;
  starts_at: string;
  is_programmed: boolean;
};

export type WeekProgramItem = {
  clientId: string;
  clientName: string;
  programName: string | null;
  endsOn: string | null;
  daysUntilEnd: number | null;
  hasCurrent: boolean;
};

export type NoSessionClient = {
  id: string;
  name: string;
};

function fmtSessionTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function daysLabel(d: number | null) {
  if (d === null) return "no end date";
  if (d < 0) return `expired ${Math.abs(d)}d ago`;
  if (d === 0) return "expires today";
  return `${d}d left`;
}

// ─── Shared collapsible banner shell ───────────────────────────────────────
function BannerShell({
  title, summary, open, onToggle, children,
}: {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ borderBottom: "1px solid var(--line)", paddingBottom: open ? "0.85rem" : "0.6rem", marginBottom: "0.6rem" }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%", background: "none", border: "none", padding: "0.2rem 0",
          cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "space-between", fontFamily: "inherit",
        }}
      >
        <span style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
          {open ? "▾" : "▸"} {title}
        </span>
        <span className="meta banner-summary" style={{ fontSize: "0.72rem" }}>{summary}</span>
      </button>
      {open && <div style={{ marginTop: "0.6rem" }}>{children}</div>}
    </div>
  );
}

// ─── Two-column grid inside a banner ───────────────────────────────────────
function TwoCol({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="banner-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem" }}>
      {left}
      {right}
    </div>
  );
}

function ColHeader({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div style={{
      fontSize: "0.69rem", fontWeight: 700, textTransform: "uppercase",
      letterSpacing: "0.07em", color,
      paddingBottom: "0.3rem", borderBottom: `2px solid ${color}`,
      marginBottom: "0.4rem", display: "flex", alignItems: "center", gap: "0.35rem",
    }}>
      {label} <span style={{ fontWeight: 400, opacity: 0.7 }}>({count})</span>
    </div>
  );
}

// ─── Banner 1: Sessions This Week ──────────────────────────────────────────
function SessionsBanner({ sessions }: { sessions: WeekSessionItem[] }) {
  const [open, setOpen] = useState(false);
  const programmed = sessions.filter((s) => s.is_programmed);
  const needs = sessions.filter((s) => !s.is_programmed);

  return (
    <BannerShell
      title="Sessions This Week"
      summary={`${sessions.length} total · ${programmed.length} programmed · ${needs.length} pending`}
      open={open}
      onToggle={() => setOpen((v) => !v)}
    >
      <TwoCol
        left={
          <div>
            <ColHeader color="var(--sage)" label="✓ Programmed" count={programmed.length} />
            {programmed.length === 0 ? (
              <p className="meta" style={{ fontSize: "0.75rem" }}>None yet this week.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {programmed.map((s) => (
                  <div key={s.id} style={{
                    padding: "0.25rem 0.45rem", borderRadius: 3,
                    background: "rgba(90,107,74,0.07)",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem",
                  }}>
                    <span style={{ fontWeight: 600, fontSize: "0.8rem", flexShrink: 0 }}>{s.client_name ?? "—"}</span>
                    <span className="meta" style={{ fontSize: "0.68rem", whiteSpace: "nowrap" }}>{fmtSessionTime(s.starts_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        }
        right={
          <div>
            <ColHeader color="var(--amber)" label="⚠ Needs Programming" count={needs.length} />
            {needs.length === 0 ? (
              <p className="meta" style={{ fontSize: "0.75rem" }}>All sessions programmed 🎉</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {needs.map((s) => (
                  <Link
                    key={s.id}
                    href={`/coach/build-program?tab=session&client=${s.client_id}&appt=${s.id}`}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem",
                      padding: "0.25rem 0.45rem", borderRadius: 3,
                      background: "rgba(217,119,6,0.07)",
                      border: "1px solid rgba(217,119,6,0.2)",
                      textDecoration: "none",
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: "0.8rem", flexShrink: 0, color: "var(--fg)" }}>{s.client_name ?? "—"}</span>
                    <span style={{ fontSize: "0.68rem", color: "var(--amber)", whiteSpace: "nowrap" }}>{fmtSessionTime(s.starts_at)} →</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        }
      />
    </BannerShell>
  );
}

// ─── Banner 2: Client Programs ─────────────────────────────────────────────
function ProgramsBanner({ items }: { items: WeekProgramItem[] }) {
  const [open, setOpen] = useState(false);
  const active = items.filter((i) => i.hasCurrent);
  const needs = items.filter((i) => !i.hasCurrent);

  return (
    <BannerShell
      title="Client Programs"
      summary={`${active.length} active · ${needs.length} need programming`}
      open={open}
      onToggle={() => setOpen((v) => !v)}
    >
      <TwoCol
        left={
          <div>
            <ColHeader color="var(--sage)" label="✓ Active Program" count={active.length} />
            {active.length === 0 ? (
              <p className="meta" style={{ fontSize: "0.75rem" }}>None yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {active.map((item) => (
                  <div key={item.clientId} style={{
                    padding: "0.25rem 0.45rem", borderRadius: 3,
                    background: (item.daysUntilEnd !== null && item.daysUntilEnd <= 14)
                      ? "rgba(217,119,6,0.07)" : "rgba(90,107,74,0.07)",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem",
                  }}>
                    <span style={{ fontWeight: 600, fontSize: "0.8rem", flexShrink: 0 }}>{item.clientName}</span>
                    <div style={{ textAlign: "right", minWidth: 0 }}>
                      <div className="meta" style={{ fontSize: "0.68rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.programName}</div>
                      <div style={{
                        fontSize: "0.64rem",
                        color: (item.daysUntilEnd !== null && item.daysUntilEnd <= 14) ? "var(--amber)" : "var(--muted)",
                      }}>{daysLabel(item.daysUntilEnd)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        }
        right={
          <div>
            <ColHeader color="var(--amber)" label="⚠ Needs Program" count={needs.length} />
            {needs.length === 0 ? (
              <p className="meta" style={{ fontSize: "0.75rem" }}>All clients programmed 🎉</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {needs.map((item) => (
                  <Link
                    key={item.clientId}
                    href={`/coach/build-program?tab=program&client=${item.clientId}`}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem",
                      padding: "0.25rem 0.45rem", borderRadius: 3,
                      background: "rgba(217,119,6,0.07)",
                      border: "1px solid rgba(217,119,6,0.2)",
                      textDecoration: "none",
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: "0.8rem", color: "var(--fg)" }}>{item.clientName}</span>
                    <span style={{ fontSize: "0.68rem", color: "var(--amber)", whiteSpace: "nowrap" }}>program →</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        }
      />
    </BannerShell>
  );
}

// ─── Banner 3: No Sessions This Week ──────────────────────────────────────
function NoSessionsBanner({ clients }: { clients: NoSessionClient[] }) {
  const [open, setOpen] = useState(false);

  return (
    <BannerShell
      title="No Sessions This Week"
      summary={`${clients.length} active client${clients.length !== 1 ? "s" : ""} not scheduled`}
      open={open}
      onToggle={() => setOpen((v) => !v)}
    >
      {clients.length === 0 ? (
        <p className="meta" style={{ fontSize: "0.75rem" }}>All active clients have sessions this week 🎉</p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
          {clients.map((c) => (
            <Link
              key={c.id}
              href={`/coach/clients/${c.id}`}
              style={{
                padding: "0.2rem 0.55rem", borderRadius: 999,
                background: "rgba(0,0,0,0.04)",
                border: "1px solid var(--line)",
                fontSize: "0.78rem", fontWeight: 500,
                textDecoration: "none", color: "var(--fg)",
                whiteSpace: "nowrap",
              }}
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}
    </BannerShell>
  );
}

// ─── Composite export ──────────────────────────────────────────────────────
export default function WeekBanners({
  sessions,
  programs,
  noSessions,
}: {
  sessions: WeekSessionItem[];
  programs: WeekProgramItem[];
  noSessions: NoSessionClient[];
}) {
  return (
    <div style={{ marginBottom: "0.25rem" }}>
      <SessionsBanner sessions={sessions} />
      <ProgramsBanner items={programs} />
      <NoSessionsBanner clients={noSessions} />
    </div>
  );
}
