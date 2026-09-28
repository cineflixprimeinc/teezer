"use client";

/**
 * teezer.live identity-provider handoff for internal SSO.
 *
 * A Teezer subdomain (e.g. ads.teezer.live) redirects here when a signed-out
 * user chooses "Continue with Teezer". We authenticate them on teezer.live (the
 * IdP) - which establishes the shared `.teezer.live` SSO cookie - then bounce back
 * to the `return` URL, where that subdomain's bootstrap finishes with consent.
 *
 * `return` is strictly validated against https://*.teezer.live to prevent an
 * open-redirect.
 */

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { useAuthStore } from "@/store/auth.store";
import { ssoService } from "@/services/sso.service";
import { LoginContent } from "@/features/auth/login-content";

const FALLBACK_RETURN = "https://ads.teezer.live/ads-manager";

function safeReturn(raw: string | null): string {
  if (!raw) return FALLBACK_RETURN;
  try {
    const u = new URL(raw);
    if (u.protocol === "https:" && /(^|\.)teezer\.live$/i.test(u.hostname)) {
      return u.toString();
    }
  } catch {
    /* fall through */
  }
  return FALLBACK_RETURN;
}

function ConnectInner() {
  const params = useSearchParams();
  const returnUrl = safeReturn(params.get("return"));
  const { isAuthenticated, authReady } = useAuthStore();
  const [redirecting, setRedirecting] = useState(false);
  const handed = useRef(false);

  // Once authenticated on teezer.live, ensure the shared SSO cookie exists, then
  // return to the requesting subdomain.
  useEffect(() => {
    if (!authReady || !isAuthenticated || handed.current) return;
    handed.current = true;
    setRedirecting(true);
    const token = typeof window !== "undefined" ? window.localStorage.getItem("teezer_token") : null;
    const ensure = token ? ssoService.promote(token).catch(() => undefined) : Promise.resolve();
    ensure.finally(() => window.location.assign(returnUrl));
  }, [authReady, isAuthenticated, returnUrl]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#f8f9fb] px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-[#eef0f3] bg-white p-8 shadow-[0_10px_40px_rgba(15,23,42,0.08)]">
        <div className="mb-6 flex flex-col items-center text-center">
          <Image src="/teezer-logo.png" alt="Teezer Ads" width={700} height={140} priority unoptimized className="h-8 w-auto" />
          <h1 className="mt-6 text-[20px] font-extrabold tracking-tight text-[#111827]">
            Sign in to continue to Teezer Ads
          </h1>
          <p className="mt-2 text-[13px] text-[#5f6675]">Use your Teezer Account.</p>
        </div>

        {!authReady || redirecting ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#fd4605] border-t-transparent" />
            <p className="text-[13px] text-[#6b7280]">{redirecting ? "Redirecting…" : "Loading…"}</p>
          </div>
        ) : isAuthenticated ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#fd4605] border-t-transparent" />
            <p className="text-[13px] text-[#6b7280]">Connecting your account…</p>
          </div>
        ) : (
          <LoginContent />
        )}
      </div>
    </main>
  );
}

export default function ConnectPage() {
  return (
    <Suspense fallback={null}>
      <ConnectInner />
    </Suspense>
  );
}
