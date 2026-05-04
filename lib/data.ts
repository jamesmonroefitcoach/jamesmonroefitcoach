import { createSupabaseServer, hasSupabaseEnv } from "@/lib/supabase/server";

export type ClientRow = {
  id: string;
  full_name: string;
  email: string | null;
  age_category: string | null;
  goals: string | null;
  regular_frequency: string | null;
  session_rate: number | null;
  test_rate: number | null;
  monthly_revenue: number | null;
  current_weight_lb: number | null;
  goal_weight_lb: number | null;
  tier: "tier_1" | "tier_2" | "tier_3" | null;
  member_since: string | null;
  status: string | null;
  balance_owed: number;
  last_session_at: string | null;
  total_sessions: number;
};

const DEMO_CLIENTS: ClientRow[] = [
  { id: "demo-client-abbey", full_name: "Abbey Archer", email: null, age_category: "22", goals: "Form & knowledge", regular_frequency: "1", session_rate: 100, test_rate: 100, monthly_revenue: 200, current_weight_lb: null, goal_weight_lb: null, tier: "tier_1", member_since: "2026-04-10", status: "current", balance_owed: 0, last_session_at: new Date(Date.now() - 5 * 86400000).toISOString(), total_sessions: 4 },
  { id: "demo-client-acacia", full_name: "Acacia Chan", email: null, age_category: "30", goals: "Weight Loss, muscle, posture", regular_frequency: "2", session_rate: 70, test_rate: 100, monthly_revenue: 280, current_weight_lb: 198, goal_weight_lb: 150, tier: "tier_2", member_since: "2025-03-01", status: "current", balance_owed: 280, last_session_at: new Date(Date.now() - 2 * 86400000).toISOString(), total_sessions: 96 },
  { id: "demo-client-david", full_name: "David Syndicongo", email: null, age_category: "32", goals: "Weight loss, muscle, posture", regular_frequency: "1", session_rate: 65, test_rate: 100, monthly_revenue: 260, current_weight_lb: 229, goal_weight_lb: 180, tier: "tier_2", member_since: "2024-10-01", status: "current", balance_owed: 0, last_session_at: new Date(Date.now() - 6 * 86400000).toISOString(), total_sessions: 71 },
  { id: "demo-client-jen", full_name: "Jen Loving", email: null, age_category: "48", goals: "Body Recomp – 1 Pull Up", regular_frequency: "2", session_rate: 65, test_rate: 100, monthly_revenue: 1040, current_weight_lb: null, goal_weight_lb: 145, tier: "tier_1", member_since: "2025-11-01", status: "current", balance_owed: 0, last_session_at: new Date(Date.now() - 1 * 86400000).toISOString(), total_sessions: 48 },
  { id: "demo-client-rowland", full_name: "Rowland Bella", email: null, age_category: "24", goals: "100 LB weight loss", regular_frequency: "2", session_rate: null, test_rate: 100, monthly_revenue: null, current_weight_lb: 294, goal_weight_lb: 280, tier: "tier_3", member_since: "2025-07-01", status: "current", balance_owed: 0, last_session_at: new Date(Date.now() - 9 * 86400000).toISOString(), total_sessions: 32 }
];

export async function listClients(coachId?: string): Promise<ClientRow[]> {
  if (!hasSupabaseEnv()) return DEMO_CLIENTS;
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("profiles")
    .select(`
      id, full_name, email,
      details:client_details!client_details_profile_id_fkey (
        age_category, goals, regular_frequency, session_rate, test_rate,
        monthly_revenue, current_weight_lb, goal_weight_lb, tier, member_since, status, coach_id
      ),
      balance:client_balance!client_balance_client_id_fkey ( balance_owed )
    `)
    .eq("role", "client");
  if (error || !data) return DEMO_CLIENTS;

  const baseRows: (ClientRow | null)[] = data
    .map((p: any) => {
      const d = Array.isArray(p.details) ? p.details[0] : p.details;
      const b = Array.isArray(p.balance) ? p.balance[0] : p.balance;
      if (coachId && d?.coach_id && d.coach_id !== coachId) return null;
      return {
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        age_category: d?.age_category ?? null,
        goals: d?.goals ?? null,
        regular_frequency: d?.regular_frequency ?? null,
        session_rate: d?.session_rate ?? null,
        test_rate: d?.test_rate ?? null,
        monthly_revenue: d?.monthly_revenue ?? null,
        current_weight_lb: d?.current_weight_lb ?? null,
        goal_weight_lb: d?.goal_weight_lb ?? null,
        tier: d?.tier ?? null,
        member_since: d?.member_since ?? null,
        status: d?.status ?? null,
        balance_owed: Number(b?.balance_owed ?? 0),
        last_session_at: null,
        total_sessions: 0
      } satisfies ClientRow;
    });
  const rows = baseRows.filter((r): r is ClientRow => r !== null);
  // Pull session stats per client (only completed sessions count toward total)
  if (rows.length) {
    const ids = rows.map((r) => r.id);
    const { data: stats } = await supabase
      .from("appointments")
      .select("client_id, starts_at, status")
      .in("client_id", ids)
      .eq("status", "completed");
    if (stats) {
      const byClient: Record<string, { total: number; last: string | null }> = {};
      stats.forEach((s: any) => {
        const cur = (byClient[s.client_id] ??= { total: 0, last: null });
        cur.total += 1;
        if (!cur.last || s.starts_at > cur.last) cur.last = s.starts_at;
      });
      rows.forEach((r) => {
        const s = byClient[r.id];
        if (s) {
          r.total_sessions = s.total;
          r.last_session_at = s.last;
        }
      });
    }
  }
  return rows;
}

export async function getClient(id: string): Promise<ClientRow | null> {
  const all = await listClients();
  return all.find((c) => c.id === id) ?? null;
}

// ─── Appointments ─────────────────────────────────────────────────────
export type AppointmentRow = {
  id: string;
  client_id: string | null;
  client_name: string | null;
  starts_at: string;
  ends_at: string;
  status: "scheduled" | "completed" | "no_show" | "cancelled" | "change_requested";
  rate: number | null;
  paid: boolean;
  notes: string | null;
  change_count: number;
  session_type: "session" | "personal";
  personal_label: string | null;
  is_blocking: boolean;
  session_program_id?: string | null;
  program_status: "programmed" | "needs_programming" | "n/a";  // n/a for personal blocks
  series_id?: string | null;
  requested_starts_at?: string | null;
  requested_ends_at?: string | null;
  requested_reason?: string | null;
};

function demoAppointments(): AppointmentRow[] {
  const now = new Date();
  const start = startOfWeek(now);
  const slots = [
    { d: 0, h: 7, c: "demo-client-acacia", n: "Acacia Chan", r: 70, st: "completed", paid: true },
    { d: 0, h: 9, c: "demo-client-jen", n: "Jen Loving", r: 65, st: "completed", paid: false },
    { d: 1, h: 6, c: "demo-client-david", n: "David Syndicongo", r: 65, st: "completed", paid: true },
    { d: 1, h: 17, c: "demo-client-abbey", n: "Abbey Archer", r: 100, st: "scheduled", paid: false },
    { d: 2, h: 8, c: "demo-client-rowland", n: "Rowland Bella", r: 80, st: "scheduled", paid: false, changes: 2 },
    { d: 2, h: 12, c: null, n: null, r: null, st: "scheduled", paid: false, personal: "Lunch + admin" },
    { d: 3, h: 7, c: "demo-client-acacia", n: "Acacia Chan", r: 70, st: "scheduled", paid: false },
    { d: 3, h: 10, c: "demo-client-david", n: "David Syndicongo", r: 65, st: "cancelled", paid: false },
    { d: 4, h: 9, c: "demo-client-jen", n: "Jen Loving", r: 65, st: "scheduled", paid: false },
    { d: 4, h: 9, c: "demo-client-acacia", n: "Acacia Chan", r: 70, st: "scheduled", paid: false }, // overlap with cancelled — actually new block
    { d: 5, h: 8, c: "demo-client-abbey", n: "Abbey Archer", r: 100, st: "scheduled", paid: false }
  ];
  // Demo "programmed" lookup — Acacia & Jen have current programs, others don't.
  const programmed = new Set(["demo-client-acacia", "demo-client-jen", "demo-client-abbey"]);
  const rows = slots.map((s, i) => {
    const startsAt = new Date(start);
    startsAt.setDate(start.getDate() + s.d);
    startsAt.setHours(s.h, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
    const isPersonal = !!(s as any).personal;
    return {
      id: `demo-appt-${i}`,
      client_id: s.c,
      client_name: s.n,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: s.st as AppointmentRow["status"],
      rate: s.r,
      paid: s.paid,
      notes: null,
      change_count: (s as any).changes ?? 0,
      session_type: isPersonal ? "personal" : "session",
      personal_label: (s as any).personal ?? null,
      is_blocking: isPersonal,
      program_status: isPersonal ? "n/a" : (s.c && programmed.has(s.c) ? "programmed" : "needs_programming"),
      series_id: null,
      requested_starts_at: null,
      requested_ends_at: null,
      requested_reason: null
    } as AppointmentRow;
  });

  // Demo: a couple of change-requests to populate James's schedule with light grey blocks
  // Find a David scheduled session and turn one into a change request proposing a different day/time
  const acaciaIdx = rows.findIndex((a) => a.client_id === "demo-client-acacia" && a.status === "scheduled");
  if (acaciaIdx >= 0) {
    const r = rows[acaciaIdx];
    const proposed = new Date(r.starts_at);
    proposed.setDate(proposed.getDate() + 1);
    proposed.setHours(8, 0, 0, 0);
    rows[acaciaIdx] = {
      ...r,
      status: "change_requested",
      requested_starts_at: proposed.toISOString(),
      requested_ends_at: new Date(proposed.getTime() + 60 * 60 * 1000).toISOString(),
      requested_reason: "Tuesday won't work — could we do Wednesday 8a?"
    };
  }
  return rows;
}

export async function listAppointmentsForWeek(coachId: string, weekStart?: Date): Promise<AppointmentRow[]> {
  if (!hasSupabaseEnv()) {
    const start = weekStart ?? startOfWeek(new Date());
    return demoAppointments().filter((a) => {
      const t = new Date(a.starts_at).getTime();
      return t >= start.getTime() && t < start.getTime() + 7 * 86400000;
    });
  }
  const supabase = await createSupabaseServer();
  const start = weekStart ?? startOfWeek(new Date());
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  const { data, error } = await supabase
    .from("appointments_with_names")
    .select("id, client_id, client_name, starts_at, ends_at, status, rate, paid, notes, change_count, session_type, personal_label, is_blocking, session_program_id, series_id, requested_starts_at, requested_ends_at, requested_reason")
    .eq("coach_id", coachId)
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString())
    .order("starts_at", { ascending: true });
  if (error || !data) return [];
  return data as AppointmentRow[];
}

export async function listAppointmentsForMonth(coachId: string, monthStart: Date): Promise<AppointmentRow[]> {
  const start = new Date(monthStart);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setMonth(start.getMonth() + 1);
  if (!hasSupabaseEnv()) {
    return demoAppointments().filter((a) => {
      const t = new Date(a.starts_at).getTime();
      return t >= start.getTime() && t < end.getTime();
    });
  }
  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from("appointments_with_names")
    .select("id, client_id, client_name, starts_at, ends_at, status, rate, paid, notes, change_count, session_type, personal_label, is_blocking, session_program_id, series_id, requested_starts_at, requested_ends_at, requested_reason")
    .eq("coach_id", coachId)
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString());
  return (data ?? []) as AppointmentRow[];
}

export async function listAppointmentsForClient(clientId: string): Promise<AppointmentRow[]> {
  if (!hasSupabaseEnv()) {
    // demo: pull from week list, plus inject a guaranteed-future appt if none
    const all = demoAppointments().filter((a) => a.client_id === clientId);
    const upcoming = all.filter((a) => new Date(a.starts_at) >= new Date());
    if (upcoming.length === 0) {
      const t = new Date();
      t.setDate(t.getDate() + 2);
      t.setHours(9, 0, 0, 0);
      all.push({
        id: `demo-future-${clientId}`,
        client_id: clientId,
        client_name: null,
        starts_at: t.toISOString(),
        ends_at: new Date(t.getTime() + 60 * 60000).toISOString(),
        status: "scheduled",
        rate: 70,
        paid: false,
        notes: null,
        change_count: 0,
        session_type: "session",
        personal_label: null,
        is_blocking: false,
        program_status: "programmed"
      });
    }
    return all;
  }
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("appointments_with_names")
    .select("id, client_id, client_name, starts_at, ends_at, status, rate, paid, notes, change_count, session_type, personal_label, is_blocking, session_program_id, series_id, requested_starts_at, requested_ends_at, requested_reason")
    .eq("client_id", clientId)
    .order("starts_at", { ascending: true });
  if (error || !data) return [];
  return data as AppointmentRow[];
}

export function startOfWeek(d: Date): Date {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  const diff = (day + 6) % 7;
  start.setDate(start.getDate() - diff);
  return start;
}

export async function countOpenRequests(coachId: string): Promise<number> {
  if (!hasSupabaseEnv()) return 3;
  const supabase = await createSupabaseServer();
  const { count } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("coach_id", coachId)
    .eq("status", "change_requested");
  return count ?? 0;
}

// ─── Account requests ─────────────────────────────────────────────────
export type AccountRequest = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  message: string | null;
  desired_role: "client" | "coach" | "admin";
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

const DEMO_REQUESTS: AccountRequest[] = [
  { id: "req-1", full_name: "Marco Reyes", email: "marco.reyes@gmail.com", phone: "512-555-2031", message: "Referred by Jen Loving — looking to start strength work.", desired_role: "client", status: "pending", created_at: new Date(Date.now() - 2 * 86400000).toISOString() },
  { id: "req-2", full_name: "Priya Patel", email: "priya.p@gmail.com", phone: null, message: "Goal: first pull-up by year end.", desired_role: "client", status: "pending", created_at: new Date(Date.now() - 86400000).toISOString() }
];

export async function listAccountRequests(): Promise<AccountRequest[]> {
  if (!hasSupabaseEnv()) return DEMO_REQUESTS;
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("account_requests")
    .select("id, full_name, email, phone, message, desired_role, status, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error || !data) return DEMO_REQUESTS;
  return data as AccountRequest[];
}

// ─── Message thread previews ──────────────────────────────────────────
export type ThreadPreview = {
  id: string;
  client_id: string;
  client_name: string;
  last_message: string;
  last_at: string;
  unread: boolean;
};

export async function listCoachThreads(coachId: string): Promise<ThreadPreview[]> {
  if (!hasSupabaseEnv()) {
    return [
      { id: "thread-1", client_id: "demo-client-acacia", client_name: "Acacia Chan", last_message: "Can we move Tuesday to Wed?", last_at: new Date(Date.now() - 3600000).toISOString(), unread: true },
      { id: "thread-2", client_id: "demo-client-jen", client_name: "Jen Loving", last_message: "Loved that pull session — knees felt great", last_at: new Date(Date.now() - 7200000).toISOString(), unread: false },
      { id: "thread-3", client_id: "demo-client-abbey", client_name: "Abbey Archer", last_message: "Heading out of town next week.", last_at: new Date(Date.now() - 26 * 3600000).toISOString(), unread: true }
    ];
  }
  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from("message_threads")
    .select("id, client_id, profiles:client_id ( full_name ), messages ( body, created_at, read_at )")
    .eq("coach_id", coachId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (!data) return [];
  return data.map((t: any) => {
    const last = (t.messages ?? []).slice(-1)[0];
    return {
      id: t.id,
      client_id: t.client_id,
      client_name: Array.isArray(t.profiles) ? t.profiles[0]?.full_name : t.profiles?.full_name,
      last_message: last?.body ?? "",
      last_at: last?.created_at ?? "",
      unread: last && !last.read_at
    } as ThreadPreview;
  });
}
