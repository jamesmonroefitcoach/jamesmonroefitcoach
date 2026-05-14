"use server";

import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";
import { revalidatePath } from "next/cache";

// Send a feedback message tied to a specific program. Resolves the coach and
// client from the programs row, upserts the (coach, client) DM thread, and
// posts a message that includes a link to the program. Both the coach (giving
// feedback on a client-created program) and the client (requesting feedback)
// can call this — the sender is whoever is logged in.

export type SendProgramFeedbackInput = {
  programId: string;
  body: string;
};

export async function sendProgramFeedback(
  input: SendProgramFeedbackInput,
): Promise<{ ok: boolean; error?: string }> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "unauthorized" };
  const body = input.body.trim();
  if (!body) return { ok: false, error: "Write a message first." };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };

  const supabase = createSupabaseAdmin();
  const { data: prog, error: progErr } = await supabase
    .from("programs")
    .select("id, name, coach_id, client_id, created_by_client")
    .eq("id", input.programId)
    .maybeSingle();
  if (progErr || !prog) return { ok: false, error: "Program not found." };

  const coachId = (prog as any).coach_id as string;
  const clientId = (prog as any).client_id as string;

  // Verify the sender is one of the two parties
  if (me.id !== coachId && me.id !== clientId) {
    return { ok: false, error: "Not your program to comment on." };
  }

  // Default DM thread per (coach, client)
  const { data: th, error: thErr } = await supabase
    .from("message_threads")
    .upsert(
      { coach_id: coachId, client_id: clientId, topic: null },
      { onConflict: "coach_id,client_id,topic" }
    )
    .select("id")
    .single();
  if (thErr || !th?.id) return { ok: false, error: thErr?.message ?? "thread create failed" };

  // Program link path depends on who's reading: client sees their portal
  // route, coach jumps into the builder. We include both so each side has
  // something useful to click.
  const programName = (prog as any).name as string;
  const isCoachSender = me.id === coachId;
  const intro = isCoachSender
    ? `Feedback on your program "${programName}":`
    : `Hey James — can I get feedback on my program "${programName}"?`;
  const clientLink = `/client/programming/view/${input.programId}`;
  const coachLink = `/coach/clients/${clientId}#programs`;
  const messageBody = `${intro}\n\n${body}\n\n— Program (client view): ${clientLink}\n— Client profile (coach view): ${coachLink}`;

  const { error: msgErr } = await supabase
    .from("messages")
    .insert({
      thread_id: th.id,
      sender_id: me.id,
      body: messageBody,
    });
  if (msgErr) return { ok: false, error: msgErr.message };

  revalidatePath("/coach/messages");
  revalidatePath("/client/messages");
  return { ok: true };
}
