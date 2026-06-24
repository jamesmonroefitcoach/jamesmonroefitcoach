import { redirect } from "next/navigation";

// The standalone Templates tab has been folded into Build Program. The
// Template format now lives there as a build-format choice (pick a client →
// Gym Session / At-home Program → Template). This route just forwards any
// old links (including deep-links) into the builder.
export default async function TemplatesPage({
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
  redirect(`/coach/programming/build/new-way${qs.toString() ? `?${qs.toString()}` : ""}`);
}
