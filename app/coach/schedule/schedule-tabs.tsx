"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub-nav for the Schedule section. Used at the top of:
//   /coach/schedule       → Schedule (week/month grid)
//   /coach/appointments   → Appointments queue (change requests + payments)
//   /coach/availability   → Open availability slots
export default function ScheduleTabs() {
  const path = usePathname() ?? "";
  const isAppointments = path.startsWith("/coach/appointments");
  const isAvailability = path.startsWith("/coach/availability");
  const isSchedule = !isAppointments && !isAvailability;

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
        }}
      >
        <Link href="/coach/schedule" style={tabStyle(isSchedule)}>Schedule</Link>
        <Link href="/coach/appointments" style={tabStyle(isAppointments)}>Appointments</Link>
        <Link href="/coach/availability" style={tabStyle(isAvailability)}>Availability</Link>
      </nav>
    </div>
  );
}
