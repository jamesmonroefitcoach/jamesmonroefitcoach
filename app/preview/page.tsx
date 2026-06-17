import MarketingPage from "../marketing-page";

// Always renders the public marketing site regardless of auth state.
// Linked from the sidebar's "Open Website ↗" button so James can see
// what visitors see without signing out of the app.

export default async function PreviewPage() {
  return <MarketingPage />;
}
