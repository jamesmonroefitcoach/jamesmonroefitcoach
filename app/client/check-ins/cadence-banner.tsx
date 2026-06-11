import type { CadenceStatus } from "@/lib/check-ins";
import { fmtDate } from "@/lib/format";

// Status banner at the top of the check-ins page.
//   Never submitted  →  neutral "First check-in, anytime"
//   Overdue (> 0)    →  red "Overdue by N days"
//   Due today (= 0)  →  amber "Due today"
//   Upcoming (< 0)   →  sage "Next check-in due [date]"
export default function CadenceBanner({ status }: { status: CadenceStatus }) {
  if (!status.lastSubmittedAt) {
    return (
      <Box bg="#fbf7ef" border="var(--line)" color="var(--ink)">
        <strong>First check-in.</strong> Submit any time — there&rsquo;s no due date yet.
      </Box>
    );
  }

  if (status.overdueDays > 0) {
    return (
      <Box bg="#fde6e0" border="#c0392b" color="#5b1d12">
        <strong>Overdue by {status.overdueDays} day{status.overdueDays === 1 ? "" : "s"}.</strong>{" "}
        Last on {fmtDate(status.lastSubmittedAt)}. Take a few minutes when you can.
      </Box>
    );
  }
  if (status.overdueDays === 0) {
    return (
      <Box bg="#fff4d3" border="#d9a300" color="#6b4400">
        <strong>Due today.</strong> Last on {fmtDate(status.lastSubmittedAt)}.
      </Box>
    );
  }
  // upcoming
  const daysUntil = -status.overdueDays;
  return (
    <Box bg="#eef3e6" border="var(--sage)" color="#3d4a30">
      <strong>Next check-in in {daysUntil} day{daysUntil === 1 ? "" : "s"}.</strong>{" "}
      Due {fmtDate(status.nextDueAt!)}. Last on {fmtDate(status.lastSubmittedAt)}.
    </Box>
  );
}

function Box({
  bg,
  border,
  color,
  children,
}: {
  bg: string;
  border: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${border}`,
        color,
        borderRadius: 6,
        padding: "0.7rem 0.9rem",
        marginBottom: "1.2rem",
        fontSize: "0.88rem",
      }}
    >
      {children}
    </div>
  );
}
