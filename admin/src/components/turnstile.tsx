"use client";

import { useEffect, useRef } from "react";

/* Cloudflare Turnstile widget. Renders only when a site key is configured
   (NEXT_PUBLIC_TURNSTILE_SITE_KEY); otherwise it's a no-op so login is
   unaffected. Calls onToken with the challenge token (or null on reset). */

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
export const turnstileEnabled = TURNSTILE_SITE_KEY.length > 0;

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

export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  // Keep the latest callback without re-running the mount effect.
  const onTokenRef = useRef(onToken);
  useEffect(() => { onTokenRef.current = onToken; }, [onToken]);

  useEffect(() => {
    if (!turnstileEnabled) return;
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | null = null;

    const renderWidget = () => {
      if (cancelled || widgetIdRef.current || !containerRef.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
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
  }, []);

  if (!turnstileEnabled) return null;
  return <div ref={containerRef} style={{ minHeight: 65, display: "flex", justifyContent: "center" }} />;
}
