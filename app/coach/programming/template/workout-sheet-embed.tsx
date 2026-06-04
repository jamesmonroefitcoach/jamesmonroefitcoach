"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Embed the interactive workout sheet (public/workout-sheet.html, a copy of
// samples/client-materials/workout-sheet.html) in a same-origin auto-sizing
// iframe. Inline JS in that file keeps everything working (Add Day, +Set,
// +Row, drag-resize, Save PDF, Send) while staying isolated from the app CSS.
//
// When user/clients/sessions are passed in, we do a postMessage handshake so
// the embedded sheet can hit /api/workout-sheets/* — the iframe sends a
// "ready" message on load and we reply with the init payload (user context,
// clients list for the combo box, sessions list for the Save modal, and an
// optional sheetId to open an existing sheet).

export type ClientLite = { id: string; name: string };
export type SessionLite = { id: string; label: string; client_id: string };
export type UserLite = { id: string; name: string; role: string };

export default function WorkoutSheetEmbed({
  sheetId,
  user,
  clients,
  sessions,
}: {
  sheetId?: string;
  user?: UserLite | null;
  clients?: ClientLite[];
  sessions?: SessionLite[];
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const router = useRouter();

  // auto-resize the iframe to fit its content
  function resize() {
    const f = ref.current;
    if (!f) return;
    try {
      const doc = f.contentDocument;
      if (doc) f.style.height = doc.documentElement.scrollHeight + "px";
    } catch {
      /* cross-origin — shouldn't happen for /public */
    }
  }

  // message handshake with the embedded sheet
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return;
      const data = ev.data as { type?: string } | null;
      if (!data || typeof data !== "object") return;
      if (data.type === "mfc.workout-sheet.ready" && user) {
        ref.current?.contentWindow?.postMessage(
          {
            type: "mfc.workout-sheet.init",
            user,
            clientList: clients ?? [],
            sessionList: sessions ?? [],
            sheetId: sheetId ?? null,
          },
          window.location.origin
        );
      }
      if (data.type === "mfc.workout-sheet.saved") {
        // reload parent data (sheets lists, etc.)
        router.refresh();
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [user, clients, sessions, sheetId, router]);

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

  // Cache-bust by sheetId so opening a different saved sheet remounts the iframe.
  const src = sheetId ? `/workout-sheet.html?sheet=${sheetId}` : "/workout-sheet.html";

  return (
    <section className="shell" style={{ paddingTop: "0.75rem" }}>
      <header>
        <span className="badge">Coach</span>
        <h1 style={{ marginTop: "0.5rem" }}>Workout Sheet</h1>
        <p className="meta">
          Interactive sheet — type set-by-set, add days/sets/rows, drag column dividers, then
          Save (to a client), Save&nbsp;PDF, or Send. Edits auto-sync once the sheet is saved.
        </p>
      </header>
      <hr className="divider" />
      <iframe
        ref={ref}
        src={src}
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
