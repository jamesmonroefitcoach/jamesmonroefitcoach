// The build sub-tab bar (New Way | Old Way) was archived with the legacy build
// surfaces. The build workspace is now reached only via the Programs tab
// (Build New + / per-program Edit), so there's no sub-nav to render.
export default function BuildLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
