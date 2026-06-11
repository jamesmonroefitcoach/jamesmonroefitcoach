import BuildTabs from "./build-tabs";

export default function BuildLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BuildTabs />
      {children}
    </>
  );
}
