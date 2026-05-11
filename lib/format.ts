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
