"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ClientRow, MovementRow } from "@/lib/data";
import type { ClientProgramItem } from "../page";
import type { ApptOption, ImportableProgram } from "../actions";
import { getClientAppointments, listImportableProgramsForClient } from "../actions";
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
  // Client's published programs for the Program-mode lobby. Fetched on
  // demand (when type=program AND a client is picked).
  const [programs, setPrograms] = useState<ImportableProgram[]>([]);
  const [programsLoading, startProgramsLoad] = useTransition();
  /** Program ID the user clicked Edit on; passed through to the WIP as a
   *  hint. (The WIP will load it via its own fetch path; for now this is
   *  a forward-compat hook.) */
  const [editProgramId, setEditProgramId] = useState<string>("");

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

  // Fetch the client's programs whenever the lobby needs them.
  useEffect(() => {
    if (!clientId || type !== "program") { setPrograms([]); return; }
    startProgramsLoad(async () => {
      const rows = await listImportableProgramsForClient(clientId);
      setPrograms(rows);
    });
  }, [clientId, type]);

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
    setEditProgramId("");
    setStarted(true);
    syncUrl({ client: clientId, type: "program" });
  }
  function startNewProgram() {
    // Wipe the per-client WIP cache so the rework mounts a blank program.
    // Archive the active WIP instead of destroying it — keeps a recoverable
    // backup in localStorage so a misclick doesn't lose work.
    try {
      const k = `monroe-programs-rework-${clientId || "noclient"}`;
      const raw = localStorage.getItem(k);
      if (raw) {
        localStorage.setItem(`monroe-programs-rework-backup-${clientId || "noclient"}-${Date.now()}`, raw);
        localStorage.removeItem(k);
      }
    } catch {}
    setEditProgramId("");
    setStarted(true);
    syncUrl({ client: clientId, type: "program" });
  }
  function editProgram(p: ImportableProgram) {
    setEditProgramId(p.id);
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
              : editProgramId
                ? `Editing ${programs.find((p) => p.id === editProgramId)?.name ?? "program"}`
                : "New / WIP"
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
      {clientId && type === "session" && (() => {
        const pickedClient = clients.find((c) => c.id === clientId);
        const clientLabel = pickedClient?.full_name ?? "this client";
        const orderedAppts = [...appts].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
        return (
        <section className="card" style={{ padding: "1rem 1.15rem" }}>
          <StepLabel n={3} label={`Pick a session for ${clientLabel} — or start new`} />
          {loading ? (
            <p className="meta" style={{ marginTop: "0.6rem", fontStyle: "italic" }}>Loading sessions…</p>
          ) : orderedAppts.length === 0 ? (
            <p className="meta" style={{ marginTop: "0.6rem", fontStyle: "italic" }}>
              No upcoming sessions for this client.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: "0.6rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              {orderedAppts.map((a) => {
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
                    <span style={{ display: "flex", flexDirection: "column", gap: "0.1rem" }}>
                      <span style={{ display: "flex", gap: "0.4rem", alignItems: "baseline" }}>
                        <strong style={{ fontSize: "0.9rem" }}>{whenLabel}</strong>
                        <StatusInline status={a.program_status} />
                      </span>
                      <span className="meta" style={{ fontSize: "0.72rem" }}>{clientLabel}</span>
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
        );
      })()}

      {clientId && type === "program" && (
        <section className="card" style={{ padding: "1rem 1.15rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.6rem", flexWrap: "wrap" }}>
            <StepLabel n={3} label="Pick a program — or start new" />
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: "0.4rem 1rem", fontSize: "0.86rem" }}
              onClick={startNewProgram}
            >
              + New program
            </button>
          </div>

          {programsLoading ? (
            <p className="meta" style={{ marginTop: "0.6rem", fontStyle: "italic" }}>Loading programs…</p>
          ) : (
            <>
              <ProgramGroup
                title="Current"
                subLabel="active right now"
                programs={programs.filter((p) => p.is_current)}
                onEdit={editProgram}
                defaultOpen
              />
              <ProgramGroup
                title="Completed"
                subLabel="historical programs"
                programs={programs.filter((p) => !p.is_current)}
                onEdit={editProgram}
                defaultOpen={false}
              />
            </>
          )}
        </section>
      )}
    </div>
  );
}

// ── Small subcomponents ──────────────────────────────────────────────

// Collapsible group for the Current / Completed program lists in Step 3.
function ProgramGroup({
  title,
  subLabel,
  programs,
  onEdit,
  defaultOpen,
}: {
  title: string;
  subLabel: string;
  programs: ImportableProgram[];
  onEdit: (p: ImportableProgram) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginTop: "0.75rem", border: "1px solid var(--line)", borderRadius: 4, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "0.55rem",
          background: open ? "rgba(0,0,0,0.02)" : "transparent",
          border: "none",
          padding: "0.55rem 0.7rem",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{open ? "▾" : "▸"}</span>
        <span style={{ fontWeight: 700, fontSize: "0.92rem" }}>{title}</span>
        <span className="meta" style={{ fontSize: "0.7rem" }}>{subLabel}</span>
        <span
          className="badge"
          style={{ marginLeft: "auto", fontSize: "0.6rem" }}
        >
          {programs.length}
        </span>
      </button>
      {open && (
        programs.length === 0 ? (
          <p className="meta" style={{ padding: "0.55rem 0.85rem", fontStyle: "italic", fontSize: "0.78rem", margin: 0 }}>
            {title === "Current" ? "No active programs." : "No completed programs yet."}
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {programs.map((p) => (
              <li
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.6rem",
                  padding: "0.5rem 0.85rem",
                  borderTop: "1px solid var(--line)",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.45rem", flexWrap: "wrap" }}>
                    <strong style={{ fontSize: "0.88rem" }}>{p.name || "Untitled program"}</strong>
                    <span className="badge" style={{ fontSize: "0.58rem" }}>
                      {p.program_kind === "at_home" ? "at-home" : "in-gym"}
                    </span>
                    {p.is_current && (
                      <span
                        className="badge"
                        style={{ fontSize: "0.56rem", color: "var(--rust)", borderColor: "var(--rust)" }}
                      >
                        current
                      </span>
                    )}
                  </div>
                  <div className="meta" style={{ fontSize: "0.7rem", marginTop: "0.15rem" }}>
                    {p.starts_on ?? "no start"} → {p.ends_on ?? "—"}
                    {p.duration_weeks ? ` · ${p.duration_weeks}wk` : ""}
                    {` · ${p.day_count} day${p.day_count === 1 ? "" : "s"}`}
                    {` · ${p.exercise_count} ex`}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: "0.3rem 0.85rem", fontSize: "0.8rem" }}
                  onClick={() => onEdit(p)}
                >
                  Edit →
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

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
