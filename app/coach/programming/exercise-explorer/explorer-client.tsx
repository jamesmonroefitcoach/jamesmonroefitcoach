"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExternalExercise, ViewSource } from "@/lib/external-exercises";
import { MOVEMENT_PATTERN_LABELS } from "@/lib/external-exercises";
import ExerciseGrid from "./ExerciseGrid";
import ExerciseDetailModal from "./ExerciseDetailModal";

const SOURCES: { value: ViewSource; label: string; sub: string }[] = [
  { value: "library", label: "Current Library", sub: "App taxonomy" },
  { value: "rapidapi", label: "ExerciseDB", sub: "Animated GIFs" },
  { value: "free-db", label: "Free DB", sub: "Static images" },
];

function uniq<T extends string>(values: T[]): T[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

export default function ExplorerClient({
  cached,
  library,
  supabaseReady,
}: {
  cached: ExternalExercise[];
  library: ExternalExercise[];
  supabaseReady: boolean;
}) {
  const router = useRouter();
  const [source, setSource] = useState<ViewSource>("library");
  const [search, setSearch] = useState("");
  const [pattern, setPattern] = useState("all");
  const [muscle, setMuscle] = useState("all");
  const [equipment, setEquipment] = useState("all");
  const [selected, setSelected] = useState<ExternalExercise | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const activeList = useMemo(
    () => (source === "library" ? library : cached.filter((e) => e.source === source)),
    [source, library, cached]
  );

  const patterns = useMemo(() => uniq(activeList.map((e) => e.movement_pattern)), [activeList]);
  const muscles = useMemo(
    () => uniq(activeList.map((e) => e.target_muscle).filter(Boolean) as string[]),
    [activeList]
  );
  const equipments = useMemo(
    () => uniq(activeList.map((e) => e.equipment).filter(Boolean) as string[]),
    [activeList]
  );

  const filtered = useMemo(
    () =>
      activeList.filter((e) => {
        if (pattern !== "all" && e.movement_pattern !== pattern) return false;
        if (muscle !== "all" && e.target_muscle !== muscle) return false;
        if (equipment !== "all" && e.equipment !== equipment) return false;
        if (search.trim()) {
          const q = search.toLowerCase();
          const hay = [e.name, e.target_muscle, e.equipment, ...e.secondary_muscles]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }),
    [activeList, pattern, muscle, equipment, search]
  );

  function changeSource(s: ViewSource) {
    setSource(s);
    setPattern("all");
    setMuscle("all");
    setEquipment("all");
    setMsg(null);
  }

  async function runSync() {
    if (source === "library") return;
    setSyncing(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/exercise-explorer/sync?source=${source}&limit=80`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Sync failed");
      setMsg(`Synced ${json.inserted} new · ${json.skipped} already cached (${json.fetched} fetched).`);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  const selectStyle: React.CSSProperties = {
    fontFamily: "inherit",
    fontSize: "0.82rem",
    padding: "0.4rem 0.5rem",
    border: "1px solid var(--line)",
    borderRadius: 4,
    background: "var(--paper)",
    color: "var(--ink)",
  };

  const isExternal = source !== "library";

  return (
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header>
        <span className="badge">Coach</span>
        <h1 style={{ marginTop: "0.5rem" }}>Exercise Explorer</h1>
        <p className="meta">
          Directional sandbox — compare external GIF/image libraries against the app&rsquo;s own
          movement taxonomy to see what&rsquo;s worth building on.
        </p>
      </header>
      <hr className="divider" />

      {/* Source toggle */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {SOURCES.map((s) => {
          const active = s.value === source;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => changeSource(s.value)}
              style={{
                textAlign: "left",
                padding: "0.5rem 0.9rem",
                borderRadius: 5,
                border: active ? "1px solid var(--rust)" : "1px solid var(--line)",
                background: active ? "var(--rust)" : "var(--paper)",
                color: active ? "#fff" : "var(--ink)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "0.86rem" }}>{s.label}</div>
              <div style={{ fontSize: "0.68rem", color: active ? "rgba(255,255,255,0.8)" : "var(--muted)" }}>
                {s.sub}
              </div>
            </button>
          );
        })}
      </div>

      {/* Controls */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          flexWrap: "wrap",
          alignItems: "center",
          marginTop: "1rem",
        }}
      >
        <input
          type="search"
          placeholder="Search exercises…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...selectStyle, flex: "1 1 200px", minWidth: 160 }}
        />
        <select value={pattern} onChange={(e) => setPattern(e.target.value)} style={selectStyle}>
          <option value="all">All patterns</option>
          {patterns.map((p) => (
            <option key={p} value={p}>
              {MOVEMENT_PATTERN_LABELS[p]}
            </option>
          ))}
        </select>
        <select value={muscle} onChange={(e) => setMuscle(e.target.value)} style={selectStyle} disabled={!muscles.length}>
          <option value="all">All muscles</option>
          {muscles.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={equipment}
          onChange={(e) => setEquipment(e.target.value)}
          style={selectStyle}
          disabled={!equipments.length}
        >
          <option value="all">All equipment</option>
          {equipments.map((eq) => (
            <option key={eq} value={eq}>
              {eq}
            </option>
          ))}
        </select>
        {isExternal && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={runSync}
            disabled={syncing || !supabaseReady}
            title={supabaseReady ? "Fetch from the external API and cache it" : "Connect Supabase to sync"}
            style={{ marginLeft: "auto" }}
          >
            {syncing ? "Syncing…" : "Sync from API"}
          </button>
        )}
      </div>

      <div style={{ marginTop: "0.6rem", fontSize: "0.78rem", color: "var(--muted)" }}>
        {filtered.length} {filtered.length === 1 ? "exercise" : "exercises"}
        {msg && <span style={{ marginLeft: "0.75rem", color: "var(--ink)" }}>{msg}</span>}
      </div>

      <div style={{ marginTop: "1rem", paddingBottom: "3rem" }}>
        {filtered.length > 0 ? (
          <ExerciseGrid items={filtered} onSelect={setSelected} />
        ) : (
          <EmptyState source={source} supabaseReady={supabaseReady} />
        )}
      </div>

      <ExerciseDetailModal exercise={selected} onClose={() => setSelected(null)} />
    </main>
  );
}

function EmptyState({ source, supabaseReady }: { source: ViewSource; supabaseReady: boolean }) {
  let body: React.ReactNode;
  if (source === "library") {
    body = "No matches — try clearing the search or filters.";
  } else if (!supabaseReady) {
    body =
      "Connect Supabase (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) and run migration 0014, then use “Sync from API”.";
  } else if (source === "rapidapi") {
    body =
      "Nothing cached yet. Add EXERCISEDB_RAPIDAPI_KEY to your env, then hit “Sync from API” to pull animated GIFs.";
  } else {
    body = "Nothing cached yet. Hit “Sync from API” to pull the keyless free-exercise-db images.";
  }
  return (
    <div
      style={{
        border: "1px dashed var(--line)",
        borderRadius: 6,
        padding: "2rem 1.5rem",
        textAlign: "center",
        color: "var(--muted)",
        fontSize: "0.86rem",
        maxWidth: 540,
        margin: "0 auto",
      }}
    >
      {body}
    </div>
  );
}
