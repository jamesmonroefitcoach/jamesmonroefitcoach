"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ProgrammingTabs() {
  const path = usePathname() ?? "";
  const isLibrary   = path.startsWith("/coach/programming/library");
  // Programs is the single home now — the build workspace lives "under" it,
  // reached via Build New + and per-program Edit, so /build/* keeps the
  // Programs tab highlighted (there's no separate Build Program tab).
  const isView      = !isLibrary;

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
    <div
      className="no-print"
      style={{
        width: "min(1180px, 100% - 2rem)",
        margin: "1rem auto 0",
      }}
    >
      <nav
        style={{
          borderBottom: "2px solid var(--line)",
          display: "flex",
          alignItems: "flex-end",
          gap: "0.25rem",
          overflowX: "auto",
        }}
      >
        <Link href="/coach/programming" style={tabStyle(isView)}>Programs</Link>
        <Link href="/coach/programming/library/exercise-library" style={tabStyle(isLibrary)}>Library</Link>
      </nav>
    </div>
  );
}
