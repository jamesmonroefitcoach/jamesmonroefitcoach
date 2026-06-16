import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listAllTestimonials } from "@/app/testimonials/actions";
import TestimonialsModeration from "./testimonials-moderation";
import MessagesTabs from "../messages/messages-tabs";

export default async function TestimonialsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  const all = await listAllTestimonials();

  return (
    <>
    <MessagesTabs />
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header>
        <span className="badge">Coach</span>
        <h1 style={{ marginTop: "0.5rem" }}>Testimonials</h1>
        <p className="meta">
          Approve client feedback before it appears on the public site. Edit the display name,
          add before/after image URLs, and sort the order shown on the flyer.
        </p>
      </header>
      <hr className="divider" />
      <TestimonialsModeration initial={all} />
    </main>
    </>
  );
}
