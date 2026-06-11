import LibraryTabs from "./library-tabs";

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LibraryTabs />
      {children}
    </>
  );
}
