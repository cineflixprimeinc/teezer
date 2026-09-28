/**
 * Teezer Edge Security Worker
 *
 * Deploy at: Cloudflare Dashboard → Workers & Pages → Create Worker
 * Then: Workers & Pages → your worker → Settings → Triggers →
 *       Add route: teezer.live/* and api.teezer.live/*
 *
 * This Worker runs before your origin on every request.
 */

// ── Bad user-agents (scanners, exploit kits, aggressive bots) ────────────────
const BAD_AGENTS = [
  "sqlmap", "nikto", "nmap", "masscan", "zgrab", "shodan",
  "python-requests", "go-http-client/1", "libwww-perl", "curl/",
  "scrapy", "mechanize", "petalbot", "ahrefsbot", "semrushbot",
  "dotbot", "blexbot", "mj12bot", "baiduspider", "yandexbot",
];

// ── Paths that should never exist on this app (scanner bait) ─────────────────
const BAD_PATHS = [
  "/.env", "/.git", "/wp-admin", "/wp-login", "/phpmyadmin",
  "/adminer", "/phpinfo", "/xmlrpc", "/actuator", "/.well-known/security",
  "/vendor/phpunit", "/console", "/.aws", "/.ssh",
];

// ── Countries to block (add ISO-2 codes as needed) ───────────────────────────
// const BLOCKED_COUNTRIES = ["CN", "RU", "KP"];
const BLOCKED_COUNTRIES = [];

// ── Rate limiting buckets (using Cloudflare's built-in request metadata) ─────
// Note: persistent rate limiting requires KV or Durable Objects.
// For baseline DDoS protection, use Cloudflare's dashboard Rate Limiting rules.
// This worker handles pattern-based blocking that doesn't need counters.

export default {
  async fetch(request, env, ctx) {
    const url        = new URL(request.url);
    const ua         = (request.headers.get("User-Agent") || "").toLowerCase();
    const path       = url.pathname.toLowerCase();
    const country    = request.cf?.country || "";
    const ip         = request.headers.get("CF-Connecting-IP") || "";

    // ── 1. Block by country ──────────────────────────────────────────────────
    if (BLOCKED_COUNTRIES.length && BLOCKED_COUNTRIES.includes(country)) {
      return new Response(
        JSON.stringify({ success: false, message: "Access denied." }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // ── 2. Block bad user-agents ─────────────────────────────────────────────
    for (const bad of BAD_AGENTS) {
      if (ua.includes(bad)) {
        return new Response(
          JSON.stringify({ success: false, message: "Forbidden." }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // ── 3. Block empty user-agents (most legitimate browsers always send one) ─
    if (!ua && url.pathname.startsWith("/api/")) {
      return new Response(
        JSON.stringify({ success: false, message: "Forbidden." }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // ── 4. Block known attack paths ──────────────────────────────────────────
    for (const bad of BAD_PATHS) {
      if (path.startsWith(bad)) {
        return new Response(
          JSON.stringify({ success: false, message: "Not found." }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // ── 5. Block oversized query strings (SQLi / path traversal attempts) ────
    if (url.search.length > 2048) {
      return new Response(
        JSON.stringify({ success: false, message: "Request too large." }),
        { status: 414, headers: { "Content-Type": "application/json" } }
      );
    }

    // ── 6. Forward to origin & add security headers to response ─────────────
    const response = await fetch(request);

    const newHeaders = new Headers(response.headers);
    newHeaders.set("X-Content-Type-Options",  "nosniff");
    newHeaders.set("X-Frame-Options",          "DENY");
    newHeaders.set("Referrer-Policy",          "strict-origin-when-cross-origin");
    newHeaders.set("Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
    // HSTS only on HTTPS responses
    if (url.protocol === "https:") {
      newHeaders.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
    }
    // Remove server fingerprinting headers
    newHeaders.delete("X-Powered-By");
    newHeaders.delete("Server");

    return new Response(response.body, {
      status:     response.status,
      statusText: response.statusText,
      headers:    newHeaders,
    });
  },
};
