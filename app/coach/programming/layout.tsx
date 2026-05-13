import ProgrammingTabs from "./programming-tabs";

export default function ProgrammingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ProgrammingTabs />
      {children}
    </>
  );
}
