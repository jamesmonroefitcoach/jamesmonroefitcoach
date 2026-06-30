import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listClients, listAppointmentsForClient, listAppointmentsForWeek, listMovements } from "@/lib/data";
import { pastProgramsForClient } from "@/lib/programs";
import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import type { ClientProgramItem } from "../page";
import NewWayClient from "./new-way-client";

// New Way — the unified Build sub-tab. Lobby (Step 1 client → Step 2 build
// type → Step 3 pick entity or new) → workspace with an In App | Template
// toggle that switches between the structured WIP builder and the
// interactive workout sheet for the same program. Both views save through
// the program↔sheet bridge so editing one updates the other.
export default async function NewWayPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: "session" | "program";
    client?: string;
    appt?: string;
    starts?: string;
    program?: string;
    view?: "inapp" | "template";
    new?: string;
  }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  const sp = await searchParams;
  const type: "session" | "program" =
    sp.type === "program" ? "program" : "session";

  const clients = await listClients(user.id);
  const libraryMovements = await listMovements();

  // ── Session-mode initial data ──
  const initialClientId =
    sp.client ??
    (type === "program"
      ? clients.filter((c) => c.needs_at_home_programming)[0]?.id ?? clients[0]?.id ?? ""
      : clients[0]?.id ?? "");
  const initialApptId = sp.appt ?? "";
  const initialStartsAt = sp.starts ?? "";

  const now = new Date().toISOString();
  const rawAppts = initialClientId ? await listAppointmentsForClient(initialClientId) : [];
  const initialAppts = rawAppts
    .filter(
      (a) =>
        a.session_type === "session" &&
        (a.id === initialApptId ||
          ((a.status === "scheduled" || a.status === "change_requested") && a.starts_at >= now))
    )
    .map((a) => ({
      id: a.id,
      starts_at: a.starts_at,
      ends_at: a.ends_at,
      status: a.status,
      program_status: a.program_status,
      session_program_id: a.session_program_id ?? null,
    }));

  // ── Program-mode initial data ──
  const flaggedClients = clients.filter((c) => c.lifecycle === "active" && c.needs_at_home_programming);
  const clientProgramSummary: ClientProgramItem[] = flaggedClients.map((c) => {
    const current = pastProgramsForClient(c.id).find(
      (p) => p.is_current && p.program_kind === "at_home"
    ) ?? null;
    const daysUntilEnd = current?.ends_on
      ? Math.ceil((new Date(current.ends_on).getTime() - Date.now()) / 86400000)
      : null;
    return {
      clientId: c.id,
      clientName: c.full_name,
      programName: current?.name ?? null,
      endsOn: current?.ends_on ?? null,
      daysUntilEnd,
      hasCurrent: !!current,
    };
  });

  // ── Quick-actions data ──────────────────────────────────────────────
  // These power the four collapsibles that sit above Step 1 on the lobby:
  // sessions-needing-programming / clients-needing-programming /
  // recently-drafted-sessions / recently-drafted-programs.
  const weekAppts = await listAppointmentsForWeek(user.id);
  const nowMs = Date.now();
  const cutoffMs = nowMs + 7 * 86_400_000;
  const clientNameById = new Map(clients.map((c) => [c.id, c.full_name]));

  const quickSessionsNeeding = weekAppts
    .filter((a) =>
      a.session_type === "session" &&
      a.status !== "cancelled" && a.status !== "no_show" &&
      a.program_status === "needs_programming" &&
      new Date(a.starts_at).getTime() >= nowMs &&
      new Date(a.starts_at).getTime() <= cutoffMs
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, 12)
    .map((a) => ({
      id: a.id,
      starts_at: a.starts_at,
      client_id: a.client_id ?? "",
      client_name: a.client_name ?? clientNameById.get(a.client_id ?? "") ?? "—",
    }));

  const quickDraftSessions = weekAppts
    .filter((a) => a.session_type === "session" && a.program_status === "draft")
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, 12)
    .map((a) => ({
      id: a.id,
      starts_at: a.starts_at,
      client_id: a.client_id ?? "",
      client_name: a.client_name ?? clientNameById.get(a.client_id ?? "") ?? "—",
    }));

  // Clients flagged for at-home programming. We surface ALL active flagged
  // clients: those WITHOUT a current at-home program lead the list (need one
  // started); those WITH one drop to the bottom showing the program as status.
  // Reads the live `programs` table (not demo data) so saving/publishing a
  // program updates this list on the next load.
  const currentAtHomeByClient = new Map<string, string>(); // client_id → program name
  if (hasSupabaseEnv()) {
    const { data } = await createSupabaseAdmin()
      .from("programs")
      .select("client_id, name")
      .eq("coach_id", user.id)
      .eq("program_kind", "at_home")
      .eq("is_current", true)
      .is("archived_at", null);
    (data ?? []).forEach((p: { client_id: string; name: string }) => {
      if (p.client_id && !currentAtHomeByClient.has(p.client_id)) {
        currentAtHomeByClient.set(p.client_id, p.name);
      }
    });
  }
  const quickClientsNeeding = clients
    .filter((c) => c.lifecycle === "active" && c.needs_at_home_programming)
    .map((c) => ({
      id: c.id,
      name: c.full_name,
      hasCurrent: currentAtHomeByClient.has(c.id),
      programName: currentAtHomeByClient.get(c.id) ?? null,
    }))
    // Needs-one first; clients already covered sink to the bottom.
    .sort((a, b) => Number(a.hasCurrent) - Number(b.hasCurrent))
    .slice(0, 20);

  // Recently drafted programs — is_published=false rows with a builder_state
  // (so we know there's actual in-progress work to come back to).
  type DraftProgram = {
    id: string;
    name: string;
    client_id: string;
    client_name: string;
    created_at: string;
    program_kind: "in_gym" | "at_home";
  };
  let quickDraftPrograms: DraftProgram[] = [];
  if (hasSupabaseEnv()) {
    const { data } = await createSupabaseAdmin()
      .from("programs")
      .select("id, name, client_id, created_at, program_kind, is_published, builder_state")
      .eq("coach_id", user.id)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(12);
    quickDraftPrograms = (data ?? []).map((p: { id: string; name: string; client_id: string; created_at: string; program_kind: "in_gym" | "at_home" }) => ({
      id: p.id,
      name: p.name,
      client_id: p.client_id,
      client_name: clientNameById.get(p.client_id) ?? "—",
      created_at: p.created_at,
      program_kind: p.program_kind,
    }));
  }

  return (
    <NewWayClient
      user={{ id: user.id, name: user.name, role: user.role }}
      initialType={type}
      clients={clients}
      libraryMovements={libraryMovements}
      initialClientId={initialClientId}
      initialAppts={initialAppts}
      initialApptId={initialApptId}
      initialStartsAt={initialStartsAt}
      initialProgramId={sp.program ?? ""}
      initialView={sp.view === "inapp" ? "inapp" : "template"}
      initialNew={sp.new === "1"}
      clientProgramSummary={clientProgramSummary}
      quickSessionsNeeding={quickSessionsNeeding}
      quickClientsNeeding={quickClientsNeeding}
      quickDraftSessions={quickDraftSessions}
      quickDraftPrograms={quickDraftPrograms}
    />
  );
}
