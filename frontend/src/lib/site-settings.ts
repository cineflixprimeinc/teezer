import "server-only";

/**
 * Site identity + SEO, fetched server-side for the root layout's metadata.
 *
 * Before this, every value in <head> was a hardcoded constant in layout.tsx, so
 * the admin panel could not change the browser title, the meta description or
 * the social share image no matter what it stored. This is the wire.
 *
 * THE FALLBACK IS THE IMPORTANT PART. If the API is unreachable - during a
 * deploy, a database blip, a fresh install whose backend is not up yet - the
 * site must still render correct metadata rather than an empty <title>. The
 * defaults below are byte-for-byte what layout.tsx hardcoded, so the worst
 * case is exactly today's behaviour.
 *
 * `server-only` so this can never be pulled into a client bundle: it fetches
 * from the API origin, which on a customer install is an internal address.
 */

export type SiteSettings = {
  site_name: string;
  site_tagline: string;
  site_description: string;
  seo_keywords: string;
  og_image_url: string;
  canonical_base_url: string;
  twitter_handle: string;
  allow_indexing: boolean;
};

/** Exactly the values layout.tsx hardcoded before it was wired. */
export const SITE_FALLBACK: SiteSettings = {
  site_name: "Teezer",
  site_tagline: "Create Your Trend",
  site_description:
    "Create, watch, and share short videos on Teezer. Discover trending creators, upload reels, add music, share stories, and connect with a growing video community.",
  seo_keywords: "",
  og_image_url: "/reelsoo-logo.png",
  canonical_base_url: "https://teezer.live",
  twitter_handle: "",
  allow_indexing: true,
};

/**
 * Which API base this SERVER-SIDE fetch uses.
 *
 * Deliberately not NEXT_PUBLIC_API_URL. That is the browser's address for the
 * API - on production, https://api.teezer.live - and requesting it from the
 * server it is hosted on returns 403, because Cloudflare blocks requests
 * originating from the origin itself. Verified on the VPS: the public URL
 * answers 403 while http://127.0.0.1:8091 answers 200.
 *
 * The consequence was invisible and exactly the failure this feature exists to
 * avoid: getSiteSettings() caught the 403, returned the fallback, and every
 * page rendered correctly with the hardcoded defaults - so saving a site title
 * in the panel appeared to work and changed nothing on the site.
 *
 * INTERNAL_API_URL is therefore the internal origin (nginx on the box, no TLS,
 * no Cloudflare). It falls back to the public URL for local development, where
 * the two are the same thing.
 */
function apiBase(): string {
  return (
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://127.0.0.1:8000/api/v1"
  );
}

export async function getSiteSettings(): Promise<SiteSettings> {
  const base = apiBase();

  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/app/site`, {
      // Revalidated rather than no-store: this is in the render path of every
      // page, so an uncached fetch would put an API round trip in front of
      // every request. 60s means an admin's save shows up within a minute
      // without the site hammering the API.
      next: { revalidate: 60 },
      headers: { Accept: "application/json" },
    });

    if (!res.ok) return SITE_FALLBACK;

    const json = await res.json();
    const data = json?.data;

    if (!data || typeof data !== "object") return SITE_FALLBACK;

    // Merged field by field, not spread wholesale: a partial or malformed
    // response must not blank out a field. Anything missing or empty keeps
    // its fallback.
    return {
      site_name:          str(data.site_name)          ?? SITE_FALLBACK.site_name,
      site_tagline:       str(data.site_tagline)       ?? SITE_FALLBACK.site_tagline,
      site_description:   str(data.site_description)   ?? SITE_FALLBACK.site_description,
      seo_keywords:       str(data.seo_keywords)       ?? SITE_FALLBACK.seo_keywords,
      og_image_url:       str(data.og_image_url)       ?? SITE_FALLBACK.og_image_url,
      canonical_base_url: str(data.canonical_base_url) ?? SITE_FALLBACK.canonical_base_url,
      twitter_handle:     str(data.twitter_handle)     ?? SITE_FALLBACK.twitter_handle,
      allow_indexing:     typeof data.allow_indexing === "boolean"
        ? data.allow_indexing
        : SITE_FALLBACK.allow_indexing,
    };
  } catch {
    // Never throw from here. A failed settings fetch must not take down every
    // server-rendered page on the site.
    return SITE_FALLBACK;
  }
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** Absolute URL for the share image, which Open Graph requires. */
export function absoluteOgImage(settings: SiteSettings): string {
  const image = settings.og_image_url;
  if (/^https?:\/\//i.test(image)) return image;
  return settings.canonical_base_url.replace(/\/+$/, "") + "/" + image.replace(/^\/+/, "");
}
