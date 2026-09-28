"use client";

/**
 * The ads.teezer.live LOGIN popup (login only - no ads sign-up, and consent is a
 * separate full page). It just gets the user a token on the ads origin:
 *   - Silent SSO (gate): a shared Reelsoo session → mint a token, no prompt.
 *   - No session → the two-option popup (Continue with Reelsoo / Email).
 * "Continue with Reelsoo" (logged out) hands off to teezer.live to sign in.
 * "Continue with Email" reuses the existing Reelsoo login.
 * After login, /ads-manager shows the full-page authorization screen until the
 * user grants Reelsoo Ads access (see ads-authorize-page.tsx).
 */

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Mail, ArrowLeft, Info } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { ssoService } from "@/services/sso.service";
import { LoginContent } from "./login-content";

const CONNECT_URL = "https://teezer.live/connect";
const CREATE_ACCOUNT_URL = "https://teezer.live/register";

type Phase = "checking" | "options" | "email";

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="w-full max-w-md rounded-2xl border border-[#eef0f3] bg-white p-7 shadow-[0_10px_40px_rgba(15,23,42,0.12)]"
      style={{ animation: "auth-modal-in 300ms cubic-bezier(0.22,1,0.36,1) both" }}
    >
      {children}
    </div>
  );
}

function Brand() {
  return (
    <div className="mb-5 flex justify-center">
      <Image src="/reelsoostudioadslogo.png" alt="Teezer Ads" width={700} height={140} priority unoptimized className="h-8 w-auto" />
    </div>
  );
}

export function AdsAuthFlow({
  autoDetect = true,
  onDone,
}: {
  initialMode?: "login";
  autoDetect?: boolean;
  onDone?: () => void;
  /** Accepted for compatibility; closing is handled by the landing overlay. */
  onCancel?: () => void;
}) {
  const { isAuthenticated, applySsoAuth } = useAuthStore();
  const [phase, setPhase] = useState<Phase>(autoDetect ? "checking" : "options");
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(autoDetect);
  const ranBootstrap = useRef(false);

  // Finish as soon as a token exists - but only once this surface is active.
  useEffect(() => {
    if (isAuthenticated && active) onDone?.();
  }, [isAuthenticated, active, onDone]);

  // The landing reveals the preloaded popup via postMessage.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (e.data && e.data.type === "rs-activate") {
        setActive(true);
        setPhase((p) => (p === "email" ? "options" : p));
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Silent SSO login on mount - gate only. Mints a token (no consent here).
  useEffect(() => {
    if (!autoDetect || ranBootstrap.current) return;
    ranBootstrap.current = true;
    if (isAuthenticated) return;

    let cancelled = false;
    const failsafe = setTimeout(() => {
      if (!cancelled) setPhase((p) => (p === "checking" ? "options" : p));
    }, 8000);
    (async () => {
      try {
        const s = await ssoService.session("ads");
        if (cancelled) return;
        if (!s.authenticated) { setPhase("options"); return; }
        const auth = await ssoService.login(s.csrf_token);
        if (cancelled) return;
        applySsoAuth(auth);
      } catch {
        if (!cancelled) setPhase("options");
      }
    })();
    return () => { cancelled = true; clearTimeout(failsafe); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const continueWithReelsoo = useCallback(async () => {
    setBusy(true);
    try {
      const s = await ssoService.session("ads");
      if (s.authenticated) {
        const auth = await ssoService.login(s.csrf_token);
        applySsoAuth(auth);
        return;
      }
    } catch {
      /* fall through to the IdP handoff */
    }
    const ret = `${window.location.origin}/ads-manager`;
    (window.top ?? window).location.assign(`${CONNECT_URL}?client=ads&return=${encodeURIComponent(ret)}`);
  }, [applySsoAuth]);

  /* ── Checking ─────────────────────────────────────────────────────────── */
  if (phase === "checking") {
    return (
      <Card>
        <Brand />
        <div className="flex flex-col items-center gap-3 py-6">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#fe2c55] border-t-transparent" />
          <p className="text-[13px] text-[#6b7280]">Checking your Teezer session…</p>
        </div>
      </Card>
    );
  }

  /* ── Email login (existing Reelsoo login, jumped into the email view) ──── */
  if (phase === "email") {
    return (
      <Card>
        <button
          type="button"
          onClick={() => setPhase("options")}
          className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-[#6b7280] transition hover:text-[#111827]"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <Brand />
        <LoginContent startView="email" embedded />
        <p className="mt-4 text-center text-[12px] text-[#9ca3af]">
          Don&apos;t have a Teezer account?{" "}
          <a href={CREATE_ACCOUNT_URL} target="_blank" rel="noreferrer" className="font-bold text-[#fe2c55]">Create one</a>
        </p>
      </Card>
    );
  }

  /* ── Options (login only) ─────────────────────────────────────────────── */
  return (
    <Card>
      <Brand />
      <h1 className="text-center text-[20px] font-extrabold tracking-tight text-[#111827]">Log in to Teezer Ads</h1>
      <p className="mt-1 text-center text-[13px] text-[#6b7280]">
        Use your Teezer Account - one login across all Teezer services.
      </p>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#eef0f3] bg-[#f8f9fb] px-3 py-2.5">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#fe2c55]" />
        <p className="text-[12px] leading-relaxed text-[#6b7280]">
          You need a Teezer account to log in.{" "}
          <a href={CREATE_ACCOUNT_URL} target="_blank" rel="noreferrer" className="font-semibold text-[#fe2c55]">Create one on teezer.live</a>{" "}
          if you don&apos;t have one yet.
        </p>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        <button
          type="button"
          onClick={continueWithReelsoo}
          disabled={busy}
          className="flex h-12 w-full items-center justify-center gap-2.5 rounded-full border border-[#e5e7eb] bg-white text-[14px] font-bold text-[#111827] transition hover:border-[#fe2c55] hover:bg-[#fff8fa] disabled:opacity-60"
        >
          <Image src="/reelsooadslogilogos.png" alt="Teezer" width={48} height={48} unoptimized className="h-6 w-6 object-contain" />
          {busy ? "Connecting…" : "Continue with Teezer"}
        </button>
        <button
          type="button"
          onClick={() => setPhase("email")}
          className="flex h-12 w-full items-center justify-center gap-2.5 rounded-full border border-[#e5e7eb] bg-white text-[14px] font-bold text-[#111827] transition hover:border-[#fe2c55] hover:bg-[#fff8fa]"
        >
          <Mail className="h-[19px] w-[19px] text-[#fe2c55]" />
          Continue with Email
        </button>
      </div>
    </Card>
  );
}
