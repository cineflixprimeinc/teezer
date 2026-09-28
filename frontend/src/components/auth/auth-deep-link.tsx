"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";

/**
 * Reads ?action=signup|login from the URL (set by the verify-email page),
 * opens the corresponding auth modal, and cleans up the URL param.
 * Also prefills login email from sessionStorage if present.
 */
export function AuthDeepLink() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const openAuthModal = useAuthStore((s) => s.openAuthModal);

  useEffect(() => {
    const action = searchParams.get("action");
    if (!action) return;

    if (action === "signup") {
      openAuthModal("signup");
    } else if (action === "login") {
      openAuthModal("login");
    }

    // Remove the ?action= param from URL without triggering a navigation
    const url = new URL(window.location.href);
    url.searchParams.delete("action");
    window.history.replaceState(null, "", url.pathname + (url.search !== "?" ? url.search : ""));
  }, [searchParams, openAuthModal, router]);

  return null;
}
