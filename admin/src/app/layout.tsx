import type { Metadata } from "next";
import { AdminProviders } from "@/lib/query-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Teezer Admin",
  description: "Teezer Admin Panel - restricted access",
  robots: "noindex, nofollow",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-[#f4f5f7] text-[#111827] antialiased">
        <AdminProviders>{children}</AdminProviders>
      </body>
    </html>
  );
}
