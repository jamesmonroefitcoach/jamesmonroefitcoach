import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listAllTestimonials } from "@/app/testimonials/actions";
import BeforeAfterModeration from "./before-after-moderation";
import MessagesTabs from "../messages/messages-tabs";

export default async function BeforeAfterPage() {
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
        <h1 style={{ marginTop: "0.5rem" }}>Before / After</h1>
        <p className="meta">
          Edit the transformation photos shown on the public site — same submissions as
          Testimonials, just the photo side. Approving/declining a client&rsquo;s submission
          still happens on the Testimonials screen.
        </p>
      </header>
      <hr className="divider" />
      <BeforeAfterModeration initial={all} />
    </main>
    </>
  );
}
