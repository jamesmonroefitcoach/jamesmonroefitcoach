// Shared types for the Growth Plan. Lives in its own file so client
// components can import them — the matching actions.ts is "use server"
// and Next strips non-async exports from those.

export type GrowthPlanClientSnapshot = {
  client_id: string;
  full_name: string;
  current_rate: number | null;
  current_spw: number | null;
  applied_increases: { date: string; from_rate: number; to_rate: number }[];
  cvi_proxy: number | null;
};

export type GrowthPlanRow = {
  id: string;
  coach_id: string;
  client_id: string | null;
  label: string | null;
  tested_rate: number | null;
  tested_spw: number | null;
  blackout_start: string | null;
  blackout_end: string | null;
  end_date: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
};

export type GrowthPlanScenario = {
  id: string;
  coach_id: string;
  name: string;
  notes: string | null;
  changes: Record<string, { rate?: number; spw?: number; end_date?: string }>;
  created_at: string;
};

export type GrowthPlanBundle = {
  rows: GrowthPlanRow[];
  snapshots: Record<string, GrowthPlanClientSnapshot>;
  scenarios: GrowthPlanScenario[];
  weekly_target: number;
};
