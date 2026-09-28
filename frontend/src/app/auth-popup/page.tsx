"use client";

/**
 * Same-origin popup surface embedded by the marketing landing's Log in / Sign up
 * buttons. Renamed from /ads-login → /auth-popup because ad blockers / Brave
 * Shields commonly block any iframe whose path contains "ads-", which left the
 * overlay blank and un-closeable. Renders the unified Teezer Ads auth flow.
 */

import { useCallback, useEffect } from "react";
import { AdsAuthFlow } from "@/features/auth/ads-auth-flow";

function AuthPopupInner() {
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
      className="fixed inset-0 grid place-items-center overflow-y-auto p-4"
      onClick={(e) => { if (e.target === e.currentTarget) notifyParent("teezer-auth-close"); }}
    >
      <AdsAuthFlow
        autoDetect={false}
        onDone={() => notifyParent("teezer-auth-success")}
        onCancel={() => notifyParent("teezer-auth-close")}
      />
    </div>
  );
}

export default function AuthPopupPage() {
  return <AuthPopupInner />;
}
