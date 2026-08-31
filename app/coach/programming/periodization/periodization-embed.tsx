"use client";
import { useCallback, useEffect, useRef } from "react";

// Auto-sizing embed for /periodization.html — the printable periodization reference.
//
// Same isolation trick as WeekPlanEmbed: the sheet lives in a plain HTML file
// with its own print CSS, so the app's landscape print rules can't reach it.
// Save PDF inside the frame calls window.print() in the frame's own document,
// which keeps the sidebar and tabs out of the output.
export default function PeriodizationEmbed() {
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
    // The notes box grows as it's typed into, so keep following the height.
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
      src="/periodization.html"
      title="Periodized Training"
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
