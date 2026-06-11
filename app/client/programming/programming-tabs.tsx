"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Client Programming top tabs: View / Build / Library
// View has Current + Completed collapsibles. Tap a Current row → program
// detail → choose Sheet or In-App Inputs to complete. The Build tab is the
// client's own structured builder. Library still groups Exercise Library +
// Materials behind its own sub-tab nav.
export default function ClientProgrammingTabs() {
  const path = usePathname() ?? "";
  const isBuild   = path === "/client/programming/build" || path.startsWith("/client/programming/build/");
  const isLibrary = path.startsWith("/client/programming/library");
  // View is the catch-all (covers /client/programming, /programs/[id], /view/[id])
  const isView    = !isBuild && !isLibrary;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "0.55rem 1.4rem",
    background: "transparent",
    border: "none",
    borderBottom: active ? "2px solid var(--rust)" : "2px solid transparent",
    marginBottom: "-2px",
    fontFamily: "inherit",
    fontSize: "0.95rem",
    fontWeight: active ? 700 : 400,
    color: active ? "var(--rust)" : "var(--muted)",
    cursor: "pointer",
    letterSpacing: active ? "0.01em" : undefined,
    textDecoration: "none",
  });

  return (
    <div className="no-print" style={{ width: "min(1180px, 100% - 2rem)", margin: "1rem auto 0" }}>
      <nav
        style={{
          borderBottom: "2px solid var(--line)",
          display: "flex",
          alignItems: "flex-end",
          gap: "0.25rem",
          overflowX: "auto",
        }}
      >
        <Link href="/client/programming" style={tabStyle(isView)}>View</Link>
        <Link href="/client/programming/build" style={tabStyle(isBuild)}>Build</Link>
        <Link href="/client/programming/library/exercise-library" style={tabStyle(isLibrary)}>Library</Link>
      </nav>
    </div>
  );
}
