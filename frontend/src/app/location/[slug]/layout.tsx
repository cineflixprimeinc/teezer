import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";

/** Turn a URL slug into a human location name, e.g. "new-york" → "New York". */
function prettifySlug(slug: string): string {
  const decoded = decodeURIComponent(slug).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return decoded.replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const name = prettifySlug(slug) || "Location";
  return pageMetadata(name, `Popular videos from ${name} on Teezer.`);
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
