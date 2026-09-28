"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/auth.store";
import { accessibilityService } from "@/services/accessibility.service";
import { applyA11y, applyCachedA11y } from "./apply";

/**
 * Mounted once in AppProviders: restores the cached accessibility setup
 * instantly on load, then reconciles with the server copy once signed in
 * (so settings saved in the mobile app apply here too, and vice versa).
 */
export function A11yApplier() {
  const isAuth = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => { applyCachedA11y(); }, []);

  useEffect(() => {
    if (!isAuth) return;
    accessibilityService.get().then(applyA11y).catch(() => { /* offline - cached setup stays */ });
  }, [isAuth]);

  return null;
}
