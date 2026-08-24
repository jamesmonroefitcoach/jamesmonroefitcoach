"use client";
import { useCallback, useEffect, useRef } from "react";

// Auto-sizing embed for /week-plan.html — the printable weekly template.
//
// Same isolation trick as WorkoutSheetEmbed: the sheet lives in a plain HTML
// file with its own print CSS, so app styles can't disturb the printed page.
// Save PDF inside the frame calls window.print() in the frame's own document,
// which is what keeps the sidebar and tabs out of the output.
export default function WeekPlanEmbed() {
  const ref = useRef<HTMLIFrameElement>(null);

  const resize = useCallback(() => {
    const f = ref.current;
    if (!f) return;
    try {
      const doc = f.contentDocument;
      if (doc) f.style.height = doc.documentElement.scrollHeight + "px";
    } catch {
      /* same-origin, shouldn't happen */
    }
  }, []);

  useEffect(() => {
    // The sheet grows as rows are typed into, so keep following its height.
    const id = window.setInterval(resize, 700);
    return () => window.clearInterval(id);
  }, [resize]);

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
    <iframe
      ref={ref}
      src="/week-plan.html"
      title="Week Plan"
      onLoad={onLoad}
      style={{
        width: "100%",
        minHeight: 700,
        border: "none",
        display: "block",
        background: "var(--bg)",
      }}
    />
  );
}
