import BuildTabsClient from "./build-tabs";

export default function ClientBuildLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BuildTabsClient />
      {children}
    </>
  );
}
