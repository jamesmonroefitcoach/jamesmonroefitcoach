"use client";
import WorkoutSheetEmbed from "@/components/workout-sheet-embed";

// Open-access client view of a workout sheet. Renders the same interactive
// sheet the app uses, in client-fill mode (role "client" freezes the coach's
// prescription; the client fills weights / notes and hits "Save changes").
// All I/O goes through the public token endpoint — no login.
export default function PublicSheetClient({
  token,
  sheetId,
  clientId,
  clientName,
}: {
  token: string;
  sheetId: string;
  clientId: string | null;
  clientName: string;
}) {
  return (
    <div style={{ width: "min(1180px, 100% - 2rem)", margin: "0.6rem auto 2rem" }}>
      <div style={{ padding: "0.6rem 0.2rem 0.8rem" }}>
        <strong style={{ fontFamily: "Oswald, sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Monroe Fit Coach
        </strong>
      </div>
      <WorkoutSheetEmbed
        user={{ id: clientId ?? "public-client", name: clientName, role: "client" }}
        clients={clientId ? [{ id: clientId, name: clientName }] : []}
        sessions={[]}
        sheetId={sheetId}
        publicToken={token}
        onSaved={() => { /* public link: stay put, no navigation */ }}
      />
    </div>
  );
}
