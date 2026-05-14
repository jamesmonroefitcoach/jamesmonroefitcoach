import ClientProgrammingTabs from "./programming-tabs";

export default function ClientProgrammingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ClientProgrammingTabs />
      {children}
    </>
  );
}
