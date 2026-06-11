import ClientLibraryTabs from "./library-tabs";

export default function ClientLibraryLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ClientLibraryTabs />
      {children}
    </>
  );
}
