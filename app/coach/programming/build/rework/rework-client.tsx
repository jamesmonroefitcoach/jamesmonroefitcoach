"use client";
// Sessions Rework WIP — a from-scratch take on the in-gym session builder
// designed for live in-gym use. The flow is:
//   1. Pick a client + a scheduled session (or start fresh).
//   2. In "Select Exercises", drill three tiers deep: category → subcategory →
//      exercise. Tick the leaf you want and give it an order number.
//   3. The selected exercises stream into the Program section below, sorted
//      by order #. Each block looks like today's builder card.
//   4. During the session, hit Perform on each row to swap into log mode
//      (per-set weight + reps + notes). Edit pencil reverts to plan. Swap
//      opens a checkbox tree to pivot to another exercise. ✕ deletes the row.
//   5. Save Draft / Complete Session at the bottom.
//
// Everything in this file persists to localStorage only — it is intentionally
// not wired to Supabase yet so we can iterate freely.

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClientRow, MovementRow } from "@/lib/data";
import {
  CATEGORY_LABELS, EQUIPMENT_OPTIONS, EXERTION_LABELS,
  LIBRARY_HIERARCHY, hierarchyLeaves, leafToMovement,
  type Category, type Equipment, type Movement,
  type LibraryGroup, type LibraryNode, type LibraryLeaf,
} from "@/lib/programs";
import type { ApptOption } from "../actions";
import ImportPickerModal, { type ImportScope, type ImportResult } from "../import-picker";
import { addMovement } from "../../exercise-library/actions";
import {
  ExerciseCard, LibraryMovementsContext,
  type ProgramItem, type SetRow,
} from "../build-program-client";

// ── Slot model ───────────────────────────────────────────────────────────────
// ExerciseSlot is a ProgramItem (so it can be fed to the shared ExerciseCard
// in plan mode) with three rework-specific extras: a discriminant `type`,
// the `leafId` that ties it back to the library tree, and a live-session
// `mode` + `perform` state used by the perform / complete renderings.

type ExerciseSlot = ProgramItem & {
  type: "exercise";
  leafId: string;
  mode: "plan" | "perform" | "complete";
  perform: {
    weights: string[];
    actualReps: string[];
    setNotes: string[];
    sessionNote: string;
  };
};

type RestSlot = {
  type: "rest";
  uid: string;
  duration: number;
  unit: "s" | "min";
};

type Slot = ExerciseSlot | RestSlot;

// ── localStorage helpers ─────────────────────────────────────────────────────
const DRAFT_KEY_PREFIX = "monroe-rework-draft-";
function draftKey(clientId: string, apptId: string): string {
  return `${DRAFT_KEY_PREFIX}${clientId || "noclient"}-${apptId || "noappt"}`;
}

type DraftSnapshot = {
  slots: Slot[];
  sessionTitle: string;
  selectExercisesOpen: boolean;
};

function loadDraft(key: string): DraftSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as DraftSnapshot) : null;
  } catch { return null; }
}
function saveDraft(key: string, snap: DraftSnapshot) {
  try { localStorage.setItem(key, JSON.stringify(snap)); } catch {}
}
function clearDraft(key: string) {
  try { localStorage.removeItem(key); } catch {}
}

// ── tree helpers ─────────────────────────────────────────────────────────────

// Group labels and their `groupId` for the top-level row.
// Re-uses LIBRARY_HIERARCHY but drops Cardio's "Rest" leaf (we surface Rest
// as a "+ Rest" button between blocks instead).
const GROUPS: LibraryGroup[] = LIBRARY_HIERARCHY;

function nodeLabel(n: LibraryNode | LibraryLeaf): string { return n.label; }

// For a sub-category node without children, the leaf-level exercises are the
// rows in the Exercise Library tagged with that subcategory.
function leafExercisesFor(
  node: LibraryNode,
  libraryMovements: MovementRow[],
): Array<{ id: string; label: string; movement: Movement }> {
  if (node.children && node.children.length > 0) {
    return node.children.map((c) => ({
      id: `leaf-${c.id}`,
      label: c.label,
      movement: leafToMovement(c),
    }));
  }
  // No children — pull from the Exercise Library by subcategory match.
  const matches = libraryMovements.filter(
    (m) => (m.subcategory ?? "").trim().toLowerCase() === node.label.trim().toLowerCase()
  );
  if (matches.length > 0) {
    return matches.map((m) => ({
      id: `mv-${m.id}`,
      label: m.name,
      movement: {
        id: m.id,
        name: m.name,
        category: m.category as Category,
        subcategory: m.subcategory ?? node.label,
        muscles: m.muscles ?? [],
        equipment_list: (m.equipment_list ?? []) as Equipment[],
        equipment_specifics: m.equipment_specifics ?? undefined,
        cues: m.cues ?? undefined,
        is_core: m.is_core,
      },
    }));
  }
  // Fall back to the node itself so the coach can still tick it as an
  // exercise placeholder until library rows exist.
  const movement = leafToMovement({
    id: node.id, label: node.label, description: node.description,
    category: node.category, is_core: node.is_core,
  });
  return [{ id: `node-${node.id}`, label: node.label, movement }];
}

// ── default block prescription when first added ──────────────────────────────
function newExerciseSlot(leafId: string, movement: Movement): ExerciseSlot {
  return {
    type: "exercise",
    uid: `ex-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    leafId,
    movement,
    is_warmup: false,
    sets: 3,
    reps: "8-10",
    exertion_score: 5,
    same_format: true,
    set_rows: [] as SetRow[],
    variations: [],
    equipment_list: (movement.equipment_list ?? []) as Equipment[],
    equipment_specifics: movement.equipment_specifics,
    mode: "plan",
    perform: { weights: [], actualReps: [], setNotes: [], sessionNote: "" },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function ReworkClient({
  clients, initialClientId, initialAppts, initialApptId, initialStartsAt, libraryMovements,
}: {
  clients: ClientRow[];
  initialClientId: string;
  initialAppts: ApptOption[];
  initialApptId: string;
  initialStartsAt: string;
  libraryMovements: MovementRow[];
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(initialClientId);
  const [apptId, setApptId] = useState(initialApptId);
  const selectedClient = useMemo(() => clients.find((c) => c.id === clientId) ?? null, [clients, clientId]);
  const selectedAppt = useMemo(() => initialAppts.find((a) => a.id === apptId) ?? null, [initialAppts, apptId]);

  const fmtSessionTitle = (iso: string) => new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
  const initialSessionTitle = apptId && selectedAppt
    ? fmtSessionTitle(selectedAppt.starts_at)
    : initialStartsAt
      ? fmtSessionTitle(initialStartsAt)
      : "New session";

  // Show picker until both client + session-or-fresh are chosen
  const [step, setStep] = useState<"picker" | "builder">(clientId && (apptId || initialStartsAt) ? "builder" : "picker");

  const dKey = draftKey(clientId, apptId);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [sessionTitle, setSessionTitle] = useState(initialSessionTitle);
  const [selectOpen, setSelectOpen] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage when client+appt is known
  useEffect(() => {
    if (step !== "builder") return;
    const snap = loadDraft(dKey);
    if (snap) {
      setSlots(snap.slots);
      setSessionTitle(snap.sessionTitle);
      setSelectOpen(snap.selectExercisesOpen);
    } else {
      setSlots([]);
    }
    setHydrated(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, dKey]);

  // Persist on every change after hydrate
  useEffect(() => {
    if (step !== "builder" || !hydrated) return;
    saveDraft(dKey, { slots, sessionTitle, selectExercisesOpen: selectOpen });
  }, [slots, sessionTitle, selectOpen, dKey, step, hydrated]);

  // ── Derived: how many slots reference each leaf (supports adding twice) ──
  const leafCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of slots) {
      if (s.type === "exercise") m.set(s.leafId, (m.get(s.leafId) ?? 0) + 1);
    }
    return m;
  }, [slots]);

  // ── Exercise count + ordered exercise slots ───────────────────────────────
  const exerciseSlots = useMemo(() => slots.filter((s): s is ExerciseSlot => s.type === "exercise"), [slots]);

  // ── Selection mutations ──────────────────────────────────────────────────
  // Checkbox toggle: if any slots reference this leaf, remove ALL of them.
  // Otherwise add one new instance.
  function toggleLeaf(leafId: string, movement: Movement) {
    setSlots((cur) => {
      const anyMatch = cur.some((s) => s.type === "exercise" && s.leafId === leafId);
      if (anyMatch) return cur.filter((s) => !(s.type === "exercise" && s.leafId === leafId));
      return [...cur, newExerciseSlot(leafId, movement)];
    });
  }
  // Light + button: always appends another instance of this leaf, even if
  // one already exists. Counter next to the name reflects the running total.
  function addLeafAgain(leafId: string, movement: Movement) {
    setSlots((cur) => [...cur, newExerciseSlot(leafId, movement)]);
  }

  function setOrderNumForLeaf(leafId: string, targetOrderNum: number) {
    setSlots((cur) => {
      const exSlots = cur.filter((s): s is ExerciseSlot => s.type === "exercise");
      const target = exSlots.find((s) => s.leafId === leafId);
      if (!target) return cur;
      const others = exSlots.filter((s) => s.leafId !== leafId);
      const clamped = Math.max(1, Math.min(targetOrderNum, others.length + 1));
      const newOrder: ExerciseSlot[] = [...others];
      newOrder.splice(clamped - 1, 0, target);
      // Rebuild slots interleaving the existing rest slots in their old positions
      // (simple model: rests live AFTER the exercise that's at the position
      // immediately before them — when exercises reorder, rests follow their
      // anchor). For now we just rebuild from scratch and append rests at end
      // in their original relative order.
      const rests = cur.filter((s): s is RestSlot => s.type === "rest");
      return [...newOrder, ...rests];
    });
  }

  function patchSlot(uid: string, patch: Partial<ExerciseSlot>) {
    setSlots((cur) => cur.map((s) => {
      if (s.uid !== uid || s.type !== "exercise") return s;
      return { ...s, ...patch } as ExerciseSlot;
    }));
  }

  function patchRest(uid: string, patch: Partial<RestSlot>) {
    setSlots((cur) => cur.map((s) => {
      if (s.uid !== uid || s.type !== "rest") return s;
      return { ...s, ...patch } as RestSlot;
    }));
  }

  function deleteSlot(uid: string) {
    setSlots((cur) => cur.filter((s) => s.uid !== uid));
  }

  function moveSlot(uid: string, dir: -1 | 1) {
    setSlots((cur) => {
      const i = cur.findIndex((s) => s.uid === uid);
      if (i < 0) return cur;
      const j = i + dir;
      if (j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  // Reorder a single exercise slot to land at a new index among the
  // exercise-only list (rest slots keep their position in the overall
  // slots array). Used by the Workout Order panel for both the ↑↓ arrows
  // and HTML5 drag-drop.
  function moveExerciseToIndex(uid: string, dstExIdx: number) {
    setSlots((cur) => {
      const ex = cur.filter((s): s is ExerciseSlot => s.type === "exercise");
      const srcIdx = ex.findIndex((s) => s.uid === uid);
      if (srcIdx < 0) return cur;
      const clamped = Math.max(0, Math.min(dstExIdx, ex.length - 1));
      if (clamped === srcIdx) return cur;
      const reordered = [...ex];
      const [moved] = reordered.splice(srcIdx, 1);
      reordered.splice(clamped, 0, moved);
      // Rebuild: walk the original slots, drop in the reordered exercise
      // slots in sequence at each exercise position; rests stay put.
      let exi = 0;
      return cur.map((s) => s.type === "exercise" ? reordered[exi++] : s);
    });
  }

  function insertRestAfter(uid: string) {
    setSlots((cur) => {
      const i = cur.findIndex((s) => s.uid === uid);
      if (i < 0) return cur;
      const next = [...cur];
      next.splice(i + 1, 0, {
        type: "rest", uid: `rest-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        duration: 60, unit: "s",
      });
      return next;
    });
  }
  function insertRestAtStart() {
    setSlots((cur) => [
      { type: "rest", uid: `rest-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, duration: 60, unit: "s" },
      ...cur,
    ]);
  }

  // ── Perform / Complete actions ───────────────────────────────────────────
  function setSlotMode(uid: string, mode: "plan" | "perform" | "complete") {
    patchSlot(uid, { mode });
  }

  // ── Swap modal ───────────────────────────────────────────────────────────
  const [swappingUid, setSwappingUid] = useState<string | null>(null);
  function applySwap(newLeafId: string, newMovement: Movement) {
    if (!swappingUid) return;
    setSlots((cur) => cur.map((s) => {
      if (s.uid !== swappingUid || s.type !== "exercise") return s;
      return {
        ...s,
        leafId: newLeafId,
        movement: newMovement,
        // keep prescription/log, only the identity changes
      };
    }));
    setSwappingUid(null);
  }

  // ── Save Draft / Complete Session ────────────────────────────────────────
  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  function handleSaveDraft() {
    saveDraft(dKey, { slots, sessionTitle, selectExercisesOpen: selectOpen });
    alert("Draft saved to this browser.");
  }
  function handleCompleteSession() {
    const incomplete = exerciseSlots.filter((s) => s.mode !== "complete");
    if (incomplete.length > 0) {
      setConfirmCompleteOpen(true);
      return;
    }
    finalizeSession();
  }
  function finalizeSession() {
    // Drop un-performed slots (keep only completed exercises + rests between
    // them) and surface the post-session report.
    setSlots((cur) => cur.filter((s) => s.type === "rest" || (s.type === "exercise" && s.mode === "complete")));
    setConfirmCompleteOpen(false);
    setReportOpen(true);
  }

  // ── Import flow (re-uses the existing modal) ─────────────────────────────
  const [importOpen, setImportOpen] = useState(false);
  function applyImport(result: ImportResult) {
    // Pull exercises from the first day of the source (we treat it as a
    // single-session import). Map each into an ExerciseSlot using our
    // default newExerciseSlot helper.
    const day = (result.days?.[0] as any) ?? null;
    if (!day) { setImportOpen(false); return; }
    const items: any[] = day.items ?? [];
    setSlots(items.map((it, i) => {
      const slot = newExerciseSlot(`imp-${i}-${it.movement?.id ?? "unk"}`, it.movement ?? { id: `imp-${i}`, name: it.movement?.name ?? "Imported", category: "push" as Category });
      slot.sets = it.sets ?? slot.sets;
      slot.reps = it.reps ?? slot.reps;
      slot.exertion_score = it.exertion_score ?? slot.exertion_score;
      slot.variations = it.variations ?? slot.variations;
      slot.equipment_list = (it.equipment_list ?? slot.equipment_list) as Equipment[];
      slot.equipment_specifics = it.equipment_specifics ?? slot.equipment_specifics;
      slot.notes = it.notes ?? slot.notes;
      return slot;
    }));
    setImportOpen(false);
  }

  // ── Other modal state ────────────────────────────────────────────────────
  const [uploadOpen, setUploadOpen] = useState(false);
  const [printoutOpen, setPrintoutOpen] = useState(false);

  // ─── PICKER STEP ────────────────────────────────────────────────────────
  if (step === "picker") {
    return (
      <>
        <TabsHeader />
        <PickerView
          clients={clients}
          appts={initialAppts}
          clientId={clientId}
          apptId={apptId}
          onPickClient={(id) => { setClientId(id); setApptId(""); }}
          onPickAppt={(id) => setApptId(id)}
          onStart={() => setStep("builder")}
          onStartFresh={() => { setApptId(""); setStep("builder"); }}
        />
      </>
    );
  }

  // ─── BUILDER STEP ───────────────────────────────────────────────────────
  return (
    <LibraryMovementsContext.Provider value={libraryMovements}>
      <TabsHeader />

      {/* Top action bar */}
      <div className="no-print" style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginBottom: "0.85rem", flexWrap: "wrap" }}>
        <button className="btn btn-ghost" onClick={() => setImportOpen(true)} title="Import from a past program or session">⇪ Import</button>
        <button className="btn btn-ghost" onClick={() => setUploadOpen(true)} title="Upload a photo of a printout to populate this session (coming soon)">📤 Upload</button>
        <button className="btn btn-ghost" onClick={() => setPrintoutOpen(true)} title="Open a printout draft to take to the gym floor">📄 View Printout</button>
        <button className="btn btn-ghost" onClick={() => setStep("picker")}>← Back</button>
      </div>

      {/* Client summary card — matches the existing Program tab's Programming
          for header (badge, name, tier · cadence · since, full-profile link)
          plus Goals + Injuries underneath. */}
      {selectedClient && (
        <div className="card" style={{ marginBottom: "1rem", borderLeft: "4px solid var(--rust)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
            <div>
              <span className="badge">Programming for</span>
              <h2 style={{ marginTop: "0.35rem", marginBottom: "0.15rem" }}>{selectedClient.full_name}</h2>
              <div className="meta" style={{ fontSize: "0.82rem" }}>
                {selectedClient.tier?.replace("_", " ") ?? "—"} · {selectedClient.regular_frequency ?? "—"} sessions/wk · since {selectedClient.member_since ? new Date(selectedClient.member_since).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                {selectedAppt ? <> · {new Date(selectedAppt.starts_at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</> : null}
              </div>
            </div>
            <Link className="btn btn-ghost" href={`/coach/clients/${selectedClient.id}`} style={{ padding: "0.35rem 0.7rem", fontSize: "0.72rem" }}>
              full profile →
            </Link>
          </div>
          <div style={{ marginTop: "0.7rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem" }}>
            <div>
              <div className="stat-label">Goals</div>
              <p style={{ marginTop: "0.25rem", fontSize: "0.88rem" }}>{selectedClient.goals ?? <span className="meta">No goals on file</span>}</p>
            </div>
            <div>
              <div className="stat-label" style={{ color: selectedClient.injuries ? "var(--red)" : undefined }}>Injuries / cautions</div>
              <p style={{ marginTop: "0.25rem", fontSize: "0.88rem", color: selectedClient.injuries ? "var(--red)" : undefined }}>
                {selectedClient.injuries ?? <span className="meta">None reported</span>}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Select Exercises (collapsible) ─── */}
      <SelectExercisesPanel
        open={selectOpen}
        onToggle={() => setSelectOpen((v) => !v)}
        groups={GROUPS}
        libraryMovements={libraryMovements}
        slots={slots}
        leafCounts={leafCounts}
        exerciseSlots={exerciseSlots}
        onToggleLeaf={toggleLeaf}
        onAddLeafAgain={addLeafAgain}
        onMoveExerciseToIndex={moveExerciseToIndex}
        onDeleteSlot={deleteSlot}
      />

      {/* ─── Program section ─── */}
      <section style={{ marginTop: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid var(--line)", paddingBottom: "0.35rem", marginBottom: "0.6rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Program</h2>
          <span className="meta" style={{ fontSize: "0.74rem" }}>{exerciseSlots.length} exercise{exerciseSlots.length === 1 ? "" : "s"}</span>
        </div>

        {slots.length === 0 ? (
          <p className="meta" style={{ padding: "0.85rem 0.4rem" }}>
            Pick exercises above to start building the session.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {/* Insert-rest-before-first button */}
            <button
              type="button"
              className="btn btn-ghost no-print"
              style={{ alignSelf: "center", fontSize: "0.66rem", padding: "0.12rem 0.6rem", color: "var(--muted)" }}
              onClick={insertRestAtStart}
            >+ Rest</button>
            {slots.map((s, idx) => {
              const isLast = idx === slots.length - 1;
              return (
                <div key={s.uid}>
                  {s.type === "exercise" ? (
                    <ExerciseSlotCard
                      slot={s}
                      orderNum={(() => {
                        let n = 0;
                        for (let i = 0; i <= idx; i++) if (slots[i].type === "exercise") n++;
                        return n;
                      })()}
                      onPatch={(patch) => patchSlot(s.uid, patch)}
                      onSetMode={(mode) => setSlotMode(s.uid, mode)}
                      onSwap={() => setSwappingUid(s.uid)}
                      onDelete={() => deleteSlot(s.uid)}
                      onMoveUp={() => moveSlot(s.uid, -1)}
                      onMoveDown={() => moveSlot(s.uid, 1)}
                    />
                  ) : (
                    <RestSlotCard
                      slot={s}
                      onPatch={(patch) => patchRest(s.uid, patch)}
                      onDelete={() => deleteSlot(s.uid)}
                      onMoveUp={() => moveSlot(s.uid, -1)}
                      onMoveDown={() => moveSlot(s.uid, 1)}
                    />
                  )}
                  {!isLast && (
                    <button
                      type="button"
                      className="btn btn-ghost no-print"
                      style={{ alignSelf: "center", fontSize: "0.66rem", padding: "0.12rem 0.6rem", color: "var(--muted)", marginTop: "0.3rem", display: "block", marginLeft: "auto", marginRight: "auto" }}
                      onClick={() => insertRestAfter(s.uid)}
                    >+ Rest</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ─── Bottom action bar ─── */}
      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1.25rem" }}>
        <button className="btn btn-ghost" onClick={handleSaveDraft}>Save Draft</button>
        <button className="btn btn-primary" onClick={handleCompleteSession}>Complete Session</button>
      </div>

      {/* ─── Modals ──────────────────────────────────────────────────────── */}
      {importOpen && (
        <ImportPickerModal
          scope={"session" as ImportScope}
          currentClientId={clientId}
          currentClientName={selectedClient?.full_name ?? ""}
          destinationIsEmpty={slots.length === 0}
          onClose={() => setImportOpen(false)}
          onImport={applyImport}
        />
      )}

      {uploadOpen && (
        <SmallModal title="Upload printout" onClose={() => setUploadOpen(false)}>
          <p className="meta" style={{ fontSize: "0.86rem", margin: "0.4rem 0 0.8rem" }}>
            <strong>Coming soon.</strong> Snap a photo of your handwritten or printed session sheet and we&apos;ll parse the exercises, weights, and reps into the Program section below.
          </p>
          <p className="meta" style={{ fontSize: "0.78rem" }}>For now please enter the session by hand using the Select Exercises panel above, or use Import to pull from a past session.</p>
        </SmallModal>
      )}

      {printoutOpen && (
        <PrintoutModal
          slots={slots}
          clientName={selectedClient?.full_name ?? ""}
          sessionTitle={sessionTitle}
          startsAt={selectedAppt?.starts_at ?? initialStartsAt}
          onClose={() => setPrintoutOpen(false)}
        />
      )}

      {swappingUid && (() => {
        const target = slots.find((s) => s.uid === swappingUid && s.type === "exercise") as ExerciseSlot | undefined;
        if (!target) return null;
        return (
          <SwapModal
            groups={GROUPS}
            libraryMovements={libraryMovements}
            currentLeafId={target.leafId}
            onClose={() => setSwappingUid(null)}
            onPick={(leafId, movement) => applySwap(leafId, movement)}
          />
        );
      })()}

      {confirmCompleteOpen && (
        <SmallModal title="Some exercises weren't performed" onClose={() => setConfirmCompleteOpen(false)}>
          <p style={{ fontSize: "0.88rem", margin: "0.4rem 0 0.8rem" }}>
            {exerciseSlots.filter((s) => s.mode !== "complete").length} exercise{exerciseSlots.filter((s) => s.mode !== "complete").length === 1 ? " was" : "s were"} not marked complete. If you proceed, they&apos;ll be dropped from the session record.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.4rem" }}>
            <button className="btn btn-ghost" onClick={() => setConfirmCompleteOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={finalizeSession}>Proceed</button>
          </div>
        </SmallModal>
      )}

      {reportOpen && (
        <SmallModal title="Post Session Report" onClose={() => { setReportOpen(false); clearDraft(dKey); }}>
          <p style={{ fontSize: "0.86rem", margin: "0.3rem 0 0.5rem" }}>
            Logged {exerciseSlots.filter((s) => s.mode === "complete").length} completed exercise{exerciseSlots.filter((s) => s.mode === "complete").length === 1 ? "" : "s"}.
          </p>
          <ul style={{ paddingLeft: "1.1rem", margin: 0, fontSize: "0.82rem", lineHeight: 1.55 }}>
            {exerciseSlots.filter((s) => s.mode === "complete").map((s) => (
              <li key={s.uid}>
                <strong>{s.movement.name}</strong>
                {s.perform.weights.some((w) => w) ? <> · weights: {s.perform.weights.filter((w) => w).join(", ")}</> : null}
                {s.perform.actualReps.some((r) => r) ? <> · reps: {s.perform.actualReps.filter((r) => r).join(", ")}</> : null}
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.85rem" }}>
            <button
              className="btn btn-primary"
              onClick={() => {
                setReportOpen(false);
                clearDraft(dKey);
                router.push("/coach/programming/build/rework");
                router.refresh();
              }}
            >Done</button>
          </div>
        </SmallModal>
      )}
    </LibraryMovementsContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabs header (links — Sessions Rework is the active tab here)
// ─────────────────────────────────────────────────────────────────────────────
function TabsHeader() {
  const TABS: { id: string; label: string; href: string }[] = [
    { id: "rework",   label: "Sessions Rework WIP", href: "/coach/programming/build/rework" },
    { id: "programs", label: "Programs WIP",        href: "/coach/programming/build/programs-rework" },
    { id: "session",  label: "Sessions",            href: "/coach/programming/build?tab=session" },
    { id: "program",  label: "Program",             href: "/coach/programming/build?tab=program" },
  ];
  return (
    <div className="no-print" style={{ borderBottom: "2px solid var(--line)", marginBottom: "1.5rem", display: "flex", alignItems: "flex-end" }}>
      {TABS.map((t) => {
        const active = t.id === "rework";
        return (
          <Link
            key={t.id}
            href={t.href}
            style={{
              padding: "0.55rem 1.4rem",
              borderBottom: active ? "2px solid var(--rust)" : "2px solid transparent",
              marginBottom: "-2px",
              fontSize: "0.95rem", fontWeight: active ? 700 : 400,
              color: active ? "var(--rust)" : "var(--muted)",
              textDecoration: "none",
              letterSpacing: active ? "0.01em" : undefined,
            }}
          >{t.label}</Link>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Picker view (client + session)
// ─────────────────────────────────────────────────────────────────────────────
function PickerView({
  clients, appts, clientId, apptId, onPickClient, onPickAppt, onStart, onStartFresh,
}: {
  clients: ClientRow[];
  appts: ApptOption[];
  clientId: string;
  apptId: string;
  onPickClient: (id: string) => void;
  onPickAppt: (id: string) => void;
  onStart: () => void;
  onStartFresh: () => void;
}) {
  const activeClients = clients.filter((c) => c.lifecycle === "active");
  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Pick a client and session</h2>
      <p className="meta" style={{ fontSize: "0.82rem", marginTop: "0.25rem" }}>This page is sandboxed — your work won&apos;t hit Supabase until we ship the full rework.</p>
      <hr className="divider" />
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        <label className="stat-label">Client</label>
        <select
          className="select"
          value={clientId}
          onChange={(e) => onPickClient(e.target.value)}
        >
          <option value="">— pick a client —</option>
          {activeClients.map((c) => (
            <option key={c.id} value={c.id}>{c.full_name}</option>
          ))}
        </select>

        {clientId && (
          <>
            <label className="stat-label">Session</label>
            {appts.length === 0 ? (
              <p className="meta" style={{ fontSize: "0.8rem" }}>No upcoming sessions for this client — start a fresh blank session below.</p>
            ) : (
              <select
                className="select"
                value={apptId}
                onChange={(e) => onPickAppt(e.target.value)}
              >
                <option value="">— pick a session —</option>
                {appts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {new Date(a.starts_at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    {a.program_status === "programmed" ? " · programmed" : a.program_status === "draft" ? " · draft" : ""}
                  </option>
                ))}
              </select>
            )}
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
          <button className="btn btn-ghost" onClick={onStartFresh} disabled={!clientId}>Start blank session</button>
          <button className="btn btn-primary" onClick={onStart} disabled={!clientId || !apptId}>Open session →</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Select Exercises panel — three-tier tree with checkboxes + order #
// ─────────────────────────────────────────────────────────────────────────────
function SelectExercisesPanel({
  open, onToggle, groups, libraryMovements, slots, leafCounts, exerciseSlots,
  onToggleLeaf, onAddLeafAgain, onMoveExerciseToIndex, onDeleteSlot,
}: {
  open: boolean;
  onToggle: () => void;
  groups: LibraryGroup[];
  libraryMovements: MovementRow[];
  slots: Slot[];
  leafCounts: Map<string, number>;
  exerciseSlots: ExerciseSlot[];
  onToggleLeaf: (leafId: string, movement: Movement) => void;
  onAddLeafAgain: (leafId: string, movement: Movement) => void;
  onMoveExerciseToIndex: (uid: string, dstExIdx: number) => void;
  onDeleteSlot: (uid: string) => void;
}) {
  // Local checkbox state for category + subcategory rows. These don't add
  // exercises to the program; they only reveal deeper tiers in the UI.
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [openSubs, setOpenSubs] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const router = useRouter();

  // Flat searchable index of every leaf across every category/subcategory.
  // The type-search at the bottom of the panel filters this list.
  const allLeaves = useMemo(() => {
    const out: { leafId: string; label: string; movement: Movement; group: string; sub: string }[] = [];
    for (const g of groups) {
      for (const n of g.nodes) {
        const leaves = leafExercisesFor(n, libraryMovements);
        for (const l of leaves) out.push({ leafId: l.id, label: l.label, movement: l.movement, group: g.label, sub: n.label });
      }
    }
    return out;
  }, [groups, libraryMovements]);

  const searchHits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return allLeaves
      .filter((l) => l.label.toLowerCase().includes(q) || l.sub.toLowerCase().includes(q) || l.group.toLowerCase().includes(q))
      .slice(0, 40);
  }, [search, allLeaves]);

  function toggleSet(set: Set<string>, key: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  }

  const totalSelected = exerciseSlots.length;

  return (
    <section style={{ marginTop: "1rem", border: "1px solid var(--line)", borderRadius: 4, background: "var(--paper)" }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%", background: "transparent", border: "none",
          padding: "0.55rem 0.85rem", cursor: "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{open ? "▾" : "▸"}</span>
          <span style={{ fontWeight: 700, fontSize: "1rem" }}>Select Exercises</span>
          <span className="badge" style={{ fontSize: "0.62rem" }}>Total: {totalSelected}</span>
        </span>
        <span className="meta" style={{ fontSize: "0.72rem" }}>Tap a category → subcategory → exercise. Order # sets the slot.</span>
      </button>

      {open && (
        <div style={{ padding: "0.65rem 0.85rem 0.85rem", borderTop: "1px solid var(--line)" }}>
          {/* Two-column body — categories + search on the left, Workout
              Order panel pinned on the right. */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 280px", gap: "1rem", alignItems: "start" }}>
            <div>
              {/* Categories laid out as columns. Checked categories come
                  first and share the available width; unchecked ones shrink
                  to their content (just the chip) so they don't eat space. */}
              {(() => {
                const checkedGroups = groups.filter((g) => openCats.has(g.id));
                const uncheckedGroups = groups.filter((g) => !openCats.has(g.id));
                const ordered = [...checkedGroups, ...uncheckedGroups];
                const colTemplate = ordered
                  .map((g) => (openCats.has(g.id) ? "minmax(0, 1fr)" : "auto"))
                  .join(" ");
                return (
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: colTemplate,
                    gap: "0.6rem 0.55rem",
                    alignItems: "start",
                  }}>
                    {ordered.map((g) => {
                      const isChecked = openCats.has(g.id);
                      return (
                        <div key={g.id} style={{ display: "flex", flexDirection: "column", gap: "0.35rem", minWidth: 0 }}>
                          <CategoryChip
                            label={g.label}
                            checked={isChecked}
                            onToggle={() => toggleSet(openCats, g.id, setOpenCats)}
                          />
                          {isChecked && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", paddingLeft: "0.15rem" }}>
                              {g.nodes.map((n) => {
                                const subChecked = openSubs.has(n.id);
                                return subChecked ? (
                                  <SubcategoryColumn
                                    key={n.id}
                                    node={n}
                                    groupCategory={g.nodes.find((x) => x.id === n.id)?.category}
                                    libraryMovements={libraryMovements}
                                    leafCounts={leafCounts}
                                    exerciseSlots={exerciseSlots}
                                    onToggleSub={() => toggleSet(openSubs, n.id, setOpenSubs)}
                                    onToggleLeaf={onToggleLeaf}
                                    onAddLeafAgain={onAddLeafAgain}
                                    onLibraryAdded={() => router.refresh()}
                                  />
                                ) : (
                                  <SubChip
                                    key={n.id}
                                    label={n.label}
                                    checked={false}
                                    onToggle={() => toggleSet(openSubs, n.id, setOpenSubs)}
                                  />
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

          {/* Type-search — at the bottom of the panel for quick lookups. */}
          <div style={{ marginTop: "0.85rem", paddingTop: "0.65rem", borderTop: "1px dashed var(--line)" }}>
            <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: "0.25rem" }}>
              Search exercises
            </label>
            <input
              className="input"
              placeholder="Type to find — e.g. lat pulldown, vertical pull, hinge…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", maxWidth: 420, fontSize: "0.84rem", padding: "0.3rem 0.5rem" }}
            />
            {search.trim() && (
              <div style={{
                marginTop: "0.4rem", border: "1px solid var(--line)", borderRadius: 3,
                maxHeight: 280, overflowY: "auto", background: "var(--paper)",
                maxWidth: 520,
              }}>
                {searchHits.length === 0 ? (
                  <p className="meta" style={{ padding: "0.5rem 0.7rem", fontSize: "0.78rem", margin: 0 }}>No matches.</p>
                ) : searchHits.map((hit) => {
                  const cnt = leafCounts.get(hit.leafId) ?? 0;
                  return (
                    <div
                      key={hit.leafId}
                      style={{
                        display: "flex", alignItems: "center", gap: "0.4rem",
                        padding: "0.28rem 0.5rem", borderBottom: "1px solid var(--line)",
                        background: cnt > 0 ? "rgba(168,61,43,0.05)" : "transparent",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => onToggleLeaf(hit.leafId, hit.movement)}
                        title={cnt > 0 ? "Remove all" : "Add to program"}
                        style={{
                          background: "transparent", border: "1px solid var(--line)",
                          borderRadius: 3, width: 18, height: 18, cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "0.78rem", color: cnt > 0 ? "var(--sage)" : "transparent",
                          flexShrink: 0,
                        }}
                      >{cnt > 0 ? "✓" : ""}</button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "0.82rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hit.label}</div>
                        <div className="meta" style={{ fontSize: "0.66rem" }}>{hit.group} · {hit.sub}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onAddLeafAgain(hit.leafId, hit.movement)}
                        title="Add another instance"
                        style={{
                          background: "rgba(168,61,43,0.08)", border: "1px solid rgba(168,61,43,0.3)",
                          color: "var(--rust)", borderRadius: 3,
                          width: 22, height: 22, cursor: "pointer",
                          fontWeight: 700, fontSize: "0.78rem", flexShrink: 0,
                        }}
                      >+</button>
                      {cnt > 0 && (
                        <span style={{
                          fontSize: "0.7rem", fontWeight: 700, color: "var(--rust)",
                          minWidth: 18, textAlign: "center",
                        }}>×{cnt}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
            </div>
            {/* Right column — Workout Order */}
            <WorkoutOrderBlock
              exerciseSlots={exerciseSlots}
              onMoveToIndex={onMoveExerciseToIndex}
              onDelete={onDeleteSlot}
            />
          </div>
        </div>
      )}
    </section>
  );
}

// ── Workout Order block ─────────────────────────────────────────────────
// Compact pinned list of every checked exercise (in current program order)
// with ↑/↓ arrows + HTML5 drag-and-drop reordering. Removes too.
function WorkoutOrderBlock({
  exerciseSlots, onMoveToIndex, onDelete,
}: {
  exerciseSlots: ExerciseSlot[];
  onMoveToIndex: (uid: string, dstExIdx: number) => void;
  onDelete: (uid: string) => void;
}) {
  const [dragUid, setDragUid] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  function move(uid: string, dir: -1 | 1) {
    const idx = exerciseSlots.findIndex((s) => s.uid === uid);
    if (idx < 0) return;
    onMoveToIndex(uid, idx + dir);
  }

  return (
    <aside style={{
      position: "sticky", top: "1rem", alignSelf: "start",
      border: "1px solid var(--line)", borderRadius: 4,
      background: "rgba(0,0,0,0.02)", padding: "0.5rem 0.6rem",
      minWidth: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
        <strong style={{ fontSize: "0.86rem" }}>Workout Order</strong>
        <span className="meta" style={{ fontSize: "0.66rem" }}>{exerciseSlots.length} ex.</span>
      </div>
      {exerciseSlots.length === 0 ? (
        <p className="meta" style={{ fontSize: "0.74rem", fontStyle: "italic", margin: "0.3rem 0" }}>
          Check exercises on the left to start building.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.18rem" }}>
          {exerciseSlots.map((s, i) => {
            const isDragOver = dragOver === i && dragUid !== null && dragUid !== s.uid;
            return (
              <div
                key={s.uid}
                draggable
                onDragStart={(e) => {
                  setDragUid(s.uid);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  if (dragUid && dragUid !== s.uid) {
                    e.preventDefault();
                    setDragOver(i);
                  }
                }}
                onDragLeave={() => { if (dragOver === i) setDragOver(null); }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragUid && dragUid !== s.uid) onMoveToIndex(dragUid, i);
                  setDragUid(null);
                  setDragOver(null);
                }}
                onDragEnd={() => { setDragUid(null); setDragOver(null); }}
                style={{
                  display: "flex", alignItems: "center", gap: "0.25rem",
                  padding: "0.22rem 0.32rem", borderRadius: 3,
                  background: isDragOver ? "rgba(168,61,43,0.15)" : "var(--paper)",
                  border: `1px solid ${isDragOver ? "var(--rust)" : "var(--line)"}`,
                  cursor: "grab", fontSize: "0.76rem",
                  opacity: dragUid === s.uid ? 0.5 : 1,
                }}
                title="Drag to reorder"
              >
                <span style={{
                  fontWeight: 700, color: "var(--rust)",
                  minWidth: 18, fontSize: "0.74rem", textAlign: "right",
                }}>{i + 1}.</span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.movement.name}>
                  {s.movement.name}
                </span>
                <button
                  type="button"
                  onClick={() => move(s.uid, -1)}
                  disabled={i === 0}
                  title="Move up"
                  style={{
                    background: "transparent", border: "none", cursor: i === 0 ? "default" : "pointer",
                    color: i === 0 ? "var(--line)" : "var(--muted)",
                    fontSize: "0.78rem", padding: "0 0.18rem", lineHeight: 1, fontFamily: "inherit",
                  }}
                >↑</button>
                <button
                  type="button"
                  onClick={() => move(s.uid, 1)}
                  disabled={i === exerciseSlots.length - 1}
                  title="Move down"
                  style={{
                    background: "transparent", border: "none",
                    cursor: i === exerciseSlots.length - 1 ? "default" : "pointer",
                    color: i === exerciseSlots.length - 1 ? "var(--line)" : "var(--muted)",
                    fontSize: "0.78rem", padding: "0 0.18rem", lineHeight: 1, fontFamily: "inherit",
                  }}
                >↓</button>
                <button
                  type="button"
                  onClick={() => onDelete(s.uid)}
                  title="Remove from program"
                  style={{
                    background: "transparent", border: "none", cursor: "pointer",
                    color: "var(--muted)", fontSize: "0.72rem", padding: "0 0.16rem", lineHeight: 1, fontFamily: "inherit",
                  }}
                >✕</button>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}

// Subcategory rendered IN-COLUMN — its checkbox row at the top, with the
// leaf exercises nested directly underneath, indented slightly. Each
// checked exercise gets an inline order-# number input right next to the
// exercise name on the same line. The light + button next to each leaf
// always adds another instance (counter shows how many).
function SubcategoryColumn({
  node, groupCategory, libraryMovements, leafCounts, exerciseSlots,
  onToggleSub, onToggleLeaf, onAddLeafAgain, onLibraryAdded,
}: {
  node: LibraryNode;
  groupCategory?: Category;
  libraryMovements: MovementRow[];
  leafCounts: Map<string, number>;
  exerciseSlots: ExerciseSlot[];
  onToggleSub: () => void;
  onToggleLeaf: (leafId: string, movement: Movement) => void;
  onAddLeafAgain: (leafId: string, movement: Movement) => void;
  onLibraryAdded: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const leaves = useMemo(() => leafExercisesFor(node, libraryMovements), [node, libraryMovements]);
  return (
    <div style={{
      border: "1px solid var(--rust)",
      borderRadius: 3,
      background: "rgba(168,61,43,0.04)",
      padding: "0.3rem 0.4rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", cursor: "pointer", flex: 1, minWidth: 0 }}>
          <input type="checkbox" checked onChange={onToggleSub} style={{ accentColor: "var(--rust)", flexShrink: 0 }} />
          <strong style={{ fontSize: "0.78rem", color: "var(--rust)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{node.label}</strong>
        </label>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "0.66rem", flexShrink: 0 }}
        >{expanded ? "▾" : "▸"}</button>
      </div>
      {expanded && (
        <div style={{ marginTop: "0.3rem", paddingLeft: "0.85rem", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
          {leaves.map((leaf) => {
            const count = leafCounts.get(leaf.id) ?? 0;
            const checked = count > 0;
            return (
              <div
                key={leaf.id}
                style={{
                  display: "flex", alignItems: "center", gap: "0.25rem",
                  padding: "0.16rem 0.25rem", borderRadius: 3,
                  background: checked ? "rgba(168,61,43,0.07)" : "transparent",
                  fontSize: "0.74rem",
                  minWidth: 0,
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleLeaf(leaf.id, leaf.movement)}
                  title={checked ? "Remove all instances" : "Add to program"}
                  style={{ accentColor: "var(--rust)", flexShrink: 0, cursor: "pointer" }}
                />
                <span style={{ fontWeight: checked ? 600 : 400, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={leaf.label}>
                  {leaf.label}
                </span>
                <button
                  type="button"
                  onClick={() => onAddLeafAgain(leaf.id, leaf.movement)}
                  title="Add another instance"
                  style={{
                    background: "rgba(168,61,43,0.08)", border: "1px solid rgba(168,61,43,0.3)",
                    color: "var(--rust)", borderRadius: 3,
                    width: 20, height: 20, cursor: "pointer", lineHeight: 1,
                    fontWeight: 700, fontSize: "0.78rem", flexShrink: 0, padding: 0,
                    fontFamily: "inherit",
                  }}
                >+</button>
                {count > 0 && (
                  <span style={{
                    fontSize: "0.66rem", fontWeight: 700, color: "var(--rust)",
                    minWidth: 18, textAlign: "center",
                  }}>×{count}</span>
                )}
              </div>
            );
          })}
          {/* + Add new exercise — opens an inline name input, calls the
              Exercise Library addMovement action, and adds the new slot.
              The new exercise persists in the database under this
              subcategory. Removal is done via the Exercise Library tab. */}
          <AddNewExerciseInline
            category={node.category}
            subcategory={node.label}
            onAdded={(movement, leafId) => {
              onAddLeafAgain(leafId, movement);
              onLibraryAdded();
            }}
          />
        </div>
      )}
    </div>
  );
}

// Inline footer on each subcategory's leaf list. Click to open a small input
// for the exercise name, hit Save to persist via the addMovement server
// action and immediately drop a slot in the program for it.
function AddNewExerciseInline({
  category, subcategory, onAdded,
}: {
  category: Category;
  subcategory: string;
  onAdded: (movement: Movement, leafId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) { setErr("Name required."); return; }
    setBusy(true);
    setErr(null);
    try {
      const res = await addMovement({
        name: name.trim(),
        category,
        subcategory,
        equipment_list: [],
        muscles: [],
      });
      if (!res.ok || !res.id) { setErr(res.error ?? "Save failed."); setBusy(false); return; }
      const movement: Movement = {
        id: res.id,
        name: name.trim(),
        category,
        subcategory,
        equipment_list: [],
      };
      onAdded(movement, `mv-${res.id}`);
      setName("");
      setOpen(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          marginTop: "0.25rem",
          background: "transparent",
          border: "1px dashed rgba(168,61,43,0.4)",
          color: "var(--rust)", borderRadius: 3,
          padding: "0.18rem 0.45rem", fontSize: "0.72rem",
          cursor: "pointer", fontFamily: "inherit",
          textAlign: "left",
        }}
      >+ Add new exercise</button>
    );
  }
  return (
    <div style={{ marginTop: "0.3rem", padding: "0.25rem 0.3rem", border: "1px solid var(--rust)", borderRadius: 3, background: "var(--paper)" }}>
      <input
        autoFocus
        className="input"
        placeholder="Exercise name…"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") { setOpen(false); setName(""); setErr(null); }
        }}
        style={{ fontSize: "0.78rem", padding: "0.18rem 0.32rem", width: "100%" }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.25rem", marginTop: "0.25rem" }}>
        <button
          type="button"
          onClick={() => { setOpen(false); setName(""); setErr(null); }}
          disabled={busy}
          className="btn btn-ghost"
          style={{ fontSize: "0.68rem", padding: "0.12rem 0.4rem" }}
        >Cancel</button>
        <button
          type="button"
          onClick={submit}
          disabled={busy || !name.trim()}
          className="btn btn-primary"
          style={{ fontSize: "0.68rem", padding: "0.12rem 0.45rem" }}
        >{busy ? "…" : "Save"}</button>
      </div>
      {err && <p style={{ color: "var(--red)", fontSize: "0.7rem", margin: "0.25rem 0 0" }}>{err}</p>}
    </div>
  );
}

function CategoryChip({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <label
      style={{
        display: "inline-flex", alignItems: "center", gap: "0.35rem",
        padding: "0.3rem 0.6rem", borderRadius: 999,
        border: `1px solid ${checked ? "var(--rust)" : "var(--line)"}`,
        background: checked ? "rgba(168,61,43,0.08)" : "transparent",
        cursor: "pointer", fontSize: "0.82rem",
        fontWeight: checked ? 700 : 500,
        color: checked ? "var(--rust)" : "var(--ink)",
      }}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} style={{ accentColor: "var(--rust)" }} />
      {label}
    </label>
  );
}
function SubChip({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <label
      style={{
        display: "flex", alignItems: "center", gap: "0.3rem",
        padding: "0.2rem 0.45rem", borderRadius: 3,
        border: `1px solid ${checked ? "var(--rust)" : "var(--line)"}`,
        background: checked ? "rgba(168,61,43,0.06)" : "transparent",
        cursor: "pointer", fontSize: "0.74rem",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}
      title={label}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} style={{ accentColor: "var(--rust)", flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Exercise slot card — plan mode, perform mode, complete mode
// ─────────────────────────────────────────────────────────────────────────────
function ExerciseSlotCard({
  slot, orderNum, onPatch, onSetMode, onSwap, onDelete, onMoveUp, onMoveDown,
}: {
  slot: ExerciseSlot;
  orderNum: number;
  onPatch: (p: Partial<ExerciseSlot>) => void;
  onSetMode: (mode: "plan" | "perform" | "complete") => void;
  onSwap: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  // Complete (collapsed summary) — re-expandable
  if (slot.mode === "complete") {
    return (
      <div style={{
        border: "1px solid var(--sage)", background: "rgba(90,107,74,0.07)",
        borderRadius: 4, padding: "0.4rem 0.6rem",
        display: "flex", alignItems: "center", gap: "0.6rem",
      }}>
        <span style={{ fontWeight: 700, color: "var(--sage)" }}>✓</span>
        <span style={{ fontWeight: 700 }}>#{orderNum} {slot.movement.name}</span>
        <span className="meta" style={{ fontSize: "0.74rem" }}>
          {slot.sets}× {slot.reps}
          {slot.perform.weights.some((w) => w) ? ` · ${slot.perform.weights.filter(Boolean).join(", ")}` : ""}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: "0.25rem" }}>
          <button type="button" className="btn btn-ghost" style={{ fontSize: "0.68rem", padding: "0.12rem 0.4rem" }} onClick={() => onSetMode("perform")}>Re-open</button>
          <button type="button" className="btn btn-ghost" style={{ fontSize: "0.68rem", padding: "0.12rem 0.4rem", color: "var(--red)" }} onClick={onDelete}>✕</button>
        </div>
      </div>
    );
  }

  // Perform mode — log fields visible, exercise locked
  if (slot.mode === "perform") {
    const setCount = slot.sets;
    const ensureLen = (arr: string[]) => Array.from({ length: setCount }, (_, i) => arr[i] ?? "");
    const weights = ensureLen(slot.perform.weights);
    const reps = ensureLen(slot.perform.actualReps);
    const notes = ensureLen(slot.perform.setNotes);
    return (
      <div style={{ border: "1px solid var(--rust)", borderRadius: 4, padding: "0.5rem 0.6rem", background: "rgba(168,61,43,0.04)" }}>
        <RowHeader
          left={
            <>
              <button type="button" className="btn btn-ghost" style={{ padding: "0.1rem 0.32rem", fontSize: "0.7rem" }} onClick={onMoveUp}>↑</button>
              <button type="button" className="btn btn-ghost" style={{ padding: "0.1rem 0.32rem", fontSize: "0.7rem" }} onClick={onMoveDown}>↓</button>
              <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>#{orderNum} {slot.movement.name}</span>
              <span className="badge badge-amber" style={{ fontSize: "0.6rem" }}>Performing</span>
            </>
          }
          right={
            <>
              <button type="button" className="btn btn-ghost" style={{ fontSize: "0.68rem", padding: "0.1rem 0.42rem" }} onClick={() => onSetMode("plan")} title="Back to plan (edit setup)">✎ Edit setup</button>
              <button type="button" className="btn btn-ghost" style={{ fontSize: "0.68rem", padding: "0.1rem 0.42rem" }} onClick={onSwap}>🔁 Swap</button>
              <button type="button" className="btn btn-ghost" style={{ fontSize: "0.68rem", padding: "0.1rem 0.42rem", color: "var(--red)" }} onClick={onDelete}>✕</button>
            </>
          }
        />

        <div className="meta" style={{ fontSize: "0.72rem", marginTop: "0.25rem" }}>
          Prescribed: {slot.sets}× {slot.reps} · RPE {EXERTION_LABELS[slot.exertion_score] ?? slot.exertion_score}
          {slot.equipment_list.length > 0 ? <> · {slot.equipment_list.join(", ")}</> : null}
          {slot.equipment_specifics ? <> · {slot.equipment_specifics}</> : null}
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "auto repeat(3, minmax(0, 1fr))",
          gap: "0.25rem 0.45rem", marginTop: "0.4rem", alignItems: "center",
        }}>
          <span></span>
          <span className="meta" style={{ fontSize: "0.66rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Weight</span>
          <span className="meta" style={{ fontSize: "0.66rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Reps</span>
          <span className="meta" style={{ fontSize: "0.66rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Set notes</span>
          {Array.from({ length: setCount }, (_, si) => (
            <div key={si} style={{ display: "contents" }}>
              <span style={{ fontSize: "0.74rem", color: "var(--muted)" }}>Set {si + 1}</span>
              <input
                className="input"
                style={{ fontSize: "0.78rem", padding: "0.18rem 0.32rem" }}
                value={weights[si]}
                onChange={(e) => {
                  const next = [...weights]; next[si] = e.target.value;
                  onPatch({ perform: { ...slot.perform, weights: next } });
                }}
                placeholder="lb"
              />
              <input
                className="input"
                style={{ fontSize: "0.78rem", padding: "0.18rem 0.32rem" }}
                value={reps[si]}
                onChange={(e) => {
                  const next = [...reps]; next[si] = e.target.value;
                  onPatch({ perform: { ...slot.perform, actualReps: next } });
                }}
                placeholder={slot.reps}
              />
              <input
                className="input"
                style={{ fontSize: "0.78rem", padding: "0.18rem 0.32rem" }}
                value={notes[si]}
                onChange={(e) => {
                  const next = [...notes]; next[si] = e.target.value;
                  onPatch({ perform: { ...slot.perform, setNotes: next } });
                }}
                placeholder="optional"
              />
            </div>
          ))}
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", marginTop: "0.45rem" }}>
          <span className="meta" style={{ fontSize: "0.66rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Exercise notes</span>
          <textarea
            className="textarea"
            rows={2}
            style={{ fontSize: "0.82rem", padding: "0.28rem 0.4rem" }}
            value={slot.perform.sessionNote}
            onChange={(e) => onPatch({ perform: { ...slot.perform, sessionNote: e.target.value } })}
            placeholder="How did it go? Any tweaks for next time?"
          />
        </label>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.4rem", marginTop: "0.55rem" }}>
          <button className="btn btn-primary" onClick={() => onSetMode("complete")}>✓ Complete</button>
        </div>
      </div>
    );
  }

  // Plan mode (default) — re-use the existing build-page ExerciseCard so the
  // layout matches exactly (All-same checkbox, preset dropdown, SETS / REPS /
  // EXERTION / SPECIFICATION / EQUIPMENT / +optional fields / NOTES /
  // ↑↓ / +SUPERSET / +NAME). Add ▶ Perform and 🔁 Swap into the bottomSlot.
  return (
    <ExerciseCard
      it={slot}
      dayUid={`rework-${slot.uid}`}
      itemIdx={orderNum - 1}
      inSuperset={false}
      inlineEquipment={false}
      drag={null}
      onDragStart={() => { /* cross-day drag not supported in rework */ }}
      onDragEnd={() => { /* noop */ }}
      onDrop={() => { /* noop */ }}
      onRemove={onDelete}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      onPatch={(patch) => onPatch(patch as Partial<ExerciseSlot>)}
      onToggleSameFormat={() => {
        if (slot.same_format) {
          // turning per-set on — seed rows from current single config
          const rows: SetRow[] = Array.from({ length: slot.sets }, () => ({
            reps: slot.reps,
            reps_type: slot.reps_type,
            reps_unit: slot.reps_unit,
            exertion_score: slot.exertion_score,
            variations: slot.variations,
            notes: undefined,
            equipment_list: slot.equipment_list,
            equipment_specifics: slot.equipment_specifics,
          }));
          onPatch({ same_format: false, set_rows: rows });
        } else {
          onPatch({ same_format: true, set_rows: [] });
        }
      }}
      onPatchSetRow={(si, patch) => {
        const rows = [...(slot.set_rows ?? [])];
        rows[si] = { ...rows[si], ...patch };
        onPatch({ set_rows: rows });
      }}
      bottomSlot={
        <div style={{ display: "inline-flex", gap: "0.3rem", marginLeft: "0.4rem" }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ fontSize: "0.7rem", padding: "0.14rem 0.6rem" }}
            onClick={() => onSetMode("perform")}
            title="Start logging this exercise"
          >▶ Perform</button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ fontSize: "0.7rem", padding: "0.14rem 0.55rem" }}
            onClick={onSwap}
            title="Swap exercise"
          >🔁 Swap</button>
        </div>
      }
    />
  );
}

function RowHeader({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.4rem", flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", minWidth: 0 }}>{left}</div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", flexShrink: 0 }} className="no-print">{right}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rest slot card
// ─────────────────────────────────────────────────────────────────────────────
function RestSlotCard({ slot, onPatch, onDelete, onMoveUp, onMoveDown }: {
  slot: RestSlot;
  onPatch: (p: Partial<RestSlot>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div style={{
      border: "1px dashed var(--line)", borderRadius: 4, padding: "0.32rem 0.6rem",
      background: "rgba(0,0,0,0.025)",
      display: "flex", alignItems: "center", gap: "0.55rem",
    }}>
      <button type="button" className="btn btn-ghost no-print" style={{ padding: "0.1rem 0.32rem", fontSize: "0.7rem" }} onClick={onMoveUp}>↑</button>
      <button type="button" className="btn btn-ghost no-print" style={{ padding: "0.1rem 0.32rem", fontSize: "0.7rem" }} onClick={onMoveDown}>↓</button>
      <span style={{ fontWeight: 600 }}>⏱ Rest</span>
      <input
        type="number" min={1} className="input"
        value={slot.duration}
        onChange={(e) => onPatch({ duration: Math.max(1, parseInt(e.target.value, 10) || 1) })}
        style={{ width: 60, fontSize: "0.8rem", padding: "0.16rem 0.28rem" }}
      />
      <select
        className="select"
        value={slot.unit}
        onChange={(e) => onPatch({ unit: e.target.value as "s" | "min" })}
        style={{ width: 64, fontSize: "0.78rem", padding: "0.14rem 0.22rem" }}
      >
        <option value="s">sec</option>
        <option value="min">min</option>
      </select>
      <button type="button" className="btn btn-ghost no-print" style={{ marginLeft: "auto", fontSize: "0.68rem", padding: "0.1rem 0.42rem", color: "var(--red)" }} onClick={onDelete}>✕</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modals
// ─────────────────────────────────────────────────────────────────────────────
function SmallModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(23,19,17,0.4)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}
      onClick={onClose}
    >
      <div className="card" style={{ width: "min(440px, 96vw)", padding: "1rem 1.2rem" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: "0.72rem" }}>✕</button>
        </div>
        <hr className="divider" />
        {children}
      </div>
    </div>
  );
}

function SwapModal({ groups, libraryMovements, currentLeafId, onClose, onPick }: {
  groups: LibraryGroup[];
  libraryMovements: MovementRow[];
  currentLeafId: string;
  onClose: () => void;
  onPick: (leafId: string, movement: Movement) => void;
}) {
  // Open the category/subcategory containing the current leaf by default
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [openSubs, setOpenSubs] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<{ leafId: string; movement: Movement } | null>(null);

  // Pre-open the path to the current leaf
  useEffect(() => {
    for (const g of groups) {
      for (const n of g.nodes) {
        const leaves = leafExercisesFor(n, libraryMovements);
        if (leaves.some((l) => l.id === currentLeafId)) {
          setOpenCats(new Set([g.id]));
          setOpenSubs(new Set([n.id]));
          return;
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSet(set: Set<string>, key: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(23,19,17,0.45)", zIndex: 1100, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "2rem 1rem", overflowY: "auto" }}
      onClick={onClose}
    >
      <div className="card" style={{ width: "min(540px, 96vw)", padding: "1rem 1.2rem", maxHeight: "85vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <span className="badge">Swap exercise</span>
            <h3 style={{ margin: "0.35rem 0 0.15rem" }}>Pick a replacement</h3>
            <p className="meta" style={{ fontSize: "0.74rem", margin: 0 }}>Uncheck anywhere to drop the current selection, then check a new exercise.</p>
          </div>
          <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: "0.72rem" }}>✕</button>
        </div>
        <hr className="divider" />
        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem", paddingRight: 4 }}>
          {groups.map((g) => {
            const catOpen = openCats.has(g.id);
            return (
              <div key={g.id} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: "0.35rem 0.55rem" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
                  <input type="checkbox" checked={catOpen} onChange={() => toggleSet(openCats, g.id, setOpenCats)} style={{ accentColor: "var(--rust)" }} />
                  <strong style={{ fontSize: "0.85rem" }}>{g.label}</strong>
                </label>
                {catOpen && (
                  <div style={{ marginTop: "0.3rem", display: "flex", flexDirection: "column", gap: "0.25rem", paddingLeft: "0.9rem" }}>
                    {g.nodes.map((n) => {
                      const subOpen = openSubs.has(n.id);
                      const leaves = leafExercisesFor(n, libraryMovements);
                      return (
                        <div key={n.id}>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", cursor: "pointer" }}>
                            <input type="checkbox" checked={subOpen} onChange={() => toggleSet(openSubs, n.id, setOpenSubs)} style={{ accentColor: "var(--rust)" }} />
                            <span style={{ fontSize: "0.82rem", fontWeight: subOpen ? 600 : 400 }}>{n.label}</span>
                          </label>
                          {subOpen && (
                            <div style={{ paddingLeft: "1rem", marginTop: "0.2rem", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                              {leaves.map((l) => {
                                const isCurrent = l.id === currentLeafId;
                                const isPicked = picked?.leafId === l.id;
                                return (
                                  <label key={l.id} style={{
                                    display: "inline-flex", alignItems: "center", gap: "0.3rem", cursor: "pointer",
                                    fontSize: "0.78rem",
                                    color: isCurrent ? "var(--muted)" : "var(--ink)",
                                    fontWeight: isPicked ? 700 : 400,
                                  }}>
                                    <input
                                      type="checkbox"
                                      checked={isPicked || isCurrent}
                                      disabled={isCurrent && !picked}
                                      onChange={() => setPicked({ leafId: l.id, movement: l.movement })}
                                      style={{ accentColor: "var(--rust)" }}
                                    />
                                    {l.label}
                                    {isCurrent && <span className="meta" style={{ fontSize: "0.66rem" }}> (current)</span>}
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.4rem", marginTop: "0.7rem" }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!picked} onClick={() => picked && onPick(picked.leafId, picked.movement)}>Swap</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Printout modal — designed for "print blank, fill in pen, then photograph"
// ─────────────────────────────────────────────────────────────────────────────
const CATEGORY_KEY: Record<Category, string> = {
  push: "P", pull: "Pl", hinge: "H", squat: "Sq", core: "C",
  leg_accessory: "L", arm_accessory: "A", shoulder: "S", cardio: "Cd", mobility: "M",
};
const EQUIPMENT_KEY: Record<string, string> = {
  machine: "M", bands: "B", dumbbells: "D", barbell: "Bb", bodyweight: "Bw",
  kettlebell: "K", cable: "Cb", other: "O",
};

function PrintoutModal({ slots, clientName, sessionTitle, startsAt, onClose }: {
  slots: Slot[];
  clientName: string;
  sessionTitle: string;
  startsAt: string;
  onClose: () => void;
}) {
  const exerciseSlots = slots.filter((s): s is ExerciseSlot => s.type === "exercise");
  const date = startsAt ? new Date(startsAt) : new Date();
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(23,19,17,0.6)", zIndex: 1100, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "1.5rem 1rem", overflowY: "auto" }}
      onClick={onClose}
    >
      <div className="card" style={{ width: "min(900px, 98vw)", padding: 0, maxHeight: "92vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <div className="no-print" style={{ padding: "0.6rem 0.85rem", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Printout draft</h3>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <button className="btn btn-primary" onClick={() => window.print()}>Print</button>
            <button className="btn btn-ghost" onClick={onClose}>✕</button>
          </div>
        </div>
        <div style={{ overflowY: "auto" }}>
          <div className="rework-printout" style={{
            padding: "0.4in", fontFamily: "Georgia, serif",
            color: "#222", background: "#fff",
            fontSize: "0.78rem", lineHeight: 1.35,
          }}>
            {/* Header — small inputs in top-left */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.55rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.15rem 0.5rem", fontSize: "0.7rem", minWidth: 230 }}>
                <span>Client:</span>
                <span style={{ borderBottom: "1px solid #000", padding: "0 0.2rem" }}>{clientName || "____________________"}</span>
                <span>Date:</span>
                <span style={{ borderBottom: "1px solid #000", padding: "0 0.2rem" }}>{date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                <span>Start:</span>
                <span style={{ borderBottom: "1px solid #000", padding: "0 0.2rem" }}>{date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
              </div>
              <div style={{ textAlign: "right", fontSize: "0.66rem" }}>
                <strong>Key:</strong> Cat — U=Upper Pl=Pull P=Push H=Hinge Sq=Squat C=Core A=Arm S=Shldr Cd=Cardio M=Mob<br />
                Eq — M=Mach B=Bands D=DB Bb=Barbell Bw=BW K=KB Cb=Cable O=Other (specify)
              </div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.7rem" }}>
              <thead>
                <tr style={{ background: "#eee", textAlign: "left" }}>
                  <th style={{ border: "1px solid #000", padding: "0.18rem 0.3rem", width: 22 }}>#</th>
                  <th style={{ border: "1px solid #000", padding: "0.18rem 0.3rem", width: 28 }}>Cat</th>
                  <th style={{ border: "1px solid #000", padding: "0.18rem 0.3rem" }}>Exercise</th>
                  <th style={{ border: "1px solid #000", padding: "0.18rem 0.3rem", width: 100 }}>Equip · specify</th>
                  <th style={{ border: "1px solid #000", padding: "0.18rem 0.3rem", width: 60 }}>Sets×Reps</th>
                  <th style={{ border: "1px solid #000", padding: "0.18rem 0.3rem", width: 38 }}>RPE</th>
                  <th style={{ border: "1px solid #000", padding: "0.18rem 0.3rem" }}>Set log (wt / reps)</th>
                  <th style={{ border: "1px solid #000", padding: "0.18rem 0.3rem", width: 28, textAlign: "center" }}>✓</th>
                </tr>
              </thead>
              <tbody>
                {exerciseSlots.map((s, i) => {
                  const cat = CATEGORY_KEY[s.movement.category] ?? "—";
                  const eq = s.equipment_list.map((e) => EQUIPMENT_KEY[e] ?? e).join(",");
                  const specs = s.equipment_specifics ? ` ${s.equipment_specifics}` : "";
                  return (
                    <tr key={s.uid}>
                      <td style={{ border: "1px solid #000", padding: "0.22rem 0.3rem", fontWeight: 700 }}>{i + 1}</td>
                      <td style={{ border: "1px solid #000", padding: "0.22rem 0.3rem" }}>{cat}</td>
                      <td style={{ border: "1px solid #000", padding: "0.22rem 0.3rem" }}>
                        <div style={{ fontWeight: 700 }}>{s.movement.name}</div>
                        {s.notes && <div style={{ fontSize: "0.62rem", color: "#444" }}>{s.notes}</div>}
                      </td>
                      <td style={{ border: "1px solid #000", padding: "0.22rem 0.3rem" }}>{eq}{specs}</td>
                      <td style={{ border: "1px solid #000", padding: "0.22rem 0.3rem", textAlign: "center" }}>{s.sets}×{s.reps}</td>
                      <td style={{ border: "1px solid #000", padding: "0.22rem 0.3rem", textAlign: "center" }}>{s.exertion_score}</td>
                      <td style={{ border: "1px solid #000", padding: "0.22rem 0.3rem" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.18rem" }}>
                          {Array.from({ length: s.sets }, (_, si) => (
                            <span key={si} style={{ display: "inline-flex", gap: "0.18rem", alignItems: "center" }}>
                              <span style={{ display: "inline-block", borderBottom: "1px solid #000", width: 30, height: "0.85rem" }} />/
                              <span style={{ display: "inline-block", borderBottom: "1px solid #000", width: 24, height: "0.85rem" }} />
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ border: "1px solid #000", padding: "0.22rem 0.3rem", textAlign: "center" }}>☐</td>
                    </tr>
                  );
                })}
                {exerciseSlots.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: "0.5rem", textAlign: "center", border: "1px solid #000", fontStyle: "italic" }}>No exercises yet — pick from Select Exercises.</td></tr>
                )}
              </tbody>
            </table>

            {/* Session-level notes */}
            <div style={{ marginTop: "0.45rem", border: "1px solid #000", padding: "0.3rem 0.4rem", minHeight: 64 }}>
              <strong style={{ fontSize: "0.68rem" }}>Session notes:</strong>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", marginTop: "0.25rem" }}>
                {[0, 1, 2].map((i) => <span key={i} style={{ borderBottom: "1px solid #000", height: "0.95rem" }} />)}
              </div>
            </div>
          </div>
        </div>

        <style jsx global>{`
          @media print {
            @page { size: letter landscape; margin: 0.4in; }
            body * { visibility: hidden !important; }
            .rework-printout, .rework-printout * { visibility: visible !important; }
            .rework-printout { position: absolute; left: 0; top: 0; width: 100%; }
          }
        `}</style>
      </div>
    </div>
  );
}
