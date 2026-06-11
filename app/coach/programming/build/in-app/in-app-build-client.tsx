"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ClientRow, MovementRow } from "@/lib/data";
import type { ClientProgramItem } from "../page";
import type { ApptOption } from "../actions";
import { getClientAppointments } from "../actions";
import ReworkClient from "../rework/rework-client";
import ProgramsReworkClient from "../programs-rework/programs-rework-client";

// In App Build — three-stage lobby that funnels into the WIP views:
//   1. Pick client
//   2. Pick build type (Session | Program)
//   3. Pick existing entity (edit) OR start new
// Once an entity is chosen, mount the appropriate WIP view (ReworkClient
// for sessions, ProgramsReworkClient for programs) with hideTabs.
export default function InAppBuildClient({
  initialType,
  clients,
  libraryMovements,
  initialClientId,
  initialAppts,
  initialApptId,
  initialStartsAt,
  clientProgramSummary,
}: {
  initialType: "session" | "program";
  clients: ClientRow[];
  libraryMovements: MovementRow[];
  initialClientId: string;
  initialAppts: ApptOption[];
  initialApptId: string;
  initialStartsAt: string;
  clientProgramSummary: ClientProgramItem[];
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(initialClientId);
  const [type, setType] = useState<"session" | "program">(initialType);
  const [appts, setAppts] = useState<ApptOption[]>(initialAppts);
  const [apptId, setApptId] = useState(initialApptId);
  const [startsAt, setStartsAt] = useState(initialStartsAt);
  // Once user picks an entity in the lobby, mount the WIP view.
  const [started, setStarted] = useState<boolean>(!!initialApptId || !!initialStartsAt);
  const [loading, startLoad] = useTransition();

  const activeClients = clients.filter((c) => c.lifecycle === "active" || c.lifecycle === "online");

  // Refetch appointments when client changes (skip the first run since
  // initialAppts is already what the server returned for initialClientId).
  useEffect(() => {
    if (!clientId) { setAppts([]); return; }
    if (clientId === initialClientId) { setAppts(initialAppts); return; }
    startLoad(async () => {
      const data = await getClientAppointments(clientId);
      setAppts(data);
    });
  }, [clientId, initialClientId, initialAppts]);

  function syncUrl(params: { client?: string; type?: string; appt?: string; starts?: string }) {
    const url = new URL(window.location.href);
    const all: Record<string, string | undefined> = {
      client: params.client,
      type: params.type,
      appt: params.appt,
      starts: params.starts,
    };
    Object.entries(all).forEach(([k, v]) => {
      if (v) url.searchParams.set(k, v); else url.searchParams.delete(k);
    });
    router.replace(`${url.pathname}?${url.searchParams.toString()}`);
  }

  function pickClient(id: string) {
    setClientId(id);
    setApptId("");
    setStartsAt("");
    setStarted(false);
    syncUrl({ client: id, type });
  }
  function pickType(next: "session" | "program") {
    if (next === type) return;
    setType(next);
    setApptId("");
    setStartsAt("");
    setStarted(false);
    syncUrl({ client: clientId, type: next });
  }
  function startSessionFor(a: ApptOption) {
    setApptId(a.id);
    setStartsAt(a.starts_at);
    setStarted(true);
    syncUrl({ client: clientId, type: "session", appt: a.id, starts: a.starts_at });
  }
  function startNewSession() {
    const now = new Date().toISOString();
    setApptId("");
    setStartsAt(now);
    setStarted(true);
    syncUrl({ client: clientId, type: "session", starts: now });
  }
  function startProgram() {
    setStarted(true);
    syncUrl({ client: clientId, type: "program" });
  }
  function backToLobby() {
    setApptId("");
    setStartsAt("");
    setStarted(false);
    syncUrl({ client: clientId, type });
  }

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;

  // ── STARTED: drop into the WIP view ──────────────────────────────────
  if (started && clientId) {
    return (
      <div style={{ width: "min(1180px, 100% - 2rem)", margin: "0.6rem auto 0" }}>
        <BackBar
          clientName={selectedClient?.full_name ?? "—"}
          typeLabel={type === "session" ? "Session · In-gym" : "Program · At-home"}
          subLabel={
            type === "session"
              ? apptId
                ? new Date(startsAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                : "New blank session"
              : "Continuing WIP"
          }
          onBack={backToLobby}
        />
        {type === "session" ? (
          <ReworkClient
            clients={clients}
            initialClientId={clientId}
            initialAppts={appts}
            initialApptId={apptId}
            initialStartsAt={startsAt}
            libraryMovements={libraryMovements}
            hideTabs
            autoStart
          />
        ) : (
          <ProgramsReworkClient
            clients={clients}
            initialClientId={clientId}
            libraryMovements={libraryMovements}
            clientProgramSummary={clientProgramSummary}
            hideTabs
          />
        )}
      </div>
    );
  }

  // ── LOBBY ───────────────────────────────────────────────────────────
  return (
    <div
      className="no-print"
      style={{
        width: "min(1180px, 100% - 2rem)",
        margin: "0.85rem auto 0",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      {/* Step 1 — client picker */}
      <section className="card" style={{ padding: "1rem 1.15rem" }}>
        <StepLabel n={1} label="Pick client" />
        <select
          value={clientId}
          onChange={(e) => pickClient(e.target.value)}
          style={{
            marginTop: "0.5rem",
            width: "100%",
            padding: "0.5rem 0.6rem",
            fontFamily: "inherit",
            fontSize: "0.92rem",
            border: "1px solid var(--line)",
            borderRadius: 4,
            background: "#fff",
          }}
        >
          <option value="">— select a client —</option>
          {activeClients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
              {c.needs_at_home_programming ? " · flagged" : ""}
            </option>
          ))}
        </select>
      </section>

      {/* Step 2 — build type — only visible after a client is chosen */}
      {clientId && (
        <section className="card" style={{ padding: "1rem 1.15rem" }}>
          <StepLabel n={2} label="Build type" />
          <div
            role="tablist"
            style={{
              marginTop: "0.5rem",
              display: "inline-flex",
              border: "1px solid var(--line)",
              borderRadius: 999,
              padding: "0.15rem",
              background: "var(--paper)",
            }}
          >
            <Pill active={type === "session"} onClick={() => pickType("session")} label="Session" sub="In-gym" />
            <Pill active={type === "program"} onClick={() => pickType("program")} label="Program" sub="At-home" />
          </div>
        </section>
      )}

      {/* Step 3 — pick entity to edit OR create new */}
      {clientId && type === "session" && (
        <section className="card" style={{ padding: "1rem 1.15rem" }}>
          <StepLabel n={3} label="Pick a session — or start new" />
          {loading ? (
            <p className="meta" style={{ marginTop: "0.6rem", fontStyle: "italic" }}>Loading sessions…</p>
          ) : appts.length === 0 ? (
            <p className="meta" style={{ marginTop: "0.6rem", fontStyle: "italic" }}>
              No upcoming sessions for this client.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: "0.6rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              {appts.map((a) => {
                const when = new Date(a.starts_at);
                const whenLabel = when.toLocaleString("en-US", {
                  weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                });
                const verb =
                  a.program_status === "programmed" ? "Edit"
                  : a.program_status === "draft" ? "Continue draft"
                  : "Build";
                return (
                  <li key={a.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "0.55rem 0.7rem", border: "1px solid var(--line)", borderRadius: 4,
                  }}>
                    <span>
                      <strong style={{ fontSize: "0.9rem" }}>{whenLabel}</strong>
                      <StatusInline status={a.program_status} />
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: "0.3rem 0.85rem", fontSize: "0.82rem" }}
                      onClick={() => startSessionFor(a)}
                    >
                      {verb} →
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div style={{ marginTop: "0.7rem", display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: "0.4rem 1rem", fontSize: "0.86rem" }}
              onClick={startNewSession}
            >
              + New blank session
            </button>
          </div>
        </section>
      )}

      {clientId && type === "program" && (
        <section className="card" style={{ padding: "1rem 1.15rem" }}>
          <StepLabel n={3} label="Continue WIP or start new" />
          <p className="meta" style={{ marginTop: "0.45rem", fontSize: "0.82rem" }}>
            The Programs WIP saves your in-progress draft per client. Choose <em>Continue</em> to pick up
            where you left off for this client, or start a fresh program.
          </p>
          <div style={{ marginTop: "0.85rem", display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: "0.4rem 1rem", fontSize: "0.86rem" }}
              onClick={startProgram}
            >
              Continue / Edit WIP →
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: "0.4rem 1rem", fontSize: "0.86rem" }}
              onClick={() => {
                // Wipe localStorage WIP for this client so the WIP view loads
                // an empty program when it mounts.
                // Same key shape as programs-rework-client.tsx so the WIP
                // mounts with an empty program.
                try { localStorage.removeItem(`monroe-programs-rework-${clientId || "noclient"}`); } catch {}
                startProgram();
              }}
            >
              + New program
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

// ── Small subcomponents ──────────────────────────────────────────────

function StepLabel({ n, label }: { n: number; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
      <span
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 22, height: 22, borderRadius: 999,
          background: "var(--rust)", color: "#fff",
          fontWeight: 700, fontSize: "0.74rem", fontFamily: "Oswald, sans-serif",
        }}
      >
        {n}
      </span>
      <span style={{ fontFamily: "Oswald, sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", fontSize: "0.78rem", fontWeight: 600 }}>
        {label}
      </span>
    </div>
  );
}

function Pill({
  active, onClick, label, sub,
}: { active: boolean; onClick: () => void; label: string; sub: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        padding: "0.32rem 0.95rem",
        background: active ? "var(--rust)" : "transparent",
        color: active ? "#fff" : "var(--ink)",
        border: "none",
        borderRadius: 999,
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: "0.86rem",
        fontWeight: active ? 600 : 400,
        display: "flex",
        flexDirection: "column",
        lineHeight: 1.05,
        textAlign: "left",
      }}
    >
      <span>{label}</span>
      <span style={{ fontSize: "0.58rem", opacity: 0.8, marginTop: 1, fontWeight: 400, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {sub}
      </span>
    </button>
  );
}

function StatusInline({ status }: { status: "programmed" | "draft" | "needs_programming" | "n/a" }) {
  const color =
    status === "programmed" ? "var(--sage)"
    : status === "draft" ? "var(--amber)"
    : "var(--muted)";
  const label =
    status === "programmed" ? "✓ programmed"
    : status === "draft" ? "● draft"
    : "● needs programming";
  return (
    <span className="meta" style={{ marginLeft: "0.55rem", fontSize: "0.7rem", color }}>
      {label}
    </span>
  );
}

function BackBar({
  clientName, typeLabel, subLabel, onBack,
}: {
  clientName: string;
  typeLabel: string;
  subLabel: string;
  onBack: () => void;
}) {
  return (
    <div
      className="no-print"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.85rem",
        padding: "0.55rem 0.85rem",
        marginBottom: "0.65rem",
        background: "var(--paper)",
        border: "1px solid var(--line)",
        borderRadius: 4,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", flexWrap: "wrap" }}>
        <strong style={{ fontSize: "0.92rem" }}>{clientName}</strong>
        <span className="meta" style={{ fontSize: "0.74rem" }}>{typeLabel}</span>
        <span className="meta" style={{ fontSize: "0.7rem", color: "var(--rust)" }}>{subLabel}</span>
      </div>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ padding: "0.28rem 0.85rem", fontSize: "0.78rem" }}
        onClick={onBack}
      >
        ← Back to picker
      </button>
    </div>
  );
}
