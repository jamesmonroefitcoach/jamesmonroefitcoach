"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ClientRow } from "@/lib/data";
import {
  CATEGORY_LABELS,
  MOVEMENT_LIBRARY,
  PROGRAM_KIND_LABEL,
  EQUIPMENT_OPTIONS,
  EXERTION_LABELS,
  EXERTION_SHORT,
  LIBRARY_HIERARCHY,
  hierarchyLeaves,
  leafToMovement,
  REST_MOVEMENT,
  type Category,
  type Movement,
  type Equipment,
  type PastProgramFull,
  type LibraryGroup,
  type LibraryNode,
  type LibraryLeaf,
  pastProgramsForClient
} from "@/lib/programs";
import { saveProgram, getClientAppointments, loadProgramForAppointment, type ApptOption } from "./actions";
import { fmtDate } from "@/lib/format";
import type { ProgramKind } from "@/lib/programs";
import type { ClientProgramItem } from "./page";
import { isLearned, recordLearned, markPerformed } from "@/lib/exercises-learned";
import { appendLog, lastEntry, historyFor, priorHeaviest, hasHistory, type ExerciseLogEntry } from "@/lib/exercise-logs";
import ImportPickerModal, { type ImportScope, type ImportResult } from "./import-picker";
import { readFeedback, savePre, savePost, savePerDay, type SessionFeedback } from "@/lib/session-feedback";
import { queueFollowup } from "@/lib/client-followups";
import { PreSessionForm, PostFeedbackForm, PostAnswersDisplay, type PostAnswersDraft } from "./feedback-forms";

export type WeekSession = {
  id: string;
  client_id: string;
  client_name: string | null;
  starts_at: string;
  is_programmed: boolean;
};

type SetRow = {
  reps: string;
  reps_type?: "reps" | "time";
  reps_unit?: "s" | "min";
  exertion_score: number;  // 1..10
  variations: Variation[];
  notes?: string;
  equipment_list?: Equipment[];
  equipment_specifics?: string;
  // Optional fields
  tempo?: string;
  rir?: number;
  half_reps?: number;
  rest_seconds?: number;   // rest after this specific set (seconds)
  position?: string;       // e.g. "standing" | "seated" | "lying" | "incline:45"
};

type Variation = "stretch" | "plyometric" | "isometric" | "single_sided" | "bilateral" | "dropset";
const VARIATIONS: Variation[] = ["stretch", "plyometric", "isometric", "single_sided", "bilateral", "dropset"];
const VARIATION_LABELS: Record<Variation, string> = {
  stretch: "Stretch", plyometric: "Plyo", isometric: "Iso",
  single_sided: "Unilateral", bilateral: "Bilateral", dropset: "Dropset",
};
const VARIATION_COLORS: Record<Variation, string> = {
  stretch: "rgba(59,130,246,0.12)", plyometric: "rgba(249,115,22,0.12)",
  isometric: "rgba(139,92,246,0.12)", single_sided: "rgba(34,197,94,0.12)",
  bilateral: "rgba(6,182,212,0.12)", dropset: "rgba(168,61,43,0.12)",
};
const VARIATION_TEXT: Record<Variation, string> = {
  stretch: "rgb(37,99,235)", plyometric: "rgb(194,65,12)",
  isometric: "rgb(109,40,217)", single_sided: "rgb(21,128,57)",
  bilateral: "rgb(14,116,144)", dropset: "var(--rust)",
};

// ─── Optional per-set fields ─────────────────────────────────────────────
type OptionalField = "tempo" | "rir" | "half_reps" | "rest_after" | "position";
const ALL_OPTIONAL_FIELDS: OptionalField[] = ["tempo", "rir", "half_reps", "rest_after", "position"];
const OPTIONAL_FIELD_CONFIG: Record<OptionalField, { label: string; shortLabel: string; width: string }> = {
  tempo:      { label: "Tempo",     shortLabel: "Tempo", width: "56px" },
  rir:        { label: "RIR",       shortLabel: "RIR",   width: "44px" },
  half_reps:  { label: "½ Reps",    shortLabel: "½",     width: "44px" },
  rest_after: { label: "Rest (s)",  shortLabel: "Rest",  width: "50px" },
  position:   { label: "Position",  shortLabel: "Pos",   width: "88px" },
};

type ProgramItem = {
  uid: string;
  movement: Movement;
  is_warmup: boolean;
  sets: number;
  reps: string;
  exertion_score: number;          // 1..10
  reps_type?: "reps" | "time";    // "reps" (default) or timed set
  reps_unit?: "s" | "min";        // used when reps_type === "time"
  same_format: boolean;            // true = all sets identical (default)
  set_rows: SetRow[];              // per-set data when same_format=false
  variations: Variation[];         // modifier tags
  superset_id?: string;            // shared id groups items into a superset block
  rest_seconds?: number;
  rest_duration?: number;     // for rest-block items (movement.id === "rest")
  rest_unit?: "s" | "min";    // "s" | "min"
  notes?: string;
  equipment_list: Equipment[];
  equipment_specifics?: string;
  movement_notes?: string;
  last_log?: { reps: number; weight_lb: number };
  // Optional column config
  optional_fields?: OptionalField[];
  tempo?: string;
  rir?: number;
  half_reps?: number;
  position?: string;       // "standing" | "seated" | "lying" | "incline:45"
};

type RenderGroup =
  | { kind: "exercise"; item: ProgramItem; itemIdx: number }
  | { kind: "superset"; supersetId: string; label: string; entries: { item: ProgramItem; itemIdx: number }[] };

function toRenderGroups(items: ProgramItem[]): RenderGroup[] {
  const groups: RenderGroup[] = [];
  const supersetMap = new Map<string, RenderGroup & { kind: "superset" }>();
  let ssCount = 0;
  items.forEach((item, itemIdx) => {
    if (!item.superset_id) {
      groups.push({ kind: "exercise", item, itemIdx });
    } else {
      const existing = supersetMap.get(item.superset_id);
      if (existing) {
        existing.entries.push({ item, itemIdx });
      } else {
        const g: RenderGroup & { kind: "superset" } = {
          kind: "superset", supersetId: item.superset_id,
          label: String.fromCharCode(65 + ssCount++),
          entries: [{ item, itemIdx }],
        };
        supersetMap.set(item.superset_id, g);
        groups.push(g);
      }
    }
  });
  return groups;
}

type ProgramDay = {
  uid: string;
  title: string;
  focus?: string;
  collapsed: boolean;
  items: ProgramItem[];
};

type PlanLogEntry = {
  weights: string[];
  actual_reps?: string[];   // per-set actual reps performed
  set_notes?: string[];     // per-set notes (one slot per set, like the builder)
  notes: string;            // optional overall-exercise notes (kept for back-compat)
  completed?: boolean;      // per-exercise complete flag (collapses block)
};
type PlanLog = Record<string, PlanLogEntry>; // itemUid → entry

const NEW_DAY = (n: number): ProgramDay => ({
  uid: `day-${n}-${Date.now()}`,
  title: `Day ${n}`,
  collapsed: false,
  items: []
});

function fmtSessionTitle(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit"
  });
}

const ALL_CATEGORIES: Category[] = [
  "push", "pull", "hinge", "squat", "core",
  "leg_accessory", "arm_accessory", "shoulder", "cardio", "mobility"
];

type DragPayload =
  | { kind: "lib"; movement: Movement }
  | { kind: "item"; dayUid: string; itemUid: string }
  | { kind: "superset"; dayUid: string; supersetId: string };

export default function BuildProgramClient({
  clients,
  initialClientId,
  initialAppts = [],
  initialApptId = "",
  initialStartsAt = "",
  initialType = "in_gym",
  initialView = "builder",
  weekSessions = [],
  clientProgramSummary = [],
}: {
  clients: ClientRow[];
  initialClientId?: string;
  initialAppts?: ApptOption[];
  initialApptId?: string;
  /** starts_at of the targeted appointment — used as title fallback when appt isn't in initialAppts */
  initialStartsAt?: string;
  initialType?: ProgramKind;
  initialView?: "builder" | "plan";
  weekSessions?: WeekSession[];
  clientProgramSummary?: ClientProgramItem[];
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(initialClientId ?? clients[0]?.id ?? "");
  const [programName, setProgramName] = useState("New program");
  const [startsOn, setStartsOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [durationWeeks, setDurationWeeks] = useState(8);
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [programKind, setProgramKind] = useState<ProgramKind>(initialType);
  const [appts, setAppts] = useState<ApptOption[]>(initialAppts);
  const [selectedApptId, setSelectedApptId] = useState(initialApptId);
  const [apptsPending, startApptsFetch] = useTransition();

  // at_home Program tab flow: picker → form → builder
  const [atHomeProgramStep, setAtHomeProgramStep] = useState<"picker" | "form" | "builder">(
    initialType === "at_home" ? "picker" : "builder"
  );
  // in_gym Session tab flow: picker → builder
  // Skip picker if we have either an appt UUID *or* a starts_at timestamp from the URL
  const [inGymStep, setInGymStep] = useState<"picker" | "builder">(
    initialType === "in_gym" && !initialApptId && !initialStartsAt ? "picker" : "builder"
  );
  const [atHomeEditingHeader, setAtHomeEditingHeader] = useState(false);
  const [pickedExistingId, setPickedExistingId] = useState("");
  // Import picker state. Either a day uid (importing into one day) or
  // "__whole_session__" / "__whole_program__" sentinels for top-level imports.
  const [importDayModalUid, setImportDayModalUid] = useState<string | null>(null);
  const importScope: ImportScope | null = useMemo(() => {
    if (!importDayModalUid) return null;
    if (importDayModalUid === "__whole_session__") return "session";
    if (importDayModalUid === "__whole_program__") return "program-whole";
    return "program-day";
  }, [importDayModalUid]);
  const [supersetPickerState, setSupersetPickerState] = useState<{
    dayUid: string; supersetId: string;
  } | null>(null);
  const [days, setDays] = useState<ProgramDay[]>(() => {
    // Resolve a starts_at: prefer the matched appointment, then the URL param
    const appt = initialApptId ? initialAppts.find((a) => a.id === initialApptId) : undefined;
    const startsAt = appt?.starts_at ?? initialStartsAt;
    if (startsAt) {
      // We have enough info to name the session — go straight to builder
      return [{
        uid: `day-1-${Date.now()}`,
        title: fmtSessionTitle(startsAt),
        collapsed: false,
        items: [],
      }];
    }
    return [NEW_DAY(1)];
  });

  const [savePending, startSave] = useTransition();
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedProgramId, setSavedProgramId] = useState<string | null>(null);
  const [isDraftSaved, setIsDraftSaved] = useState(false);
  const [draftedApptIds, setDraftedApptIds] = useState<Set<string>>(new Set());

  // ── Plan / completed view ────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<"builder" | "plan" | "completed">(initialView);
  const [planLog, setPlanLog] = useState<PlanLog>({});
  const [summaryOpen, setSummaryOpen] = useState(false);

  function initPlanLog(src: ProgramDay[]): PlanLog {
    const log: PlanLog = {};
    for (const day of src) {
      for (const it of day.items) {
        const count = it.same_format ? it.sets : Math.max(it.sets, it.set_rows.length);
        log[it.uid] = {
          weights: Array<string>(count).fill(""),
          actual_reps: Array<string>(count).fill(""),
          set_notes: Array<string>(count).fill(""),
          notes: "",
        };
      }
    }
    return log;
  }
  function blankEntry(): PlanLogEntry {
    return { weights: [], actual_reps: [], set_notes: [], notes: "" };
  }
  function setPlanWeight(itemUid: string, idx: number, val: string) {
    setPlanLog((p) => {
      const e = p[itemUid] ?? blankEntry();
      const w = [...e.weights]; w[idx] = val;
      return { ...p, [itemUid]: { ...e, weights: w } };
    });
  }
  function setPlanActualReps(itemUid: string, idx: number, val: string) {
    setPlanLog((p) => {
      const e = p[itemUid] ?? blankEntry();
      const ar = [...(e.actual_reps ?? [])]; ar[idx] = val;
      return { ...p, [itemUid]: { ...e, actual_reps: ar } };
    });
  }
  function setPlanSetNotes(itemUid: string, idx: number, val: string) {
    setPlanLog((p) => {
      const e = p[itemUid] ?? blankEntry();
      const sn = [...(e.set_notes ?? [])]; sn[idx] = val;
      return { ...p, [itemUid]: { ...e, set_notes: sn } };
    });
  }
  function setPlanNotes(itemUid: string, val: string) {
    setPlanLog((p) => ({ ...p, [itemUid]: { ...(p[itemUid] ?? blankEntry()), notes: val } }));
  }
  function setPlanExerciseCompleted(itemUid: string, val: boolean) {
    setPlanLog((p) => ({ ...p, [itemUid]: { ...(p[itemUid] ?? blankEntry()), completed: val } }));
  }
  // Per-day completion is tracked separately so it survives independent of items.
  const [completedDays, setCompletedDays] = useState<Set<string>>(new Set());
  function toggleDayCompleted(dayUid: string) {
    setCompletedDays((s) => { const n = new Set(s); n.has(dayUid) ? n.delete(dayUid) : n.add(dayUid); return n; });
  }

  // Feedback storage — re-read after every save so the plan view re-renders.
  const [feedbackTick, setFeedbackTick] = useState(0);
  const bumpFeedback = () => setFeedbackTick((t) => t + 1);

  // ── Draft persistence via localStorage ──────────────────────────────────────
  // key: build_program_drafts_{clientId}  value: { [apptId]: programId }
  function draftKey(cid: string) { return `build_program_drafts_${cid}`; }
  function readDraftMap(cid: string): Record<string, string> {
    try { return JSON.parse(localStorage.getItem(draftKey(cid)) ?? "{}"); } catch { return {}; }
  }
  function writeDraftMap(cid: string, map: Record<string, string>) {
    try { localStorage.setItem(draftKey(cid), JSON.stringify(map)); } catch {}
  }

  // Restore drafted appt set when the client changes. Merge DB-derived drafts
  // (appts with program_status === 'draft') with any localStorage-tracked drafts.
  useEffect(() => {
    if (!clientId) return;
    const dbDrafts = appts.filter((a) => a.program_status === "draft").map((a) => a.id);
    const map = readDraftMap(clientId);
    setDraftedApptIds(new Set([...Object.keys(map), ...dbDrafts]));
  }, [clientId, appts]);

  // When the selected appointment changes, restore the linked program (draft OR
  // published) so the builder shows exactly what was saved before.
  useEffect(() => {
    if (!clientId || !selectedApptId) { setSavedProgramId(null); setIsDraftSaved(false); return; }
    const appt = appts.find((a) => a.id === selectedApptId);
    // Try apptId-keyed snapshot first (stable, always available even offline).
    let restored = false;
    let pidFromSnapshot: string | null = null;
    try {
      const raw = localStorage.getItem(`builder_state_appt_${selectedApptId}`);
      if (raw) {
        const bs = JSON.parse(raw) as {
          days?: ProgramDay[]; programName?: string; durationWeeks?: number;
          daysPerWeek?: number; startsOn?: string; program_id?: string | null; publish?: boolean;
        };
        if (bs?.days?.length) {
          setDays(bs.days);
          if (bs.programName) setProgramName(bs.programName);
          if (bs.durationWeeks) setDurationWeeks(bs.durationWeeks);
          if (bs.daysPerWeek) setDaysPerWeek(bs.daysPerWeek);
          if (bs.startsOn) setStartsOn(bs.startsOn);
          restored = true;
        }
        if (bs?.program_id) pidFromSnapshot = bs.program_id;
      }
    } catch {}
    // Resolve program_id from: DB link → snapshot → legacy map
    const pidFromAppt = appt?.session_program_id ?? null;
    const pidFromMap = readDraftMap(clientId)[selectedApptId] ?? null;
    const pid = pidFromAppt ?? pidFromSnapshot ?? (pidFromMap && pidFromMap !== "local" && pidFromMap !== "saved" ? pidFromMap : null);
    setSavedProgramId(pid);
    setIsDraftSaved(appt?.program_status === "draft" || (!pidFromAppt && !!pidFromMap));
    // Fallback: if we didn't restore yet, try the pid-keyed snapshot for back-compat.
    if (!restored && pid) {
      try {
        const raw = localStorage.getItem(`builder_state_${pid}`);
        if (raw) {
          const bs = JSON.parse(raw) as { days?: ProgramDay[]; programName?: string; durationWeeks?: number; daysPerWeek?: number; startsOn?: string };
          if (bs?.days?.length) {
            setDays(bs.days);
            if (bs.programName) setProgramName(bs.programName);
            if (bs.durationWeeks) setDurationWeeks(bs.durationWeeks);
            if (bs.daysPerWeek) setDaysPerWeek(bs.daysPerWeek);
            if (bs.startsOn) setStartsOn(bs.startsOn);
          }
        }
      } catch {}
    }
    // Fetch program meta from DB (name, is_published) for header display in case it changed.
    if (!pid) return;
    let cancelled = false;
    (async () => {
      const res = await loadProgramForAppointment(selectedApptId);
      if (cancelled || !res.ok || !res.data) return;
      if (res.data.name) setProgramName(res.data.name);
      if (res.data.starts_on) setStartsOn(res.data.starts_on);
      if (res.data.duration_weeks) setDurationWeeks(res.data.duration_weeks);
      // If the linked program is published, default to plan view (read-only with
      // weight/notes inputs). Coach can still click "Edit" to drop into builder.
      if (res.data.is_published) setViewMode((v) => (v === "builder" ? "plan" : v));
    })();
    return () => { cancelled = true; };
  }, [clientId, selectedApptId, appts]);

  // When entering plan view, ensure every visible exercise has a PlanLog entry
  // sized to its current set count (so weight inputs render correctly).
  useEffect(() => {
    if (viewMode === "builder") return;
    setPlanLog((pl) => {
      const next = { ...pl };
      let changed = false;
      for (const d of days) {
        for (const it of d.items) {
          const count = it.same_format ? it.sets : Math.max(it.sets, it.set_rows.length);
          const cur = next[it.uid];
          if (!cur) {
            next[it.uid] = {
              weights: Array<string>(count).fill(""),
              actual_reps: Array<string>(count).fill(""),
              set_notes: Array<string>(count).fill(""),
              notes: "",
            };
            changed = true;
          } else if (cur.weights.length < count) {
            next[it.uid] = {
              ...cur,
              weights: [...cur.weights, ...Array<string>(count - cur.weights.length).fill("")],
              actual_reps: [...(cur.actual_reps ?? []), ...Array<string>(count - (cur.actual_reps ?? []).length).fill("")],
              set_notes: [...(cur.set_notes ?? []), ...Array<string>(count - (cur.set_notes ?? []).length).fill("")],
            };
            changed = true;
          }
        }
      }
      return changed ? next : pl;
    });
  }, [viewMode, days]);

  // library controls
  const [searchTerm, setSearchTerm] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set()); // all groups collapsed by default
  const [openNodes, setOpenNodes] = useState<Set<string>>(new Set()); // child-nodes collapsed
  const [showCoverage, setShowCoverage] = useState(true);
  const [libOpen, setLibOpen] = useState(true);
  const [selectedDayUid, setSelectedDayUid] = useState<string>(() => days[0]?.uid ?? "");
  const activeDayUid = useMemo(
    () => days.find((d) => d.uid === selectedDayUid)?.uid ?? days[0]?.uid ?? "",
    [days, selectedDayUid]
  );

  // past programs
  const [pastSelId, setPastSelId] = useState<string>("");
  const pastPrograms = useMemo(() => (clientId ? pastProgramsForClient(clientId) : []), [clientId]);
  const pastSelected = useMemo(() => pastPrograms.find((p) => p.id === pastSelId) ?? null, [pastPrograms, pastSelId]);

  function handleTabChange(k: ProgramKind) {
    setProgramKind(k);
    if (k === "at_home") {
      setAtHomeProgramStep("picker");
      setAtHomeEditingHeader(false);
    }
    if (k === "in_gym") {
      setInGymStep("picker");
    }
    const url = new URL(window.location.href);
    url.searchParams.set("tab", k === "in_gym" ? "session" : "program");
    router.replace(url.pathname + "?" + url.searchParams.toString(), { scroll: false });
  }

  function openAtHomeAddForm() {
    setProgramName("New program");
    setStartsOn(new Date().toISOString().slice(0, 10));
    setDurationWeeks(8);
    setDaysPerWeek(3);
    setAtHomeProgramStep("form");
  }

  function openAtHomeEditForm() {
    const prog = atHomePrograms.find((p) => p.id === pickedExistingId);
    if (prog) {
      setProgramName(prog.name);
      setStartsOn(prog.starts_on ?? new Date().toISOString().slice(0, 10));
      const start = prog.starts_on ? new Date(prog.starts_on) : new Date();
      const end = prog.ends_on ? new Date(prog.ends_on) : new Date(start.getTime() + 8 * 7 * 86400000);
      setDurationWeeks(Math.max(1, Math.round((end.getTime() - start.getTime()) / (7 * 86400000))));
      setDaysPerWeek(prog.days?.length || 3);
    }
    setAtHomeProgramStep("form");
  }

  function submitAtHomeForm() {
    const newDays = Array.from({ length: daysPerWeek }, (_, i) => NEW_DAY(i + 1));
    setDays(newDays);
    setSelectedDayUid(newDays[0]?.uid ?? "");
    setAtHomeProgramStep("builder");
    setAtHomeEditingHeader(false);
  }

  function handleBannerProgramSelect(item: ClientProgramItem) {
    setClientId(item.clientId);
    setPastSelId("");
    if (!item.hasCurrent) {
      // No current program → jump straight to the new-program form
      setProgramName("New program");
      setStartsOn(new Date().toISOString().slice(0, 10));
      setDurationWeeks(8);
      setDaysPerWeek(3);
      setAtHomeProgramStep("form");
    }
    // If they already have a program, stay on picker so coach can choose Edit or + Add
  }

  function handleBannerSelect(s: WeekSession) {
    setClientId(s.client_id);
    setSelectedApptId(s.id);
    setDays([{ uid: `day-1-${Date.now()}`, title: fmtSessionTitle(s.starts_at), collapsed: false, items: [] }]);
    setInGymStep("builder");
    startApptsFetch(async () => {
      const result = await getClientAppointments(s.client_id);
      setAppts(result);
    });
  }

  function selectClient(id: string) {
    setClientId(id);
    setPastSelId("");
    setSelectedApptId("");
    if (id) {
      startApptsFetch(async () => {
        const result = await getClientAppointments(id);
        setAppts(result);
      });
    } else {
      setAppts([]);
    }
  }

  const selectedClient = useMemo(() => clients.find((c) => c.id === clientId) ?? null, [clients, clientId]);

  // at-home programs for picker dropdown
  const atHomePrograms = useMemo(() => pastPrograms.filter((p) => p.program_kind === "at_home"), [pastPrograms]);

  // at-home pull-from helper (only relevant when building in-gym)
  const atHomeForClient = useMemo(() => pastPrograms.filter((p) => p.program_kind === "at_home" && p.is_current), [pastPrograms]);

  // drag state
  const [drag, setDrag] = useState<DragPayload | null>(null);

  const filteredHierarchy = useMemo(() => {
    const t = searchTerm.trim().toLowerCase();
    if (!t) return LIBRARY_HIERARCHY;
    return LIBRARY_HIERARCHY.map((g) => ({
      ...g,
      nodes: g.nodes.reduce<LibraryNode[]>((acc, node) => {
        if (node.children?.length) {
          const matchedChildren = node.children.filter(
            (c) => c.label.toLowerCase().includes(t) || c.description?.toLowerCase().includes(t)
          );
          if (matchedChildren.length) {
            acc.push({ ...node, children: matchedChildren });
          } else if (node.label.toLowerCase().includes(t) || node.description?.toLowerCase().includes(t)) {
            acc.push(node);
          }
        } else if (node.label.toLowerCase().includes(t) || node.description?.toLowerCase().includes(t)) {
          acc.push(node);
        }
        return acc;
      }, []),
    })).filter((g) => g.nodes.length > 0);
  }, [searchTerm]);

  // Maps each leaf id → the effective movement id (accounts for leafToMovement MOVEMENT_LIBRARY lookup)
  const leafMoveIdMap = useMemo(() => {
    const map = new Map<string, string>();
    hierarchyLeaves().forEach((l) => map.set(l.id, leafToMovement(l).id));
    return map;
  }, []);

  const inProgramCount = useMemo(() => {
    const counts: Record<string, number> = {};
    days.forEach((d) => d.items.forEach((it) => { counts[it.movement.id] = (counts[it.movement.id] ?? 0) + 1; }));
    return counts;
  }, [days]);

  const inProgramIds = useMemo(
    () => new Set(Object.keys(inProgramCount).filter((k) => (inProgramCount[k] ?? 0) > 0)),
    [inProgramCount]
  );

  // Coverage stats: by category, count of how many distinct library movements appear in the program / total in library.
  const coverageByCategory = useMemo(() => {
    const usedByCat: Record<Category, Set<string>> = {} as any;
    ALL_CATEGORIES.forEach((c) => (usedByCat[c] = new Set()));
    days.forEach((d) => d.items.forEach((it) => usedByCat[it.movement.category].add(it.movement.id)));
    const totals: Record<Category, number> = {} as any;
    ALL_CATEGORIES.forEach((c) => (totals[c] = MOVEMENT_LIBRARY.filter((m) => m.category === c).length));
    return ALL_CATEGORIES.map((c) => ({
      category: c,
      used: usedByCat[c].size,
      total: totals[c],
      core_used: MOVEMENT_LIBRARY.filter((m) => m.category === c && m.is_core && usedByCat[c].has(m.id)).length,
      core_total: MOVEMENT_LIBRARY.filter((m) => m.category === c && m.is_core).length
    }));
  }, [days]);

  const uncoveredMovements = useMemo(() =>
    hierarchyLeaves().filter((l) => !inProgramIds.has(leafMoveIdMap.get(l.id) ?? l.id)),
  [inProgramIds, leafMoveIdMap]);

  // ─── auto-collapse days on mobile ───────────────────────────────
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth <= 640) {
      setDays((d) => d.map((x) => ({ ...x, collapsed: true })));
    }
  }, []); // once on mount

  // ─── day actions ────────────────────────────────────────────────
  function isMobile() { return typeof window !== "undefined" && window.innerWidth <= 640; }
  function addDay() { setDays((d) => [...d, { ...NEW_DAY(d.length + 1), collapsed: isMobile() }]); }
  function removeDay(uid: string) { setDays((d) => d.filter((x) => x.uid !== uid)); }

  // Apply an imported program into the current builder. Strips client info
  // (the destination client populates from the program being built), gives
  // imported days/items fresh uids so they don't collide, and respects scope.
  function applyImport(result: ImportResult, dayUid?: string) {
    function freshDay(d: any, idx: number): ProgramDay {
      const newDayUid = `day-imp-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
      // Map old superset_id values to fresh ones (consistent within this day)
      const ssMap = new Map<string, string>();
      const items: ProgramItem[] = (d.items ?? []).map((it: any, j: number): ProgramItem => {
        let newSsId: string | undefined = undefined;
        if (it.superset_id) {
          let m = ssMap.get(it.superset_id);
          if (!m) { m = `ss-imp-${Date.now()}-${idx}-${ssMap.size}-${Math.random().toString(36).slice(2, 5)}`; ssMap.set(it.superset_id, m); }
          newSsId = m;
        }
        return {
          ...it,
          uid: `it-imp-${Date.now()}-${idx}-${j}-${Math.random().toString(36).slice(2, 5)}`,
          superset_id: newSsId,
        } as ProgramItem;
      });
      return {
        uid: newDayUid,
        title: d.title ?? `Day ${idx + 1}`,
        focus: d.focus,
        collapsed: false,
        items,
      };
    }

    const importedDays = result.days.map((d: any, i: number) => freshDay(d, i));

    if (dayUid) {
      // Replace the contents of a specific day (program-day scope)
      const replacement = importedDays[0];
      if (!replacement) return;
      setDays((cur) => cur.map((existing) => existing.uid === dayUid
        ? { ...existing, items: replacement.items, title: replacement.title }
        : existing
      ));
    } else {
      // Whole replacement (session or program-whole). Replace all days outright.
      setDays(importedDays.length > 0 ? importedDays : [NEW_DAY(1)]);
      // For program-whole, also adopt the source's name/dates when destination
      // was effectively empty (no exercises across all days).
      const destEmpty = days.every((d) => d.items.length === 0);
      if (destEmpty && result.source.name) setProgramName(result.source.name);
      if (destEmpty && result.source.duration_weeks) setDurationWeeks(result.source.duration_weeks);
    }
  }
  function toggleCollapse(uid: string) {
    setDays((d) => d.map((x) => (x.uid === uid ? { ...x, collapsed: !x.collapsed } : x)));
  }
  function patchDay(uid: string, patch: Partial<ProgramDay>) {
    setDays((d) => d.map((x) => (x.uid === uid ? { ...x, ...patch } : x)));
  }

  function addMovementToDay(dayUid: string, m: Movement, asWarmup = false) {
    setDays((d) =>
      d.map((day) => {
        if (day.uid !== dayUid) return day;
        const item: ProgramItem = {
          uid: `${m.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          movement: m,
          is_warmup: asWarmup,
          sets: 3,
          reps: "8-10",
          exertion_score: 5,
          same_format: true,
          set_rows: [],
          variations: [],
          rest_seconds: 60,
          equipment_list: [],
          equipment_specifics: undefined,
        };
        return { ...day, items: [...day.items, item], collapsed: false };
      })
    );
  }

  function patchItem(dayUid: string, itemUid: string, patch: Partial<ProgramItem>) {
    setDays((d) =>
      d.map((day) => {
        if (day.uid !== dayUid) return day;
        return {
          ...day,
          items: day.items.map((it) => {
            if (it.uid !== itemUid) return it;
            const next = { ...it, ...patch };
            // Auto-switch to time input when isometric variation is applied
            if ("variations" in patch && next.variations.includes("isometric") && next.reps_type !== "time") {
              next.reps_type = "time";
              next.reps_unit = next.reps_unit ?? "s";
              if (!next.reps || isNaN(Number(next.reps))) next.reps = "30";
            }
            // When sets count changes while broken-out, resize set_rows to match
            if ("sets" in patch && !next.same_format) {
              const newCount = Math.max(1, next.sets);
              const rows = next.set_rows.slice(0, newCount);
              while (rows.length < newCount) {
                const last = rows[rows.length - 1] ?? { reps: next.reps, exertion_score: next.exertion_score };
                rows.push({ ...last });
              }
              next.set_rows = rows;
            }
            return next;
          }),
        };
      })
    );
  }

  function toggleSameFormat(dayUid: string, itemUid: string) {
    setDays((d) =>
      d.map((day) => {
        if (day.uid !== dayUid) return day;
        return {
          ...day,
          items: day.items.map((it) => {
            if (it.uid !== itemUid) return it;
            if (it.same_format) {
              // Expand: build one row per set from current values (including equipment + optional fields)
              const rows: SetRow[] = Array.from({ length: it.sets }, () => ({
                reps: it.reps,
                reps_type: it.reps_type,
                reps_unit: it.reps_unit,
                exertion_score: it.exertion_score,
                variations: [...it.variations],
                notes: it.notes,
                equipment_list: [...it.equipment_list],
                equipment_specifics: it.equipment_specifics,
                tempo: it.tempo,
                rir: it.rir,
                half_reps: it.half_reps,
                rest_seconds: it.rest_seconds,
              }));
              return { ...it, same_format: false, set_rows: rows };
            } else {
              // Collapse: adopt first row's values as the shared values
              const first = it.set_rows[0];
              return {
                ...it,
                same_format: true,
                reps: first?.reps ?? it.reps,
                exertion_score: first?.exertion_score ?? it.exertion_score,
                notes: first?.notes ?? it.notes,
                equipment_list: first?.equipment_list ?? it.equipment_list,
                equipment_specifics: first?.equipment_specifics ?? it.equipment_specifics,
                tempo: first?.tempo ?? it.tempo,
                rir: first?.rir ?? it.rir,
                half_reps: first?.half_reps ?? it.half_reps,
                rest_seconds: first?.rest_seconds ?? it.rest_seconds,
              };
            }
          }),
        };
      })
    );
  }

  function patchSetRow(dayUid: string, itemUid: string, setIdx: number, patch: Partial<SetRow>) {
    setDays((d) =>
      d.map((day) => {
        if (day.uid !== dayUid) return day;
        return {
          ...day,
          items: day.items.map((it) => {
            if (it.uid !== itemUid) return it;
            const rows = it.set_rows.map((r, i) => (i === setIdx ? { ...r, ...patch } : r));
            return { ...it, set_rows: rows };
          }),
        };
      })
    );
  }
  function removeItem(dayUid: string, itemUid: string) {
    setDays((d) => d.map((day) => (day.uid === dayUid ? { ...day, items: day.items.filter((it) => it.uid !== itemUid) } : day)));
  }
  function moveItem(dayUid: string, itemUid: string, dir: -1 | 1) {
    setDays((d) =>
      d.map((day) => {
        if (day.uid !== dayUid) return day;
        const idx = day.items.findIndex((it) => it.uid === itemUid);
        const j = idx + dir;
        if (idx < 0 || j < 0 || j >= day.items.length) return day;
        const copy = day.items.slice();
        [copy[idx], copy[j]] = [copy[j], copy[idx]];
        return { ...day, items: copy };
      })
    );
  }
  function moveItemAcross(srcDayUid: string, itemUid: string, dstDayUid: string, targetIndex?: number) {
    setDays((d) => {
      const src = d.find((x) => x.uid === srcDayUid);
      const item = src?.items.find((it) => it.uid === itemUid);
      if (!src || !item) return d;
      const without = d.map((day) => day.uid === srcDayUid ? { ...day, items: day.items.filter((it) => it.uid !== itemUid) } : day);
      return without.map((day) => {
        if (day.uid !== dstDayUid) return day;
        const idx = targetIndex ?? day.items.length;
        const next = day.items.slice();
        next.splice(Math.max(0, Math.min(idx, next.length)), 0, item);
        return { ...day, items: next };
      });
    });
  }
  function reorderWithinDay(dayUid: string, itemUid: string, targetIndex: number) {
    setDays((d) => d.map((day) => {
      if (day.uid !== dayUid) return day;
      const cur = day.items.findIndex((it) => it.uid === itemUid);
      if (cur < 0) return day;
      const copy = day.items.slice();
      const [taken] = copy.splice(cur, 1);
      const ix = Math.max(0, Math.min(targetIndex, copy.length));
      copy.splice(ix > cur ? ix - 1 : ix, 0, taken);
      return { ...day, items: copy };
    }));
  }

  // ─── Copy / pull-from ────────────────────────────────────────────
  function copyFromPast(p: PastProgramFull) {
    setProgramName(`${p.name} — v2`);
    setDurationWeeks(p.duration_weeks ?? 8);
    setProgramKind(p.program_kind);
    if (p.program_kind === "at_home" && p.at_home_cadence) {
      const parsed = parseInt(p.at_home_cadence);
      if (!isNaN(parsed)) setDaysPerWeek(parsed);
    }
    setDays(
      p.days.map((d, i) => ({
        uid: `copy-${i}-${Date.now()}`,
        title: d.title,
        collapsed: false,
        items: d.items.map((it, j) => {
          const m = MOVEMENT_LIBRARY.find((x) => x.name === it.name) ?? {
            id: `m-${j}`, name: it.name, category: it.category
          };
          return {
            uid: `${m.id}-${Date.now()}-${j}`,
            movement: m as Movement,
            is_warmup: false,
            sets: it.sets,
            reps: it.reps,
            exertion_score: 5,
            same_format: true,
            set_rows: [],
            variations: [],
            rest_seconds: 60,
            notes: it.notes,
            equipment_list: [],
            equipment_specifics: undefined,
          } satisfies ProgramItem;
        })
      }))
    );
    setSaveMessage(`Copied "${p.name}" — edit and Publish to make it the current ${PROGRAM_KIND_LABEL[p.program_kind].toLowerCase()} program.`);
  }

  // pull a single day from at-home into the in-gym builder as a new day
  function pullAtHomeDay(programId: string, dayNumber: number) {
    const prog = atHomeForClient.find((p) => p.id === programId);
    const d = prog?.days.find((x) => x.day_number === dayNumber);
    if (!prog || !d) return;
    setDays((cur) => [
      ...cur,
      {
        uid: `pulled-${Date.now()}`,
        title: `${d.title} (from program)`,
        collapsed: false,
        items: d.items.map((it, j) => {
          const m = MOVEMENT_LIBRARY.find((x) => x.name === it.name) ?? { id: `m-${j}`, name: it.name, category: it.category };
          return {
            uid: `${m.id}-${Date.now()}-${j}`,
            movement: m as Movement,
            is_warmup: false,
            sets: it.sets,
            reps: it.reps,
            exertion_score: 5,
            same_format: true,
            set_rows: [],
            variations: [],
            rest_seconds: 60,
            equipment_list: [],
            equipment_specifics: undefined,
          } satisfies ProgramItem;
        })
      }
    ]);
  }

  function persist(publish: boolean) {
    if (!clientId) { setSaveError("Pick a client first."); return; }
    setSaveError(null);
    setSaveMessage(null);
    startSave(async () => {
      const sessionAppt = programKind === "in_gym" ? appts.find((a) => a.id === selectedApptId) : null;
      const autoName = sessionAppt
        ? `Session ${new Date(sessionAppt.starts_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
        : programName;
      const res = await saveProgram({
        program_id: savedProgramId ?? undefined,
        appt_id: programKind === "in_gym" ? (selectedApptId || null) : null,
        client_id: clientId,
        name: autoName,
        starts_on: startsOn,
        duration_weeks: durationWeeks,
        based_on_program_id: pastSelId || null,
        publish,
        program_kind: programKind,
        at_home_cadence: programKind === "at_home" ? `${daysPerWeek}x/week` : null,
        // Full builder snapshot — enables lossless re-import elsewhere
        builder_state: { days, programName, durationWeeks, daysPerWeek, startsOn },
        days: days.map((d, idx) => ({
          day_number: idx + 1,
          title: d.title,
          focus: d.focus,
          items: d.items.map((it) => ({
            movement_id: MOVEMENT_LIBRARY.some((m) => m.id === it.movement.id) ? it.movement.id : undefined,
            movement_name: it.movement.name,
            category: it.movement.category,
            is_warmup: it.is_warmup,
            sets: it.sets,
            reps: it.same_format
              ? it.reps
              : it.set_rows.map((r, i) => `Set ${i + 1}: ${r.reps}`).join(" / "),
            exertion: it.same_format
              ? (EXERTION_LABELS[it.exertion_score] ?? String(it.exertion_score))
              : it.set_rows.map((r, i) => `Set ${i + 1}: ${EXERTION_SHORT[r.exertion_score] ?? r.exertion_score}`).join(", "),
            rest_seconds: it.rest_seconds ?? null,
            notes: it.notes ?? null
          }))
        }))
      });
      // Always snapshot the full builder UI state (set_rows, supersets, optional
      // fields, etc.) to localStorage so reload restores exactly what the coach
      // saw — even if Supabase is unconfigured or the DB write didn't return an id.
      const pidFromSave = res.ok ? (res.data?.id ?? null) : null;
      if (selectedApptId) {
        try {
          localStorage.setItem(
            `builder_state_appt_${selectedApptId}`,
            JSON.stringify({ days, programName, durationWeeks, daysPerWeek, startsOn, program_id: pidFromSave, publish })
          );
        } catch {}
      }
      if (!res.ok) {
        if (res.error.startsWith("Supabase not configured")) {
          if (!publish && selectedApptId) {
            const map = readDraftMap(clientId);
            map[selectedApptId] = "local";
            writeDraftMap(clientId, map);
            setDraftedApptIds((prev) => new Set([...prev, selectedApptId]));
            setIsDraftSaved(true);
          } else if (publish && selectedApptId) {
            const map = readDraftMap(clientId);
            delete map[selectedApptId];
            writeDraftMap(clientId, map);
            setDraftedApptIds((prev) => { const n = new Set(prev); n.delete(selectedApptId); return n; });
            setIsDraftSaved(false);
            setPlanLog(initPlanLog(days));
            setViewMode("plan");
          }
          setSaveMessage(`${publish ? "Published" : "Drafted"} locally — Supabase not configured yet.`);
        } else {
          setSaveError(res.error);
        }
        return;
      }
      const pid = pidFromSave;
      if (pid) setSavedProgramId(pid);
      // Also write a pid-keyed copy for back-compat with any earlier saves.
      if (pid) {
        try {
          localStorage.setItem(
            `builder_state_${pid}`,
            JSON.stringify({ days, programName, durationWeeks, daysPerWeek, startsOn })
          );
        } catch {}
      }
      // Optimistically reflect the new status on the local appts list so the
      // dropdown badge flips without a server round-trip.
      if (selectedApptId) {
        setAppts((prev) => prev.map((a) => a.id === selectedApptId
          ? { ...a, program_status: publish ? "programmed" : "draft", session_program_id: pid ?? a.session_program_id ?? null }
          : a
        ));
      }
      if (!publish) {
        if (selectedApptId) {
          const map = readDraftMap(clientId);
          map[selectedApptId] = pid ?? "saved";
          writeDraftMap(clientId, map);
          setDraftedApptIds((prev) => new Set([...prev, selectedApptId]));
        }
        setIsDraftSaved(true);
        setSaveMessage("Drafted.");
      } else {
        if (selectedApptId) {
          const map = readDraftMap(clientId);
          delete map[selectedApptId];
          writeDraftMap(clientId, map);
          setDraftedApptIds((prev) => { const n = new Set(prev); n.delete(selectedApptId); return n; });
        }
        setIsDraftSaved(false);
        setSaveMessage("Published. Visible on the client's portal.");
        setPlanLog(initPlanLog(days));
        setViewMode("plan");
      }
    });
  }

  function daySummary(day: ProgramDay): string {
    const exercises = day.items.filter((it) => it.movement.id !== "rest");
    if (exercises.length === 0) return "no movements yet";
    const counts: Partial<Record<Category, number>> = {};
    exercises.forEach((it) => { counts[it.movement.category] = (counts[it.movement.category] ?? 0) + 1; });
    return Object.entries(counts)
      .map(([k, v]) => `${v} ${CATEGORY_LABELS[k as Category].toLowerCase()}`)
      .join(" · ");
  }

  function toggleGroup(id: string) {
    setOpenGroups((cur) => {
      const n = new Set(cur);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function toggleNode(id: string) {
    setOpenNodes((cur) => {
      const n = new Set(cur);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function addLeafToProgram(leaf: LibraryLeaf, dayUid: string) {
    addMovementToDay(dayUid, leafToMovement(leaf), false);
  }

  function addRestToDay(dayUid: string) {
    setDays((d) =>
      d.map((day) => {
        if (day.uid !== dayUid) return day;
        const item: ProgramItem = {
          uid: `rest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          movement: REST_MOVEMENT,
          is_warmup: false,
          sets: 1,
          reps: "",
          exertion_score: 5,
          same_format: true,
          set_rows: [],
          variations: [],
          rest_seconds: 0,
          equipment_list: [],
          rest_duration: 60,
          rest_unit: "s",
        };
        return { ...day, items: [...day.items, item], collapsed: false };
      })
    );
  }

  function addMovementToSuperset(dayUid: string, m: Movement, supersetId: string) {
    setDays((d) =>
      d.map((day) => {
        if (day.uid !== dayUid) return day;
        const newItem: ProgramItem = {
          uid: `${m.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          movement: m, is_warmup: false,
          sets: 3, reps: "8-10", exertion_score: 5,
          same_format: true, set_rows: [], variations: [],
          rest_seconds: 60,
          equipment_list: [],
          equipment_specifics: undefined,
          superset_id: supersetId,
        };
        return { ...day, items: [...day.items, newItem] };
      })
    );
  }

  // ─── Variation toggle ────────────────────────────────────────────
  function toggleVariation(dayUid: string, itemUid: string, v: Variation) {
    setDays((d) =>
      d.map((day) => {
        if (day.uid !== dayUid) return day;
        return {
          ...day,
          items: day.items.map((it) => {
            if (it.uid !== itemUid) return it;
            const has = it.variations.includes(v);
            return { ...it, variations: has ? it.variations.filter((x) => x !== v) : [...it.variations, v] };
          }),
        };
      })
    );
  }

  // ─── Superset actions ─────────────────────────────────────────────
  function createSuperset(dayUid: string, itemUidA: string, itemUidB: string) {
    const supersetId = `ss-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setDays((d) =>
      d.map((day) => {
        if (day.uid !== dayUid) return day;
        return {
          ...day,
          items: day.items.map((it) =>
            it.uid === itemUidA || it.uid === itemUidB ? { ...it, superset_id: supersetId } : it
          ),
        };
      })
    );
  }
  function addToSuperset(dayUid: string, itemUid: string, supersetId: string) {
    patchItem(dayUid, itemUid, { superset_id: supersetId });
  }
  function initSuperset(dayUid: string, itemUid: string): string {
    const supersetId = `ss-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    patchItem(dayUid, itemUid, { superset_id: supersetId });
    return supersetId;
  }

  function removeFromSuperset(dayUid: string, itemUid: string) {
    setDays((d) =>
      d.map((day) => {
        if (day.uid !== dayUid) return day;
        const item = day.items.find((it) => it.uid === itemUid);
        const ssId = item?.superset_id;
        if (!ssId) return day;
        const siblings = day.items.filter((it) => it.superset_id === ssId && it.uid !== itemUid);
        return {
          ...day,
          items: day.items.map((it) => {
            if (it.uid === itemUid) return { ...it, superset_id: undefined };
            // If only 1 sibling remains, dissolve the superset entirely
            if (siblings.length === 1 && it.superset_id === ssId) return { ...it, superset_id: undefined };
            return it;
          }),
        };
      })
    );
  }
  function removeSuperset(dayUid: string, supersetId: string) {
    // Ungroup: strip superset_id from each item so they stay as standalone exercises
    setDays((d) =>
      d.map((day) =>
        day.uid !== dayUid
          ? day
          : {
              ...day,
              items: day.items.map((it) =>
                it.superset_id === supersetId ? { ...it, superset_id: undefined } : it
              ),
            }
      )
    );
  }

  function moveSupersetAcross(srcDayUid: string, supersetId: string, dstDayUid: string, targetIdx?: number) {
    setDays((d) => {
      const src = d.find((day) => day.uid === srcDayUid);
      const ssItems = src?.items.filter((it) => it.superset_id === supersetId) ?? [];
      if (!ssItems.length) return d;
      const without = d.map((day) =>
        day.uid === srcDayUid ? { ...day, items: day.items.filter((it) => it.superset_id !== supersetId) } : day
      );
      return without.map((day) => {
        if (day.uid !== dstDayUid) return day;
        const next = day.items.slice();
        const ix = Math.max(0, Math.min(targetIdx ?? next.length, next.length));
        next.splice(ix, 0, ...ssItems);
        return { ...day, items: next };
      });
    });
  }
  function reorderSupersetWithinDay(dayUid: string, supersetId: string, targetItemIdx: number) {
    setDays((d) =>
      d.map((day) => {
        if (day.uid !== dayUid) return day;
        const ssItems = day.items.filter((it) => it.superset_id === supersetId);
        const others = day.items.filter((it) => it.superset_id !== supersetId);
        const ix = Math.max(0, Math.min(targetItemIdx, others.length));
        others.splice(ix, 0, ...ssItems);
        return { ...day, items: others };
      })
    );
  }

  // ─── DnD handlers ────────────────────────────────────────────────
  function onDragStartLib(m: Movement, e: React.DragEvent) {
    setDrag({ kind: "lib", movement: m });
    e.dataTransfer.effectAllowed = "copy";
  }
  function onDragStartItem(dayUid: string, itemUid: string, e: React.DragEvent) {
    setDrag({ kind: "item", dayUid, itemUid });
    e.dataTransfer.effectAllowed = "move";
  }
  function onDragStartSuperset(dayUid: string, supersetId: string, e: React.DragEvent) {
    e.stopPropagation();
    setDrag({ kind: "superset", dayUid, supersetId });
    e.dataTransfer.effectAllowed = "move";
  }
  function onDayDrop(dstDayUid: string, e: React.DragEvent) {
    e.preventDefault();
    if (!drag) return;
    if (drag.kind === "lib") {
      addMovementToDay(dstDayUid, drag.movement, false);
    } else if (drag.kind === "item" && drag.dayUid !== dstDayUid) {
      moveItemAcross(drag.dayUid, drag.itemUid, dstDayUid);
    } else if (drag.kind === "superset" && drag.dayUid !== dstDayUid) {
      moveSupersetAcross(drag.dayUid, drag.supersetId, dstDayUid);
    }
    setDrag(null);
  }
  function onRowDrop(dstDayUid: string, targetIndex: number, e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!drag) return;
    if (drag.kind === "lib") {
      addMovementToDay(dstDayUid, drag.movement, false);
      setDays((d) => d.map((day) => {
        if (day.uid !== dstDayUid) return day;
        const last = day.items[day.items.length - 1];
        if (!last) return day;
        const without = day.items.slice(0, -1);
        const ix = Math.max(0, Math.min(targetIndex, without.length));
        without.splice(ix, 0, last);
        return { ...day, items: without };
      }));
    } else if (drag.kind === "item") {
      if (drag.dayUid === dstDayUid) reorderWithinDay(dstDayUid, drag.itemUid, targetIndex);
      else moveItemAcross(drag.dayUid, drag.itemUid, dstDayUid, targetIndex);
    } else if (drag.kind === "superset") {
      if (drag.dayUid === dstDayUid) reorderSupersetWithinDay(dstDayUid, drag.supersetId, targetIndex);
      else moveSupersetAcross(drag.dayUid, drag.supersetId, dstDayUid, targetIndex);
    }
    setDrag(null);
  }

  return (
    <div>
      {viewMode !== "builder" && (
        <SessionPlanView
          clientId={clientId}
          days={days}
          programKind={programKind}
          clientName={selectedClient?.full_name ?? ""}
          sessionTitle={programKind === "in_gym" ? (days[0]?.title ?? "Session") : programName}
          planLog={planLog}
          completed={viewMode === "completed"}
          completedDays={completedDays}
          onToggleDayCompleted={toggleDayCompleted}
          summaryOpen={summaryOpen}
          onSummaryToggle={() => setSummaryOpen((o) => !o)}
          onSetWeight={setPlanWeight}
          onSetActualReps={setPlanActualReps}
          onSetSetNotes={setPlanSetNotes}
          onSetNotes={setPlanNotes}
          onSetExerciseCompleted={setPlanExerciseCompleted}
          onEdit={() => setViewMode("builder")}
          onComplete={() => setViewMode("completed")}
          feedbackId={programKind === "in_gym" ? selectedApptId : (savedProgramId ? `program-${savedProgramId}` : "")}
          feedbackTick={feedbackTick}
          onSavePre={(a) => {
            const fid = programKind === "in_gym" ? selectedApptId : (savedProgramId ? `program-${savedProgramId}` : "");
            if (!fid) return;
            savePre(fid, a);
            bumpFeedback();
          }}
          onSavePost={(a) => {
            const fid = programKind === "in_gym" ? selectedApptId : (savedProgramId ? `program-${savedProgramId}` : "");
            if (!fid) return;
            savePost(fid, a);
            bumpFeedback();
            // For in_gym sessions, queue a follow-up for the client (due next day).
            if (programKind === "in_gym" && selectedApptId && clientId) {
              const appt = appts.find((x) => x.id === selectedApptId);
              const startsAt = appt?.starts_at ?? new Date().toISOString();
              const label = new Date(startsAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
              queueFollowup({ client_id: clientId, appt_id: selectedApptId, session_label: label, session_starts_at: startsAt });
            }
          }}
          onSavePerDay={(dayUid, a) => {
            const fid = programKind === "in_gym" ? selectedApptId : (savedProgramId ? `program-${savedProgramId}` : "");
            if (!fid) return;
            savePerDay(fid, dayUid, a);
            bumpFeedback();
          }}
        />
      )}
      {viewMode === "builder" && <>
      {/* ─── Page-level tab bar ─── */}
      <div style={{ borderBottom: "2px solid var(--line)", marginBottom: "1.5rem", display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ display: "flex" }}>
          {(["in_gym", "at_home"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => handleTabChange(k)}
              style={{
                padding: "0.55rem 1.4rem",
                background: "transparent",
                border: "none",
                borderBottom: programKind === k ? "2px solid var(--rust)" : "2px solid transparent",
                marginBottom: "-2px",
                fontFamily: "inherit",
                fontSize: "0.95rem",
                fontWeight: programKind === k ? 700 : 400,
                color: programKind === k ? "var(--rust)" : "var(--muted)",
                cursor: "pointer",
                letterSpacing: programKind === k ? "0.01em" : undefined
              }}
            >
              {k === "in_gym" ? "Session" : "Program"}
            </button>
          ))}
        </div>
        <span className="meta" style={{ paddingBottom: "0.55rem", fontSize: "0.78rem" }}>
          {programKind === "in_gym"
            ? "Training days James leads on the schedule."
            : "Self-guided plan the client follows on their own time."}
        </span>
      </div>

      {/* ─── in_gym PICKER FLOW ─── */}
      {programKind === "in_gym" && inGymStep === "picker" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>

          {/* Sessions this week — above client selector */}
          {weekSessions.length > 0 && (
            <SessionsThisWeekBanner sessions={weekSessions} onSelect={handleBannerSelect} />
          )}

          {/* Client selector — outside any card */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span className="stat-label" style={{ margin: 0, whiteSpace: "nowrap" }}>Client</span>
            <ClientCombobox clients={clients} value={clientId} onChange={selectClient} />
          </div>

          {/* Client summary card — only when selected */}
          {selectedClient && (
            <div className="card" style={{ borderLeft: "4px solid var(--rust)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
                <div>
                  <span className="badge">Programming for</span>
                  <h2 style={{ marginTop: "0.35rem", marginBottom: "0.15rem" }}>{selectedClient.full_name}</h2>
                  <div className="meta" style={{ fontSize: "0.82rem" }}>
                    {selectedClient.tier?.replace("_", " ") ?? "—"} · {selectedClient.regular_frequency ?? "—"} sessions/wk · since {fmtDate(selectedClient.member_since)}
                  </div>
                </div>
                <Link className="btn btn-ghost" href={`/coach/clients/${selectedClient.id}`} style={{ padding: "0.35rem 0.7rem", fontSize: "0.72rem" }}>
                  full profile →
                </Link>
              </div>
              <ClientGoalsSection client={selectedClient} />
            </div>
          )}

          {/* Session picker */}
          {clientId && (
            <div className="card">
              <label className="stat-label">
                Select Session
                {apptsPending ? <span className="meta" style={{ marginLeft: "0.5rem", fontWeight: 400 }}>loading…</span> : null}
              </label>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.3rem", alignItems: "center", flexWrap: "wrap" }}>
                <select
                  className="select"
                  style={{ flex: 1, maxWidth: 420 }}
                  value={selectedApptId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedApptId(id);
                    setSaveMessage(null);
                    const appt = appts.find((a) => a.id === id);
                    // Only reset days to a clean empty day when there is NO
                    // saved state to restore (no DB link AND no localStorage
                    // snapshot for this appt). Otherwise the useEffect below
                    // restores the saved exercises.
                    const hasLocalSnapshot = id ? (() => {
                      try { return !!localStorage.getItem(`builder_state_appt_${id}`); }
                      catch { return false; }
                    })() : false;
                    if (!appt?.session_program_id && !hasLocalSnapshot) {
                      setDays([{
                        uid: `day-1-${Date.now()}`,
                        title: appt ? fmtSessionTitle(appt.starts_at) : "Session",
                        collapsed: false,
                        items: [],
                      }]);
                    }
                  }}
                  disabled={apptsPending}
                >
                  <option value="">— pick a session —</option>
                  {appts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {new Date(a.starts_at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      {a.program_status === "draft" || draftedApptIds.has(a.id) ? "  · Drafted"
                        : a.program_status === "programmed" ? "  ✓ Published"
                        : ""}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-primary"
                  disabled={!selectedApptId}
                  onClick={() => setInGymStep("builder")}
                >{(() => {
                  const a = appts.find((x) => x.id === selectedApptId);
                  return a?.program_status === "programmed" ? "View →"
                    : a?.program_status === "draft" || draftedApptIds.has(selectedApptId) ? "Edit →"
                    : "Build →";
                })()}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── at_home SETUP FLOW (picker / form steps) ─── */}
      {programKind === "at_home" && atHomeProgramStep !== "builder" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>

          {/* Client programs banner — above client selector */}
          {clientProgramSummary.length > 0 && (
            <ClientProgramsBanner items={clientProgramSummary} onSelect={handleBannerProgramSelect} />
          )}

          {/* Client selector — outside any card */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span className="stat-label" style={{ margin: 0, whiteSpace: "nowrap" }}>Client</span>
            <ClientCombobox clients={clients} value={clientId} onChange={selectClient} />
          </div>

          {/* Client summary card — only when selected */}
          {selectedClient && (
            <div className="card" style={{ borderLeft: "4px solid var(--rust)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
                <div>
                  <span className="badge">Programming for</span>
                  <h2 style={{ marginTop: "0.35rem", marginBottom: "0.15rem" }}>{selectedClient.full_name}</h2>
                  <div className="meta" style={{ fontSize: "0.82rem" }}>
                    {selectedClient.tier?.replace("_", " ") ?? "—"} · {selectedClient.regular_frequency ?? "—"} sessions/wk · since {fmtDate(selectedClient.member_since)}
                  </div>
                </div>
                <Link className="btn btn-ghost" href={`/coach/clients/${selectedClient.id}`} style={{ padding: "0.35rem 0.7rem", fontSize: "0.72rem" }}>
                  full profile →
                </Link>
              </div>
              <ClientGoalsSection client={selectedClient} />
            </div>
          )}

          {/* Step 2a: Pick existing */}
          {clientId && atHomeProgramStep === "picker" && (
            <div className="card">
              <label className="stat-label">Program</label>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.3rem", alignItems: "center", flexWrap: "wrap" }}>
                <select
                  className="select"
                  style={{ flex: 1, maxWidth: 380 }}
                  value={pickedExistingId}
                  onChange={(e) => setPickedExistingId(e.target.value)}
                >
                  <option value="">— select existing program —</option>
                  {atHomePrograms.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.starts_on ? ` · ${new Date(p.starts_on).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
                    </option>
                  ))}
                </select>
                {pickedExistingId && (
                  <button className="btn btn-ghost" onClick={openAtHomeEditForm}>Edit</button>
                )}
                <button className="btn btn-primary" onClick={openAtHomeAddForm}>+ Add</button>
              </div>
            </div>
          )}

          {/* Step 2b: Program form */}
          {clientId && atHomeProgramStep === "form" && (
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.75rem" }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: "0.2rem 0.6rem", fontSize: "0.78rem" }}
                  onClick={() => setAtHomeProgramStep("picker")}
                >← Back</button>
                <span className="stat-label" style={{ margin: 0 }}>Program details</span>
              </div>
              <div className="form-grid-5col" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: "0.75rem", alignItems: "end" }}>
                <div>
                  <label className="stat-label">Program name</label>
                  <input className="input" value={programName} onChange={(e) => setProgramName(e.target.value)} style={{ marginTop: "0.3rem" }} />
                </div>
                <div>
                  <label className="stat-label">Starts on</label>
                  <input className="input" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} style={{ marginTop: "0.3rem" }} />
                </div>
                <div>
                  <label className="stat-label">Time frame (wks)</label>
                  <input className="input" type="number" min={1} max={52} value={durationWeeks} onChange={(e) => setDurationWeeks(Number(e.target.value) || 1)} style={{ marginTop: "0.3rem" }} />
                </div>
                <div>
                  <label className="stat-label">Days / week</label>
                  <input className="input" type="number" min={1} max={7} value={daysPerWeek} onChange={(e) => setDaysPerWeek(Number(e.target.value) || 1)} style={{ marginTop: "0.3rem" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                  <button className="btn btn-primary" onClick={submitAtHomeForm}>Submit</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── BUILDER: at_home program header ─── */}
      {programKind === "at_home" && atHomeProgramStep === "builder" && (
        <div className="card no-print" style={{ marginBottom: "1rem" }}>
          {atHomeEditingHeader ? (
            <div className="form-grid-5col" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: "0.75rem", alignItems: "end" }}>
              <div>
                <label className="stat-label">Program name</label>
                <input className="input" value={programName} onChange={(e) => setProgramName(e.target.value)} style={{ marginTop: "0.3rem" }} />
              </div>
              <div>
                <label className="stat-label">Starts on</label>
                <input className="input" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} style={{ marginTop: "0.3rem" }} />
              </div>
              <div>
                <label className="stat-label">Time frame (wks)</label>
                <input className="input" type="number" min={1} max={52} value={durationWeeks} onChange={(e) => setDurationWeeks(Number(e.target.value) || 1)} style={{ marginTop: "0.3rem" }} />
              </div>
              <div>
                <label className="stat-label">Days / week</label>
                <input className="input" type="number" min={1} max={7} value={daysPerWeek} onChange={(e) => setDaysPerWeek(Number(e.target.value) || 1)} style={{ marginTop: "0.3rem" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                <button className="btn btn-primary" onClick={() => setAtHomeEditingHeader(false)}>Submit</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span className="badge">At-home program</span>
                <h2 style={{ margin: "0.35rem 0 0.2rem" }}>{programName}</h2>
                <div className="meta" style={{ fontSize: "0.82rem" }}>
                  {selectedClient?.full_name} · Starts {new Date(startsOn).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {durationWeeks}wk · {daysPerWeek}×/wk
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: "0.78rem" }}
                  onClick={() => setImportDayModalUid("__whole_program__")}
                  title="Copy a past program (all days)"
                >⇪ Import whole program</button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: "0.78rem" }}
                  onClick={() => setAtHomeProgramStep("picker")}
                >← Back</button>
                <button className="btn btn-ghost" style={{ fontSize: "0.78rem" }} onClick={() => setAtHomeEditingHeader(true)}>✎ Edit</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── at_home builder: client summary ─── */}
      {programKind === "at_home" && atHomeProgramStep === "builder" && selectedClient && (
        <div className="card" style={{ marginBottom: "1rem", borderLeft: "4px solid var(--rust)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
            <div>
              <span className="badge">Programming for</span>
              <h2 style={{ marginTop: "0.35rem", marginBottom: "0.15rem" }}>{selectedClient.full_name}</h2>
              <div className="meta" style={{ fontSize: "0.82rem" }}>
                {selectedClient.tier?.replace("_", " ") ?? "—"} · {selectedClient.regular_frequency ?? "—"} sessions/wk · since {fmtDate(selectedClient.member_since)}
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

      {/* ─── in_gym BUILDER: session header card ─── */}
      {programKind === "in_gym" && inGymStep === "builder" && (
        <div className="card no-print" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span className="badge">Session</span>
              <h2 style={{ margin: "0.35rem 0 0.2rem" }}>{days[0]?.title ?? "Session"}</h2>
              <div className="meta" style={{ fontSize: "0.82rem" }}>
                {selectedClient?.full_name} · In-gym training session
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: "0.78rem" }}
                onClick={() => setImportDayModalUid("__whole_session__")}
                title="Copy a past session or one day of a past program"
              >⇪ Import session</button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: "0.78rem" }}
                onClick={() => setInGymStep("picker")}
              >← Back</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── in_gym builder: client summary ─── */}
      {programKind === "in_gym" && inGymStep === "builder" && selectedClient && (
        <div className="card" style={{ marginBottom: "1rem", borderLeft: "4px solid var(--rust)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
            <div>
              <span className="badge">Programming for</span>
              <h2 style={{ marginTop: "0.35rem", marginBottom: "0.15rem" }}>{selectedClient.full_name}</h2>
              <div className="meta" style={{ fontSize: "0.82rem" }}>
                {selectedClient.tier?.replace("_", " ") ?? "—"} · {selectedClient.regular_frequency ?? "—"} sessions/wk · since {fmtDate(selectedClient.member_since)}
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

    {/* ─── BUILDER grid: library + main ─── */}
    {((programKind === "in_gym" && inGymStep === "builder") || (programKind === "at_home" && atHomeProgramStep === "builder")) && (
    <>
    <div className="builder-layout" style={{ display: "grid", gridTemplateColumns: libOpen ? "220px 1fr" : "36px 1fr", gap: "1.25rem", transition: "grid-template-columns 0.15s" }}>
      {/* ─── library accordion (left) ─── */}
      <aside className="builder-library-aside no-print" style={{ position: "sticky", top: "1rem", alignSelf: "start" }}>
        {!libOpen ? (
          /* Collapsed strip */
          <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0.5rem 0.3rem", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={() => setLibOpen(true)}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem", color: "var(--muted)", padding: "0.2rem" }}
              title="Expand library"
            >▶</button>
            <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.08em", color: "var(--muted)", textTransform: "uppercase" }}>Library</span>
          </div>
        ) : (
          /* Expanded panel */
          <div className="card" style={{ maxHeight: "calc(100vh - 2rem)", overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Library</h3>
              <button
                type="button"
                onClick={() => setLibOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.78rem", color: "var(--muted)", padding: "0.2rem 0.35rem" }}
                title="Collapse library"
              >◀</button>
            </div>
            <input
              className="input"
              placeholder="Search movements…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ marginTop: "0.4rem" }}
            />
            <hr className="divider" />
            <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
              {filteredHierarchy.map((group) => {
            const groupOpen = openGroups.has(group.id) || !!searchTerm;
            const groupHasCovered = group.nodes.some((node) =>
              node.children?.length
                ? node.children.some((c) => inProgramIds.has(leafMoveIdMap.get(c.id) ?? c.id))
                : inProgramIds.has(leafMoveIdMap.get(node.id) ?? node.id)
            );
            return (
              <div key={group.id} style={{ borderBottom: "1px solid var(--line)", paddingBottom: "0.25rem", marginBottom: "0.1rem" }}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  style={{
                    width: "100%", textAlign: "left", background: "transparent", border: "none",
                    padding: "0.38rem 0", cursor: "pointer", display: "flex", alignItems: "center",
                    gap: "0.4rem", fontFamily: "inherit", fontWeight: 700, fontSize: "0.9rem",
                    letterSpacing: "0.01em"
                  }}
                >
                  <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>{groupOpen ? "▾" : "▸"}</span>
                  <span style={{ flex: 1 }}>{group.label}</span>
                  {groupHasCovered
                    ? <span style={{ color: "var(--sage)", fontSize: "0.8rem", fontWeight: 400 }}>✓</span>
                    : null}
                </button>
                {groupOpen ? (
                  <div style={{ paddingLeft: "0.5rem" }}>
                    {group.nodes.map((node) => {
                      const hasChildren = (node.children?.length ?? 0) > 0;
                      const nodeOpen = openNodes.has(node.id) || !!searchTerm;
                      const nodeMoveId = leafMoveIdMap.get(node.id) ?? node.id;
                      const nodeInProgram = hasChildren
                        ? node.children!.some((c) => inProgramIds.has(leafMoveIdMap.get(c.id) ?? c.id))
                        : inProgramIds.has(nodeMoveId);

                      if (!hasChildren) {
                        const leaf: LibraryLeaf = { id: node.id, label: node.label, description: node.description, category: node.category, is_core: node.is_core };
                        return (
                          <div key={node.id} style={{ paddingLeft: "0.5rem" }}>
                            <LibraryLeafRow
                              leaf={leaf}
                              inProgram={nodeInProgram}
                              onAdd={() => addLeafToProgram(leaf, activeDayUid)}
                              onDragStart={(e) => onDragStartLib(leafToMovement(leaf), e)}
                              onDragEnd={() => setDrag(null)}
                            />
                          </div>
                        );
                      }

                      // Node with children — collapsible sub-group
                      return (
                        <div key={node.id} style={{ marginBottom: "0.2rem" }}>
                          <button
                            type="button"
                            onClick={() => toggleNode(node.id)}
                            style={{
                              width: "100%", textAlign: "left", background: "transparent", border: "none",
                              padding: "0.28rem 0", cursor: "pointer", display: "flex", alignItems: "center",
                              gap: "0.4rem", fontFamily: "inherit", fontWeight: 600, fontSize: "0.83rem"
                            }}
                          >
                            <span style={{ fontSize: "0.62rem", color: "var(--muted)" }}>{nodeOpen ? "▾" : "▸"}</span>
                            <span style={{ flex: 1 }}>{node.label}</span>
                            {nodeInProgram
                              ? <span style={{ color: "var(--sage)", fontSize: "0.76rem", fontWeight: 400 }}>✓</span>
                              : null}
                          </button>
                          {nodeOpen ? (
                            <div style={{ paddingLeft: "0.6rem" }}>
                              {node.children!.map((child) => {
                                const childLeaf = child;
                                const childInProgram = inProgramIds.has(leafMoveIdMap.get(child.id) ?? child.id);
                                return (
                                  <div key={child.id} style={{ paddingLeft: "0.5rem" }}>
                                    <LibraryLeafRow
                                      leaf={childLeaf}
                                      inProgram={childInProgram}
                                      onAdd={() => addLeafToProgram(childLeaf, activeDayUid)}
                                      onDragStart={(e) => onDragStartLib(leafToMovement(childLeaf), e)}
                                      onDragEnd={() => setDrag(null)}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
              {filteredHierarchy.length === 0 ? <p className="meta" style={{ fontSize: "0.78rem" }}>No matches.</p> : null}
            </div>

            {/* ── Rest block — always at bottom ── */}
            <div style={{ borderTop: "1px solid var(--line)", marginTop: "0.4rem", paddingTop: "0.4rem" }}>
              <div
                style={{
                  padding: "0.26rem 0.4rem",
                  borderRadius: 3,
                  marginBottom: "0.12rem",
                }}
                title="Add a timed rest block to the active day"
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <button
                    type="button"
                    className="btn btn-ghost no-print"
                    style={{ padding: "0.04rem 0.32rem", fontSize: "0.72rem", flexShrink: 0, color: "var(--muted)" }}
                    onClick={() => addRestToDay(activeDayUid)}
                    title="Add rest block to active day"
                  >+</button>
                  <span style={{ fontWeight: 600, fontSize: "0.82rem" }}>Rest</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ─── main column ─── */}
      <section style={{ minWidth: 0 }}>
        {/* Past programs + at-home pull-from — Session tab only */}
        {programKind === "in_gym" && (
          <div className="card no-print" style={{ marginTop: "1rem", display: "grid", gridTemplateColumns: atHomeForClient.length ? "1fr 1fr" : "1fr", gap: "0.75rem", alignItems: "end" }}>
            <div>
              <label className="stat-label">Past programs</label>
              <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.3rem" }}>
                <select className="select" value={pastSelId} onChange={(e) => setPastSelId(e.target.value)} style={{ flex: 1 }}>
                  <option value="">— pick one —</option>
                  {pastPrograms.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.program_kind === "at_home" ? ` (${fmtDate(p.starts_on)} → ${fmtDate(p.ends_on)})` : ""} · {PROGRAM_KIND_LABEL[p.program_kind]}
                    </option>
                  ))}
                </select>
                <button className="btn btn-primary" disabled={!pastSelected} onClick={() => pastSelected && copyFromPast(pastSelected)}>Copy</button>
              </div>
            </div>
            {atHomeForClient.length ? (
              <div>
                <label className="stat-label">Pull day from Program</label>
                <select
                  className="select"
                  defaultValue=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const [pid, n] = e.target.value.split("::");
                    pullAtHomeDay(pid, Number(n));
                    e.target.value = "";
                  }}
                  style={{ marginTop: "0.3rem" }}
                >
                  <option value="">— pick day —</option>
                  {atHomeForClient.flatMap((p) =>
                    p.days.map((d) => (
                      <option key={`${p.id}-${d.day_number}`} value={`${p.id}::${d.day_number}`}>
                        {p.name} · {d.title}
                      </option>
                    ))
                  )}
                </select>
              </div>
            ) : null}
          </div>
        )}

        {/* Coverage */}
        <div className="card no-print" style={{ marginTop: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Coverage</h3>
            <button className="btn btn-ghost" style={{ padding: "0.25rem 0.55rem", fontSize: "0.74rem" }} onClick={() => setShowCoverage((v) => !v)}>{showCoverage ? "Hide" : "Show"}</button>
          </div>
          {showCoverage ? (
            <>
              <CoverageHierarchy inProgramIds={inProgramIds} leafMoveIdMap={leafMoveIdMap} />
              <hr className="divider" />
              <div>
                <h4 style={{ margin: 0, fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>Uncovered movements</h4>
                <p className="meta" style={{ fontSize: "0.74rem", marginTop: "0.2rem" }}>Drag any of these into a day to fill the gap.</p>
                <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                  {uncoveredMovements.length === 0 ? (
                    <p className="meta" style={{ fontSize: "0.82rem" }}>All movements have been used. Nice.</p>
                  ) : uncoveredMovements.map((leaf) => (
                    <span
                      key={leaf.id}
                      draggable
                      onDragStart={(e) => onDragStartLib(leafToMovement(leaf), e)}
                      onDragEnd={() => setDrag(null)}
                      style={{
                        display: "inline-flex", alignItems: "center",
                        background: "rgba(0,0,0,0.03)",
                        border: "1px solid var(--line)",
                        padding: "0.18rem 0.5rem", borderRadius: 999, fontSize: "0.74rem", cursor: "grab"
                      }}
                      title={`${CATEGORY_LABELS[leaf.category]} — drag into a day`}
                    >
                      {leaf.label}
                    </span>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* ── in_gym: single day card (session date/time as title, no add/delete/active buttons) ── */}
        {programKind === "in_gym" && (() => {
          const day = days[0];
          if (!day) return null;
          const renderGroups = toRenderGroups(day.items);
          return (
            <div
              className="card"
              style={{ padding: 0, display: "flex", flexDirection: "column", marginTop: "1rem", minWidth: 0 }}
              onDragOver={(e) => { if (drag) e.preventDefault(); }}
              onDrop={(e) => onDayDrop(day.uid, e)}
            >
              {/* Session day header */}
              <div style={{
                padding: "0.55rem 0.7rem", display: "flex", alignItems: "center", gap: "0.4rem",
                borderBottom: "1px solid var(--line)",
                background: "rgba(168,61,43,0.04)",
              }}>
                <input
                  className="input"
                  style={{ flex: 1, fontWeight: 700, fontSize: "0.88rem", border: "none", background: "transparent", padding: "0.15rem 0" }}
                  value={day.title}
                  onChange={(e) => patchDay(day.uid, { title: e.target.value })}
                />
                <button
                  type="button"
                  className="btn btn-ghost no-print"
                  style={{ padding: "0.1rem 0.35rem", fontSize: "0.6rem", flexShrink: 0, color: "var(--muted)" }}
                  onClick={() => setImportDayModalUid(day.uid)}
                  title="Import exercises from a past program into this session"
                >↓ Import</button>
              </div>
              {/* Summary bar */}
              <div className="meta" style={{ fontSize: "0.68rem", padding: "0.25rem 0.7rem", borderBottom: "1px solid var(--line)", color: "var(--muted)" }}>
                {daySummary(day)}
              </div>

              {/* Exercises */}
              <div style={{ padding: "0.4rem 0.5rem", display: "flex", flexDirection: "column", gap: "0.4rem", flex: 1, minWidth: 0 }}>
              {day.items.length === 0 ? (
                <p className="meta" style={{ fontSize: "0.74rem", textAlign: "center", padding: "0.75rem 0", color: "var(--muted)" }}>
                  Drop movements here or click + in the library
                </p>
              ) : renderGroups.map((group) => {

                /* ── Standalone exercise ── */
                if (group.kind === "exercise") {
                  const { item: it, itemIdx } = group;
                  return (
                    <ExerciseCard
                      key={it.uid}
                      it={it}
                      dayUid={day.uid}
                      itemIdx={itemIdx}
                      inSuperset={false}
                      drag={drag}
                      onDragStart={(e) => onDragStartItem(day.uid, it.uid, e)}
                      onDragEnd={() => setDrag(null)}
                      onDrop={(e) => onRowDrop(day.uid, itemIdx, e)}
                      onRemove={() => removeItem(day.uid, it.uid)}
                      onMoveUp={() => moveItem(day.uid, it.uid, -1)}
                      onMoveDown={() => moveItem(day.uid, it.uid, 1)}
                      onPatch={(p) => patchItem(day.uid, it.uid, p)}
                      onToggleSameFormat={() => toggleSameFormat(day.uid, it.uid)}
                      onPatchSetRow={(si, p) => patchSetRow(day.uid, it.uid, si, p)}
                      bottomSlot={
                        <button
                          type="button"
                          className="btn btn-ghost no-print"
                          style={{ fontSize: "0.62rem", padding: "0.1rem 0.32rem", color: "var(--amber)", borderColor: "rgba(217,119,6,0.4)", marginTop: "0.18rem" }}
                          onClick={() => initSuperset(day.uid, it.uid)}
                          title="Group this exercise into a superset — drag more exercises into the box"
                        >⊞ + Superset</button>
                      }
                    />
                  );
                }

                /* ── Superset block ── */
                const { supersetId, entries } = group;
                const lastEntry = entries[entries.length - 1];
                return (
                  <div
                    key={supersetId}
                    onDragOver={(e) => { if (drag) { e.preventDefault(); e.stopPropagation(); }}}
                    onDrop={(e) => {
                      e.stopPropagation();
                      if (!drag) return;
                      if (drag.kind === "lib") {
                        e.preventDefault();
                        addMovementToSuperset(day.uid, drag.movement, supersetId);
                        setDrag(null);
                      } else if (drag.kind === "item" && !entries.find(x => x.item.uid === drag.itemUid)) {
                        if (drag.dayUid !== day.uid) moveItemAcross(drag.dayUid, drag.itemUid, day.uid);
                        addToSuperset(day.uid, drag.itemUid, supersetId);
                        setDrag(null);
                      } else {
                        onRowDrop(day.uid, lastEntry.itemIdx + 1, e);
                      }
                    }}
                    style={{ borderRadius: 5, border: "2px solid var(--amber)" }}
                  >
                    <div
                      draggable
                      onDragStart={(e) => onDragStartSuperset(day.uid, supersetId, e)}
                      onDragEnd={() => setDrag(null)}
                      style={{ background: "rgba(217,119,6,0.09)", padding: "0.28rem 0.5rem", display: "flex", alignItems: "center", gap: "0.4rem", cursor: "grab", borderBottom: "1px solid rgba(217,119,6,0.25)", borderTopLeftRadius: 3, borderTopRightRadius: 3 }}
                    >
                      <span className="no-print" style={{ color: "var(--amber)", userSelect: "none", fontSize: "0.7rem" }}>⋮⋮</span>
                      <span style={{ fontWeight: 700, fontSize: "0.7rem", color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.06em", flex: 1 }}>Super Set</span>
                      <span className="meta" style={{ fontSize: "0.64rem" }}>{entries.length} exercises</span>
                      <button
                        type="button"
                        className="no-print"
                        title="Remove entire superset"
                        onClick={() => removeSuperset(day.uid, supersetId)}
                        style={{ background: "transparent", border: "1px solid var(--amber)", borderRadius: 3, color: "var(--amber)", fontSize: "0.68rem", fontWeight: 700, lineHeight: 1, cursor: "pointer", padding: "0.1rem 0.35rem", flexShrink: 0 }}
                      >✕ Remove</button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", padding: "0.3rem 0.35rem" }}>
                      {entries.map(({ item: it, itemIdx }) => (
                        <ExerciseCard
                          key={it.uid}
                          it={it}
                          dayUid={day.uid}
                          itemIdx={itemIdx}
                          inSuperset={true}
                          drag={drag}
                          onDragStart={(e) => onDragStartItem(day.uid, it.uid, e)}
                          onDragEnd={() => setDrag(null)}
                          onDrop={(e) => onRowDrop(day.uid, itemIdx, e)}
                          onRemove={() => removeItem(day.uid, it.uid)}
                          onMoveUp={() => moveItem(day.uid, it.uid, -1)}
                          onMoveDown={() => moveItem(day.uid, it.uid, 1)}
                          onPatch={(p) => patchItem(day.uid, it.uid, p)}
                          onToggleSameFormat={() => toggleSameFormat(day.uid, it.uid)}
                          onPatchSetRow={(si, p) => patchSetRow(day.uid, it.uid, si, p)}
                        />
                      ))}
                    </div>
                    <div
                      className="no-print"
                      style={{
                        width: "100%", fontSize: "0.62rem", padding: "0.3rem 0.5rem",
                        borderTop: "1px dashed rgba(217,119,6,0.3)",
                        color: "var(--amber)", textAlign: "center",
                        fontStyle: "italic", letterSpacing: "0.04em",
                        background: drag ? "rgba(217,119,6,0.06)" : "transparent",
                      }}
                    >⤓ Drag exercises here</div>
                  </div>
                );
              })}
              </div>
            </div>
          );
        })()}

        {/* ── at_home: multi-day card stack ── */}
        {programKind === "at_home" && (
          <>
          <div style={{
            marginTop: "1rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            paddingBottom: "0.75rem",
            minWidth: 0,
          }}>
            {days.map((day) => {
              const renderGroups = toRenderGroups(day.items);
              return (
                <div
                  key={day.uid}
                  className="card"
                  style={{
                    padding: 0, display: "flex", flexDirection: "column", minWidth: 0,
                    marginTop: 0,
                    borderColor: day.uid === activeDayUid ? "var(--rust)" : undefined,
                  }}
                  onDragOver={(e) => { if (drag) e.preventDefault(); }}
                  onDrop={(e) => onDayDrop(day.uid, e)}
                >
                  {/* Day header */}
                  <div style={{
                    padding: "0.55rem 0.7rem", display: "flex", alignItems: "center", gap: "0.4rem",
                    borderBottom: day.collapsed ? "none" : "1px solid var(--line)",
                    background: day.uid === activeDayUid ? "rgba(168,61,43,0.04)" : undefined,
                  }}>
                    <button
                      type="button"
                      className="btn btn-ghost no-print"
                      style={{ padding: "0.1rem 0.3rem", fontSize: "0.65rem", flexShrink: 0, color: "var(--muted)", border: "none" }}
                      onClick={() => toggleCollapse(day.uid)}
                      title={day.collapsed ? "Expand" : "Collapse"}
                    >{day.collapsed ? "▶" : "▼"}</button>
                    <input
                      className="input"
                      style={{ flex: 1, fontWeight: 700, fontSize: "0.88rem", border: "none", background: "transparent", padding: "0.15rem 0" }}
                      value={day.title}
                      onChange={(e) => patchDay(day.uid, { title: e.target.value })}
                    />
                    {!day.collapsed && <>
                      <button
                        type="button"
                        className="btn btn-ghost no-print"
                        style={{ padding: "0.1rem 0.35rem", fontSize: "0.6rem", flexShrink: 0, color: "var(--muted)" }}
                        onClick={() => setImportDayModalUid(day.uid)}
                        title="Import exercises from a past program into this day"
                      >↓ Import</button>
                      <button
                        type="button"
                        className="btn btn-ghost no-print"
                        style={{
                          padding: "0.1rem 0.35rem", fontSize: "0.6rem", flexShrink: 0,
                          color: day.uid === activeDayUid ? "var(--rust)" : "var(--muted)",
                          borderColor: day.uid === activeDayUid ? "var(--rust)" : undefined,
                          background: day.uid === activeDayUid ? "rgba(168,61,43,0.08)" : undefined,
                          fontWeight: day.uid === activeDayUid ? 700 : undefined,
                        }}
                        onClick={() => setSelectedDayUid(day.uid)}
                        title={day.uid === activeDayUid ? "Active — library additions go here" : "Set as active day for library"}
                      >
                        {day.uid === activeDayUid ? "✎ active" : "✎"}
                      </button>
                    </>}
                    <button className="btn btn-ghost no-print" style={{ padding: "0.1rem 0.35rem", fontSize: "0.65rem", color: "var(--red)", flexShrink: 0 }} onClick={() => removeDay(day.uid)} title="Delete day">✕</button>
                  </div>

                  {!day.collapsed && <>
                  <div className="meta" style={{ fontSize: "0.68rem", padding: "0.25rem 0.7rem", borderBottom: "1px solid var(--line)", color: "var(--muted)" }}>
                    {daySummary(day)}
                  </div>

                  {/* Render groups */}
                  <div style={{ padding: "0.4rem 0.5rem", display: "flex", flexDirection: "column", gap: "0.4rem", flex: 1, minWidth: 0 }}>
                    {day.items.length === 0 ? (
                      <p className="meta" style={{ fontSize: "0.74rem", textAlign: "center", padding: "0.75rem 0", color: "var(--muted)" }}>Drop movements here</p>
                    ) : renderGroups.map((group) => {

                      /* ── Standalone exercise ── */
                      if (group.kind === "exercise") {
                        const { item: it, itemIdx } = group;
                        return (
                          <ExerciseCard
                            key={it.uid}
                            it={it}
                            dayUid={day.uid}
                            itemIdx={itemIdx}
                            inSuperset={false}
                            drag={drag}
                            onDragStart={(e) => onDragStartItem(day.uid, it.uid, e)}
                            onDragEnd={() => setDrag(null)}
                            onDrop={(e) => onRowDrop(day.uid, itemIdx, e)}
                            onRemove={() => removeItem(day.uid, it.uid)}
                            onMoveUp={() => moveItem(day.uid, it.uid, -1)}
                            onMoveDown={() => moveItem(day.uid, it.uid, 1)}
                            onPatch={(p) => patchItem(day.uid, it.uid, p)}
                            onToggleSameFormat={() => toggleSameFormat(day.uid, it.uid)}
                            onPatchSetRow={(si, p) => patchSetRow(day.uid, it.uid, si, p)}
                            bottomSlot={
                              <button
                                type="button"
                                className="btn btn-ghost no-print"
                                style={{ fontSize: "0.62rem", padding: "0.1rem 0.32rem", color: "var(--amber)", borderColor: "rgba(217,119,6,0.4)", marginTop: "0.18rem" }}
                                onClick={() => initSuperset(day.uid, it.uid)}
                                title="Group this exercise into a superset — drag more exercises into the box"
                              >⊞ + Superset</button>
                            }
                          />
                        );
                      }

                      /* ── Superset block ── */
                      const { supersetId, label, entries } = group;
                      const lastEntry = entries[entries.length - 1];
                      const canExtend = !!day.items[lastEntry.itemIdx + 1] && !day.items[lastEntry.itemIdx + 1].superset_id;
                      return (
                        <div
                          key={supersetId}
                          onDragOver={(e) => { if (drag) { e.preventDefault(); e.stopPropagation(); }}}
                          onDrop={(e) => {
                            e.stopPropagation();
                            if (!drag) return;
                            if (drag.kind === "lib") {
                              e.preventDefault();
                              addMovementToSuperset(day.uid, drag.movement, supersetId);
                              setDrag(null);
                            } else if (drag.kind === "item" && !entries.find(x => x.item.uid === drag.itemUid)) {
                              if (drag.dayUid !== day.uid) moveItemAcross(drag.dayUid, drag.itemUid, day.uid);
                              addToSuperset(day.uid, drag.itemUid, supersetId);
                              setDrag(null);
                            } else {
                              onRowDrop(day.uid, lastEntry.itemIdx + 1, e);
                            }
                          }}
                          style={{ borderRadius: 5, border: "2px solid var(--amber)" }}
                        >
                          <div
                            draggable
                            onDragStart={(e) => onDragStartSuperset(day.uid, supersetId, e)}
                            onDragEnd={() => setDrag(null)}
                            style={{ background: "rgba(217,119,6,0.09)", padding: "0.28rem 0.5rem", display: "flex", alignItems: "center", gap: "0.4rem", cursor: "grab", borderBottom: "1px solid rgba(217,119,6,0.25)", borderTopLeftRadius: 3, borderTopRightRadius: 3 }}
                          >
                            <span className="no-print" style={{ color: "var(--amber)", userSelect: "none", fontSize: "0.7rem" }}>⋮⋮</span>
                            <span style={{ fontWeight: 700, fontSize: "0.7rem", color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.06em", flex: 1 }}>Super Set</span>
                            <span className="meta" style={{ fontSize: "0.64rem" }}>{entries.length} exercises</span>
                            <button
                              type="button"
                              className="no-print"
                              title="Remove entire superset"
                              onClick={() => removeSuperset(day.uid, supersetId)}
                              style={{ background: "transparent", border: "1px solid var(--amber)", borderRadius: 3, color: "var(--amber)", fontSize: "0.68rem", fontWeight: 700, lineHeight: 1, cursor: "pointer", padding: "0.1rem 0.35rem", flexShrink: 0 }}
                            >✕ Remove</button>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", padding: "0.3rem 0.35rem" }}>
                            {entries.map(({ item: it, itemIdx }) => (
                              <ExerciseCard
                                key={it.uid}
                                it={it}
                                dayUid={day.uid}
                                itemIdx={itemIdx}
                                inSuperset={true}
                                drag={drag}
                                onDragStart={(e) => onDragStartItem(day.uid, it.uid, e)}
                                onDragEnd={() => setDrag(null)}
                                onDrop={(e) => onRowDrop(day.uid, itemIdx, e)}
                                onRemove={() => removeItem(day.uid, it.uid)}
                                onMoveUp={() => moveItem(day.uid, it.uid, -1)}
                                onMoveDown={() => moveItem(day.uid, it.uid, 1)}
                                onPatch={(p) => patchItem(day.uid, it.uid, p)}
                                onToggleSameFormat={() => toggleSameFormat(day.uid, it.uid)}
                                onPatchSetRow={(si, p) => patchSetRow(day.uid, it.uid, si, p)}
                              />
                            ))}
                          </div>
                          <div
                            className="no-print"
                            style={{
                              width: "100%", fontSize: "0.62rem", padding: "0.3rem 0.5rem",
                              borderTop: "1px dashed rgba(217,119,6,0.3)",
                              color: "var(--amber)", textAlign: "center",
                              fontStyle: "italic", letterSpacing: "0.04em",
                              background: drag ? "rgba(217,119,6,0.06)" : "transparent",
                            }}
                          >⤓ Drag exercises here</div>
                        </div>
                      );
                    })}
                  </div>
                  </>}
                </div>
              );
            })}
          </div>

          {/* Add day — at_home only */}
          <button className="btn btn-ghost no-print" onClick={addDay} style={{ whiteSpace: "nowrap", marginTop: "0.5rem", padding: "0.5rem 0.85rem" }}>+ Add day</button>
          </>
        )}
      </section>
    </div>{/* end library+main grid */}

    {/* ─── Bottom actions ─── */}
    <div className="no-print" style={{ display: "flex", gap: "0.5rem", marginTop: "1.25rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
      {saveMessage && <span style={{ color: isDraftSaved ? "var(--amber)" : "var(--sage)", fontSize: "0.82rem", alignSelf: "center", marginRight: "0.25rem" }}>{saveMessage}</span>}
      {saveError && <span style={{ color: "var(--red)", fontSize: "0.82rem", alignSelf: "center", marginRight: "0.25rem" }}>{saveError}</span>}
      <button className="btn btn-ghost" onClick={() => window.print()}>Print</button>
      <button className="btn btn-ghost" onClick={() => persist(false)} disabled={savePending}>{savePending ? "…" : "Save draft"}</button>
      <button className="btn btn-primary" onClick={() => persist(true)} disabled={savePending}>{savePending ? "Publishing…" : "Publish"}</button>
    </div>

    {/* ─── Import picker ─── */}
    {importDayModalUid && importScope && (() => {
      // Compute "destination is empty" for the confirm-replace dialog.
      const isWhole = importScope === "session" || importScope === "program-whole";
      const destEmpty = isWhole
        ? days.every((d) => d.items.length === 0)
        : (days.find((d) => d.uid === importDayModalUid)?.items.length ?? 0) === 0;
      return (
        <ImportPickerModal
          scope={importScope}
          currentClientId={clientId}
          currentClientName={selectedClient?.full_name ?? ""}
          destinationIsEmpty={destEmpty}
          onClose={() => setImportDayModalUid(null)}
          onImport={(result) => {
            if (isWhole) applyImport(result);
            else applyImport(result, importDayModalUid!);
            setImportDayModalUid(null);
          }}
        />
      );
    })()}
    </>
    )}
      </>}{/* end viewMode === "builder" */}
    </div>
  );
}

// ─── Session plan view (published / completed) ────────────────────────────────

function computeExerciseSummary(entry: PlanLogEntry | undefined): { heaviest: number | null; volume: number | null } {
  if (!entry) return { heaviest: null, volume: null };
  let heaviest: number | null = null;
  let volume: number | null = null;
  const reps = entry.actual_reps ?? [];
  let allFilled = true;
  let total = 0;
  for (let i = 0; i < entry.weights.length; i++) {
    const w = parseFloat(entry.weights[i] ?? "");
    if (!Number.isNaN(w) && w > 0) {
      heaviest = heaviest === null ? w : Math.max(heaviest, w);
      const r = parseFloat(reps[i] ?? "");
      if (!Number.isNaN(r) && r > 0) total += w * r;
      else allFilled = false;
    } else {
      allFilled = false;
    }
  }
  if (entry.weights.length > 0 && allFilled && total > 0) volume = total;
  return { heaviest, volume };
}

// ─── Exercise log history modal (timeline of past completions) ──────────────
function ExerciseLogModal({ clientId, movement, onClose }: {
  clientId: string;
  movement: Movement;
  onClose: () => void;
}) {
  const entries = historyFor(clientId, movement.id, movement.name);
  const heaviestOverall = priorHeaviest(clientId, movement.id, movement.name);
  // Render entries newest-first
  const ordered = [...entries].reverse();
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(23,19,17,0.45)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div className="card" style={{ width: "min(560px, 94vw)", maxHeight: "84vh", padding: "1rem 1.2rem", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.35rem" }}>
          <div>
            <h3 style={{ margin: 0 }}>{movement.name}</h3>
            <div className="meta" style={{ fontSize: "0.74rem", marginTop: "0.2rem" }}>
              {entries.length} session{entries.length !== 1 ? "s" : ""} logged
              {heaviestOverall > 0 ? ` · heaviest ${heaviestOverall} lbs` : ""}
            </div>
          </div>
          <button className="btn btn-ghost" style={{ fontSize: "0.78rem", padding: "0.2rem 0.4rem" }} onClick={onClose}>✕</button>
        </div>
        <hr className="divider" />
        {entries.length === 0 ? (
          <p className="meta" style={{ fontSize: "0.84rem" }}>No history yet for this exercise.</p>
        ) : (
          <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {ordered.map((e, i) => {
              const heaviestThisSession = Math.max(0, ...e.sets.map((s) => s.weight_lb));
              const totalVolume = e.sets.reduce((acc, s) => acc + (s.weight_lb * (parseFloat(s.reps) || 0)), 0);
              // Was this the heaviest at the time? PR star if no later session had a higher max.
              const laterEntries = entries.slice(entries.length - 1 - (ordered.length - 1 - i) + 1);
              const wasPRAtTime = (() => {
                // Compute prior heaviest at the moment of this entry (exclusive)
                const priorList = entries.slice(0, entries.length - 1 - (ordered.length - 1 - i));
                if (priorList.length === 0) return false; // first ever → not flagged as PR
                const priorMax = Math.max(0, ...priorList.flatMap((p) => p.sets.map((s) => s.weight_lb)));
                return heaviestThisSession > priorMax;
              })();
              return (
                <div key={e.recorded_at + "-" + i} style={{ borderLeft: "3px solid var(--line)", paddingLeft: "0.75rem" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.4rem", flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 600, fontSize: "0.84rem" }}>
                      {new Date(e.recorded_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                      {wasPRAtTime && (
                        <span title="Personal record at the time" style={{ marginLeft: "0.4rem", color: "var(--amber)" }}>★</span>
                      )}
                    </div>
                    <span className="meta" style={{ fontSize: "0.72rem" }}>
                      heaviest {heaviestThisSession || "—"} lbs
                      {totalVolume > 0 ? ` · vol ${totalVolume}` : ""}
                    </span>
                  </div>
                  <div className="meta" style={{ fontSize: "0.7rem", marginTop: "0.1rem" }}>{e.prescription}</div>
                  <div style={{ marginTop: "0.35rem", display: "grid", gridTemplateColumns: "auto auto auto", gap: "0.15rem 0.85rem", fontSize: "0.78rem" }}>
                    {e.sets.map((s, si) => (
                      <div key={si} style={{ display: "contents" }}>
                        <span className="meta">Set {si + 1}</span>
                        <span>{s.weight_lb > 0 ? `${s.weight_lb} lbs` : "—"}</span>
                        <span>{s.reps ? `× ${s.reps}` : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ExerciseInfoPopup({ movement, onClose }: { movement: Movement; onClose: () => void }) {
  const cues = movement.cues ?? "—";
  const equipment = (movement.equipment_list && movement.equipment_list.length > 0)
    ? movement.equipment_list.join(", ")
    : (movement.equipment ?? "—");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(23,19,17,0.45)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div className="card" style={{ width: "min(440px, 92vw)", padding: "1.1rem 1.2rem" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <h3 style={{ margin: 0 }}>{movement.name}</h3>
          <button className="btn btn-ghost" style={{ fontSize: "0.78rem", padding: "0.2rem 0.4rem" }} onClick={onClose}>✕</button>
        </div>
        <div className="meta" style={{ marginTop: "0.35rem", fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {CATEGORY_LABELS[movement.category]}
        </div>
        <hr className="divider" />
        <div style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "0.4rem 0.85rem", fontSize: "0.85rem" }}>
          <span className="meta">Cues</span>
          <span>{cues}</span>
          <span className="meta">Equipment</span>
          <span>{equipment}{movement.equipment_specifics ? ` · ${movement.equipment_specifics}` : ""}</span>
          {movement.muscles && movement.muscles.length > 0 && (<>
            <span className="meta">Muscles</span>
            <span>{movement.muscles.join(", ")}</span>
          </>)}
          {movement.demo_url && (<>
            <span className="meta">Demo</span>
            <a href={movement.demo_url} target="_blank" rel="noreferrer" style={{ color: "var(--rust)" }}>Open demo →</a>
          </>)}
        </div>
      </div>
    </div>
  );
}

// Format helpers for plan-view metadata chips
function fmtPosition(p: string | undefined): string | null {
  if (!p) return null;
  if (p.startsWith("incline")) {
    const angle = p.slice("incline:".length);
    return angle ? `Incline ${angle}°` : "Incline";
  }
  return p.charAt(0).toUpperCase() + p.slice(1);
}
function fmtRest(s: number | undefined): string | null {
  if (s == null || s <= 0) return null;
  if (s >= 60 && s % 60 === 0) return `${s / 60}m rest`;
  return `${s}s rest`;
}
function fmtEquipment(list: Equipment[] | undefined, specifics: string | undefined): string | null {
  const parts: string[] = [];
  if (list && list.length > 0) {
    parts.push(list.map((eq) => {
      const opt = EQUIPMENT_OPTIONS.find((o) => o.value === eq);
      return opt?.label ?? eq;
    }).join(", "));
  }
  if (specifics) parts.push(specifics);
  return parts.length ? parts.join(" · ") : null;
}

// Item-level metadata strip (shown under exercise name)
function ExerciseMetaStrip({ it }: { it: ProgramItem }) {
  const chips: { label: string; value: string }[] = [];
  const equipment = fmtEquipment(it.equipment_list, it.equipment_specifics);
  if (equipment) chips.push({ label: "Equipment", value: equipment });
  if (it.same_format) {
    // Show item-level extras only when the prescription is uniform across sets;
    // when same_format=false we show per-set differences in each row instead.
    if (it.tempo) chips.push({ label: "Tempo", value: it.tempo });
    const pos = fmtPosition(it.position);
    if (pos) chips.push({ label: "Position", value: pos });
    if (it.rir != null) chips.push({ label: "RIR", value: String(it.rir) });
    if (it.half_reps != null && it.half_reps > 0) chips.push({ label: "½ reps", value: String(it.half_reps) });
    const rest = fmtRest(it.rest_seconds);
    if (rest) chips.push({ label: "Rest", value: rest });
    if (it.exertion_score) chips.push({ label: "Effort", value: EXERTION_LABELS[it.exertion_score] ?? EXERTION_SHORT[it.exertion_score] ?? String(it.exertion_score) });
  }
  if (it.variations.length > 0) {
    chips.push({ label: "Variation", value: it.variations.map((v) => VARIATION_LABELS[v]).join(", ") });
  }
  if (chips.length === 0) return null;
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: "0.4rem 0.85rem",
      fontSize: "0.74rem", color: "var(--muted)",
      marginBottom: "0.45rem",
    }}>
      {chips.map((c) => (
        <span key={c.label}>
          <span style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: "0.66rem", color: "#8a7e72" }}>{c.label}:</span>
          {" "}
          <span style={{ color: "var(--ink)" }}>{c.value}</span>
        </span>
      ))}
    </div>
  );
}

// Per-set extras line (shown when same_format=false and the set row has differences)
function SetRowMeta({ row, fallbackEffort }: { row: SetRow | undefined; fallbackEffort?: number }) {
  if (!row) return null;
  const bits: string[] = [];
  const effort = row.exertion_score ?? fallbackEffort;
  if (effort) {
    const label = EXERTION_SHORT[effort] ?? EXERTION_LABELS[effort] ?? String(effort);
    bits.push(label);
  }
  if (row.tempo) bits.push(`tempo ${row.tempo}`);
  if (row.rir != null) bits.push(`RIR ${row.rir}`);
  if (row.half_reps != null && row.half_reps > 0) bits.push(`½×${row.half_reps}`);
  const pos = fmtPosition(row.position);
  if (pos) bits.push(pos);
  const rest = fmtRest(row.rest_seconds);
  if (rest) bits.push(rest);
  const eq = fmtEquipment(row.equipment_list, row.equipment_specifics);
  if (eq) bits.push(eq);
  if (row.variations && row.variations.length > 0) {
    bits.push(row.variations.map((v) => VARIATION_LABELS[v]).join("/"));
  }
  if (bits.length === 0) return null;
  return (
    <span style={{ fontSize: "0.7rem", color: "var(--muted)", fontStyle: "italic" }}>
      {bits.join(" · ")}
    </span>
  );
}

function PlanExerciseBlock({
  clientId, it, entry, completed, isCompletedView,
  onSetWeight, onSetActualReps, onSetSetNotes, onSetNotes, onSetExerciseCompleted,
}: {
  clientId: string;
  it: ProgramItem;
  entry: PlanLogEntry;
  completed: boolean;            // per-exercise complete flag
  isCompletedView: boolean;      // entire program is completed
  onSetWeight: (itemUid: string, idx: number, val: string) => void;
  onSetActualReps: (itemUid: string, idx: number, val: string) => void;
  onSetSetNotes: (itemUid: string, idx: number, val: string) => void;
  onSetNotes: (itemUid: string, val: string) => void;
  onSetExerciseCompleted: (itemUid: string, val: boolean) => void;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const setCount = it.same_format ? it.sets : Math.max(it.sets, it.set_rows.length);
  const { heaviest, volume } = computeExerciseSummary(entry);

  // Snapshot prior history at component mount / when completion toggles. These
  // are captured BEFORE the current completion gets logged, so PR detection
  // compares against true prior heaviest only.
  const priorSnapshot = useMemo(() => {
    if (!clientId) return { lastEntry: null as ExerciseLogEntry | null, priorMax: 0, hasPrior: false };
    return {
      lastEntry: lastEntry(clientId, it.movement.id, it.movement.name),
      priorMax: priorHeaviest(clientId, it.movement.id, it.movement.name),
      hasPrior: hasHistory(clientId, it.movement.id, it.movement.name),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, it.movement.id, it.movement.name, completed]);

  // Track whether the just-logged completion was a PR
  const [pendingPR, setPendingPR] = useState(false);

  // "New" badge — only when client has never done this exercise before
  const isNew = !priorSnapshot.hasPrior && !completed;
  // ★ PR star — only when there was a prior history AND this completion beat it
  const wasPR = completed && pendingPR && priorSnapshot.hasPrior;

  function onCompleteClick() {
    // Build per-set log of what was actually logged
    const loggedSets: { weight_lb: number; reps: string }[] = [];
    for (let i = 0; i < entry.weights.length; i++) {
      const w = parseFloat(entry.weights[i] ?? "");
      const r = (entry.actual_reps ?? [])[i] ?? "";
      if (!Number.isNaN(w) && w > 0) loggedSets.push({ weight_lb: w, reps: String(r || "") });
    }
    // Determine PR — must have prior history AND beat prior heaviest
    const beatsPrior = priorSnapshot.hasPrior && heaviest !== null && heaviest > priorSnapshot.priorMax;
    setPendingPR(!!beatsPrior);
    // Append a log entry for the timeline (full per-set record)
    if (loggedSets.length > 0) {
      const prescription = it.same_format
        ? `${it.sets} × ${it.reps}`
        : it.set_rows.map((r, i) => `Set ${i + 1}: ${r.reps}`).join(" / ");
      appendLog(clientId, {
        movement_id: it.movement.id,
        name: it.movement.name,
        prescription,
        sets: loggedSets,
      });
    }
    // Record heaviest weight into the learned list when collapsing
    if (heaviest !== null && heaviest > 0) {
      let bestIdx = -1;
      for (let i = 0; i < entry.weights.length; i++) {
        const w = parseFloat(entry.weights[i] ?? "");
        if (!Number.isNaN(w) && w === heaviest) { bestIdx = i; break; }
      }
      const repsAt = bestIdx >= 0
        ? (entry.actual_reps?.[bestIdx] || (it.same_format ? it.reps : (it.set_rows[bestIdx]?.reps ?? it.reps)))
        : (it.same_format ? it.reps : it.reps);
      recordLearned(clientId, {
        movement_id: it.movement.id,
        name: it.movement.name,
        category: it.movement.category,
        weight_lb: heaviest,
        reps: String(repsAt),
      });
    } else {
      markPerformed(clientId, { movement_id: it.movement.id, name: it.movement.name, category: it.movement.category });
    }
    onSetExerciseCompleted(it.uid, true);
  }

  // ── Collapsed summary view ─────────────────────────────────────────────
  if (completed) {
    return (
      <div style={{ borderLeft: `3px solid ${wasPR ? "var(--amber)" : "var(--sage)"}`, paddingLeft: "0.75rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.6rem", flexWrap: "wrap" }}>
        {logOpen && <ExerciseLogModal clientId={clientId} movement={it.movement} onClose={() => setLogOpen(false)} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: "0.92rem" }}>
            {wasPR && <span title="Personal record" style={{ color: "var(--amber)", marginRight: "0.3rem" }}>★</span>}
            {it.movement.name}
          </span>
          <span className="badge badge-sage" style={{ marginLeft: "0.5rem", fontSize: "0.58rem" }}>✓ done</span>
          {wasPR && <span className="badge badge-amber" style={{ marginLeft: "0.3rem", fontSize: "0.58rem" }}>PR</span>}
          <div className="meta" style={{ fontSize: "0.76rem", marginTop: "0.2rem", display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
            <span>
              {heaviest !== null ? `Heaviest weight logged: ${heaviest} lbs` : "No weight logged"}
              {volume !== null ? ` · Volume: ${volume} lbs` : ""}
            </span>
            <button
              type="button"
              onClick={() => setLogOpen(true)}
              className="no-print"
              style={{ background: "none", border: "none", color: "var(--rust)", cursor: "pointer", fontSize: "0.72rem", padding: 0, textDecoration: "underline" }}
            >View log →</button>
          </div>
        </div>
        {!isCompletedView && (
          <button
            className="btn btn-ghost"
            style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }}
            onClick={() => onSetExerciseCompleted(it.uid, false)}
          >Reopen</button>
        )}
      </div>
    );
  }

  // ── Full editable view ─────────────────────────────────────────────────
  return (
    <div style={{ borderLeft: "3px solid var(--line)", paddingLeft: "0.75rem" }}>
      {infoOpen && <ExerciseInfoPopup movement={it.movement} onClose={() => setInfoOpen(false)} />}
      {logOpen && <ExerciseLogModal clientId={clientId} movement={it.movement} onClose={() => setLogOpen(false)} />}
      {/* Header: name + info button + new badge */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.45rem", flexWrap: "wrap" }}>
        <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{it.movement.name}</span>
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          title="Movement details"
          className="no-print"
          style={{
            background: "transparent", border: "1px solid var(--line)", borderRadius: 999,
            width: 20, height: 20, lineHeight: 1, color: "var(--rust)", cursor: "pointer",
            fontSize: "0.75rem", fontWeight: 700,
          }}
        >i</button>
        {priorSnapshot.hasPrior && (
          <button
            type="button"
            onClick={() => setLogOpen(true)}
            className="no-print"
            style={{
              background: "none", border: "none", color: "var(--rust)",
              cursor: "pointer", fontSize: "0.72rem", padding: 0, textDecoration: "underline",
            }}
          >View log →</button>
        )}
        {isNew && (
          <span style={{
            background: "var(--clay)", color: "#fff", fontSize: "0.58rem", fontWeight: 700,
            padding: "0.05rem 0.4rem", borderRadius: 3, letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}>New</span>
        )}
        {it.is_warmup && <span className="badge" style={{ fontSize: "0.6rem" }}>Warmup</span>}
        {it.superset_id && (
          <span className="badge badge-amber" style={{ fontSize: "0.58rem" }}>Superset</span>
        )}
      </div>

      {/* Sets — full prescription grid with input columns for Actual / Weight / Notes */}
      {(() => {
        // Detect which optional columns to render — only those actually in use.
        const isFieldUsed = (
          itemVal: unknown,
          rowKey: keyof SetRow,
        ): boolean => {
          if (itemVal != null && itemVal !== "" && itemVal !== 0) return true;
          for (const r of it.set_rows ?? []) {
            const v = (r as Record<string, unknown>)[rowKey];
            if (v != null && v !== "" && v !== 0) return true;
          }
          return false;
        };
        const showTempo = isFieldUsed(it.tempo, "tempo");
        const showPos = isFieldUsed(it.position, "position");
        const showHalf = isFieldUsed(it.half_reps, "half_reps");
        const showRir = isFieldUsed(it.rir, "rir");
        const showRest = isFieldUsed(it.rest_seconds, "rest_seconds");
        // "Coach notes" column shows the programmed per-set notes from the builder.
        // Show the column when any set has a programmed note OR (in same_format) when
        // the item itself has notes the coach wrote in.
        const showCoachNotes = !!it.notes
          || (it.set_rows ?? []).some((r) => r.notes);
        const showPrev = !!priorSnapshot.lastEntry;

        // Build the grid template
        const colWidths: string[] = [
          "32px",   // SET
          "60px",   // REPS
          "70px",   // ACTUAL (input)
          "70px",   // WEIGHT (input)
          "80px",   // EXERTION
          "90px",   // SPECIFICATION
          "100px",  // EQUIPMENT
        ];
        const headers: string[] = ["Set", "Reps", "Actual", "Weight", "Exertion", "Specification", "Equipment"];
        if (showTempo) { colWidths.push("70px"); headers.push("Tempo"); }
        if (showPos)   { colWidths.push("100px"); headers.push("Pos"); }
        if (showHalf)  { colWidths.push("50px"); headers.push("½"); }
        if (showRir)   { colWidths.push("56px"); headers.push("RIR"); }
        if (showRest)  { colWidths.push("70px"); headers.push("Rest"); }
        if (showCoachNotes) { colWidths.push("1fr"); headers.push("Coach Notes"); }
        colWidths.push("1fr"); headers.push("Notes");
        if (showPrev)  { colWidths.push("90px"); headers.push(""); /* prev: subtext, no header */ }

        const cols = colWidths.join(" ");
        const cellHeaderStyle: React.CSSProperties = {
          fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.05em", color: "var(--muted)",
          paddingBottom: "0.18rem", borderBottom: "1px solid var(--line)",
        };
        const cellStyle: React.CSSProperties = { fontSize: "0.78rem" };
        const inputStyle: React.CSSProperties = { fontSize: "0.78rem", padding: "0.16rem 0.35rem", width: "100%" };

        // Format helpers for prescription columns
        const exertionLabel = (score: number | undefined) => {
          if (!score) return "—";
          return EXERTION_SHORT[score] ?? EXERTION_LABELS[score] ?? String(score);
        };
        const variationLabel = (vs: Variation[] | undefined) => {
          if (!vs || vs.length === 0) return "—";
          return vs.map((v) => VARIATION_LABELS[v]).join(", ");
        };
        const equipmentLabel = (list: Equipment[] | undefined, specs: string | undefined) => {
          const parts: string[] = [];
          if (list && list.length > 0) {
            parts.push(list.map((eq) => EQUIPMENT_OPTIONS.find((o) => o.value === eq)?.label ?? eq).join(", "));
          }
          if (specs) parts.push(specs);
          return parts.length ? parts.join(" · ") : "—";
        };
        const positionLabel = (p: string | undefined) => fmtPosition(p) ?? "—";
        const restLabel = (s: number | undefined) => fmtRest(s) ?? "—";

        return (
          <div className="plan-set-grid" style={{ marginBottom: "0.6rem", overflowX: "auto" }}>
            <div style={{ minWidth: "min-content" }}>
              {/* Header row */}
              <div style={{ display: "grid", gridTemplateColumns: cols, gap: "0.4rem 0.6rem", alignItems: "end" }}>
                {headers.map((h, i) => (
                  <span key={i} style={cellHeaderStyle}>{h}</span>
                ))}
              </div>

              {/* Set rows */}
              {Array.from({ length: setCount }).map((_, si) => {
                const row = it.same_format ? undefined : it.set_rows[si];
                // Pull the value from the row when available; otherwise fall back to the item-level value.
                const val = <T,>(rowVal: T | undefined, itemVal: T): T => (rowVal != null && rowVal !== ("" as unknown as T) ? rowVal : itemVal);
                const prescribedReps = val(row?.reps, it.reps);
                const exertion = val(row?.exertion_score, it.exertion_score);
                const variations = (row?.variations && row.variations.length > 0) ? row.variations : it.variations;
                const equipmentList = (row?.equipment_list && row.equipment_list.length > 0) ? row.equipment_list : it.equipment_list;
                const equipmentSpecifics = val(row?.equipment_specifics, it.equipment_specifics);
                const tempo = val(row?.tempo, it.tempo);
                const position = val(row?.position, it.position);
                const halfReps = val(row?.half_reps, it.half_reps);
                const rir = val(row?.rir, it.rir);
                const restSec = val(row?.rest_seconds, it.rest_seconds);
                const coachNote = val(row?.notes, it.notes);

                const w = entry.weights[si] ?? "";
                const ar = (entry.actual_reps ?? [])[si] ?? "";
                const sn = (entry.set_notes ?? [])[si] ?? "";
                const prevSet = priorSnapshot.lastEntry?.sets[si] ?? null;

                return (
                  <div
                    key={si}
                    style={{
                      display: "grid", gridTemplateColumns: cols, gap: "0.4rem 0.6rem",
                      alignItems: "center", padding: "0.28rem 0",
                      borderBottom: "1px dashed var(--line)",
                    }}
                  >
                    <span style={{ ...cellStyle, fontWeight: 600 }}>{si + 1}</span>
                    <span style={cellStyle}>{prescribedReps || "—"}</span>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      placeholder="—"
                      value={ar}
                      onChange={(e) => onSetActualReps(it.uid, si, e.target.value)}
                      style={inputStyle}
                      title="Actual reps performed"
                    />
                    <input
                      className="input"
                      type="number"
                      min={0}
                      placeholder="—"
                      value={w}
                      onChange={(e) => onSetWeight(it.uid, si, e.target.value)}
                      style={inputStyle}
                      title="Weight (lbs)"
                    />
                    <span style={cellStyle}>{exertionLabel(exertion)}</span>
                    <span style={cellStyle}>{variationLabel(variations)}</span>
                    <span style={cellStyle}>{equipmentLabel(equipmentList, equipmentSpecifics ?? undefined)}</span>
                    {showTempo && <span style={cellStyle}>{tempo || "—"}</span>}
                    {showPos   && <span style={cellStyle}>{positionLabel(position)}</span>}
                    {showHalf  && <span style={cellStyle}>{halfReps != null && halfReps > 0 ? halfReps : "—"}</span>}
                    {showRir   && <span style={cellStyle}>{rir != null ? rir : "—"}</span>}
                    {showRest  && <span style={cellStyle}>{restLabel(restSec)}</span>}
                    {showCoachNotes && (
                      <span style={{ ...cellStyle, color: "var(--muted)", fontStyle: "italic" }}>{coachNote || "—"}</span>
                    )}
                    <input
                      className="input"
                      type="text"
                      placeholder=""
                      value={sn}
                      onChange={(e) => onSetSetNotes(it.uid, si, e.target.value)}
                      style={inputStyle}
                      title="Per-set notes"
                    />
                    {showPrev && (
                      <span style={{ fontSize: "0.7rem", color: "#a89e90", fontStyle: "italic", textAlign: "right" }}>
                        {prevSet && prevSet.weight_lb > 0
                          ? `${prevSet.weight_lb} × ${prevSet.reps || "—"}`
                          : ""}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Coach Notes (read-only, from programming) — only render when set */}
      {it.movement_notes && (
        <div style={{ marginTop: "0.2rem", marginBottom: "0.45rem", padding: "0.35rem 0.5rem", borderLeft: "2px solid var(--line)", background: "rgba(0,0,0,0.02)" }}>
          <div style={{ fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", marginBottom: "0.15rem" }}>
            Coach Notes
          </div>
          <div style={{ fontSize: "0.82rem", whiteSpace: "pre-wrap" }}>{it.movement_notes}</div>
        </div>
      )}

      {/* Overall exercise notes — input field for the coach to fill during/after the session */}
      <textarea
        className="textarea"
        rows={2}
        placeholder="Overall notes…"
        value={entry.notes}
        onChange={(e) => onSetNotes(it.uid, e.target.value)}
        style={{ fontSize: "0.8rem", padding: "0.25rem 0.4rem", resize: "vertical", width: "100%" }}
      />

      {!isCompletedView && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.4rem" }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ fontSize: "0.72rem", padding: "0.2rem 0.55rem", color: "var(--sage)", borderColor: "var(--sage)" }}
            onClick={onCompleteClick}
          >✓ Complete</button>
        </div>
      )}
    </div>
  );
}

function PlanDayBlock({
  clientId, day, planLog, completed, isCompletedView, dayCompleted, onToggleDayCompleted,
  onSetWeight, onSetActualReps, onSetSetNotes, onSetNotes, onSetExerciseCompleted,
  showCompleteDayButton,
}: {
  clientId: string;
  day: ProgramDay;
  planLog: PlanLog;
  completed: boolean;
  isCompletedView: boolean;
  dayCompleted: boolean;
  onToggleDayCompleted: (uid: string) => void;
  onSetWeight: (itemUid: string, idx: number, val: string) => void;
  onSetActualReps: (itemUid: string, idx: number, val: string) => void;
  onSetSetNotes: (itemUid: string, idx: number, val: string) => void;
  onSetNotes: (itemUid: string, val: string) => void;
  onSetExerciseCompleted: (itemUid: string, val: boolean) => void;
  showCompleteDayButton: boolean;
}) {
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <h3 style={{ margin: 0 }}>{day.title}</h3>
        {dayCompleted && <span className="badge badge-sage" style={{ fontSize: "0.62rem" }}>✓ Day complete</span>}
      </div>

      {dayCompleted ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {day.items.map((it) => {
            const { heaviest, volume } = computeExerciseSummary(planLog[it.uid]);
            return (
              <div key={it.uid} className="meta" style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", fontSize: "0.76rem", paddingLeft: "0.4rem", borderLeft: "2px solid var(--sage)" }}>
                <span style={{ color: "var(--ink)", fontWeight: 600 }}>{it.movement.name}</span>
                <span>
                  {heaviest !== null ? `${heaviest} lbs` : "—"}
                  {volume !== null ? ` · vol ${volume}` : ""}
                </span>
              </div>
            );
          })}
          {!isCompletedView && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.4rem" }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: "0.72rem", padding: "0.2rem 0.55rem" }}
                onClick={() => onToggleDayCompleted(day.uid)}
              >Reopen day</button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {day.items.map((it) => (
              <PlanExerciseBlock
                key={it.uid}
                clientId={clientId}
                it={it}
                entry={planLog[it.uid] ?? { weights: [], actual_reps: [], set_notes: [], notes: "" }}
                completed={!!planLog[it.uid]?.completed}
                isCompletedView={isCompletedView}
                onSetWeight={onSetWeight}
                onSetActualReps={onSetActualReps}
                onSetSetNotes={onSetSetNotes}
                onSetNotes={onSetNotes}
                onSetExerciseCompleted={onSetExerciseCompleted}
              />
            ))}
          </div>
          {showCompleteDayButton && !isCompletedView && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.85rem" }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ fontSize: "0.78rem" }}
                onClick={() => onToggleDayCompleted(day.uid)}
              >✓ Complete Day</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SessionPlanView({
  clientId,
  days,
  programKind,
  clientName,
  sessionTitle,
  planLog,
  completed,
  completedDays,
  onToggleDayCompleted,
  summaryOpen,
  onSummaryToggle,
  onSetWeight,
  onSetActualReps,
  onSetSetNotes,
  onSetNotes,
  onSetExerciseCompleted,
  onEdit,
  onComplete,
  feedbackId,
  feedbackTick,
  onSavePre,
  onSavePost,
  onSavePerDay,
}: {
  clientId: string;
  days: ProgramDay[];
  programKind: ProgramKind;
  clientName: string;
  sessionTitle: string;
  planLog: PlanLog;
  completed: boolean;
  completedDays: Set<string>;
  onToggleDayCompleted: (uid: string) => void;
  summaryOpen: boolean;
  onSummaryToggle: () => void;
  onSetWeight: (itemUid: string, idx: number, val: string) => void;
  onSetActualReps: (itemUid: string, idx: number, val: string) => void;
  onSetSetNotes: (itemUid: string, idx: number, val: string) => void;
  onSetNotes: (itemUid: string, val: string) => void;
  onSetExerciseCompleted: (itemUid: string, val: boolean) => void;
  onEdit: () => void;
  onComplete: () => void;
  feedbackId: string;
  feedbackTick: number;
  onSavePre: (a: { feel: string; sore: string }) => void;
  onSavePost: (a: PostAnswersDraft) => void;
  onSavePerDay: (dayUid: string, a: PostAnswersDraft) => void;
}) {
  const showCompleteDayButton = days.length > 1;
  // Re-read feedback whenever the tick bumps or the id changes.
  const feedback: SessionFeedback = useMemo(() => readFeedback(feedbackId), [feedbackId, feedbackTick]);
  // When the user just hit Complete Program/Day, show a feedback form before
  // collapsing to the summary view. After submit, the read-only display takes over.
  const [showProgramFeedbackForm, setShowProgramFeedbackForm] = useState(false);
  const [pendingDayFeedback, setPendingDayFeedback] = useState<string | null>(null);

  // Auto-open program feedback form the first time we hit completed view.
  useEffect(() => {
    if (completed && !feedback.post) setShowProgramFeedbackForm(true);
  }, [completed, feedback.post]);

  return (
    <div className="plan-print" style={{ display: "flex", flexDirection: "column", gap: "1rem", paddingTop: "1rem" }}>
      {/* ─── Header ─── */}
      <div className="card" style={{ borderLeft: "4px solid var(--rust)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <span className="badge badge-sage">Published</span>
            <h2 style={{ margin: "0.35rem 0 0.15rem" }}>{sessionTitle}</h2>
            <div className="meta" style={{ fontSize: "0.82rem" }}>{clientName}</div>
          </div>
          <div style={{ display: "flex", gap: "0.4rem" }} className="no-print">
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: "0.78rem" }}
              onClick={() => window.print()}
              title="Print this plan for the floor"
            >🖨 Print</button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: "0.78rem" }}
              onClick={onEdit}
            >{programKind === "in_gym" ? "✎ Edit Session" : "✎ Edit Program"}</button>
          </div>
        </div>
      </div>

      {/* ─── Pre-session check-in (in_gym only) ─── */}
      {programKind === "in_gym" && feedbackId && (
        <PreSessionForm initial={feedback.pre} onSubmit={onSavePre} />
      )}

      {/* ─── Post Session Summary (completed only) ─── */}
      {completed && (
        <div className="card">
          <button
            type="button"
            onClick={onSummaryToggle}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0, width: "100%" }}
          >
            <span style={{ fontFamily: "var(--font-heading,Oswald)", fontWeight: 700, fontSize: "1rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Post Session Summary</span>
            <span style={{ fontSize: "0.7rem", color: "var(--muted)", marginLeft: "auto" }}>{summaryOpen ? "▲" : "▼"}</span>
          </button>
          {summaryOpen && (
            <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "rgba(0,0,0,0.03)", borderRadius: 3 }}>
              <p className="meta" style={{ margin: 0, fontSize: "0.84rem" }}>Coming soon.</p>
            </div>
          )}
        </div>
      )}

      {/* ─── Days ─── */}
      {days.map((day) => (
        <div key={day.uid}>
          <PlanDayBlock
            clientId={clientId}
            day={day}
            planLog={planLog}
            completed={completed}
            isCompletedView={completed}
            dayCompleted={completedDays.has(day.uid)}
            onToggleDayCompleted={(uid) => {
              const wasCompleted = completedDays.has(uid);
              onToggleDayCompleted(uid);
              // If we just marked it complete, prompt for feedback (only if not already submitted)
              if (!wasCompleted && !feedback.per_day?.[uid]) {
                setPendingDayFeedback(uid);
              }
            }}
            onSetWeight={onSetWeight}
            onSetActualReps={onSetActualReps}
            onSetSetNotes={onSetSetNotes}
            onSetNotes={onSetNotes}
            onSetExerciseCompleted={onSetExerciseCompleted}
            showCompleteDayButton={showCompleteDayButton}
          />
          {/* Per-day feedback form / answers display */}
          {showCompleteDayButton && completedDays.has(day.uid) && (
            pendingDayFeedback === day.uid && !feedback.per_day?.[day.uid] ? (
              <div style={{ marginTop: "0.6rem" }}>
                <PostFeedbackForm
                  title="Day Feedback"
                  onSubmit={(a) => { onSavePerDay(day.uid, a); setPendingDayFeedback(null); }}
                  onCancel={() => setPendingDayFeedback(null)}
                />
              </div>
            ) : feedback.per_day?.[day.uid] ? (
              <div style={{ marginTop: "0.6rem" }}>
                <PostAnswersDisplay answers={feedback.per_day[day.uid]} title="Day Feedback" />
              </div>
            ) : null
          )}
        </div>
      ))}

      {/* ─── Bottom action ─── */}
      {!completed && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
          <button className="btn btn-primary" onClick={onComplete}>
            {programKind === "in_gym" && days.length === 1 ? "Complete Session" : "Complete Program"}
          </button>
        </div>
      )}
      {completed && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
          <span style={{ alignSelf: "center", fontSize: "0.82rem", color: "var(--sage)", fontWeight: 600 }}>✓ Completed</span>
        </div>
      )}

      {/* ─── Program/Session feedback ─── */}
      {completed && (
        showProgramFeedbackForm && !feedback.post ? (
          <PostFeedbackForm
            title={programKind === "in_gym" && days.length === 1 ? "Session Feedback" : "Program Feedback"}
            onSubmit={(a) => { onSavePost(a); setShowProgramFeedbackForm(false); }}
            onCancel={() => setShowProgramFeedbackForm(false)}
          />
        ) : feedback.post ? (
          <PostAnswersDisplay
            answers={feedback.post}
            title={programKind === "in_gym" && days.length === 1 ? "Session Feedback" : "Program Feedback"}
          />
        ) : null
      )}
    </div>
  );
}

// ─── Client program summary banner (Program tab) ────────────────────────
function ClientProgramSummaryBanner({
  items,
  onSelect
}: {
  items: ClientProgramItem[];
  onSelect: (clientId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const needsProgramming = items.filter(
    (i) => !i.hasCurrent || (i.daysUntilEnd !== null && i.daysUntilEnd <= 5)
  );
  const programmed = items.filter(
    (i) => i.hasCurrent && (i.daysUntilEnd === null || i.daysUntilEnd > 5)
  );

  function endLabel(item: ClientProgramItem): string {
    if (!item.endsOn) return "no end date";
    const days = item.daysUntilEnd ?? 0;
    if (days < 0) return `ended ${Math.abs(days)}d ago`;
    if (days === 0) return "ends today";
    return `ends in ${days}d`;
  }

  function endDate(item: ClientProgramItem): string {
    if (!item.endsOn) return "";
    return new Date(item.endsOn).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return (
    <div className="card no-print" style={{ marginBottom: "1.25rem" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", background: "none", border: "none", padding: 0,
          cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "space-between", fontFamily: "inherit",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "0.88rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
          {open ? "▾" : "▸"} Active Client Programs
        </h3>
        <span className="meta" style={{ fontSize: "0.76rem" }}>
          {items.length} active · {programmed.length} current · {needsProgramming.length} need attention
        </span>
      </button>

      {open && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "0.75rem" }}>
          {/* Programmed column */}
          <div>
            <div style={{
              fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.07em", color: "var(--sage)",
              paddingBottom: "0.4rem", borderBottom: "2px solid var(--sage)",
              marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem"
            }}>
              ✓ Programmed <span style={{ fontWeight: 400, opacity: 0.7 }}>({programmed.length})</span>
            </div>
            {programmed.length === 0 ? (
              <p className="meta" style={{ fontSize: "0.78rem" }}>None.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                {programmed.map((item) => (
                  <div key={item.clientId} style={{ padding: "0.3rem 0.5rem", borderRadius: 3, background: "rgba(90,107,74,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                    <span style={{ fontWeight: 600, fontSize: "0.84rem", flexShrink: 0 }}>{item.clientName}</span>
                    <span className="meta" style={{ fontSize: "0.72rem", textAlign: "right", whiteSpace: "nowrap" }}>
                      {item.programName ? `${item.programName} · ` : ""}{endDate(item)}{endDate(item) ? " — " : ""}<span style={{ color: (item.daysUntilEnd ?? 99) <= 14 ? "var(--amber)" : undefined }}>{endLabel(item)}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Needs programming column */}
          <div>
            <div style={{
              fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.07em", color: "var(--amber)",
              paddingBottom: "0.4rem", borderBottom: "2px solid var(--amber)",
              marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem"
            }}>
              ⚠ Needs Programming <span style={{ fontWeight: 400, opacity: 0.7 }}>({needsProgramming.length})</span>
            </div>
            {needsProgramming.length === 0 ? (
              <p className="meta" style={{ fontSize: "0.78rem" }}>All clients are covered 🎉</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                {needsProgramming.map((item) => (
                  <button
                    key={item.clientId}
                    type="button"
                    onClick={() => onSelect(item.clientId)}
                    style={{
                      width: "100%", textAlign: "left", background: "rgba(217,119,6,0.07)",
                      border: "1px solid rgba(217,119,6,0.2)", borderRadius: 3,
                      padding: "0.3rem 0.5rem", cursor: "pointer", fontFamily: "inherit",
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem"
                    }}
                    title="Click to select this client in the builder below"
                  >
                    <span style={{ fontWeight: 600, fontSize: "0.84rem", flexShrink: 0 }}>{item.clientName}</span>
                    <span style={{ fontSize: "0.72rem", color: "var(--amber)", textAlign: "right", whiteSpace: "nowrap" }}>
                      {item.hasCurrent
                        ? `${item.programName ? item.programName + " · " : ""}${endDate(item)}${endDate(item) ? " — " : ""}${endLabel(item)}`
                        : "No current program"}{" · "}tap to select →
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Client programs banner (Programs tab) ───────────────────────────────────
function ClientProgramsBanner({
  items,
  onSelect,
}: {
  items: ClientProgramItem[];
  onSelect: (item: ClientProgramItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const needs = items.filter((i) => !i.hasCurrent);
  const active = items.filter((i) => i.hasCurrent);

  function daysLabel(d: number | null) {
    if (d === null) return "no end date";
    if (d < 0) return `expired ${Math.abs(d)}d ago`;
    if (d === 0) return "expires today";
    if (d <= 7) return `${d}d left`;
    return `${d}d left`;
  }

  return (
    <div className="card no-print" style={{ marginBottom: "1.25rem" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", background: "none", border: "none", padding: 0,
          cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "space-between", fontFamily: "inherit",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "0.88rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
          {open ? "▾" : "▸"} Client Programs
        </h3>
        <span className="meta" style={{ fontSize: "0.76rem" }}>
          {active.length} active · {needs.length} need programming
        </span>
      </button>
      {open && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "0.75rem" }}>
          {/* Active programs */}
          <div>
            <div style={{
              fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.07em", color: "var(--sage)",
              paddingBottom: "0.4rem", borderBottom: "2px solid var(--sage)",
              marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem"
            }}>
              ✓ Active Program <span style={{ fontWeight: 400, opacity: 0.7 }}>({active.length})</span>
            </div>
            {active.length === 0 ? (
              <p className="meta" style={{ fontSize: "0.78rem" }}>None yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                {active.map((item) => (
                  <div
                    key={item.clientId}
                    style={{
                      padding: "0.3rem 0.5rem", borderRadius: 3,
                      background: (item.daysUntilEnd !== null && item.daysUntilEnd <= 14)
                        ? "rgba(217,119,6,0.07)" : "rgba(90,107,74,0.07)",
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem"
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: "0.84rem", flexShrink: 0 }}>{item.clientName}</span>
                    <div style={{ textAlign: "right", minWidth: 0 }}>
                      <div className="meta" style={{ fontSize: "0.72rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.programName}
                      </div>
                      <div style={{
                        fontSize: "0.68rem",
                        color: (item.daysUntilEnd !== null && item.daysUntilEnd <= 14) ? "var(--amber)" : "var(--muted)"
                      }}>
                        {daysLabel(item.daysUntilEnd)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Needs programming */}
          <div>
            <div style={{
              fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.07em", color: "var(--amber)",
              paddingBottom: "0.4rem", borderBottom: "2px solid var(--amber)",
              marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem"
            }}>
              ⚠ Needs Program <span style={{ fontWeight: 400, opacity: 0.7 }}>({needs.length})</span>
            </div>
            {needs.length === 0 ? (
              <p className="meta" style={{ fontSize: "0.78rem" }}>All clients are programmed 🎉</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                {needs.map((item) => (
                  <button
                    key={item.clientId}
                    type="button"
                    onClick={() => onSelect(item)}
                    style={{
                      width: "100%", textAlign: "left", background: "rgba(217,119,6,0.07)",
                      border: "1px solid rgba(217,119,6,0.2)", borderRadius: 3,
                      padding: "0.3rem 0.5rem", cursor: "pointer", fontFamily: "inherit",
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem"
                    }}
                    title="Click to start a new program for this client"
                  >
                    <span style={{ fontWeight: 600, fontSize: "0.84rem" }}>{item.clientName}</span>
                    <span style={{ fontSize: "0.72rem", color: "var(--amber)", whiteSpace: "nowrap" }}>tap to program →</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sessions this week banner ───────────────────────────────────────────
function SessionsThisWeekBanner({
  sessions,
  onSelect
}: {
  sessions: WeekSession[];
  onSelect: (s: WeekSession) => void;
}) {
  const [open, setOpen] = useState(false);
  const programmed = sessions.filter((s) => s.is_programmed);
  const needs = sessions.filter((s) => !s.is_programmed);

  function fmtSessionTime(iso: string) {
    return new Date(iso).toLocaleString("en-US", {
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit"
    });
  }

  return (
    <div className="card no-print" style={{ marginBottom: "1.25rem" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", background: "none", border: "none", padding: 0,
          cursor: "pointer", display: "flex", flexDirection: "column",
          alignItems: "flex-start", gap: "0.12rem", fontFamily: "inherit", textAlign: "left",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "0.88rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", textAlign: "left" }}>
          {open ? "▾" : "▸"} Sessions This Week
        </h3>
        <span className="meta" style={{ fontSize: "0.74rem" }}>
          {sessions.length} total · {programmed.length} programmed · {needs.length} pending
        </span>
      </button>
      {open && <div className="sessions-banner-cols" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "0.75rem" }}>
        {/* Programmed column */}
        <div>
          <div style={{
            fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.07em", color: "var(--sage)",
            paddingBottom: "0.4rem", borderBottom: "2px solid var(--sage)",
            marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem"
          }}>
            ✓ Programmed <span style={{ fontWeight: 400, opacity: 0.7 }}>({programmed.length})</span>
          </div>
          {programmed.length === 0 ? (
            <p className="meta" style={{ fontSize: "0.78rem" }}>None yet this week.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              {programmed.map((s) => (
                <div key={s.id} style={{ padding: "0.3rem 0.5rem", borderRadius: 3, background: "rgba(90,107,74,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                  <span style={{ fontWeight: 600, fontSize: "0.84rem", flexShrink: 0 }}>{s.client_name ?? "—"}</span>
                  <span className="meta" style={{ fontSize: "0.72rem", whiteSpace: "nowrap" }}>{fmtSessionTime(s.starts_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Needs programming column */}
        <div>
          <div style={{
            fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.07em", color: "var(--amber)",
            paddingBottom: "0.4rem", borderBottom: "2px solid var(--amber)",
            marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem"
          }}>
            ⚠ Needs Programming <span style={{ fontWeight: 400, opacity: 0.7 }}>({needs.length})</span>
          </div>
          {needs.length === 0 ? (
            <p className="meta" style={{ fontSize: "0.78rem" }}>All sessions are programmed 🎉</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              {needs.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelect(s)}
                  style={{
                    width: "100%", textAlign: "left", background: "rgba(217,119,6,0.07)",
                    border: "1px solid rgba(217,119,6,0.2)", borderRadius: 3,
                    padding: "0.3rem 0.5rem", cursor: "pointer", fontFamily: "inherit",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem"
                  }}
                  title="Click to load this session in the builder below"
                >
                  <span style={{ fontWeight: 600, fontSize: "0.84rem", flexShrink: 0 }}>{s.client_name ?? "—"}</span>
                  <span style={{ fontSize: "0.72rem", color: "var(--amber)", whiteSpace: "nowrap" }}>{fmtSessionTime(s.starts_at)} · tap to program →</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>}
    </div>
  );
}

// ─── Exercise card (used both standalone and inside a superset) ──────────
// ─── Exercise preset (named saved configuration) ────────────────────────────
type ExercisePreset = {
  id: string;
  name: string;
  movementId: string;
  sets: number;
  reps: string;
  exertion_score: number;
  variations: Variation[];
  equipment_list: Equipment[];
  equipment_specifics?: string;
  notes?: string;
};

const PRESET_KEY = "monroe-exercise-presets";

function loadPresets(movementId: string): ExercisePreset[] {
  if (typeof window === "undefined") return [];
  try {
    const all = JSON.parse(localStorage.getItem(PRESET_KEY) ?? "{}");
    return (all[movementId] ?? []) as ExercisePreset[];
  } catch { return []; }
}

function persistPresets(movementId: string, list: ExercisePreset[]) {
  try {
    const all = JSON.parse(localStorage.getItem(PRESET_KEY) ?? "{}");
    all[movementId] = list;
    localStorage.setItem(PRESET_KEY, JSON.stringify(all));
  } catch {}
}

// ─── Shared hook: close a panel when clicking/tapping outside two refs ────────
function useClickOutsideTwo(
  refA: React.RefObject<HTMLElement | null>,
  refB: React.RefObject<HTMLElement | null>,
  active: boolean,
  onClose: () => void
) {
  useEffect(() => {
    if (!active) return;
    const handle = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (!refA.current?.contains(t) && !refB.current?.contains(t)) onClose();
    };
    const scroll = () => onClose();
    document.addEventListener("mousedown", handle);
    document.addEventListener("touchstart", handle);
    window.addEventListener("scroll", scroll, { passive: true, capture: true });
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("touchstart", handle);
      window.removeEventListener("scroll", scroll, { capture: true });
    };
  }, [active, onClose, refA, refB]);
}

// ─── Variation select — native, matches Exertion visually ───────────────────
function VariationDropdown({ value, onChange, style }: {
  value: Variation[];
  onChange: (v: Variation[]) => void;
  style?: React.CSSProperties;
}) {
  const selected = value[0] ?? "";
  return (
    <select
      className="select"
      value={selected}
      onChange={(e) => onChange(e.target.value ? [e.target.value as Variation] : [])}
      style={{ fontSize: "0.72rem", padding: "0.14rem 0.14rem", textAlign: "center", width: "100%", minWidth: 0, ...style }}
    >
      <option value="">—</option>
      {VARIATIONS.map((v) => <option key={v} value={v}>{VARIATION_LABELS[v]}</option>)}
    </select>
  );
}

// ─── Reps / Time toggle input ─────────────────────────────────────────────
function RepsInput({
  reps, repsType, repsUnit, onChange,
}: {
  reps: string;
  repsType?: "reps" | "time";
  repsUnit?: "s" | "min";
  onChange: (patch: { reps?: string; reps_type?: "reps" | "time"; reps_unit?: "s" | "min" }) => void;
}) {
  const isTime = repsType === "time";
  const unit = repsUnit ?? "s";
  const INP: React.CSSProperties = { fontSize: "0.73rem", padding: "0.16rem 0.14rem", textAlign: "center" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
      <button
        type="button"
        title={isTime ? "Switch to reps" : "Switch to timed set"}
        onClick={() => onChange({ reps_type: isTime ? "reps" : "time", reps_unit: unit, reps: isTime ? "" : (reps || "30") })}
        style={{
          fontSize: "0.55rem", padding: "0.1rem 0.2rem",
          border: "1px solid var(--line)", borderRadius: 2,
          background: isTime ? "rgba(0,0,0,0.08)" : "transparent",
          cursor: "pointer", color: isTime ? "var(--ink)" : "var(--muted)",
          flexShrink: 0, lineHeight: 1, fontFamily: "inherit",
        }}
      >{isTime ? "#" : "⏱"}</button>
      {isTime ? (
        <>
          <input
            className="input" type="number" min={1} step={unit === "min" ? 1 : 5}
            value={reps || "30"}
            onChange={(e) => onChange({ reps: e.target.value })}
            style={{ ...INP, width: 34 }}
          />
          <select
            className="select" value={unit}
            onChange={(e) => onChange({ reps_unit: e.target.value as "s" | "min" })}
            style={{ fontSize: "0.65rem", padding: "0.14rem 0.08rem", width: 32 }}
          >
            <option value="s">s</option>
            <option value="min">m</option>
          </select>
        </>
      ) : (
        <input
          className="input"
          style={{ ...INP, flex: 1, minWidth: 0 }}
          value={reps}
          onChange={(e) => onChange({ reps: e.target.value })}
        />
      )}
    </div>
  );
}

// ─── Optional field add — button + fixed-position panel ─────────────────────
function AddOptionalFieldButton({
  activeFields,
  onAdd,
}: {
  activeFields: OptionalField[];
  onAdd: (f: OptionalField) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const available = ALL_OPTIONAL_FIELDS.filter((f) => !activeFields.includes(f));
  const PANEL_W = 140;

  useClickOutsideTwo(btnRef, panelRef, open, () => setOpen(false));

  if (available.length === 0) return null;

  function toggleOpen() {
    if (open) { setOpen(false); return; }
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({
      top: rect.bottom + 2,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_W - 8)),
    });
    setOpen(true);
  }

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        ref={btnRef}
        type="button"
        title="Add optional field"
        onClick={toggleOpen}
        style={{
          background: "transparent", border: "1px solid var(--line)", borderRadius: 3,
          fontSize: "0.62rem", padding: "0.06rem 0.22rem", cursor: "pointer",
          color: "var(--muted)", lineHeight: 1, fontFamily: "inherit",
        }}
      >+</button>
      {open && (
        <div ref={panelRef} style={{
          position: "fixed", top: pos.top, left: pos.left, zIndex: 1000,
          background: "var(--paper)", border: "1px solid var(--line)",
          borderRadius: 3, boxShadow: "0 4px 12px rgba(0,0,0,0.14)",
          minWidth: PANEL_W, padding: "0.25rem 0",
        }}>
          {available.map((f) => (
            <button key={f} type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onAdd(f); setOpen(false); }}
              style={{
                display: "block", width: "100%", textAlign: "left", border: "none",
                padding: "0.28rem 0.65rem", fontSize: "0.8rem", cursor: "pointer",
                fontFamily: "inherit", background: "transparent", color: "var(--ink)",
              }}
            >{OPTIONAL_FIELD_CONFIG[f].label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Single optional-field input cell ─────────────────────────────────────
const POSITION_OPTIONS = ["standing", "seated", "incline", "lying"] as const;
type PositionBase = typeof POSITION_OPTIONS[number];
const POSITION_LABELS: Record<PositionBase, string> = {
  standing: "Standing", seated: "Seated", incline: "Incline", lying: "Lying",
};

function OptionalFieldInput({
  field, value, onChange, style,
}: {
  field: OptionalField;
  value: string | number | undefined;
  onChange: (v: string | number | undefined) => void;
  style?: React.CSSProperties;
}) {
  if (field === "tempo") {
    return (
      <input
        className="input"
        style={style}
        placeholder="3-1-3"
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    );
  }

  if (field === "position") {
    const raw = (value as string) ?? "";
    const isIncline = raw.startsWith("incline");
    const base: PositionBase | "" = isIncline ? "incline" : (raw as PositionBase | "");
    const angle = isIncline ? raw.slice("incline:".length) : "";
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 2, width: "100%", boxSizing: "border-box" }}>
        <select
          className="select"
          value={base}
          onChange={(e) => {
            const v = e.target.value as PositionBase | "";
            onChange(v === "incline" ? "incline:" : (v || undefined));
          }}
          style={{ fontSize: "0.68rem", padding: "0.1rem 0.06rem", flex: 1, minWidth: 0 }}
        >
          <option value="">—</option>
          {POSITION_OPTIONS.map((p) => (
            <option key={p} value={p}>{POSITION_LABELS[p]}</option>
          ))}
        </select>
        {isIncline && (
          <input
            className="input"
            type="number"
            min={0}
            max={90}
            placeholder="°"
            value={angle}
            onChange={(e) => onChange(`incline:${e.target.value}`)}
            style={{ width: 28, fontSize: "0.68rem", padding: "0.1rem 0.1rem", textAlign: "center", flexShrink: 0 }}
          />
        )}
      </div>
    );
  }

  // rir, half_reps, rest_after are all numeric
  return (
    <input
      className="input"
      type="number"
      min={0}
      max={field === "rir" ? 10 : undefined}
      style={style}
      placeholder={field === "rest_after" ? "s" : "0"}
      value={(value as number) ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
    />
  );
}

function ExerciseCard({
  it, dayUid, itemIdx, inSuperset, drag,
  onDragStart, onDragEnd, onDrop,
  onRemove, onMoveUp, onMoveDown,
  onPatch, onToggleSameFormat, onPatchSetRow,
  bottomSlot,
}: {
  it: ProgramItem;
  dayUid: string;
  itemIdx: number;
  inSuperset: boolean;
  drag: DragPayload | null;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDrop: (e: React.DragEvent) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onPatch: (patch: Partial<ProgramItem>) => void;
  onToggleSameFormat: () => void;
  onPatchSetRow: (si: number, patch: Partial<SetRow>) => void;
  bottomSlot?: React.ReactNode;
}) {
  // ─── Preset state ─────────────────────────────────────────────────
  const [presets, setPresets] = useState<ExercisePreset[]>(() => loadPresets(it.movement.id));
  const [showNameInput, setShowNameInput] = useState(false);
  const [presetDraft, setPresetDraft] = useState("");

  function saveCurrentAsPreset() {
    const name = presetDraft.trim();
    if (!name) return;
    const preset: ExercisePreset = {
      id: `p-${Date.now()}`,
      name,
      movementId: it.movement.id,
      sets: it.sets,
      reps: it.reps,
      exertion_score: it.exertion_score,
      variations: it.variations,
      equipment_list: it.equipment_list,
      equipment_specifics: it.equipment_specifics,
      notes: it.notes,
    };
    const next = [...presets, preset];
    setPresets(next);
    persistPresets(it.movement.id, next);
    setPresetDraft("");
    setShowNameInput(false);
  }

  function applyPreset(p: ExercisePreset) {
    onPatch({
      sets: p.sets,
      reps: p.reps,
      exertion_score: p.exertion_score,
      variations: p.variations,
      equipment_list: p.equipment_list,
      equipment_specifics: p.equipment_specifics,
      notes: p.notes,
    });
  }

  // ── Rest block rendering ─────────────────────────────────────────
  if (it.movement.id === "rest") {
    const dur = it.rest_duration ?? 60;
    const unit = it.rest_unit ?? "s";
    return (
      <div
        draggable
        onDragStart={onDragStart}
        onDragOver={(e) => { if (drag) e.preventDefault(); }}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        style={{
          padding: "0.35rem 0.45rem",
          borderRadius: 4,
          border: "1px dashed rgba(0,0,0,0.18)",
          background: "rgba(0,0,0,0.025)",
          cursor: "grab",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <span className="no-print" style={{ color: "var(--muted)", userSelect: "none", fontSize: "0.68rem", flexShrink: 0 }}>⋮⋮</span>
          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>⏱</span>
          <span style={{ fontWeight: 600, fontSize: "0.82rem" }}>Rest</span>
          <input
            className="input"
            type="number"
            min={1}
            max={unit === "min" ? 60 : 600}
            step={unit === "min" ? 1 : 5}
            value={dur}
            onChange={(e) => onPatch({ rest_duration: Number(e.target.value) || 1 })}
            style={{ width: 52, fontSize: "0.78rem", padding: "0.15rem 0.25rem", textAlign: "center" }}
          />
          <select
            className="select"
            value={unit}
            onChange={(e) => onPatch({ rest_unit: e.target.value as "s" | "min" })}
            style={{ fontSize: "0.75rem", padding: "0.15rem 0.2rem", width: 54 }}
          >
            <option value="s">sec</option>
            <option value="min">min</option>
          </select>
          <div className="no-print" style={{ marginLeft: "auto", display: "flex", gap: "0.15rem" }}>
            <button className="btn btn-ghost" style={{ padding: "0.08rem 0.28rem", fontSize: "0.62rem" }} onClick={onMoveUp}>↑</button>
            <button className="btn btn-ghost" style={{ padding: "0.08rem 0.28rem", fontSize: "0.62rem" }} onClick={onMoveDown}>↓</button>
            <button className="btn btn-ghost" style={{ padding: "0.08rem 0.28rem", fontSize: "0.65rem", color: "var(--red)" }} onClick={onRemove}>×</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => { if (drag) e.preventDefault(); }}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      style={{
        padding: "0.4rem 0.45rem",
        borderRadius: inSuperset ? 3 : 4,
        border: inSuperset ? "1px solid rgba(217,119,6,0.18)" : "1px solid var(--line)",
        background: it.is_warmup ? "rgba(168,61,43,0.04)" : inSuperset ? "rgba(217,119,6,0.03)" : "var(--paper)",
        cursor: "grab",
        minWidth: 0,
      }}
    >
      {/* Name row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.3rem" }}>
        <span className="no-print" style={{ color: "var(--muted)", userSelect: "none", fontSize: "0.68rem", paddingTop: "0.12rem", flexShrink: 0 }}>⋮⋮</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: "0.82rem", lineHeight: 1.3, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.25rem" }}>
            <span>{it.movement.name}</span>
            {it.is_warmup ? <span style={{ fontSize: "0.6rem", color: "var(--rust)", fontWeight: 400 }}>warm-up</span> : null}
          </div>
          <div className="meta" style={{ fontSize: "0.69rem" }}>
            {CATEGORY_LABELS[it.movement.category]}{it.movement.cues ? ` · ${it.movement.cues}` : ""}
          </div>
          {it.last_log ? (
            <div className="meta" style={{ fontSize: "0.67rem" }}>last: {it.last_log.reps} × {it.last_log.weight_lb} lb</div>
          ) : null}
        </div>
        <button className="btn btn-ghost no-print" style={{ padding: "0.08rem 0.28rem", fontSize: "0.65rem", color: "var(--red)", flexShrink: 0 }} onClick={onRemove}>×</button>
      </div>

      {/* Saved presets dropdown */}
      {presets.length > 0 && (
        <div style={{ marginTop: "0.22rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <span style={{ fontSize: "0.58rem", color: "var(--muted)", flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>Preset</span>
          <select
            className="select"
            style={{ flex: 1, fontSize: "0.69rem", padding: "0.12rem 0.2rem" }}
            value=""
            onChange={(e) => {
              const p = presets.find((x) => x.id === e.target.value);
              if (p) applyPreset(p);
            }}
          >
            <option value="" disabled>— apply saved —</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Set controls — grid layout so headers align with inputs */}
      {(() => {
        const HDR: React.CSSProperties = {
          fontSize: "0.56rem", color: "var(--muted)", textTransform: "uppercase",
          letterSpacing: "0.05em", textAlign: "center", alignSelf: "end",
          paddingBottom: "0.12rem", userSelect: "none",
        };
        const INP: React.CSSProperties = { fontSize: "0.72rem", padding: "0.14rem 0.14rem", textAlign: "center" };
        const activeFields: OptionalField[] = it.optional_fields ?? [];
        const optColStr = activeFields.map((f) => OPTIONAL_FIELD_CONFIG[f].width).join(" ");
        // Column order: Sets | Reps | Exertion | Spec | Equip | [opt cols] | + | Notes(1fr)
        const SF_COLS = `32px 76px 68px 62px 60px${optColStr ? ` ${optColStr}` : ""} 26px 1fr`;
        const PS_COLS = `24px 76px 68px 62px 60px${optColStr ? ` ${optColStr}` : ""} 26px 1fr`;

        function removeOptField(f: OptionalField) {
          onPatch({ optional_fields: activeFields.filter((x) => x !== f) });
        }
        function addOptField(f: OptionalField) {
          onPatch({ optional_fields: [...activeFields, f] });
        }

        return (
          <div style={{ marginTop: "0.3rem" }}>

            {/* "All same" toggle — always above the grid */}
            <label style={{ display: "inline-flex", alignItems: "center", gap: "0.22rem", cursor: "pointer", marginBottom: "0.22rem" }}>
              <input type="checkbox" checked={it.same_format} onChange={onToggleSameFormat} style={{ cursor: "pointer" }} />
              <span style={{ fontSize: "0.61rem", color: "var(--muted)", userSelect: "none" }}>All same</span>
            </label>

            {/* Scroll wrapper so set grids never blow out the phone screen */}
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" as any, width: "100%", minWidth: 0 }}>

            {it.same_format ? (
              /* ── Same-format grid: header row + single input row ── */
              <div style={{ display: "grid", gridTemplateColumns: SF_COLS, gap: "0.35rem", alignItems: "center", minWidth: "min-content" }}>
                {/* Headers: Sets | Reps | Exertion | Spec | Equip | [opt] | + | Notes */}
                <span style={HDR}>Sets</span>
                <span style={HDR}>Reps</span>
                <span style={HDR}>Exertion</span>
                <span style={HDR}>
                  <span className="hdr-full">Specification</span>
                  <span className="hdr-short">Spec</span>
                </span>
                <span style={HDR}>
                  <span className="hdr-full">Equipment</span>
                  <span className="hdr-short">Equip</span>
                </span>
                {activeFields.map((f) => (
                  <span key={`hdr-${f}`} style={{ ...HDR, display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                    <button
                      type="button"
                      style={{ background: "transparent", border: "none", padding: "0 1px", cursor: "pointer", fontSize: "0.5rem", color: "var(--muted)", lineHeight: 1 }}
                      title={`Remove ${OPTIONAL_FIELD_CONFIG[f].label}`}
                      onClick={() => removeOptField(f)}
                    >×</button>
                    {OPTIONAL_FIELD_CONFIG[f].shortLabel}
                  </span>
                ))}
                <span />{/* + placeholder */}
                <span style={{ ...HDR, textAlign: "left" }}>Notes</span>
                {/* Data row */}
                <input className="input" style={INP} type="number" min={1} max={20}
                  value={it.sets} onChange={(e) => onPatch({ sets: Number(e.target.value) || 0 })} />
                <RepsInput
                  reps={it.reps} repsType={it.reps_type} repsUnit={it.reps_unit}
                  onChange={(p) => onPatch(p as Partial<ProgramItem>)}
                />
                <select className="select" style={INP}
                  value={it.exertion_score} onChange={(e) => onPatch({ exertion_score: Number(e.target.value) })}>
                  {Object.entries(EXERTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <VariationDropdown value={it.variations} onChange={(v) => onPatch({ variations: v })} />
                <EquipmentMultiSelect
                  value={it.equipment_list} specifics={it.equipment_specifics}
                  onChange={(eq, sp) => onPatch({ equipment_list: eq, equipment_specifics: sp })}
                  compact
                />
                {activeFields.map((f) => (
                  <OptionalFieldInput
                    key={`inp-${f}`}
                    field={f}
                    value={f === "rest_after" ? it.rest_seconds : f === "tempo" ? it.tempo : f === "rir" ? it.rir : f === "half_reps" ? it.half_reps : f === "position" ? it.position : undefined}
                    onChange={(v) => onPatch(f === "rest_after" ? { rest_seconds: v as number | undefined } : { [f]: v } as Partial<ProgramItem>)}
                    style={{ ...INP, width: "100%", boxSizing: "border-box" as const }}
                  />
                ))}
                <span style={{ alignSelf: "center", textAlign: "center" }}>
                  <AddOptionalFieldButton activeFields={activeFields} onAdd={addOptField} />
                </span>
                <input className="input" style={{ fontSize: "0.72rem", padding: "0.16rem 0.2rem", width: "100%", boxSizing: "border-box" }}
                  placeholder="Notes…" value={it.notes ?? ""} onChange={(e) => onPatch({ notes: e.target.value })} />
              </div>
            ) : (
              /* ── Per-set: sets count + grid with header row + one row per set ── */
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.22rem" }}>
                  <span style={{ ...HDR, textAlign: "left" }}>Sets</span>
                  <input className="input" style={{ ...INP, width: 36 }} type="number" min={1} max={10}
                    value={it.sets} onChange={(e) => onPatch({ sets: Number(e.target.value) || 1 })} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: PS_COLS, gap: "0.3rem", alignItems: "center", minWidth: "min-content" }}>
                  {/* Headers: blank | Reps | Exertion | Spec | Equip | [opt] | + | Notes */}
                  <span style={HDR}></span>
                  <span style={HDR}>Reps</span>
                  <span style={HDR}>Exertion</span>
                  <span style={HDR}>
                    <span className="hdr-full">Specification</span>
                    <span className="hdr-short">Spec</span>
                  </span>
                  <span style={HDR}>
                    <span className="hdr-full">Equipment</span>
                    <span className="hdr-short">Equip</span>
                  </span>
                  {activeFields.map((f) => (
                    <span key={`hdr-${f}`} style={{ ...HDR, display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                      <button
                        type="button"
                        style={{ background: "transparent", border: "none", padding: "0 1px", cursor: "pointer", fontSize: "0.5rem", color: "var(--muted)", lineHeight: 1 }}
                        title={`Remove ${OPTIONAL_FIELD_CONFIG[f].label}`}
                        onClick={() => removeOptField(f)}
                      >×</button>
                      {OPTIONAL_FIELD_CONFIG[f].shortLabel}
                    </span>
                  ))}
                  <span />{/* + placeholder */}
                  <span style={{ ...HDR, textAlign: "left" }}>Notes</span>
                  {/* Set rows */}
                  {it.set_rows.map((row, si) => (
                    <>
                      <span key={`lbl-${si}`} style={{ fontSize: "0.65rem", color: "var(--muted)", fontWeight: 600, textAlign: "center" }}>S{si + 1}</span>
                      <RepsInput
                        key={`reps-${si}`}
                        reps={row.reps}
                        repsType={row.reps_type ?? it.reps_type}
                        repsUnit={row.reps_unit ?? it.reps_unit}
                        onChange={(p) => onPatchSetRow(si, p as Partial<SetRow>)}
                      />
                      <select key={`exr-${si}`} className="select" style={INP}
                        value={row.exertion_score} onChange={(e) => onPatchSetRow(si, { exertion_score: Number(e.target.value) })}>
                        {Object.entries(EXERTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <VariationDropdown key={`spec-${si}`} value={row.variations ?? []} onChange={(v) => onPatchSetRow(si, { variations: v })} />
                      <EquipmentMultiSelect
                        key={`eq-${si}`}
                        value={row.equipment_list ?? it.equipment_list}
                        specifics={row.equipment_specifics ?? it.equipment_specifics}
                        onChange={(eq, sp) => onPatchSetRow(si, { equipment_list: eq, equipment_specifics: sp })}
                        compact
                      />
                      {activeFields.map((f) => (
                        <OptionalFieldInput
                          key={`opt-${f}-${si}`}
                          field={f}
                          value={f === "rest_after" ? row.rest_seconds : f === "tempo" ? row.tempo : f === "rir" ? row.rir : f === "half_reps" ? row.half_reps : f === "position" ? row.position : undefined}
                          onChange={(v) => onPatchSetRow(si, f === "rest_after" ? { rest_seconds: v as number | undefined } : { [f]: v } as Partial<SetRow>)}
                          style={{ ...INP, width: "100%", boxSizing: "border-box" as const }}
                        />
                      ))}
                      <span key={`plus-sp-${si}`} style={{ alignSelf: "center", textAlign: "center" }}>
                        <AddOptionalFieldButton activeFields={activeFields} onAdd={addOptField} />
                      </span>
                      <input key={`notes-${si}`} className="input" style={{ fontSize: "0.71rem", padding: "0.16rem 0.2rem", width: "100%", boxSizing: "border-box" }}
                        placeholder="Notes…" value={row.notes ?? ""} onChange={(e) => onPatchSetRow(si, { notes: e.target.value })} />
                    </>
                  ))}
                </div>
              </>
            )}

            </div>{/* end scroll wrapper */}
          </div>
        );
      })()}

      {/* Coaching notes */}
      <textarea
        className="input"
        style={{ marginTop: "0.28rem", width: "100%", fontSize: "0.71rem", padding: "0.16rem 0.28rem", boxSizing: "border-box", resize: "vertical", minHeight: 32, display: "block" }}
        placeholder="Coaching notes…"
        value={it.movement_notes ?? ""}
        onChange={(e) => onPatch({ movement_notes: e.target.value })}
        rows={2}
      />

      {/* Reorder + bottom slot + Add Name */}
      <div className="no-print" style={{ display: "flex", alignItems: "center", gap: "0.15rem", marginTop: "0.22rem", flexWrap: "wrap" }}>
        <button className="btn btn-ghost" style={{ padding: "0.08rem 0.28rem", fontSize: "0.62rem" }} onClick={onMoveUp}>↑</button>
        <button className="btn btn-ghost" style={{ padding: "0.08rem 0.28rem", fontSize: "0.62rem" }} onClick={onMoveDown}>↓</button>
        <div style={{ flex: 1 }}>{bottomSlot}</div>
        {showNameInput ? (
          <>
            <input
              className="input"
              autoFocus
              style={{ width: 96, fontSize: "0.69rem", padding: "0.1rem 0.22rem" }}
              placeholder="Name…"
              value={presetDraft}
              onChange={(e) => setPresetDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveCurrentAsPreset();
                if (e.key === "Escape") { setShowNameInput(false); setPresetDraft(""); }
              }}
            />
            <button className="btn btn-primary" style={{ fontSize: "0.64rem", padding: "0.1rem 0.38rem" }} onClick={saveCurrentAsPreset}>Save</button>
            <button className="btn btn-ghost" style={{ fontSize: "0.64rem", padding: "0.1rem 0.26rem" }} onClick={() => { setShowNameInput(false); setPresetDraft(""); }}>✕</button>
          </>
        ) : (
          <button
            className="btn btn-ghost"
            style={{ fontSize: "0.63rem", padding: "0.06rem 0.28rem", color: "var(--muted)" }}
            onClick={() => setShowNameInput(true)}
            title="Save current config as a named preset"
          >+ Name</button>
        )}
      </div>
    </div>
  );
}

// ─── Coverage hierarchy panel (mirrors library accordion) ────────────────
function CoverageHierarchy({
  inProgramIds,
  leafMoveIdMap,
}: {
  inProgramIds: Set<string>;
  leafMoveIdMap: Map<string, string>;
}) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setOpenGroups((cur) => { const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function leafCovered(leaf: { id: string }): boolean {
    return inProgramIds.has(leafMoveIdMap.get(leaf.id) ?? leaf.id);
  }

  function groupStats(group: LibraryGroup) {
    let used = 0, total = 0;
    group.nodes.forEach((node) => {
      if (node.children?.length) {
        node.children.forEach((c) => { total++; if (leafCovered(c)) used++; });
      } else {
        total++;
        if (leafCovered(node)) used++;
      }
    });
    return { used, total };
  }

  return (
    <div className="coverage-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.75rem", marginTop: "0.5rem", alignItems: "start" }}>
      {LIBRARY_HIERARCHY.map((group) => {
        const { used, total } = groupStats(group);
        const anyUsed = used > 0;
        const open = openGroups.has(group.id);
        const color = used === 0 ? "var(--red)" : used < total ? "var(--amber)" : "var(--sage)";

        return (
          <div key={group.id} style={{ borderTop: "2px solid var(--line)", paddingTop: "0.35rem" }}>
            <button
              type="button"
              onClick={() => toggle(group.id)}
              style={{
                width: "100%", textAlign: "left", background: "transparent", border: "none",
                padding: "0.1rem 0 0.3rem", cursor: "pointer", display: "flex", alignItems: "center",
                gap: "0.4rem", fontFamily: "inherit", fontWeight: 700, fontSize: "0.82rem",
              }}
            >
              <span style={{ flex: 1 }}>{group.label}</span>
              <span style={{ fontFamily: "var(--font-heading), Oswald, sans-serif", fontSize: "0.84rem", fontWeight: 700, color }}>
                {used}<span style={{ color: "var(--muted)", fontSize: "0.68rem", fontWeight: 400 }}>/{total}</span>
              </span>
              <span style={{ fontSize: "0.6rem", color: "var(--muted)" }}>{open ? "▾" : "▸"}</span>
            </button>

            {open && (
              <div style={{ paddingLeft: "0.5rem" }}>
                {group.nodes.map((node) => {
                  const hasChildren = (node.children?.length ?? 0) > 0;

                  if (!hasChildren) {
                    const covered = leafCovered(node);
                    return (
                      <div key={node.id} style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.2rem 0.3rem", fontSize: "0.78rem" }}>
                        <span style={{ color: covered ? "var(--sage)" : "var(--muted)", fontSize: "0.68rem", width: 14, textAlign: "center", flexShrink: 0 }}>
                          {covered ? "✓" : "○"}
                        </span>
                        <span style={{ color: covered ? undefined : "var(--muted)", fontWeight: covered ? 600 : undefined }}>{node.label}</span>
                      </div>
                    );
                  }

                  const childLeaves = node.children!;
                  const nodeUsed = childLeaves.filter((c) => leafCovered(c)).length;
                  const nodeAnyUsed = nodeUsed > 0;

                  return (
                    <div key={node.id} style={{ marginBottom: "0.1rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.22rem 0.3rem", fontSize: "0.78rem", fontWeight: 600 }}>
                        <span style={{ color: nodeAnyUsed ? "var(--sage)" : "var(--muted)", fontSize: "0.68rem", width: 14, textAlign: "center", flexShrink: 0 }}>
                          {nodeUsed === childLeaves.length ? "✓" : nodeAnyUsed ? "~" : "○"}
                        </span>
                        <span style={{ flex: 1 }}>{node.label}</span>
                        <span className="meta" style={{ fontSize: "0.68rem", fontWeight: 400 }}>{nodeUsed}/{childLeaves.length}</span>
                      </div>
                      {childLeaves.map((child) => {
                        const childCovered = leafCovered(child);
                        return (
                          <div key={child.id} style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.16rem 0.3rem 0.16rem 1.4rem", fontSize: "0.74rem" }}>
                            <span style={{ color: childCovered ? "var(--sage)" : "var(--muted)", fontSize: "0.66rem", width: 12, textAlign: "center", flexShrink: 0 }}>
                              {childCovered ? "✓" : "○"}
                            </span>
                            <span style={{ color: childCovered ? undefined : "var(--muted)" }}>{child.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Library leaf row: add btn + label + in-program indicator ─────────────
/** A draggable row for a real named exercise from the Supabase movements table. */
function LibraryLeafRow({
  leaf,
  inProgram,
  onAdd,
  onDragStart,
  onDragEnd,
}: {
  leaf: LibraryLeaf;
  inProgram: boolean;
  onAdd: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        padding: "0.26rem 0.4rem",
        borderRadius: 3,
        background: inProgram ? "rgba(168,61,43,0.05)" : undefined,
        marginBottom: "0.12rem",
        cursor: "grab",
      }}
      title="Drag into a day, or click + to add to the active day"
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.4rem" }}>
        <button
          type="button"
          className="btn btn-ghost no-print"
          style={{ padding: "0.04rem 0.32rem", fontSize: "0.72rem", flexShrink: 0, color: "var(--muted)" }}
          onClick={(e) => { e.stopPropagation(); onAdd(); }}
          title="Add to active day"
        >+</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: "0.82rem" }}>{leaf.label}</div>
        </div>
        {inProgram && (
          <span
            aria-label="In program"
            style={{ flexShrink: 0, marginTop: "0.15rem", color: "var(--rust)", fontSize: "0.82rem", lineHeight: 1 }}
          >✓</span>
        )}
      </div>
    </div>
  );
}

// ─── Equipment multi-select with Other-specify and Machine-specify ─────
function EquipmentMultiSelect({
  value,
  specifics,
  onChange,
  compact = false,
}: {
  value: Equipment[];
  specifics?: string;
  onChange: (next: Equipment[], specifics: string | undefined) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const showSpecifics = value.includes("machine") || value.includes("other");
  const fullLabel = value.length === 0 ? "Equipment" : value.length <= 2 ? value.map(v => EQUIPMENT_OPTIONS.find(o => o.value === v)?.label ?? v).join(", ") : `${value.length} equip.`;
  const compactLabel = value.length === 0 ? "Equip." : value.length <= 1 ? (EQUIPMENT_OPTIONS.find(o => o.value === value[0])?.label ?? value[0]).slice(0, 7) : `${value.length} eq.`;
  const label = compact ? compactLabel : fullLabel;

  // Close on scroll so the fixed dropdown doesn't drift
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", close, { capture: true });
  }, [open]);

  function openDropdown() {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + 2, left: rect.left });
    }
    setOpen((o) => !o);
  }

  function toggle(eq: Equipment) {
    const has = value.includes(eq);
    const next = has ? value.filter(x => x !== eq) : [...value, eq];
    onChange(next, next.includes("machine") || next.includes("other") ? specifics : undefined);
  }

  return (
    <div style={{ position: "relative", minWidth: 0 }}>
      <button
        ref={btnRef}
        type="button"
        className="btn btn-ghost"
        style={{
          padding: compact ? "0.16rem 0.28rem" : "0.35rem 0.5rem",
          fontSize: compact ? "0.67rem" : "0.74rem",
          textAlign: "left",
          width: "100%",
          justifyContent: "space-between",
          display: "flex",
          alignItems: "center",
          gap: "0.3rem",
          whiteSpace: "nowrap",
          boxSizing: "border-box",
        }}
        onClick={openDropdown}
      >
        <span style={{ fontWeight: value.length ? 600 : 400, color: value.length ? undefined : "var(--muted)" }}>{label}</span>
        <span style={{ fontSize: "0.58rem" }}>▾</span>
      </button>
      {open ? (
        <div
          style={{
            position: "fixed",
            top: dropPos?.top ?? 0,
            left: dropPos?.left ?? 0,
            zIndex: 1000,
            background: "var(--paper)",
            border: "1px solid var(--line)",
            borderRadius: 3,
            padding: "0.4rem",
            minWidth: 200,
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
          }}
        >
          {EQUIPMENT_OPTIONS.map((opt) => (
            <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.18rem 0.2rem", fontSize: "0.78rem", cursor: "pointer" }}>
              <input type="checkbox" checked={value.includes(opt.value)} onChange={() => toggle(opt.value)} />
              {opt.label}
            </label>
          ))}
          {showSpecifics ? (
            <input
              className="input"
              placeholder={value.includes("other") ? "Specify other…" : "Specify machine…"}
              value={specifics ?? ""}
              onChange={(e) => onChange(value, e.target.value)}
              style={{ marginTop: "0.4rem", fontSize: "0.78rem" }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ─── Superset exercise picker ─────────────────────────────────────────────
function SupersetExercisePicker({
  onSelect,
  onClose,
}: {
  onSelect: (leaf: LibraryLeaf) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();

  const filtered = q
    ? hierarchyLeaves().filter(
        (l) => l.label.toLowerCase().includes(q) || l.category.toLowerCase().includes(q)
      )
    : null;

  return (
    <div
      className="no-print"
      style={{ borderTop: "1px solid rgba(217,119,6,0.25)", padding: "0.4rem 0.5rem", background: "rgba(217,119,6,0.04)" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
        <input
          className="input"
          autoFocus
          placeholder="Search exercises…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, fontSize: "0.72rem", padding: "0.22rem 0.35rem" }}
        />
        <button
          type="button"
          className="btn btn-ghost"
          style={{ fontSize: "0.66rem", padding: "0.18rem 0.4rem", color: "var(--muted)" }}
          onClick={onClose}
        >✕</button>
      </div>

      <div style={{ marginTop: "0.35rem", maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {filtered ? (
          filtered.length > 0 ? (
            filtered.map((leaf) => (
              <button
                key={leaf.id}
                type="button"
                className="btn btn-ghost"
                style={{ textAlign: "left", fontSize: "0.72rem", padding: "0.22rem 0.45rem", justifyContent: "flex-start" }}
                onClick={() => onSelect(leaf)}
              >
                <strong>{leaf.label}</strong>
                <span className="meta" style={{ marginLeft: "0.4rem", fontSize: "0.67rem" }}>{CATEGORY_LABELS[leaf.category]}</span>
              </button>
            ))
          ) : (
            <p className="meta" style={{ fontSize: "0.72rem", margin: "0.15rem 0.45rem" }}>No matches</p>
          )
        ) : (
          LIBRARY_HIERARCHY.map((group) => (
            <div key={group.id}>
              <div style={{
                fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.07em", color: "var(--amber)",
                padding: "0.3rem 0.45rem 0.1rem", marginTop: "0.15rem",
              }}>
                {group.label}
              </div>
              {group.nodes.flatMap((node): { leaf: LibraryLeaf; parentLabel: string | undefined }[] =>
                node.children?.length
                  ? node.children.map((child) => ({ leaf: child as LibraryLeaf, parentLabel: node.label }))
                  : [{ leaf: { id: node.id, label: node.label, category: node.category, is_core: node.is_core, description: node.description } as LibraryLeaf, parentLabel: undefined }]
              ).map(({ leaf, parentLabel }) => (
                <button
                  key={leaf.id}
                  type="button"
                  className="btn btn-ghost"
                  style={{ width: "100%", textAlign: "left", fontSize: "0.72rem", padding: "0.2rem 0.45rem", justifyContent: "flex-start" }}
                  onClick={() => onSelect(leaf)}
                >
                  {parentLabel && (
                    <span className="meta" style={{ fontSize: "0.67rem", marginRight: "0.25rem" }}>{parentLabel} ›</span>
                  )}
                  <strong>{leaf.label}</strong>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Form data helpers ─────────────────────────────────────────────────────────

// Exact form field keys for goals (order preserved in display)
const GOAL_KEYS = [
  "Training goals",
  "Exercises to learn / work on",
  "Needs most improvement",
];

const INJURY_KEY = "Injuries / limitations";

function getFormFieldValue(formData: Record<string, string> | null, key: string): string {
  if (!formData) return "No Response";
  const val = formData[key]?.trim();
  return val || "No Response";
}

function getFormGoals(formData: Record<string, string> | null): Array<{ key: string; value: string }> {
  return GOAL_KEYS.map((key) => ({ key, value: getFormFieldValue(formData, key) }));
}

function getFormInjuryValue(formData: Record<string, string> | null): string {
  return getFormFieldValue(formData, INJURY_KEY);
}

// ── Client goals + injuries panel ────────────────────────────────────────────

function ClientGoalsSection({ client }: { client: ClientRow }) {
  const formGoals = getFormGoals(client.form_data);
  const injuryAnswer = getFormInjuryValue(client.form_data);
  const isRealInjury = injuryAnswer !== "No Response" && injuryAnswer.toLowerCase() !== "none" && injuryAnswer.toLowerCase() !== "no" && injuryAnswer.toLowerCase() !== "n/a";
  const hasInjury = isRealInjury || !!client.injuries;

  const rowStyle: React.CSSProperties = { fontSize: "0.82rem", lineHeight: 1.5 };
  const keyStyle: React.CSSProperties = { fontWeight: 600 };

  return (
    <div style={{ marginTop: "0.55rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
      <div>
        <div className="stat-label">Goals</div>
        <div style={{ marginTop: "0.2rem", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
          {/* Coach notes first */}
          {client.goals && (
            <div style={rowStyle}>
              <span style={keyStyle}>Coach notes:</span>{" "}{client.goals}
            </div>
          )}
          {formGoals.map(({ key, value }) => (
            <div key={key} style={{ ...rowStyle, color: value === "No Response" ? "var(--muted)" : undefined }}>
              <span style={keyStyle}>{key}:</span>{" "}{value}
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="stat-label" style={{ color: hasInjury ? "var(--red)" : undefined }}>
          Injuries / limitations
        </div>
        <div style={{ marginTop: "0.2rem", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
          {/* Coach notes first */}
          {client.injuries && (
            <div style={{ ...rowStyle, color: "var(--red)" }}>
              <span style={keyStyle}>Coach notes:</span>{" "}{client.injuries}
            </div>
          )}
          <div style={{ ...rowStyle, color: isRealInjury ? "var(--red)" : injuryAnswer === "No Response" ? "var(--muted)" : undefined }}>
            <span style={keyStyle}>{INJURY_KEY}:</span>{" "}{injuryAnswer}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Client typeable combobox ──────────────────────────────────────────────────

function ClientCombobox({
  clients,
  value,
  onChange,
}: {
  clients: ClientRow[];
  value: string;
  onChange: (id: string) => void;
}) {
  const sorted = useMemo(
    () => [...clients].sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [clients]
  );
  const [query, setQuery] = useState(() => sorted.find((c) => c.id === value)?.full_name ?? "");
  const [open, setOpen] = useState(false);
  const prevValue = useRef(value);

  // Sync display when external value changes (e.g. banner click)
  useEffect(() => {
    if (prevValue.current !== value) {
      prevValue.current = value;
      const name = sorted.find((c) => c.id === value)?.full_name ?? "";
      setQuery(name);
    }
  }, [value, sorted]);

  const filtered = useMemo(
    () => query.trim()
      ? sorted.filter((c) => c.full_name.toLowerCase().includes(query.toLowerCase()))
      : sorted,
    [sorted, query]
  );

  function pick(id: string) {
    const name = sorted.find((c) => c.id === id)?.full_name ?? "";
    setQuery(name);
    setOpen(false);
    onChange(id);
  }

  function handleFocus() {
    setQuery(""); // clear so full list shows for tapping
    setOpen(true);
  }

  function handleBlur() {
    setTimeout(() => {
      setOpen(false);
      // Restore selected name if nothing new was picked
      const name = sorted.find((c) => c.id === value)?.full_name ?? "";
      setQuery(name);
    }, 150);
  }

  return (
    <div style={{ position: "relative", maxWidth: 320, marginTop: "0.3rem" }}>
      <input
        className="input"
        value={query}
        placeholder="Search or tap to browse…"
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={{ width: "100%" }}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, zIndex: 50,
          background: "var(--paper)", border: "1px solid var(--line)",
          borderRadius: 4, maxHeight: 200, overflowY: "auto",
          boxShadow: "0 4px 14px rgba(0,0,0,0.1)",
        }}>
          {filtered.map((c) => (
            <div
              key={c.id}
              onMouseDown={() => pick(c.id)}
              style={{
                padding: "0.4rem 0.65rem",
                cursor: "pointer",
                fontSize: "0.85rem",
                background: c.id === value ? "var(--ash)" : undefined,
                borderBottom: "1px solid var(--line)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--ash)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = c.id === value ? "var(--ash)" : ""; }}
            >
              {c.full_name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
