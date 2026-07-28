export function fmtMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fmtSessionAgo(d: string | null | undefined): { line1: string; line2: string } | null {
  if (!d) return null;
  const date = new Date(d);
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const monthDay = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { line1: `${weekday}, ${monthDay}`, line2: `${days}d ago` };
}

// The practice runs out of Hyde Park Gym in Austin. Message stamps are pinned
// to that zone on purpose: `created_at` is a timestamptz, and formatting it
// without a timeZone uses whatever zone the *renderer* is in. Server-rendered
// HTML comes off Vercel in UTC, so an 8:54 PM message shipped as "1:54 AM"
// and only ever corrected itself if that subtree happened to re-render.
const PRACTICE_TZ = "America/Chicago";

/** YYYY-MM-DD for a date as seen in Austin — used to test "is this today?". */
function practiceDayKey(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: PRACTICE_TZ });
}

/**
 * Message timestamp in the practice's local time. Today's messages show the
 * time alone; anything older is prefixed with its date, so a message from May
 * can't read as if it arrived this afternoon.
 */
export function fmtMessageStamp(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: PRACTICE_TZ,
  });
  if (practiceDayKey(date) === practiceDayKey(new Date())) return time;
  const day = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: PRACTICE_TZ,
  });
  return `${day}, ${time}`;
}

/**
 * Same rule as fmtMessageStamp, but older entries collapse to the date alone.
 * For the conversation list, where the stamp shares a narrow row with the
 * client's name on a phone.
 */
export function fmtMessageStampShort(d: string | Date | null | undefined): string {
  const full = fmtMessageStamp(d);
  if (!full.includes(",")) return full;
  return full.split(",")[0];
}

export function fmtSessionAway(d: string | null | undefined): { line1: string; line2: string } | null {
  if (!d) return null;
  const date = new Date(d);
  const diffMs = date.getTime() - Date.now();
  const days = Math.floor(diffMs / 86400000);
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const monthDay = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (days <= 0) return { line1: `${weekday}, ${monthDay}`, line2: "today" };
  return { line1: `${weekday}, ${monthDay}`, line2: `${days}d away` };
}
