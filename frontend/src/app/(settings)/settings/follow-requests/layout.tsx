import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata("Follow Requests");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
