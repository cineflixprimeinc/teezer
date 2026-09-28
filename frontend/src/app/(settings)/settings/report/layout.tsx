import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata("Report a Problem");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
