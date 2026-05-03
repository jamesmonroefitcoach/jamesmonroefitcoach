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
};

const DEMO_CLIENTS: ClientRow[] = [
  { id: "demo-client-abbey", full_name: "Abbey Archer", email: null, age_category: "22", goals: "Form & knowledge", regular_frequency: "1", session_rate: 100, test_rate: 100, monthly_revenue: 200, current_weight_lb: null, goal_weight_lb: null, tier: "tier_1", member_since: "2026-04-10", status: "current", balance_owed: 0 },
  { id: "demo-client-acacia", full_name: "Acacia Chan", email: null, age_category: "30", goals: "Weight Loss, muscle, posture", regular_frequency: "2", session_rate: 70, test_rate: 100, monthly_revenue: 280, current_weight_lb: 198, goal_weight_lb: 150, tier: "tier_2", member_since: "2025-03-01", status: "current", balance_owed: 280 },
  { id: "demo-client-david", full_name: "David Syndicongo", email: null, age_category: "32", goals: "Weight loss, muscle, posture", regular_frequency: "1", session_rate: 65, test_rate: 100, monthly_revenue: 260, current_weight_lb: 229, goal_weight_lb: 180, tier: "tier_2", member_since: "2024-10-01", status: "current", balance_owed: 0 },
  { id: "demo-client-jen", full_name: "Jen Loving", email: null, age_category: "48", goals: "Body Recomp – 1 Pull Up", regular_frequency: "2", session_rate: 65, test_rate: 100, monthly_revenue: 1040, current_weight_lb: null, goal_weight_lb: 145, tier: "tier_1", member_since: "2025-11-01", status: "current", balance_owed: 0 },
  { id: "demo-client-rowland", full_name: "Rowland Bella", email: null, age_category: "24", goals: "100 LB weight loss", regular_frequency: "2", session_rate: null, test_rate: 100, monthly_revenue: null, current_weight_lb: 294, goal_weight_lb: 280, tier: "tier_3", member_since: "2025-07-01", status: "current", balance_owed: 0 }
];

export async function listClients(coachId?: string): Promise<ClientRow[]> {
  if (!hasSupabaseEnv()) return DEMO_CLIENTS;
  const supabase = await createSupabaseServer();
  let query = supabase
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
  const { data, error } = await query;
  if (error || !data) return DEMO_CLIENTS;

  const rows: ClientRow[] = data
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
        balance_owed: Number(b?.balance_owed ?? 0)
      };
    })
    .filter((r): r is ClientRow => r !== null);
  return rows;
}

export async function getClient(id: string): Promise<ClientRow | null> {
  const all = await listClients();
  return all.find((c) => c.id === id) ?? null;
}

// ─── Appointments ─────────────────────────────────────────────────────
export type AppointmentRow = {
  id: string;
  client_id: string;
  client_name: string;
  starts_at: string;
  ends_at: string;
  status: "scheduled" | "completed" | "no_show" | "cancelled" | "change_requested";
  rate: number | null;
  paid: boolean;
  notes: string | null;
  change_count: number;
};

function demoAppointments(): AppointmentRow[] {
  const today = new Date();
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  // back up to Monday
  const day = start.getDay();
  const diff = (day + 6) % 7;
  start.setDate(start.getDate() - diff);

  const rows: AppointmentRow[] = [];
  const slots = [
    { d: 0, h: 7, c: "demo-client-acacia", n: "Acacia Chan", r: 70 },
    { d: 0, h: 9, c: "demo-client-jen", n: "Jen Loving", r: 65 },
    { d: 1, h: 6, c: "demo-client-david", n: "David Syndicongo", r: 65 },
    { d: 1, h: 17, c: "demo-client-abbey", n: "Abbey Archer", r: 100 },
    { d: 2, h: 8, c: "demo-client-rowland", n: "Rowland Bella", r: 80 },
    { d: 3, h: 7, c: "demo-client-acacia", n: "Acacia Chan", r: 70 },
    { d: 4, h: 9, c: "demo-client-jen", n: "Jen Loving", r: 65 },
    { d: 5, h: 8, c: "demo-client-abbey", n: "Abbey Archer", r: 100 }
  ];
  slots.forEach((s, i) => {
    const startsAt = new Date(start);
    startsAt.setDate(start.getDate() + s.d);
    startsAt.setHours(s.h, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
    rows.push({
      id: `demo-appt-${i}`,
      client_id: s.c,
      client_name: s.n,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: "scheduled",
      rate: s.r,
      paid: i % 3 === 0,
      notes: null,
      change_count: i === 2 ? 2 : 0
    });
  });
  return rows;
}

export async function listAppointmentsForWeek(coachId: string, weekStart?: Date): Promise<AppointmentRow[]> {
  if (!hasSupabaseEnv()) return demoAppointments();
  const supabase = await createSupabaseServer();
  const start = weekStart ?? startOfWeek(new Date());
  const end = new Date(start);
  end.setDate(start.getDate() + 7);

  const { data, error } = await supabase
    .from("appointments_with_names")
    .select("id, client_id, client_name, starts_at, ends_at, status, rate, paid, notes, change_count")
    .eq("coach_id", coachId)
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString())
    .order("starts_at", { ascending: true });
  if (error || !data) return demoAppointments();
  return data as AppointmentRow[];
}

export async function listAppointmentsForClient(clientId: string): Promise<AppointmentRow[]> {
  if (!hasSupabaseEnv()) return demoAppointments().filter((a) => a.client_id === clientId);
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("appointments_with_names")
    .select("id, client_id, client_name, starts_at, ends_at, status, rate, paid, notes, change_count")
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

// ─── Open requests ────────────────────────────────────────────────────
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
