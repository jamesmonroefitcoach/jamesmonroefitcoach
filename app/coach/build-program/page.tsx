import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listClients } from "@/lib/data";
import BuildProgramClient from "./build-program-client";

export default async function BuildProgramPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  const sp = await searchParams;
  const clients = await listClients(user.id);

  return (
    <main className="shell">
      <header>
        <span className="badge">Coach</span>
        <h1 style={{ marginTop: "0.5rem" }}>Build a program</h1>
        <p className="meta">Pick a client. Build the day. Add movements with sets, reps, weight, equipment, and demo links. Print for the floor.</p>
      </header>
      <hr className="divider" />
      <BuildProgramClient clients={clients} initialClientId={sp.client} />
    </main>
  );
}
