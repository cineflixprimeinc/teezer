import type { Metadata } from "next";

/**
 * Build a page's metadata from its title (+ optional description).
 *
 * This is a thin factory over Next.js's own Metadata object - NOT a separate
 * metadata system. It exists only so every route produces consistent tab titles
 * and social-preview tags without repeating the same shape on every page:
 *
 *  - `title` flows through the root layout's "%s - Reelsoo" template, so the
 *    browser tab reads e.g. "Explore - Reelsoo".
 *  - Next does NOT apply that template to Open Graph / Twitter titles, so those
 *    are branded here to match the visible tab title.
 *
 * Next.js resolves this on both the initial server render AND client-side (SPA)
 * navigation, so the tab title updates on every route change - including browser
 * Back/Forward - with no manual document.title handling and no flicker.
 */
const BRAND = "Teezer";

export function pageMetadata(title: string, description?: string): Metadata {
  const branded = `${title} - ${BRAND}`;
  const withDesc = description ? { description } : {};
  return {
    title,
    ...withDesc,
    openGraph: { title: branded, ...withDesc },
    twitter: { title: branded, ...withDesc },
  };
}

/**
 * Fetch a public API resource for use inside `generateMetadata` on dynamic
 * routes (profiles, videos, sounds). Always resolves - any failure (network,
 * timeout, non-2xx, missing base URL) returns null so the caller falls back to a
 * param-derived title and the page never errors. Uses the same public API base
 * the app already uses; responses are cached/revalidated so metadata generation
 * has negligible cost.
 */
export async function fetchMetadataResource<T = Record<string, unknown>>(
  path: string,
): Promise<T | null> {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) return null;
  try {
    const res = await fetch(`${base}${path}`, {
      signal: AbortSignal.timeout(2500),
      next: { revalidate: 300 },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.data ?? null) as T | null;
  } catch {
    return null;
  }
}

/** Collapse whitespace and clip a string to `max` chars for a clean tab title. */
export function clip(text: string, max = 70): string {
  const s = text.replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}
