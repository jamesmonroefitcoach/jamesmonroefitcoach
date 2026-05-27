"use client";
import { useRef } from "react";

// Embeds the interactive workout sheet (public/workout-sheet.html — a copy of
// samples/client-materials/workout-sheet.html) on the Template page. An iframe
// keeps its inline script/styles fully working (Add Day, + Set, drag-resize,
// auto-save) while staying isolated from the app's CSS. Same-origin, so we can
// read the inner document height and auto-size the frame (no inner scrollbar),
// re-measuring whenever the sheet grows.
export default function WorkoutSheetEmbed() {
  const ref = useRef<HTMLIFrameElement>(null);

  function resize() {
    const f = ref.current;
    if (!f) return;
    try {
      const doc = f.contentDocument;
      if (doc) f.style.height = doc.documentElement.scrollHeight + "px";
    } catch {
      /* cross-origin (shouldn't happen for /public) — leave default height */
    }
  }

  function onLoad() {
    resize();
    try {
      const doc = ref.current?.contentDocument;
      if (doc && "ResizeObserver" in window) {
        const ro = new ResizeObserver(() => resize());
        ro.observe(doc.documentElement);
      }
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="shell" style={{ paddingTop: "0.75rem" }}>
      <header>
        <span className="badge">Coach</span>
        <h1 style={{ marginTop: "0.5rem" }}>Workout Sheet</h1>
        <p className="meta">
          Interactive sheet — type set-by-set, add days/sets/rows, drag column dividers, then
          Save&nbsp;PDF or Send. Entries auto-save in your browser.
        </p>
      </header>
      <hr className="divider" />
      <iframe
        ref={ref}
        src="/workout-sheet.html"
        title="Workout Sheet"
        onLoad={onLoad}
        style={{
          width: "100%",
          minHeight: 600,
          border: "1px solid var(--line)",
          borderRadius: 6,
          display: "block",
          background: "var(--bg)",
        }}
      />
    </section>
  );
}
