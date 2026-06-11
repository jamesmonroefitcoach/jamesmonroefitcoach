import { redirect } from "next/navigation";

// Legacy /template — folded into /new-way. Existing ?sheet=<id> deep
// links still work: the new-way workspace receives the param and the
// Template view inside it loads the matching sheet.
export default async function TemplateLegacyRedirect({
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
  qs.set("view", "template");
  redirect(`/coach/programming/build/new-way${qs.toString() ? `?${qs.toString()}` : ""}`);
}
