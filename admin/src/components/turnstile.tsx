"use client";

import { useEffect, useRef, useState } from "react";

/* Cloudflare Turnstile widget. Renders only when a site key is configured
   (NEXT_PUBLIC_TURNSTILE_SITE_KEY); otherwise it's a no-op so login is
   unaffected. Calls onToken with the challenge token (or null on reset). */

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
export const turnstileEnabled = TURNSTILE_SITE_KEY.length > 0;

/* Runtime fallback: when no key was baked in at build time, ask the API. An
   admin can paste or rotate the key in Admin > Integrations without a rebuild. */
let runtimeKeyPromise: Promise<string> | null = null;
function fetchRuntimeSiteKey(): Promise<string> {
  if (!runtimeKeyPromise) {
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
    runtimeKeyPromise = fetch(`${base}/app/turnstile`, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j?.data?.enabled && typeof j.data.site_key === "string" ? j.data.site_key : ""))
      .catch(() => "");
  }
  return runtimeKeyPromise;
}

/** Site key to use: the build-time one, else the one configured in the admin panel. */
export function useTurnstileSiteKey(): string {
  const [key, setKey] = useState(TURNSTILE_SITE_KEY);
  useEffect(() => {
    if (TURNSTILE_SITE_KEY) return;
    let alive = true;
    fetchRuntimeSiteKey().then((k) => { if (alive) setKey(k); });
    return () => { alive = false; };
  }, []);
  return key;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, any>) => string;
      remove: (id: string) => void;
      reset: (id?: string) => void;
    };
  }
}

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function Turnstile({ onToken, siteKey = TURNSTILE_SITE_KEY }: { onToken: (token: string | null) => void; siteKey?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  // Keep the latest callback without re-running the mount effect.
  const onTokenRef = useRef(onToken);
  useEffect(() => { onTokenRef.current = onToken; }, [onToken]);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | null = null;

    const renderWidget = () => {
      if (cancelled || widgetIdRef.current || !containerRef.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (t: string) => onTokenRef.current(t),
        "expired-callback": () => onTokenRef.current(null),
        "error-callback": () => onTokenRef.current(null),
        theme: "dark",
        size: "flexible",
      });
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      if (!document.getElementById(SCRIPT_ID)) {
        const s = document.createElement("script");
        s.id = SCRIPT_ID;
        s.src = SCRIPT_SRC;
        s.async = true;
        s.defer = true;
        s.onload = renderWidget;
        document.head.appendChild(s);
      }
      poll = setInterval(() => {
        if (window.turnstile) {
          if (poll) clearInterval(poll);
          poll = null;
          renderWidget();
        }
      }, 120);
      setTimeout(() => { if (poll) clearInterval(poll); }, 6000);
    }

    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch { /* ignore */ }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  if (!siteKey) return null;
  return <div ref={containerRef} style={{ minHeight: 65, display: "flex", justifyContent: "center" }} />;
}
