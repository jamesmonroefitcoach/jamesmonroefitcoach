"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ClientRow, MovementRow } from "@/lib/data";
import type { ClientProgramItem } from "../page";
import type { ApptOption, ImportableProgram } from "../actions";
import {
  getClientAppointments,
  listImportableProgramsForClient,
  getOrCreatePairedSheetAction,
  getSessionProgramId,
} from "../actions";
import ReworkClient from "../rework/rework-client";
import ProgramsReworkClient from "../programs-rework/programs-rework-client";
import WorkoutSheetEmbed, { type ClientLite } from "@/components/workout-sheet-embed";
import { archiveActiveWip, listWipBackups, restoreWipBackup, deleteWipBackup, type WipBackup } from "@/lib/program-wip";

type ViewMode = "inapp" | "template";

// New Way Build — lobby (client → type → entity) → workspace with an
// In App | Template view toggle. Both views read/write through the
// program↔sheet bridge, so editing in one updates the other.
type QuickSession = { id: string; starts_at: string; client_id: string; client_name: string };
type QuickClient = { id: string; name: string };
type QuickDraftProgram = { id: string; name: string; client_id: string; client_name: string; created_at: string; program_kind: "in_gym" | "at_home" };

export default function NewWayClient({
  user,
  initialType,
  clients,
  libraryMovements,
  initialClientId,
  initialAppts,
  initialApptId,
  initialStartsAt,
  initialProgramId,
  initialView,
  clientProgramSummary,
  quickSessionsNeeding,
  quickClientsNeeding,
  quickDraftSessions,
  quickDraftPrograms,
}: {
  user: { id: string; name: string; role: "coach" | "client" | "admin" };
  initialType: "session" | "program";
  clients: ClientRow[];
  libraryMovements: MovementRow[];
  initialClientId: string;
  initialAppts: ApptOption[];
  initialApptId: string;
  initialStartsAt: string;
  initialProgramId: string;
  initialView: ViewMode;
  clientProgramSummary: ClientProgramItem[];
  quickSessionsNeeding: QuickSession[];
  quickClientsNeeding: QuickClient[];
  quickDraftSessions: QuickSession[];
  quickDraftPrograms: QuickDraftProgram[];
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(initialClientId);
  const [type, setType] = useState<"session" | "program">(initialType);
  const [appts, setAppts] = useState<ApptOption[]>(initialAppts);
  const [apptId, setApptId] = useState(initialApptId);
  const [startsAt, setStartsAt] = useState(initialStartsAt);
  // Once user picks an entity in the lobby, mount the workspace.
  const [started, setStarted] = useState<boolean>(!!initialApptId || !!initialStartsAt || !!initialProgramId);
  const [loading, startLoad] = useTransition();
  // Program list for Step 3.
  const [programs, setPrograms] = useState<ImportableProgram[]>([]);
  const [programsLoading, startProgramsLoad] = useTransition();
  /** localStorage backups for the picked client — surfaces the 'Recover
   *  previous draft' banner. Read fresh whenever clientId changes. */
  const [wipBackups, setWipBackups] = useState<WipBackup[]>([]);
  // Refresh-trigger so we can re-list backups after restore/delete without
  // making the listWipBackups call a render-time side effect.
  const [backupTick, setBackupTick] = useState(0);
  /** Program ID currently being edited (set by clicking Edit on a row, or
   *  passed in via ?program=). Empty string means "new". */
  const [editProgramId, setEditProgramId] = useState<string>(initialProgramId);
  /** Captured from the WIP's onDraftSaved callback. Lets the Template
   *  view resolve a paired sheet immediately after the first autosave —
   *  no need to wait for a manual Save Draft click. */
  const [autosaveDraftId, setAutosaveDraftId] = useState<string>("");
  /** The paired workout_sheets.id for the chosen program. Loaded lazily
   *  when the workspace mounts. Null when nothing is paired yet. */
  const [pairedSheetId, setPairedSheetId] = useState<string | null>(null);
  /** Which view is showing in the workspace. */
  const [view, setView] = useState<ViewMode>(initialView);

  const activeClients = clients.filter((c) => c.lifecycle === "active" || c.lifecycle === "online");

  // Refetch appointments when client changes.
  useEffect(() => {
    if (!clientId) { setAppts([]); return; }
    if (clientId === initialClientId) { setAppts(initialAppts); return; }
    startLoad(async () => {
      const data = await getClientAppointments(clientId);
      setAppts(data);
    });
  }, [clientId, initialClientId, initialAppts]);

  // Fetch programs when in Program mode.
  useEffect(() => {
    if (!clientId || type !== "program") { setPrograms([]); return; }
    startProgramsLoad(async () => {
      const rows = await listImportableProgramsForClient(clientId);
      setPrograms(rows);
    });
  }, [clientId, type]);

  // Re-list WIP backups whenever the picked client (or backupTick) changes.
  useEffect(() => {
    if (!clientId || type !== "program") { setWipBackups([]); return; }
    setWipBackups(listWipBackups(clientId));
  }, [clientId, type, backupTick]);

  // When the workspace mounts (or its target program changes), resolve
  // the paired sheet ID so the Template view has something to load.
  useEffect(() => {
    if (!started) { setPairedSheetId(null); return; }
    let cancelled = false;
    (async () => {
      let programIdToPair: string | null = null;
      // Priority order:
      //   1. The autosave draftId (most up-to-date — set as soon as the
      //      WIP fires its first autosave or hydrates from a stash).
      //   2. The Edit→ target the user picked from the lobby.
      //   3. The appointment's session_program_id (links to whichever
      //      programs row Old Way or a prior session draft saved into).
      if (autosaveDraftId) {
        programIdToPair = autosaveDraftId;
      } else if (type === "program" && editProgramId) {
        programIdToPair = editProgramId;
      } else if (type === "session" && apptId) {
        programIdToPair = await getSessionProgramId(apptId);
      }
      if (!programIdToPair) {
        if (!cancelled) setPairedSheetId(null);
        return;
      }
      const res = await getOrCreatePairedSheetAction(programIdToPair);
      if (cancelled) return;
      setPairedSheetId(res.ok ? res.sheetId : null);
    })();
    return () => { cancelled = true; };
  }, [started, type, editProgramId, apptId, autosaveDraftId]);

  function syncUrl(params: { client?: string; type?: string; appt?: string; starts?: string; program?: string; view?: string }) {
    const url = new URL(window.location.href);
    const all: Record<string, string | undefined> = {
      client: params.client,
      type: params.type,
      appt: params.appt,
      starts: params.starts,
      program: params.program,
      view: params.view,
    };
    Object.entries(all).forEach(([k, v]) => {
      if (v) url.searchParams.set(k, v); else url.searchParams.delete(k);
    });
    router.replace(`${url.pathname}?${url.searchParams.toString()}`);
  }

  function pickClient(id: string) {
    setClientId(id);
    setApptId(""); setStartsAt(""); setEditProgramId(""); setAutosaveDraftId(""); setStarted(false);
    syncUrl({ client: id, type });
  }
  function pickType(next: "session" | "program") {
    if (next === type) return;
    setType(next);
    setApptId(""); setStartsAt(""); setEditProgramId(""); setAutosaveDraftId(""); setStarted(false);
    syncUrl({ client: clientId, type: next });
  }
  function startSessionFor(a: ApptOption) {
    setApptId(a.id); setStartsAt(a.starts_at); setEditProgramId("");
    setStarted(true);
    syncUrl({ client: clientId, type: "session", appt: a.id, starts: a.starts_at, view });
  }
  function startNewSession() {
    const now = new Date().toISOString();
    setApptId(""); setStartsAt(now); setEditProgramId("");
    setStarted(true);
    syncUrl({ client: clientId, type: "session", starts: now, view });
  }
  function startNewProgram() {
    // Archive the active WIP to a timestamped backup key instead of
    // destroying it — a misclicked '+ New' must not lose work.
    archiveActiveWip(clientId);
    setEditProgramId("");
    setStarted(true);
    syncUrl({ client: clientId, type: "program", view });
  }
  function editProgram(p: ImportableProgram) {
    setEditProgramId(p.id);
    setStarted(true);
    syncUrl({ client: clientId, type: "program", program: p.id, view });
  }
  function backToLobby() {
    setApptId(""); setStartsAt(""); setEditProgramId(""); setAutosaveDraftId(""); setStarted(false);
    syncUrl({ client: clientId, type });
  }

  // ── Quick-actions ── jumps straight into the workspace bypassing the
  // 3-step lobby. Used by the four collapsibles above Step 1.
  function quickProgramSession(s: QuickSession) {
    setClientId(s.client_id);
    setType("session");
    setApptId(s.id);
    setStartsAt(s.starts_at);
    setEditProgramId("");
    setStarted(true);
    syncUrl({ client: s.client_id, type: "session", appt: s.id, starts: s.starts_at, view });
  }
  function quickStartProgramForClient(c: QuickClient) {
    archiveActiveWip(c.id);
    setClientId(c.id);
    setType("program");
    setApptId(""); setStartsAt(""); setEditProgramId("");
    setStarted(true);
    syncUrl({ client: c.id, type: "program", view });
  }
  function quickEditProgram(p: QuickDraftProgram) {
    setClientId(p.client_id);
    setType("program");
    setApptId(""); setStartsAt(""); setEditProgramId(p.id);
    setStarted(true);
    syncUrl({ client: p.client_id, type: "program", program: p.id, view });
  }
  function switchView(next: ViewMode) {
    if (next === view) return;
    setView(next);
    syncUrl({ client: clientId, type, appt: apptId, starts: startsAt, program: editProgramId || undefined, view: next });
  }

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;

  // ── STARTED: workspace with In App | Template toggle ─────────────────
  if (started && clientId) {
    const clientLite: ClientLite[] = clients
      .filter((c) => !!c.full_name)
      .map((c) => ({ id: c.id, name: c.full_name }));
    const subLabel =
      type === "session"
        ? apptId
          ? new Date(startsAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
          : "New blank session"
        : editProgramId
          ? `Editing ${programs.find((p) => p.id === editProgramId)?.name ?? "program"}`
          : "New / WIP";

    return (
      <div style={{ width: "min(1180px, 100% - 2rem)", margin: "0.6rem auto 0" }}>
        <BackBar
          clientName={selectedClient?.full_name ?? "—"}
          typeLabel={type === "session" ? "Session · In-gym" : "Program · At-home"}
          subLabel={subLabel}
          view={view}
          onSwitchView={switchView}
          templateReady={!!pairedSheetId}
          onBack={backToLobby}
        />
        {view === "inapp" ? (
          type === "session" ? (
            <ReworkClient
              clients={clients}
              initialClientId={clientId}
              initialAppts={appts}
              initialApptId={apptId}
              initialStartsAt={startsAt}
              libraryMovements={libraryMovements}
              hideTabs
              autoStart
              onDraftSaved={setAutosaveDraftId}
            />
          ) : (
            <ProgramsReworkClient
              clients={clients}
              initialClientId={clientId}
              libraryMovements={libraryMovements}
              clientProgramSummary={clientProgramSummary}
              hideTabs
              onDraftSaved={setAutosaveDraftId}
            />
          )
        ) : (
          // Template view — the workout sheet iframe for the paired sheet.
          // The iframe's own Save flow writes back through the bridge so
          // toggling to In App afterwards shows the updated rows.
          pairedSheetId ? (
            <WorkoutSheetEmbed
              user={{ id: user.id, name: user.name, role: user.role }}
              clients={clientLite}
              sessions={[]}
              sheetId={pairedSheetId}
            />
          ) : (
            <div className="card" style={{ padding: "1.5rem", textAlign: "center" }}>
              <p style={{ marginTop: 0, fontWeight: 600 }}>Save once to enable the Template view</p>
              <p className="meta" style={{ fontSize: "0.85rem" }}>
                A paired sheet is created the first time the program is saved. Switch back to In App,
                save your progress, and the Template view will load the paired sheet.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => switchView("inapp")}
                style={{ marginTop: "0.6rem", padding: "0.4rem 1rem" }}
              >
                ← Back to In App
              </button>
            </div>
          )
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
      {/* Quick actions — four collapsibles for the most common entry
          paths. All default closed so the lobby still leads with the
          deliberate client→type→entity flow; click any row here to skip
          straight into the workspace for that target. */}
      <QuickGroup
        title="Sessions needing programming this week"
        subLabel="next 7 days · across all clients"
        count={quickSessionsNeeding.length}
        emptyLabel="Nothing flagged. Everyone's covered for the week."
      >
        {quickSessionsNeeding.map((s) => (
          <QuickRow
            key={s.id}
            primary={fmtSessionWhen(s.starts_at)}
            secondary={s.client_name}
            ctaLabel="Create →"
            onClick={() => quickProgramSession(s)}
          />
        ))}
      </QuickGroup>

      <QuickGroup
        title="Clients needing programming"
        subLabel="flagged for at-home, no active program"
        count={quickClientsNeeding.length}
        emptyLabel="Every flagged client has an active program."
      >
        {quickClientsNeeding.map((c) => (
          <QuickRow
            key={c.id}
            primary={c.name}
            secondary="No current at-home program"
            ctaLabel="Create →"
            onClick={() => quickStartProgramForClient(c)}
          />
        ))}
      </QuickGroup>

      <QuickGroup
        title="Recently drafted sessions"
        subLabel="started but not finished"
        count={quickDraftSessions.length}
        emptyLabel="No session drafts hanging around."
      >
        {quickDraftSessions.map((s) => (
          <QuickRow
            key={s.id}
            primary={fmtSessionWhen(s.starts_at)}
            secondary={s.client_name}
            ctaLabel="Edit draft →"
            onClick={() => quickProgramSession(s)}
          />
        ))}
      </QuickGroup>

      <QuickGroup
        title="Recently drafted programs"
        subLabel="unpublished, in progress"
        count={quickDraftPrograms.length}
        emptyLabel="No program drafts hanging around."
      >
        {quickDraftPrograms.map((p) => (
          <QuickRow
            key={p.id}
            primary={p.name || "Untitled program"}
            secondary={`${p.client_name} · ${p.program_kind === "at_home" ? "at-home" : "in-gym"}`}
            ctaLabel="Edit program →"
            onClick={() => quickEditProgram(p)}
          />
        ))}
      </QuickGroup>

      {/* Step 1 — client picker */}
      <section className="card" style={{ padding: "1rem 1.15rem" }}>
        <StepLabel n={1} label="Pick client" />
        <select
          value={clientId}
          onChange={(e) => pickClient(e.target.value)}
          style={{
            marginTop: "0.5rem", width: "100%", padding: "0.5rem 0.6rem",
            fontFamily: "inherit", fontSize: "0.92rem",
            border: "1px solid var(--line)", borderRadius: 4, background: "#fff",
          }}
        >
          <option value="">— select a client —</option>
          {activeClients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}{c.needs_at_home_programming ? " · flagged" : ""}
            </option>
          ))}
        </select>
      </section>

      {/* Step 2 — build type */}
      {clientId && (
        <section className="card" style={{ padding: "1rem 1.15rem" }}>
          <StepLabel n={2} label="Build type" />
          <div
            role="tablist"
            style={{
              marginTop: "0.5rem", display: "inline-flex",
              border: "1px solid var(--line)", borderRadius: 999,
              padding: "0.15rem", background: "var(--paper)",
            }}
          >
            <Pill active={type === "session"} onClick={() => pickType("session")} label="Session" sub="In-gym" />
            <Pill active={type === "program"} onClick={() => pickType("program")} label="Program" sub="At-home" />
          </div>
        </section>
      )}

      {/* Step 3 — session */}
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

      {/* Recovery banner — shown when localStorage holds prior WIP backups
          for the picked client. Each '+ New program' click moves the
          current draft into a backup slot; this is how you get it back. */}
      {clientId && type === "program" && wipBackups.length > 0 && (
        <section
          className="card"
          style={{
            padding: "0.7rem 0.95rem",
            background: "rgba(168,61,43,0.05)",
            border: "1px solid var(--rust)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
            <strong style={{ fontSize: "0.88rem", color: "var(--rust)" }}>
              ↻ {wipBackups.length} previous draft{wipBackups.length === 1 ? "" : "s"} for this client
            </strong>
            <span className="meta" style={{ fontSize: "0.75rem" }}>
              Saved when you clicked &lsquo;+ New program.&rsquo; Restore the most recent or browse them all.
            </span>
          </div>
          <ul style={{ listStyle: "none", margin: "0.55rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            {wipBackups.slice(0, 5).map((b) => {
              const when = new Date(b.timestamp).toLocaleString("en-US", {
                month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
              });
              // Peek at the program name without parsing the full JSON.
              const nameMatch = b.json.match(/"name":"([^"]+)"/);
              const name = nameMatch?.[1] ?? "Untitled WIP";
              return (
                <li key={b.key} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: "0.5rem", padding: "0.35rem 0.55rem",
                  background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 4,
                }}>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <strong style={{ fontSize: "0.82rem" }}>{name}</strong>
                    <span className="meta" style={{ marginLeft: "0.45rem", fontSize: "0.7rem" }}>{when}</span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: "0.22rem 0.7rem", fontSize: "0.72rem" }}
                    onClick={() => {
                      if (restoreWipBackup(b.key, clientId)) {
                        // Drop into Program WIP with the restored draft.
                        setEditProgramId("");
                        setStarted(true);
                        setBackupTick((t) => t + 1);
                        syncUrl({ client: clientId, type: "program", view });
                      }
                    }}
                  >Restore</button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: "0.22rem 0.55rem", fontSize: "0.7rem", color: "var(--muted)" }}
                    onClick={() => {
                      if (confirm("Delete this backup permanently?")) {
                        deleteWipBackup(b.key);
                        setBackupTick((t) => t + 1);
                      }
                    }}
                  >×</button>
                </li>
              );
            })}
            {wipBackups.length > 5 && (
              <li className="meta" style={{ fontSize: "0.68rem", fontStyle: "italic", marginTop: "0.15rem" }}>
                + {wipBackups.length - 5} more (browse via DevTools → Local Storage if needed)
              </li>
            )}
          </ul>
        </section>
      )}

      {/* Step 3 — program */}
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

// ── quick actions ──────────────────────────────────────────────────────

function fmtSessionWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function QuickGroup({
  title, subLabel, count, emptyLabel, children,
}: {
  title: string;
  subLabel: string;
  count: number;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // When the section has zero items, dim it but keep the header clickable
  // so the count is visible.
  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 4,
        background: count === 0 ? "rgba(0,0,0,0.015)" : "var(--paper)",
        overflow: "hidden",
        opacity: count === 0 ? 0.7 : 1,
      }}
    >
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
          padding: "0.55rem 0.85rem",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{open ? "▾" : "▸"}</span>
        <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{title}</span>
        <span className="meta" style={{ fontSize: "0.7rem" }}>{subLabel}</span>
        <span
          className="badge"
          style={{
            marginLeft: "auto",
            fontSize: "0.6rem",
            color: count > 0 ? "var(--rust)" : "var(--muted)",
            borderColor: count > 0 ? "var(--rust)" : "var(--line)",
          }}
        >
          {count}
        </span>
      </button>
      {open && (
        count === 0 ? (
          <p className="meta" style={{ padding: "0.55rem 0.85rem", fontStyle: "italic", fontSize: "0.78rem", margin: 0 }}>
            {emptyLabel}
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {children}
          </ul>
        )
      )}
    </div>
  );
}

function QuickRow({
  primary, secondary, ctaLabel, onClick,
}: {
  primary: string;
  secondary: string;
  ctaLabel: string;
  onClick: () => void;
}) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.6rem",
        padding: "0.45rem 0.85rem",
        borderTop: "1px solid var(--line)",
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: "0.86rem", fontWeight: 600 }}>{primary}</div>
        <div className="meta" style={{ fontSize: "0.7rem", marginTop: "0.1rem" }}>{secondary}</div>
      </div>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ padding: "0.28rem 0.85rem", fontSize: "0.78rem" }}
        onClick={onClick}
      >
        {ctaLabel}
      </button>
    </li>
  );
}

// ── subcomponents (mirror in-app) ──────────────────────────────────────

function ProgramGroup({
  title, subLabel, programs, onEdit, defaultOpen,
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
          width: "100%", display: "flex", alignItems: "center", gap: "0.55rem",
          background: open ? "rgba(0,0,0,0.02)" : "transparent",
          border: "none", padding: "0.55rem 0.7rem", cursor: "pointer",
          fontFamily: "inherit", textAlign: "left",
        }}
      >
        <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{open ? "▾" : "▸"}</span>
        <span style={{ fontWeight: 700, fontSize: "0.92rem" }}>{title}</span>
        <span className="meta" style={{ fontSize: "0.7rem" }}>{subLabel}</span>
        <span className="badge" style={{ marginLeft: "auto", fontSize: "0.6rem" }}>
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
              <li key={p.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: "0.6rem", padding: "0.5rem 0.85rem",
                borderTop: "1px solid var(--line)",
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.45rem", flexWrap: "wrap" }}>
                    <strong style={{ fontSize: "0.88rem" }}>{p.name || "Untitled program"}</strong>
                    <span className="badge" style={{ fontSize: "0.58rem" }}>
                      {p.program_kind === "at_home" ? "at-home" : "in-gym"}
                    </span>
                    {p.is_current && (
                      <span className="badge" style={{ fontSize: "0.56rem", color: "var(--rust)", borderColor: "var(--rust)" }}>
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
        border: "none", borderRadius: 999, cursor: "pointer",
        fontFamily: "inherit", fontSize: "0.86rem",
        fontWeight: active ? 600 : 400,
        display: "flex", flexDirection: "column", lineHeight: 1.05, textAlign: "left",
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

// ── BackBar with the In App | Template view toggle ─────────────────────
function BackBar({
  clientName, typeLabel, subLabel, view, onSwitchView, templateReady, onBack,
}: {
  clientName: string;
  typeLabel: string;
  subLabel: string;
  view: ViewMode;
  onSwitchView: (next: ViewMode) => void;
  templateReady: boolean;
  onBack: () => void;
}) {
  return (
    <div
      className="no-print"
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: "0.85rem", padding: "0.55rem 0.85rem", marginBottom: "0.65rem",
        background: "var(--paper)", border: "1px solid var(--line)",
        borderRadius: 4, flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", flexWrap: "wrap" }}>
        <strong style={{ fontSize: "0.92rem" }}>{clientName}</strong>
        <span className="meta" style={{ fontSize: "0.74rem" }}>{typeLabel}</span>
        <span className="meta" style={{ fontSize: "0.7rem", color: "var(--rust)" }}>{subLabel}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
        {/* In App | Template segmented toggle */}
        <div
          role="tablist"
          style={{
            display: "inline-flex",
            border: "1px solid var(--line)", borderRadius: 999,
            padding: "0.15rem", background: "var(--bg)",
          }}
        >
          <ViewTab active={view === "inapp"} label="In App" onClick={() => onSwitchView("inapp")} />
          <ViewTab
            active={view === "template"}
            label="Template"
            onClick={() => onSwitchView("template")}
            title={templateReady ? "Switch to the workout sheet for this program" : "Save once to enable Template view"}
          />
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
    </div>
  );
}

function ViewTab({
  active, label, onClick, title,
}: { active: boolean; label: string; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      title={title}
      style={{
        padding: "0.28rem 0.85rem",
        background: active ? "var(--rust)" : "transparent",
        color: active ? "#fff" : "var(--ink)",
        border: "none", borderRadius: 999, cursor: "pointer",
        fontFamily: "inherit", fontSize: "0.78rem",
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </button>
  );
}
