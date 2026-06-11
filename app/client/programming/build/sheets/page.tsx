import { redirect } from "next/navigation";

// Legacy /build/sheets → Template. Preserves any in-flight bookmarks.
export default async function LegacySheetsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ sheet?: string }>;
}) {
  const { sheet } = await searchParams;
  const qs = sheet ? `?sheet=${encodeURIComponent(sheet)}` : "";
  redirect(`/client/programming/build/template${qs}`);
}
