"use client";
import { useMemo, useState, useTransition } from "react";
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
  type Category,
  type Movement,
  type Equipment,
  type PastProgramFull,
  type LibraryGroup,
  type LibraryNode,
  type LibraryLeaf,
  pastProgramsForClient
} from "@/lib/programs";
import { saveProgram, getClientAppointments, type ApptOption } from "./actions";
import { fmtDate } from "@/lib/format";
import type { ProgramKind } from "@/lib/programs";
import type { ClientProgramItem } from "./page";

export type WeekSession = {
  id: string;
  client_id: string;
  client_name: string | null;
  starts_at: string;
  is_programmed: boolean;
};

type SetRow = {
  reps: string;
  exertion_score: number;  // 1..10
  variations: Variation[];
  notes?: string;
};

type Variation = "stretch" | "plyometric" | "isometric" | "single_sided" | "dropset";
const VARIATIONS: Variation[] = ["stretch", "plyometric", "isometric", "single_sided", "dropset"];
const VARIATION_LABELS: Record<Variation, string> = {
  stretch: "Stretch", plyometric: "Plyo", isometric: "Iso", single_sided: "Single", dropset: "Dropset",
};
const VARIATION_COLORS: Record<Variation, string> = {
  stretch: "rgba(59,130,246,0.12)", plyometric: "rgba(249,115,22,0.12)",
  isometric: "rgba(139,92,246,0.12)", single_sided: "rgba(34,197,94,0.12)", dropset: "rgba(168,61,43,0.12)",
};
const VARIATION_TEXT: Record<Variation, string> = {
  stretch: "rgb(37,99,235)", plyometric: "rgb(194,65,12)",
  isometric: "rgb(109,40,217)", single_sided: "rgb(21,128,57)", dropset: "var(--rust)",
};

type ProgramItem = {
  uid: string;
  movement: Movement;
  is_warmup: boolean;
  sets: number;
  reps: string;
  exertion_score: number;          // 1..10
  same_format: boolean;            // true = all sets identical (default)
  set_rows: SetRow[];              // per-set data when same_format=false
  variations: Variation[];         // modifier tags
  superset_id?: string;            // shared id groups items into a superset block
  rest_seconds?: number;
  notes?: string;
  equipment_list: Equipment[];
  equipment_specifics?: string;
  movement_notes?: string;
  last_log?: { reps: number; weight_lb: number };
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
  initialType = "in_gym",
  weekSessions = [],
  clientProgramSummary = []
}: {
  clients: ClientRow[];
  initialClientId?: string;
  initialAppts?: ApptOption[];
  initialApptId?: string;
  initialType?: ProgramKind;
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
  const [atHomeEditingHeader, setAtHomeEditingHeader] = useState(false);
  const [pickedExistingId, setPickedExistingId] = useState("");
  const [importDayModalUid, setImportDayModalUid] = useState<string | null>(null);
  const [supersetPickerState, setSupersetPickerState] = useState<{
    dayUid: string; supersetId: string; search: string;
  } | null>(null);
  const [days, setDays] = useState<ProgramDay[]>([NEW_DAY(1)]);

  const [savePending, startSave] = useTransition();
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // library controls
  const [searchTerm, setSearchTerm] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    new Set(LIBRARY_HIERARCHY.map((g) => g.id))  // all groups open by default
  );
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

  function handleBannerProgramSelect(clientId: string) {
    setClientId(clientId);
    setPastSelId("");
  }

  function handleBannerSelect(s: WeekSession) {
    setClientId(s.client_id);
    setSelectedApptId(s.id);
    setDays((d) => d.map((day, i) => i === 0 ? { ...day, title: fmtSessionTitle(s.starts_at) } : day));
    startApptsFetch(async () => {
      const result = await getClientAppointments(s.client_id);
      setAppts(result);
    });
  }

  function handleClientChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
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

  // ─── day actions ────────────────────────────────────────────────
  function addDay() { setDays((d) => [...d, NEW_DAY(d.length + 1)]); }
  function removeDay(uid: string) { setDays((d) => d.filter((x) => x.uid !== uid)); }
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
          exertion_score: 7,
          same_format: true,
          set_rows: [],
          variations: [],
          rest_seconds: 60,
          equipment_list: (m.equipment_list ?? []) as Equipment[],
          equipment_specifics: m.equipment_specifics
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
              // Expand: build one row per set from current values
              const rows: SetRow[] = Array.from({ length: it.sets }, () => ({
                reps: it.reps,
                exertion_score: it.exertion_score,
                variations: [...it.variations],
                notes: it.notes,
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
            exertion_score: 7,
            same_format: true,
            set_rows: [],
            variations: [],
            rest_seconds: 60,
            notes: it.notes,
            equipment_list: ((m as Movement).equipment_list ?? []) as Equipment[],
            equipment_specifics: (m as Movement).equipment_specifics
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
            exertion_score: 7,
            same_format: true,
            set_rows: [],
            variations: [],
            rest_seconds: 60,
            equipment_list: ((m as Movement).equipment_list ?? []) as Equipment[]
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
        client_id: clientId,
        name: autoName,
        starts_on: startsOn,
        duration_weeks: durationWeeks,
        based_on_program_id: pastSelId || null,
        publish,
        program_kind: programKind,
        at_home_cadence: programKind === "at_home" ? `${daysPerWeek}x/week` : null,
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
              ? `${it.exertion_score} — ${EXERTION_SHORT[it.exertion_score]}`
              : it.set_rows.map((r, i) => `Set ${i + 1}: ${r.exertion_score}`).join(", "),
            rest_seconds: it.rest_seconds ?? null,
            notes: it.notes ?? null
          }))
        }))
      });
      if (!res.ok) {
        if (res.error.startsWith("Supabase not configured")) {
          setSaveMessage(`${publish ? "Published" : "Saved"} locally — Supabase not configured yet.`);
        } else {
          setSaveError(res.error);
        }
        return;
      }
      setSaveMessage(publish ? "Published. Visible on the client's portal." : "Saved as draft.");
    });
  }

  function daySummary(day: ProgramDay): string {
    if (day.items.length === 0) return "no movements yet";
    const counts: Partial<Record<Category, number>> = {};
    day.items.forEach((it) => { counts[it.movement.category] = (counts[it.movement.category] ?? 0) + 1; });
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

      {/* Sessions this week banner — Session tab only */}
      {programKind === "in_gym" && weekSessions.length > 0 ? (
        <SessionsThisWeekBanner sessions={weekSessions} onSelect={handleBannerSelect} />
      ) : null}

      {/* ─── at_home SETUP FLOW (picker / form steps) ─── */}
      {programKind === "at_home" && atHomeProgramStep !== "builder" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

          {/* Step 1: Client + summary */}
          <div className="card" style={{ borderLeft: selectedClient ? "4px solid var(--rust)" : undefined }}>
            <label className="stat-label">Client</label>
            <select className="select" value={clientId} onChange={handleClientChange} style={{ marginTop: "0.3rem", maxWidth: 320 }}>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
            {selectedClient && (
              <>
                <div style={{ marginTop: "0.65rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
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
              </>
            )}
          </div>

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
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: "0.75rem", alignItems: "end" }}>
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
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: "0.75rem", alignItems: "end" }}>
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
              <div style={{ display: "flex", gap: "0.5rem" }}>
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

    {/* ─── BUILDER grid: library + main ─── */}
    {(programKind === "in_gym" || (programKind === "at_home" && atHomeProgramStep === "builder")) && (
    <>
    <div style={{ display: "grid", gridTemplateColumns: libOpen ? "220px 1fr" : "36px 1fr", gap: "1.25rem", transition: "grid-template-columns 0.15s" }}>
      {/* ─── library accordion (left) ─── */}
      <aside className="no-print" style={{ position: "sticky", top: "1rem", alignSelf: "start" }}>
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
                        // Leaf node — checkbox + day selector
                        const leaf: LibraryLeaf = { id: node.id, label: node.label, description: node.description, category: node.category, is_core: node.is_core };
                        return (
                          <LibraryLeafRow
                            key={node.id}
                            leaf={leaf}
                            inProgram={nodeInProgram}
                            onAdd={() => addLeafToProgram(leaf, activeDayUid)}
                            onDragStart={(e) => onDragStartLib(leafToMovement(leaf), e)}
                            onDragEnd={() => setDrag(null)}
                          />
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
                                const childInProgram = inProgramIds.has(leafMoveIdMap.get(child.id) ?? child.id);
                                return (
                                  <LibraryLeafRow
                                    key={child.id}
                                    leaf={child}
                                    inProgram={childInProgram}
                                    onAdd={() => addLeafToProgram(child, activeDayUid)}
                                    onDragStart={(e) => onDragStartLib(leafToMovement(child), e)}
                                    onDragEnd={() => setDrag(null)}
                                  />
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
          </div>
        )}
      </aside>

      {/* ─── main column ─── */}
      <section>
        {/* Session tab: client + session selector */}
        {programKind === "in_gym" && (
          <div className="card no-print">
            <div style={{ marginBottom: "0.75rem" }}>
              <label className="stat-label">Client</label>
              <select className="select" value={clientId} onChange={handleClientChange} style={{ marginTop: "0.3rem", maxWidth: 300 }}>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="stat-label">
                Select Session
                {apptsPending ? <span className="meta" style={{ marginLeft: "0.5rem", fontWeight: 400 }}>loading…</span> : null}
              </label>
              <select
                className="select"
                value={selectedApptId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedApptId(id);
                  const appt = appts.find((a) => a.id === id);
                  setDays((d) => d.map((day, i) => i === 0
                    ? { ...day, title: appt ? fmtSessionTitle(appt.starts_at) : "Day 1" }
                    : day
                  ));
                }}
                style={{ marginTop: "0.3rem", maxWidth: 420 }}
                disabled={apptsPending}
              >
                <option value="">— pick a session —</option>
                {appts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {new Date(a.starts_at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    {a.program_status === "programmed" ? "  ✓ programmed" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Client summary — shown for in_gym */}
        {programKind === "in_gym" && selectedClient ? (
          <div className="card" style={{ marginTop: "1rem", borderLeft: "4px solid var(--rust)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.6rem" }}>
              <div>
                <span className="badge">Programming for</span>
                <h2 style={{ marginTop: "0.4rem" }}>{selectedClient.full_name}</h2>
                <div className="meta" style={{ marginTop: "0.2rem", fontSize: "0.82rem" }}>
                  {selectedClient.tier?.replace("_", " ") ?? "—"} · {selectedClient.regular_frequency ?? "—"} sessions/wk · since {fmtDate(selectedClient.member_since)}
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                <Link className="btn btn-ghost" href={`/coach/clients/${selectedClient.id}`} style={{ padding: "0.35rem 0.7rem", fontSize: "0.72rem" }}>full profile →</Link>
              </div>
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
        ) : null}

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

        {/* Days — responsive grid layout */}
        <div style={{
          marginTop: "1rem",
          display: "grid",
          gridTemplateColumns: `repeat(${days.length}, minmax(${Math.max(210, Math.min(380, Math.floor(900 / days.length)))}px, 1fr))`,
          gap: "0.75rem",
          alignItems: "start",
          paddingBottom: "0.75rem",
          overflowX: "auto",
        }}>
          {days.map((day) => {
            const renderGroups = toRenderGroups(day.items);
            return (
              <div
                key={day.uid}
                className="card"
                style={{
                  padding: 0, display: "flex", flexDirection: "column", minWidth: 0,
                  marginTop: 0, // override .card + .card { margin-top: 1rem } — grid handles spacing
                  borderColor: day.uid === activeDayUid ? "var(--rust)" : undefined,
                }}
                onDragOver={(e) => { if (drag) e.preventDefault(); }}
                onDrop={(e) => onDayDrop(day.uid, e)}
              >
                {/* Day header */}
                <div style={{
                  padding: "0.55rem 0.7rem", display: "flex", alignItems: "center", gap: "0.4rem",
                  borderBottom: "1px solid var(--line)",
                  background: day.uid === activeDayUid ? "rgba(168,61,43,0.04)" : undefined,
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
                  <button className="btn btn-ghost no-print" style={{ padding: "0.1rem 0.35rem", fontSize: "0.65rem", color: "var(--red)", flexShrink: 0 }} onClick={() => removeDay(day.uid)} title="Delete day">✕</button>
                </div>
                <div className="meta" style={{ fontSize: "0.68rem", padding: "0.25rem 0.7rem", borderBottom: "1px solid var(--line)", color: "var(--muted)" }}>
                  {daySummary(day)}
                </div>

                {/* Render groups */}
                <div style={{ padding: "0.4rem 0.5rem", display: "flex", flexDirection: "column", gap: "0.4rem", flex: 1 }}>
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
                              onClick={() => {
                                const ssId = initSuperset(day.uid, it.uid);
                                setSupersetPickerState({ dayUid: day.uid, supersetId: ssId, search: "" });
                              }}
                              title="Add another exercise to form a superset"
                            >⊞ + Superset</button>
                          }
                        />
                      );
                    }

                    /* ── Superset block ── */
                    const { supersetId, label, entries } = group;
                    const lastEntry = entries[entries.length - 1];
                    const afterSuperset = day.items[lastEntry.itemIdx + 1];
                    const canExtend = !!afterSuperset && !afterSuperset.superset_id;
                    return (
                      <div
                        key={supersetId}
                        onDragOver={(e) => { if (drag) { e.preventDefault(); e.stopPropagation(); }}}
                        onDrop={(e) => {
                          e.stopPropagation();
                          if (!drag) return;
                          if (drag.kind === "item" && !entries.find(x => x.item.uid === drag.itemUid)) {
                            // Dropping a standalone exercise onto this superset: add it to the superset
                            if (drag.dayUid !== day.uid) moveItemAcross(drag.dayUid, drag.itemUid, day.uid);
                            addToSuperset(day.uid, drag.itemUid, supersetId);
                            setDrag(null);
                          } else {
                            onRowDrop(day.uid, lastEntry.itemIdx + 1, e);
                          }
                        }}
                        style={{ borderRadius: 5, border: "2px solid var(--amber)", overflow: "hidden" }}
                      >
                        {/* Superset header — draggable */}
                        <div
                          draggable
                          onDragStart={(e) => onDragStartSuperset(day.uid, supersetId, e)}
                          onDragEnd={() => setDrag(null)}
                          style={{
                            background: "rgba(217,119,6,0.09)", padding: "0.28rem 0.5rem",
                            display: "flex", alignItems: "center", gap: "0.4rem", cursor: "grab",
                            borderBottom: "1px solid rgba(217,119,6,0.25)"
                          }}
                        >
                          <span className="no-print" style={{ color: "var(--amber)", userSelect: "none", fontSize: "0.7rem" }}>⋮⋮</span>
                          <span style={{ fontWeight: 700, fontSize: "0.7rem", color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.06em", flex: 1 }}>
                            Super Set
                          </span>
                          <span className="meta" style={{ fontSize: "0.64rem" }}>{entries.length} exercises</span>
                        </div>

                        {/* Items within superset */}
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
                                  bottomSlot={
                                <button
                                  type="button"
                                  className="btn btn-ghost no-print"
                                  style={{ fontSize: "0.6rem", padding: "0.1rem 0.3rem", color: "var(--muted)", width: "100%", marginTop: "0.2rem" }}
                                  onClick={() => removeFromSuperset(day.uid, it.uid)}
                                >↗ Ungroup</button>
                              }
                            />
                          ))}
                        </div>

                        {/* Inline superset picker (shown after initSuperset) */}
                        {supersetPickerState?.supersetId === supersetId ? (
                          <div
                            className="no-print"
                            style={{ borderTop: "1px solid rgba(217,119,6,0.25)", padding: "0.35rem 0.5rem", background: "rgba(217,119,6,0.04)" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                              <input
                                className="input"
                                autoFocus
                                placeholder="Search to add exercise…"
                                value={supersetPickerState.search}
                                onChange={(e) => setSupersetPickerState(s => s ? { ...s, search: e.target.value } : s)}
                                style={{ flex: 1, fontSize: "0.72rem", padding: "0.22rem 0.35rem" }}
                              />
                              <button
                                type="button"
                                className="btn btn-ghost"
                                style={{ fontSize: "0.66rem", padding: "0.18rem 0.4rem", color: "var(--muted)" }}
                                onClick={() => setSupersetPickerState(null)}
                              >✕</button>
                            </div>
                            {supersetPickerState.search.trim().length > 0 && (() => {
                              const q = supersetPickerState.search.trim().toLowerCase();
                              const hits = MOVEMENT_LIBRARY.filter(m => m.name.toLowerCase().includes(q) || m.category.includes(q)).slice(0, 8);
                              return hits.length ? (
                                <div style={{ marginTop: "0.3rem", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                                  {hits.map(m => (
                                    <button
                                      key={m.id}
                                      type="button"
                                      className="btn btn-ghost"
                                      style={{ textAlign: "left", fontSize: "0.72rem", padding: "0.2rem 0.4rem", justifyContent: "flex-start" }}
                                      onClick={() => {
                                        const { dayUid, supersetId } = supersetPickerState;
                                        // Build the new item and assign superset_id in one setDays call
                                        const newUid = `${m.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                                        setDays(d => d.map(day => {
                                          if (day.uid !== dayUid) return day;
                                          const newItem: ProgramItem = {
                                            uid: newUid,
                                            movement: m,
                                            is_warmup: false,
                                            sets: 3, reps: "8-10", exertion_score: 7,
                                            same_format: true, set_rows: [], variations: [],
                                            rest_seconds: 60,
                                            equipment_list: (m.equipment_list ?? []) as Equipment[],
                                            equipment_specifics: m.equipment_specifics,
                                            superset_id: supersetId,
                                          };
                                          return { ...day, items: [...day.items, newItem] };
                                        }));
                                        setSupersetPickerState(null);
                                      }}
                                    >
                                      <strong>{m.name}</strong>
                                      <span className="meta" style={{ marginLeft: "0.4rem", fontSize: "0.67rem" }}>{CATEGORY_LABELS[m.category]}</span>
                                    </button>
                                  ))}
                                </div>
                              ) : <p className="meta" style={{ fontSize: "0.72rem", margin: "0.25rem 0 0" }}>No matches</p>;
                            })()}
                          </div>
                        ) : (
                          /* + Add to superset button */
                          <button
                            type="button"
                            className="btn btn-ghost no-print"
                            style={{ width: "100%", fontSize: "0.62rem", padding: "0.2rem 0.5rem", borderRadius: 0, borderTop: "1px solid rgba(217,119,6,0.2)", color: "var(--amber)" }}
                            onClick={() => setSupersetPickerState({ dayUid: day.uid, supersetId, search: "" })}
                          >⊞ + Add exercise to Super Set</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

        </div>

        {/* Add day */}
        <button className="btn btn-ghost no-print" onClick={addDay} style={{ whiteSpace: "nowrap", marginTop: "0.5rem", padding: "0.5rem 0.85rem" }}>+ Add day</button>
      </section>
    </div>{/* end library+main grid */}

    {/* ─── Bottom actions ─── */}
    <div className="no-print" style={{ display: "flex", gap: "0.5rem", marginTop: "1.25rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
      {saveMessage && <span style={{ color: "var(--sage)", fontSize: "0.82rem", alignSelf: "center", marginRight: "0.25rem" }}>{saveMessage}</span>}
      {saveError && <span style={{ color: "var(--red)", fontSize: "0.82rem", alignSelf: "center", marginRight: "0.25rem" }}>{saveError}</span>}
      <button className="btn btn-ghost" onClick={() => window.print()}>Print</button>
      <button className="btn btn-ghost" onClick={() => persist(false)} disabled={savePending}>{savePending ? "…" : "Save draft"}</button>
      <button className="btn btn-primary" onClick={() => persist(true)} disabled={savePending}>{savePending ? "Publishing…" : "Publish"}</button>
    </div>

    {/* ─── Import from Programs modal (stub) ─── */}
    {importDayModalUid && (
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(23,19,17,0.45)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}
        onClick={() => setImportDayModalUid(null)}
      >
        <div className="card" style={{ width: "min(520px, 90vw)", padding: "1.5rem" }} onClick={(e) => e.stopPropagation()}>
          <h3 style={{ margin: 0 }}>Import from Programs</h3>
          <p className="meta" style={{ marginTop: "0.5rem", fontSize: "0.84rem" }}>
            Past program browser — coming soon. This will let you browse and copy days from previous programs into this day.
          </p>
          <button className="btn btn-ghost" style={{ marginTop: "1rem" }} onClick={() => setImportDayModalUid(null)}>Close</button>
        </div>
      </div>
    )}
    </>
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
          cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "space-between", fontFamily: "inherit",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "0.88rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
          {open ? "▾" : "▸"} Sessions This Week
        </h3>
        <span className="meta" style={{ fontSize: "0.76rem" }}>
          {sessions.length} total · {programmed.length} programmed · {needs.length} pending
        </span>
      </button>
      {open && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "0.75rem" }}>
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

// ─── Variation dropdown (compact multi-select) ──────────────────────────────
function VariationDropdown({ value, onChange }: {
  value: Variation[];
  onChange: (v: Variation[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const label =
    value.length === 0 ? "Spec"
    : value.length === 1 ? VARIATION_LABELS[value[0]]
    : `${value.length} specs`;

  function toggleV(v: Variation) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  }

  return (
    <div
      style={{ position: "relative", display: "inline-flex" }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          fontSize: "0.67rem",
          padding: "0.16rem 0.28rem",
          borderRadius: 3,
          border: value.length > 0 ? "1px solid var(--ink)" : "1px solid var(--line)",
          background: value.length > 0 ? "rgba(0,0,0,0.07)" : "transparent",
          color: value.length > 0 ? "var(--ink)" : "var(--muted)",
          cursor: "pointer",
          fontFamily: "inherit",
          whiteSpace: "nowrap",
          width: 68,
          overflow: "hidden",
          textOverflow: "ellipsis",
          textAlign: "left",
        }}
        title={value.map((v) => VARIATION_LABELS[v]).join(", ") || "Spec"}
      >
        {label} {open ? "▴" : "▾"}
      </button>
      {open && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 0,
          zIndex: 100,
          background: "var(--paper)",
          border: "1px solid var(--line)",
          borderRadius: 4,
          padding: "0.3rem 0.45rem",
          minWidth: 112,
          boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
        }}>
          {VARIATIONS.map((v) => (
            <label
              key={v}
              onMouseDown={(e) => e.preventDefault()} // keep focus in container so blur doesn't close before toggle
              style={{
                display: "flex", alignItems: "center", gap: "0.3rem",
                fontSize: "0.72rem", cursor: "pointer", padding: "0.1rem 0",
                color: value.includes(v) ? VARIATION_TEXT[v] : undefined,
                fontWeight: value.includes(v) ? 600 : undefined,
              }}
            >
              <input type="checkbox" checked={value.includes(v)} onChange={() => toggleV(v)} style={{ cursor: "pointer" }} />
              {VARIATION_LABELS[v]}
            </label>
          ))}
        </div>
      )}
    </div>
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

      {/* Set controls — all inline, no column headers */}
      {(() => {
        const INP: React.CSSProperties = { fontSize: "0.73rem", padding: "0.16rem 0.18rem", textAlign: "center" };
        return (
          <div style={{ marginTop: "0.3rem" }}>
            {/* Toggle + first/shared row */}
            <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.22rem", cursor: "pointer", flexShrink: 0 }}>
                <input type="checkbox" checked={it.same_format} onChange={onToggleSameFormat} style={{ cursor: "pointer" }} />
                <span style={{ fontSize: "0.61rem", color: "var(--muted)", userSelect: "none", whiteSpace: "nowrap" }}>All same</span>
              </label>

              {it.same_format ? (
                <>
                  <input className="input" style={{ ...INP, width: 36 }} type="number" min={1} max={20}
                    value={it.sets} onChange={(e) => onPatch({ sets: Number(e.target.value) || 0 })} title="Sets" placeholder="sets" />
                  <input className="input" style={{ ...INP, width: 46 }}
                    value={it.reps} onChange={(e) => onPatch({ reps: e.target.value })} title="Reps" placeholder="reps" />
                  <VariationDropdown value={it.variations} onChange={(v) => onPatch({ variations: v })} />
                  <EquipmentMultiSelect
                    value={it.equipment_list} specifics={it.equipment_specifics}
                    onChange={(eq, sp) => onPatch({ equipment_list: eq, equipment_specifics: sp })}
                    compact
                  />
                  <input className="input" style={{ flex: "1 1 52px", minWidth: 0, fontSize: "0.72rem", padding: "0.16rem 0.2rem" }}
                    placeholder="Notes…" value={it.notes ?? ""} onChange={(e) => onPatch({ notes: e.target.value })} />
                  <select className="select" style={{ ...INP, width: 72 }}
                    value={it.exertion_score} onChange={(e) => onPatch({ exertion_score: Number(e.target.value) })}>
                    {Object.entries(EXERTION_SHORT).map(([k, v]) => <option key={k} value={k}>{k}–{v}</option>)}
                  </select>
                </>
              ) : (
                <>
                  <input className="input" style={{ ...INP, width: 36 }} type="number" min={1} max={10}
                    value={it.sets} onChange={(e) => onPatch({ sets: Number(e.target.value) || 1 })} title="Sets" />
                  <EquipmentMultiSelect
                    value={it.equipment_list} specifics={it.equipment_specifics}
                    onChange={(eq, sp) => onPatch({ equipment_list: eq, equipment_specifics: sp })}
                    compact
                  />
                </>
              )}
            </div>

            {/* Per-set rows */}
            {!it.same_format && (
              <div style={{ marginTop: "0.2rem", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                {it.set_rows.map((row, si) => (
                  <div key={si} style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
                    <span style={{ minWidth: 30, fontSize: "0.65rem", color: "var(--muted)", fontWeight: 600, flexShrink: 0 }}>S{si + 1}</span>
                    <input className="input" style={{ ...INP, width: 46 }}
                      value={row.reps} onChange={(e) => onPatchSetRow(si, { reps: e.target.value })} title="Reps" placeholder="reps" />
                    <VariationDropdown value={row.variations ?? []} onChange={(v) => onPatchSetRow(si, { variations: v })} />
                    <input className="input" style={{ flex: "1 1 50px", minWidth: 0, fontSize: "0.71rem", padding: "0.16rem 0.2rem" }}
                      placeholder="Notes…" value={row.notes ?? ""} onChange={(e) => onPatchSetRow(si, { notes: e.target.value })} />
                    <select className="select" style={{ ...INP, width: 70 }}
                      value={row.exertion_score} onChange={(e) => onPatchSetRow(si, { exertion_score: Number(e.target.value) })}>
                      {Object.entries(EXERTION_SHORT).map(([k, v]) => <option key={k} value={k}>{k}–{v}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            )}
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
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.75rem", marginTop: "0.5rem", alignItems: "start" }}>
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

// ─── Library leaf row: checkbox + drag handle + add-to-selected-day btn ──
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
        <input
          type="checkbox"
          readOnly
          checked={inProgram}
          aria-label="In program"
          style={{ cursor: "default", marginTop: "0.15rem", flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: "0.82rem" }}>{leaf.label}</div>
        </div>
        <button
          type="button"
          className="btn btn-ghost no-print"
          style={{ padding: "0.04rem 0.32rem", fontSize: "0.72rem", flexShrink: 0, color: "var(--muted)" }}
          onClick={(e) => { e.stopPropagation(); onAdd(); }}
          title="Add to active day"
        >+</button>
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
  const showSpecifics = value.includes("machine") || value.includes("other");
  const fullLabel = value.length === 0 ? "Equipment" : value.length <= 2 ? value.map(v => EQUIPMENT_OPTIONS.find(o => o.value === v)?.label ?? v).join(", ") : `${value.length} equip.`;
  const compactLabel = value.length === 0 ? "Equip." : value.length <= 1 ? (EQUIPMENT_OPTIONS.find(o => o.value === value[0])?.label ?? value[0]).slice(0, 7) : `${value.length} eq.`;
  const label = compact ? compactLabel : fullLabel;

  function toggle(eq: Equipment) {
    const has = value.includes(eq);
    const next = has ? value.filter(x => x !== eq) : [...value, eq];
    onChange(next, next.includes("machine") || next.includes("other") ? specifics : undefined);
  }

  return (
    <div style={{ position: "relative", minWidth: compact ? 0 : 160, flexShrink: compact ? 1 : 0 }}>
      <button
        type="button"
        className="btn btn-ghost"
        style={{
          padding: compact ? "0.16rem 0.28rem" : "0.35rem 0.5rem",
          fontSize: compact ? "0.67rem" : "0.74rem",
          textAlign: "left",
          width: compact ? "auto" : "100%",
          justifyContent: "space-between",
          display: "flex",
          alignItems: "center",
          gap: "0.3rem",
          whiteSpace: "nowrap",
        }}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ fontWeight: value.length ? 600 : 400, color: value.length ? undefined : "var(--muted)" }}>{label}</span>
        <span style={{ fontSize: "0.58rem" }}>▾</span>
      </button>
      {open ? (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            zIndex: 10,
            background: "var(--paper)",
            border: "1px solid var(--line)",
            borderRadius: 3,
            padding: "0.4rem",
            minWidth: 200,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            marginTop: 2
          }}
          onMouseLeave={() => setOpen(false)}
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
          <button type="button" className="btn btn-ghost" style={{ width: "100%", marginTop: "0.4rem", padding: "0.25rem", fontSize: "0.7rem" }} onClick={() => setOpen(false)}>Done</button>
        </div>
      ) : null}
    </div>
  );
}
