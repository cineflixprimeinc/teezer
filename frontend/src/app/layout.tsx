import type { Metadata } from "next";
import { AppProviders } from "@/lib/query-provider";
import { getSiteSettings, absoluteOgImage } from "@/lib/site-settings";
import "./globals.css";

/**
 * Metadata is generated per request from platform settings rather than
 * declared as a constant.
 *
 * Every value in <head> used to be hardcoded here, which meant the admin
 * panel could store a site title or description and the served HTML would
 * never reflect it. getSiteSettings() reads them from the API with a 60s
 * revalidate, and falls back to exactly these previous hardcoded values if
 * the API cannot be reached - so a backend blip degrades to today's
 * behaviour rather than an empty <title>.
 *
 * The keywords array that used to live here (29 hardcoded terms) is gone.
 * Keywords are now a single admin-editable field and are emitted ONLY when
 * set: every major search engine has ignored the tag for years, and shipping
 * a fixed list on a product other people rebrand was wrong regardless.
 */
export async function generateMetadata(): Promise<Metadata> {
  const s = await getSiteSettings();

  const base = s.canonical_base_url.replace(/\/+$/, "");
  const ogImage = absoluteOgImage(s);
  const defaultTitle = s.site_tagline ? `${s.site_name} - ${s.site_tagline}` : s.site_name;
  const keywords = s.seo_keywords
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  return {
    metadataBase: new URL(base),
    title: {
      default: defaultTitle,
      template: `%s - ${s.site_name}`,
    },
    description: s.site_description,
    ...(keywords.length ? { keywords } : {}),
    alternates: { canonical: base },
    // Turning indexing off has to reach BOTH robots directives, or the site
    // stays indexable through whichever one was missed.
    robots: s.allow_indexing
      ? { index: true, follow: true }
      : { index: false, follow: false },
    openGraph: {
      type: "website",
      siteName: s.site_name,
      title: defaultTitle,
      description: s.site_description,
      url: base,
      images: [{ url: ogImage, alt: defaultTitle }],
    },
    twitter: {
      card: "summary_large_image",
      title: defaultTitle,
      description: s.site_description,
      images: [ogImage],
      ...(s.twitter_handle
        ? { site: s.twitter_handle.startsWith("@") ? s.twitter_handle : `@${s.twitter_handle}` }
        : {}),
    },
    manifest: "/manifest.json",
    icons: {
      icon: [
        { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
        { url: "/favicon-48.png", type: "image/png", sizes: "48x48" },
        { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      ],
      apple: "/apple-touch-icon.png",
    },
  };
}


export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        {/* Warm up the API + media connections early (TLS/DNS) so the first data
            fetch and LCP image/video don't pay the full handshake - the two origins
            PageSpeed flagged as preconnect candidates. media serves no-cors <img>/
            <video>; api is a CORS fetch, so it preconnects with crossOrigin. */}
        <link rel="preconnect" href="https://cdn.teezer.live" />
        <link rel="preconnect" href="https://api.teezer.live" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://cdn.teezer.live" />
        <link rel="dns-prefetch" href="https://api.teezer.live" />
        {/* Apply saved theme BEFORE hydration - prevents light-flash on dark reload */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('reelsoo:theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(e){}})();`,
          }}
        />
        {/* Self-heal from stale/failed JS chunks (e.g. a CDN-cached 404 after a
            deploy). Runs before React so a broken lazy chunk can never blank the
            app - it reloads ONCE (guarded) to fetch the fresh build. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var K='reelsoo_chunk_reloaded';function isChunk(m){return m&&/ChunkLoadError|Loading chunk|Failed to load chunk|dynamically imported module|not executable|Importing a module script failed/i.test(m);}function reloadOnce(){try{if(sessionStorage.getItem(K))return;sessionStorage.setItem(K,'1');}catch(e){}location.reload();}window.addEventListener('error',function(e){var t=e&&e.target;if(t&&(t.tagName==='SCRIPT'||t.tagName==='LINK')){var s=t.src||t.href||'';if(s.indexOf('/_next/static/')>-1){reloadOnce();return;}}if(isChunk(e&&e.message))reloadOnce();},true);window.addEventListener('unhandledrejection',function(e){var r=e&&e.reason;if(isChunk(r&&r.message||String(r)))reloadOnce();});window.addEventListener('load',function(){setTimeout(function(){try{sessionStorage.removeItem(K);}catch(e){}},8000);});})();`,
          }}
        />
      </head>
      <body className="min-h-full">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
