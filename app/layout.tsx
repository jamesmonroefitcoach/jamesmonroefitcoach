import type { Metadata } from "next";
import { Oswald, Inter } from "next/font/google";
import { getSessionUser } from "@/lib/session";
import Sidebar from "@/components/sidebar";
import "./globals.css";

const heading = Oswald({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-heading", display: "swap" });
const body = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "Monroe Fit Coach",
  description: "Programming, scheduling, and check-ins for James Monroe's coaching practice."
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body>
        <div className="app-shell">
          {user ? <Sidebar user={user} /> : null}
          <div className="app-main">{children}</div>
        </div>
      </body>
    </html>
  );
}
