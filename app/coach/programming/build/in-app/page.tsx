import { redirect } from "next/navigation";

// Legacy /in-app — folded into /new-way. Preserves any in-flight query
// state so existing deep-links (?type=...&client=...&appt=...) keep
// working through the redirect.
export default async function InAppLegacyRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") qs.set(k, v[0]);
  }
  // Force view=inapp since they came in expecting that.
  qs.set("view", "inapp");
  redirect(`/coach/programming/build/new-way${qs.toString() ? `?${qs.toString()}` : ""}`);
}
