"use client";

/**
 * Legacy alias for the popup surface (kept for any cached landing that still
 * points at /ads-login). Prefer /auth-popup. Login-only Reelsoo Ads auth flow.
 */

import { useCallback, useEffect } from "react";
import { AdsAuthFlow } from "@/features/auth/ads-auth-flow";

function AdsLoginInner() {
  const notifyParent = useCallback((type: string) => {
    if (typeof window !== "undefined" && window.parent && window.parent !== window) {
      window.parent.postMessage({ type }, window.location.origin);
    }
  }, []);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
  }, []);

  return (
    <div
      className="fixed inset-0 grid place-items-center p-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) notifyParent("reelsoo-auth-close"); }}
    >
      <AdsAuthFlow
        autoDetect={false}
        onDone={() => notifyParent("reelsoo-auth-success")}
        onCancel={() => notifyParent("reelsoo-auth-close")}
      />
    </div>
  );
}

export default function AdsLoginPage() {
  return <AdsLoginInner />;
}
