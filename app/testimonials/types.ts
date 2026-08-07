// Plain shared types + helpers for the testimonials module. Lives in
// its own file so client components can import them — the actions.ts
// file is "use server" and Next strips non-async exports from those.

export type TestimonialStatus = "new" | "approved" | "declined" | "hidden";

export type Testimonial = {
  id: string;
  client_id: string | null;
  submitted_name: string;
  display_name: string | null;
  meta_line: string | null;
  body: string;
  status: TestimonialStatus;
  is_published: boolean;
  before_image_url: string | null;
  after_image_url: string | null;
  before_image_urls: string[] | null;
  after_image_urls: string[] | null;
  // "cover" crops to the 4/5 frame (default); "contain" letterboxes so the
  // full body shows. Lives on the row, not just in code, so James can fix
  // clipped feet/legs from the Before/After editor without a redeploy.
  before_fit: "cover" | "contain" | null;
  after_fit: "cover" | "contain" | null;
  // Zoom (1 = no zoom) + focal point as a % of the image (x/y), used only
  // when fit === "cover". Defaults (1, 50, 0) reproduce the old fixed
  // "center top" crop exactly. James sets these by dragging/zooming in the
  // Before/After editor.
  before_zoom: number | null;
  before_pos_x: number | null;
  before_pos_y: number | null;
  after_zoom: number | null;
  after_pos_x: number | null;
  after_pos_y: number | null;
  sort_order: number;
  client_feedback: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  approved_at: string | null;
};

// Collapse the legacy single-URL column into the arrays so downstream
// code only ever reads from one place.
export function allBeforeUrls(t: Testimonial): string[] {
  const arr = t.before_image_urls ?? [];
  return t.before_image_url ? [t.before_image_url, ...arr] : arr;
}
export function allAfterUrls(t: Testimonial): string[] {
  const arr = t.after_image_urls ?? [];
  return t.after_image_url ? [t.after_image_url, ...arr] : arr;
}
