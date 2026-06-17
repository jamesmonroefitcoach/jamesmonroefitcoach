import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import MarketingPage from "./marketing-page";

// Public root. Signed-in users still get routed straight to their
// role surface so /coach and /client work as deep links; signed-out
// visitors see the marketing page. Use /preview to see the
// marketing page even when signed in.

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) {
    if (user.is_admin || user.role === "admin") redirect("/admin");
    if (user.role === "coach") redirect("/coach");
    redirect("/client");
  }
  return <MarketingPage />;
}
