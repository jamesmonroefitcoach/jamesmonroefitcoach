"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Build Program sub-tabs:
//   New Way | Old Way
// New Way is the unified lobby + workspace at /new-way. Once the lobby
// selection is made, the workspace exposes an In App | Template toggle
// — the two views save through the program↔sheet bridge so editing in
// one updates the other.
// Old Way is the legacy holding pen for pre-merge entry points.
const BASE = "/coach/programming/build";

export default function BuildTabs() {
  const path = usePathname() ?? "";
  if (!path.startsWith(BASE)) return null;

  // /in-app and /template are legacy paths that now redirect to /new-way —
  // keep the tab highlighted while a redirect is in flight.
  const isNewWay =
    path.startsWith(`${BASE}/new-way`) ||
    path.startsWith(`${BASE}/in-app`) ||
    path.startsWith(`${BASE}/template`);

  // The New Way workspace owns its own In App | Template toggle so the
  // sub-tab nav stays out of the way once a selection is made. The lobby
  // still shows it; the workspace hides it via the showTabs override
  // controlled by the page (?started=1).
  // For now we keep it always visible on /new-way — the workspace's own
  // back bar sits below.

  // Old Way covers the landing page plus every legacy route it points at.
  const isOldWay =
    path.startsWith(`${BASE}/old-way`) ||
    path.startsWith(`${BASE}/rework`) ||
    path.startsWith(`${BASE}/programs-rework`) ||
    path.startsWith(`${BASE}/session`) ||
    // /build itself = classic Builder (and the catch-all when nothing else matches)
    path === BASE;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "0.45rem 1.1rem",
    background: "transparent",
    border: "none",
    borderBottom: active ? "2px solid var(--rust)" : "2px solid transparent",
    marginBottom: "-2px",
    fontFamily: "inherit",
    fontSize: "0.86rem",
    fontWeight: active ? 700 : 400,
    color: active ? "var(--rust)" : "var(--muted)",
    cursor: "pointer",
    letterSpacing: active ? "0.01em" : undefined,
    textDecoration: "none",
    whiteSpace: "nowrap",
  });

  return (
    <div className="no-print" style={{ width: "min(1180px, 100% - 2rem)", margin: "0.45rem auto 0" }}>
      <nav
        style={{
          borderBottom: "1px solid var(--line)",
          display: "flex",
          alignItems: "flex-end",
          gap: "0.1rem",
          overflowX: "auto",
        }}
      >
        <Link href={`${BASE}/new-way`} style={tabStyle(isNewWay)}>New Way</Link>
        <Link href={`${BASE}/old-way`} style={tabStyle(isOldWay)}>Old Way</Link>
      </nav>
    </div>
  );
}
