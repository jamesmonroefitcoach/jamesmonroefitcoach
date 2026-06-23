import Link from "next/link";
import { listWorkoutSheets } from "@/lib/workout-sheets.server";
import PdfUpload from "./pdf-upload";
import WorkoutSheetsList from "./workout-sheets-list";

export default async function WorkoutSheetsSection({ clientId }: { clientId: string }) {
  const sheets = await listWorkoutSheets({ clientId, limit: 50 });

  return (
    <div className="card" style={{ marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Workout Sheets</h2>
        <Link className="btn btn-primary" href="/coach/programming/build/template">
          + New Sheet
        </Link>
      </div>
      <hr className="divider" />

      <WorkoutSheetsList clientId={clientId} initialSheets={sheets} />

      <PdfUpload clientId={clientId} />
    </div>
  );
}
