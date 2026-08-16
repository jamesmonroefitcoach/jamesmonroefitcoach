import Link from "next/link";
import type { Metadata } from "next";
import IntakeClient from "./intake-client";

// Public new-client intake questionnaire. No auth: James texts this link to
// someone before their consultation, same open-access posture as /s/<token>.
// Header-only chrome — a prospect landing here came from a direct link and
// does not need the marketing nav.

export const metadata: Metadata = {
  title: "New Client Intake | Monroe Fit Coach",
  description:
    "Tell James about your goals, health history, and schedule before your consultation.",
};

export default function IntakePage() {
  return (
    <div className="public-shell">
      <header className="public-header">
        <div className="public-header-inner">
          <Link href="/" className="public-brand">
            <span className="public-brand-mark">MFC</span>
            <span className="public-brand-text">Monroe Fit Coach</span>
          </Link>
        </div>
      </header>
      <IntakeClient />
    </div>
  );
}
