import { getWorkoutSheetByPublicToken } from "@/lib/workout-sheets.server";
import PublicSheetClient from "./public-sheet-client";

// Open-access sheet page. No auth: the unguessable token in the URL is the
// capability. James builds an at-home program and texts the client this link;
// the client fills it in like a PDF and it saves back to their program.
export const dynamic = "force-dynamic";

export default async function PublicSheetPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const sheet = await getWorkoutSheetByPublicToken(token);

  if (!sheet) {
    return (
      <div style={{ maxWidth: 520, margin: "4rem auto", padding: "0 1.5rem", textAlign: "center" }}>
        <h1 style={{ fontFamily: "Oswald, sans-serif", fontSize: "1.4rem" }}>Link not found</h1>
        <p className="meta" style={{ marginTop: "0.6rem", color: "var(--muted)" }}>
          This workout-sheet link isn&apos;t valid. Ask your coach to resend it.
        </p>
      </div>
    );
  }

  const clientName = (sheet.sheet_data?.client || "").trim() || "Client";

  return (
    <PublicSheetClient
      token={token}
      sheetId={sheet.id}
      clientId={sheet.client_id}
      clientName={clientName}
    />
  );
}
