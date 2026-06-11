"use server";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import {
  logSet,
  updateRowNote,
  markProgramComplete,
} from "@/lib/program-logger";

type Result = { ok: true } | { ok: false; error: string };

async function ownsRow(programMovementId: string, userId: string): Promise<boolean> {
  if (!hasSupabaseEnv()) return false;
  const { data } = await createSupabaseAdmin()
    .from("program_movements")
    .select("program_days:program_day_id ( programs:program_id ( client_id, coach_id ) )")
    .eq("id", programMovementId)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prog = (data as any)?.program_days?.programs;
  if (!prog) return false;
  return prog.client_id === userId || prog.coach_id === userId;
}

export async function logSetAction(input: {
  programMovementId: string;
  setIndex: number;
  repsActual: string | null;
  weightActual: string | null;
  done: boolean;
}): Promise<Result> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "Not signed in." };
  if (!(await ownsRow(input.programMovementId, me.id))) {
    return { ok: false, error: "Not allowed." };
  }
  const ok = await logSet(input);
  if (!ok) return { ok: false, error: "Save failed." };
  return { ok: true };
}

export async function updateRowNoteAction(
  programMovementId: string,
  note: string
): Promise<Result> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "Not signed in." };
  if (!(await ownsRow(programMovementId, me.id))) {
    return { ok: false, error: "Not allowed." };
  }
  const ok = await updateRowNote(programMovementId, note);
  if (!ok) return { ok: false, error: "Save failed." };
  return { ok: true };
}

export async function markCompleteAction(programId: string): Promise<Result> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "Not signed in." };
  // Reject if the caller doesn't own this program (client_id) or isn't its coach
  const { data } = hasSupabaseEnv()
    ? await createSupabaseAdmin()
        .from("programs")
        .select("client_id, coach_id")
        .eq("id", programId)
        .maybeSingle<{ client_id: string; coach_id: string }>()
    : { data: null };
  if (!data) return { ok: false, error: "Program not found." };
  if (data.client_id !== me.id && data.coach_id !== me.id) {
    return { ok: false, error: "Not allowed." };
  }

  const res = await markProgramComplete(programId);
  if (!res.ok) return { ok: false, error: res.error ?? "Couldn't mark complete." };

  revalidatePath("/client/programming");
  revalidatePath(`/coach/clients/${data.client_id}`);
  revalidatePath("/coach/messages");
  return { ok: true };
}
