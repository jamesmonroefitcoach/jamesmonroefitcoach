// Check-ins — shared list/create helpers for client + coach surfaces.

import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";

export type CheckInRow = {
  id: string;
  client_id: string;
  coach_id: string | null;
  submitted_at: string;
  weight_lb: number | null;
  body_fat_pct: number | null;
  satisfaction: number | null;
  nutrition_conf: number | null;
  sleep_recovery: number | null;
  commitment: number | null;
  goals_text: string | null;
  improvement_text: string | null;
  challenges: string | null;
  injuries: string | null;
};

const COLS =
  "id, client_id, coach_id, submitted_at, weight_lb, body_fat_pct, " +
  "satisfaction, nutrition_conf, sleep_recovery, commitment, " +
  "goals_text, improvement_text, challenges, injuries";

export async function listCheckInsForClient(clientId: string): Promise<CheckInRow[]> {
  if (!hasSupabaseEnv()) return [];
  const { data, error } = await createSupabaseAdmin()
    .from("check_ins")
    .select(COLS)
    .eq("client_id", clientId)
    .order("submitted_at", { ascending: false });
  if (error || !data) return [];
  return data as unknown as CheckInRow[];
}

export async function getCheckInCadenceDays(clientId: string): Promise<number> {
  if (!hasSupabaseEnv()) return 14;
  const { data } = await createSupabaseAdmin()
    .from("client_details")
    .select("check_in_cadence_days")
    .eq("profile_id", clientId)
    .maybeSingle<{ check_in_cadence_days: number | null }>();
  return data?.check_in_cadence_days ?? 14;
}

export type CadenceStatus = {
  cadenceDays: number;
  lastSubmittedAt: string | null;
  nextDueAt: string | null;        // ISO; null if never submitted
  overdueDays: number;             // > 0 = overdue, 0 = due today, < 0 = upcoming
};

export function calcCadenceStatus(rows: CheckInRow[], cadenceDays: number): CadenceStatus {
  const last = rows[0]?.submitted_at ?? null;
  if (!last) return { cadenceDays, lastSubmittedAt: null, nextDueAt: null, overdueDays: 0 };
  const nextDue = new Date(new Date(last).getTime() + cadenceDays * 86_400_000);
  const today = new Date();
  // Day-granularity diff
  const ms = today.getTime() - nextDue.getTime();
  const overdueDays = Math.floor(ms / 86_400_000);
  return {
    cadenceDays,
    lastSubmittedAt: last,
    nextDueAt: nextDue.toISOString(),
    overdueDays,
  };
}

export type CheckInInsert = {
  client_id: string;
  coach_id?: string | null;
  submitted_at?: string | null;
  weight_lb?: number | null;
  body_fat_pct?: number | null;
  satisfaction?: number | null;
  nutrition_conf?: number | null;
  sleep_recovery?: number | null;
  commitment?: number | null;
  goals_text?: string | null;
  improvement_text?: string | null;
  challenges?: string | null;
  injuries?: string | null;
  raw_survey?: Record<string, unknown> | null;
};

export async function insertCheckIn(input: CheckInInsert): Promise<CheckInRow | null> {
  if (!hasSupabaseEnv()) return null;
  const row: Record<string, unknown> = {
    client_id: input.client_id,
    coach_id: input.coach_id ?? null,
    weight_lb: input.weight_lb ?? null,
    body_fat_pct: input.body_fat_pct ?? null,
    satisfaction: input.satisfaction ?? null,
    nutrition_conf: input.nutrition_conf ?? null,
    sleep_recovery: input.sleep_recovery ?? null,
    commitment: input.commitment ?? null,
    goals_text: input.goals_text ?? null,
    improvement_text: input.improvement_text ?? null,
    challenges: input.challenges ?? null,
    injuries: input.injuries ?? null,
    raw_survey: input.raw_survey ?? null,
  };
  if (input.submitted_at) row.submitted_at = input.submitted_at;

  const { data, error } = await createSupabaseAdmin()
    .from("check_ins")
    .insert(row)
    .select(COLS)
    .single();
  if (error || !data) return null;
  return data as unknown as CheckInRow;
}

export async function getCoachIdForClient(clientId: string): Promise<string | null> {
  if (!hasSupabaseEnv()) return null;
  const { data } = await createSupabaseAdmin()
    .from("client_details")
    .select("coach_id")
    .eq("profile_id", clientId)
    .maybeSingle<{ coach_id: string | null }>();
  return data?.coach_id ?? null;
}
