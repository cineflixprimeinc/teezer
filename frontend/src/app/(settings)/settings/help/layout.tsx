import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata("Help Center");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
