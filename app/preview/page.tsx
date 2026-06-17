import MarketingPage from "../marketing-page";

// Always renders the public marketing site regardless of auth state.
// Hides the prospect-facing sticky nav band — James opens this from
// inside the app and doesn't need About/Specialties/Sign-in links.

export default async function PreviewPage() {
  return <MarketingPage hideHeader={true} />;
}
