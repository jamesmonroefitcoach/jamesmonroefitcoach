"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ClientProgrammingTabs() {
  const path = usePathname() ?? "";
  const isBuild    = path.startsWith("/client/programming/build");
  const isLibrary  = path.startsWith("/client/programming/exercise-library");
  const isMaterials = path.startsWith("/client/programming/materials");
  const isView     = !isBuild && !isLibrary && !isMaterials;

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
      <nav style={{ borderBottom: "2px solid var(--line)", display: "flex", alignItems: "flex-end", gap: "0.25rem" }}>
        <Link href="/client/programming" style={tabStyle(isView)}>View Program</Link>
        <Link href="/client/programming/build" style={tabStyle(isBuild)}>Build Program</Link>
        <Link href="/client/programming/exercise-library" style={tabStyle(isLibrary)}>Exercise Library</Link>
        <Link href="/client/programming/materials" style={tabStyle(isMaterials)}>Materials</Link>
      </nav>
    </div>
  );
}
