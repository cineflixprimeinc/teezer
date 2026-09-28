import type { NextConfig } from "next";

const securityHeaders = [
  // Prevent MIME-type sniffing
  { key: "X-Content-Type-Options",   value: "nosniff" },
  // Prevent embedding in iframes (clickjacking)
  { key: "X-Frame-Options",          value: "DENY" },
  // Legacy XSS filter for older browsers
  { key: "X-XSS-Protection",         value: "1; mode=block" },
  // Control referrer info in requests
  { key: "Referrer-Policy",          value: "strict-origin-when-cross-origin" },
  // Lock down unnecessary browser features
  {
    key:   "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  // Force HTTPS for 1 year (+ preload list eligible)
  {
    key:   "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Allow prefetching DNS for performance (safe)
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // Basic CSP: blocks flash/plugins/iframes; allows Next.js inline scripts & self assets
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // challenges.cloudflare.com - Cloudflare Turnstile loads its script and
      // renders its widget (in an iframe) from there. Without it the captcha
      // never appears and the login button stays disabled.
      // static.cloudflareinsights.com hosts the Web Analytics beacon that Cloudflare
      // injects on the proxied domain; without it CSP blocks the script (console
      // error + failing Best-Practices/Issues audits).
      // accounts.google.com/gsi/client is the Google Identity Services SDK
      // (Continue with Google on the login/signup modals) - without it here
      // the CSP silently blocks the script from ever loading, so the button
      // stays stuck on "Google sign-in is still loading" forever (onLoad
      // never fires, googleReady never flips true).
      // appleid.cdn-apple.com hosts appleid.auth.js, the Sign in with Apple JS
      // SDK ("Continue with Apple" on the login/signup modals). Exactly the
      // same trap as accounts.google.com directly above: without it the CSP
      // blocks the script silently, window.AppleID never exists, and the
      // button reports "Apple sign-in is still loading" forever because
      // onLoad never fires and appleReady never flips true.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://static.cloudflareinsights.com https://accounts.google.com https://appleid.cdn-apple.com",
      "style-src 'self' 'unsafe-inline'",
      // *.giphy.com / *.klipy.com serve the GIFs the comment box's GIF picker
      // lets a user attach (comment-section.tsx GifPicker/gif_url). Neither was
      // ever listed - Giphy shards across media0-media4.giphy.com/i.giphy.com,
      // and existing comments were saved with klipy.com URLs (an earlier/other
      // GIF provider) - so every posted GIF rendered as a broken image, CSP
      // silently blocking the request with nothing in the Network tab beyond a
      // "Refused to load" console entry.
      "img-src 'self' data: blob: https://cdn.teezer.live https://*.teezer.live https://*.giphy.com https://*.klipy.com",
      // api.teezer.live serves the HLS playlists themselves (HlsPlaylistController
      // re-signs and streams master.m3u8/{variant}/index.m3u8 per request, since a
      // static signed URL can't cover a whole directory of segments); the .ts
      // segments referenced inside those playlists are signed to whatever host
      // MEDIA_URL currently points at (cdn.teezer.live) - a wildcard here tracks that the same way img-src
      // already does, instead of hardcoding one hostname that goes stale again.
      "media-src 'self' blob: https://*.teezer.live",
      // r2.cloudflarestorage.com is the direct-upload target for presigned PUTs
      // (browser → R2). Without it the CSP silently blocks every media upload.
      // cloudflareinsights.com receives the analytics beacon's POST.
      // *.backblazeb2.com is the direct-upload target for presigned PUTs
      // (browser -> B2, e.g. s3.us-east-005.backblazeb2.com). It was missed in
      // the R2 -> B2 migration: only the r2.cloudflarestorage.com host below was
      // ever listed, so once MediaPresignService started signing against B2 the
      // browser refused every upload PUT on connect-src - the request never
      // left the page. Wildcarded so a bucket region change does not break it
      // again. The r2 host stays for any presign still pointing at R2.
      // api.giphy.com is what GifPicker's fetch() actually searches/trends
      // against (comment-section.tsx) - without it here too, a NEW gif search
      // fails outright (blocked before the request even leaves the page), on
      // top of img-src blocking the resulting image once picked.
      // accounts.google.com here too - the GIS SDK calls it directly (token
      // exchange / One Tap status) once initialize()/prompt() run.
      "connect-src 'self' https://api.teezer.live https://cdn.teezer.live wss://api.teezer.live wss://realtime.teezer.live https://realtime.teezer.live https://*.backblazeb2.com https://*.r2.cloudflarestorage.com https://challenges.cloudflare.com https://cloudflareinsights.com https://api.giphy.com https://accounts.google.com https://appleid.apple.com",
      "font-src 'self' data:",
      // accounts.google.com - the GIS One Tap/prompt UI renders in an iframe
      // from there.
      // appleid.apple.com - the Sign in with Apple SDK opens its authorization
      // window there and keeps a hidden iframe on the same origin to postMessage
      // the result back to us. Listed alongside connect-src above for the same
      // reason Google needs both.
      "frame-src https://challenges.cloudflare.com https://accounts.google.com https://appleid.apple.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // In the two-VPS load-balanced setup each origin builds independently, which
  // normally yields a different BUILD_ID per server → a client that loads HTML
  // from one origin can 404 a chunk/Server-Action served by the other. Pinning
  // the build id to the deployed git commit (exported as NEXT_BUILD_ID by
  // deploy/vps-deploy.sh) makes every origin building the same commit produce
  // the SAME id, so assets line up across the load balancer. Falls back to
  // Next's default random id locally when the env var is unset.
  generateBuildId: async () => process.env.NEXT_BUILD_ID || null,

  // Appends `?dpl=<id>` to every /_next/static asset URL, giving Cloudflare a
  // fresh cache key per deploy. A stale/poisoned CDN entry (e.g. a 404 cached
  // during a rebuild window) can then never keep breaking the app - a new deploy
  // id sidesteps it. Set NEXT_DEPLOYMENT_ID at build time (deploy script).
  // Falls back to the build id so this is never empty in a build that forgot to
  // export it. Without a value Next emits bare asset URLs, and a single error
  // response cached against one of those is unreachable for its full one-year
  // TTL - which is exactly how the homepage broke on 2026-09-08.
  deploymentId: process.env.NEXT_DEPLOYMENT_ID
    || (process.env.NEXT_BUILD_ID ? process.env.NEXT_BUILD_ID.slice(0, 8) : undefined),

  // Let next/image optimize + serve modern formats (AVIF/WebP) for our media
  // hosts. Without these patterns next/image refuses remote URLs, so avatars and
  // thumbnails would have to stay as raw <img> (full-size, no resizing).
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.teezer.live" },
      { protocol: "https", hostname: "**.teezer.live" },
      { protocol: "https", hostname: "**.r2.cloudflarestorage.com" },
    ],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 31536000, // hashed object keys are immutable → cache 1 year
  },

  // Don't ship browser source maps to users (smaller, faster transfer).
  productionBrowserSourceMaps: false,

  // Tree-shake heavy barrel libraries we use that aren't in Next's default list.
  experimental: {
    optimizePackageImports: ["echarts", "echarts-for-react", "@stripe/react-stripe-js"],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        // Apple requires the AASA to be served as application/json. The file has
        // no extension, so it would otherwise go out as application/octet-stream
        // and iOS would silently refuse to associate the domain - Universal
        // Links would just never fire, with no error anywhere.
        source: "/.well-known/apple-app-site-association",
        headers: [{ key: "Content-Type", value: "application/json" }],
      },
    ];
  },

  /**
   * Canonical URL consolidation.
   *
   * The link grammar shared with the app and the backend uses the singular
   * /video/:id and /tag/:hashtag. The site historically served /videos/:id and
   * /hashtag/:x, so those now redirect rather than co-existing - two live URLs
   * for one page is a duplicate-content problem, and App Links would have to
   * claim both.
   *
   * `permanent: true` emits 308, not 301: Next uses 307/308 so the request
   * method is preserved (a 301 lets browsers rewrite POST to GET). 308 is the
   * cacheable permanent redirect search engines follow.
   *
   * Note redirects are evaluated BEFORE the filesystem, including /public - so
   * these patterns are deliberately narrow and cannot shadow /.well-known/.
   */
  async redirects() {
    return [
      { source: "/videos/:id", destination: "/video/:id", permanent: true },
      { source: "/hashtag/:hashtag", destination: "/tag/:hashtag", permanent: true },
    ];
  },
};

export default nextConfig;
