import ClientBuildTabs from "./build-tabs";

export default function ClientBuildLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ClientBuildTabs />
      {children}
    </>
  );
}
