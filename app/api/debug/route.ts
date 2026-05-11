import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "(not set)";
  const keySet = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const hasEnv = hasSupabaseEnv();

  if (!hasEnv) {
    return NextResponse.json({ hasEnv, url, keySet, error: "env vars missing" });
  }

  try {
    const supabase = createSupabaseAdmin();

    const { data: profiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .order("role");

    const { data: clients, error: clientsErr } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "client");

    const { data: details, error: detailsErr } = await supabase
      .from("client_details")
      .select("profile_id, status, coach_id")
      .limit(5);

    // Test the full listClients-style query with all columns
    const { data: fullDetails, error: fullErr } = await supabase
      .from("profiles")
      .select(`
        id, full_name, email,
        details:client_details!client_details_profile_id_fkey (
          age_category, gender, goals, injuries, regular_frequency, session_rate,
          monthly_revenue, current_weight_lb, goal_weight_lb,
          tier, member_since, status, coach_id, lifecycle, requires_confirmation,
          form_received_at, form_data, birthday
        )
      `)
      .eq("role", "client")
      .limit(1);

    return NextResponse.json({
      hasEnv,
      url,
      keySet,
      profiles: { count: profiles?.length ?? 0, error: profilesErr?.message, sample: profiles?.slice(0, 5) },
      clients: { count: clients?.length ?? 0, error: clientsErr?.message },
      client_details: { count: details?.length ?? 0, error: detailsErr?.message, sample: details?.slice(0, 3) },
      full_query: { error: fullErr?.message ?? null, sample: fullDetails?.slice(0, 1) ?? null },
    });
  } catch (e: any) {
    return NextResponse.json({ hasEnv, url, keySet, caught: String(e) });
  }
}
