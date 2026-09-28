import type { NextConfig } from "next";

/**
 * The admin panel shipped with NO security headers, while the public site
 * (frontend/next.config.ts) has had a full set for a while - and an admin panel
 * is the higher-value clickjacking target of the two.
 *
 * Deliberately mirrors the public site's policy rather than inventing a tighter
 * one: that policy is already proven against this same API and CDN, and a
 * superset of what admin needs is far safer than a guess that silently breaks a
 * page an operator depends on.
 */
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
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js needs inline/eval for its runtime. challenges.cloudflare.com is
      // Turnstile (NEXT_PUBLIC_TURNSTILE_SITE_KEY); static.cloudflareinsights.com
      // is the beacon Cloudflare injects on proxied domains - without it the CSP
      // blocks a script Cloudflare itself added.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://static.cloudflareinsights.com",
      "style-src 'self' 'unsafe-inline'",
      // teezer.live is listed SEPARATELY from *.teezer.live on purpose: a CSP
      // wildcard matches subdomains only, never the apex. Gift icons are slugs
      // resolved against the web app at https://teezer.live/gifts/*.svg
      // (see giftIcon in services/gift-coin.service.ts), so without the apex
      // every slug-based icon in Gifts & Coins is blocked and renders as a
      // broken image - which is exactly what happened.
      "img-src 'self' data: blob: https://teezer.live https://cdn.teezer.live https://*.teezer.live",
      // Admin previews uploaded videos through the same signed media hosts.
      "media-src 'self' blob: https://*.teezer.live",
      "connect-src 'self' https://api.teezer.live https://cdn.teezer.live https://*.teezer.live https://challenges.cloudflare.com https://cloudflareinsights.com",
      "font-src 'self' data:",
      "frame-src https://challenges.cloudflare.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
