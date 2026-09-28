"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Eye } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";

/**
 * Explains to a demo account, on the PUBLIC site, why posting does not work.
 *
 * The admin panel has its own banner (DemoNotice). This is the other half: a
 * demo user browsing teezer.live can watch, scroll, open profiles and read the
 * Studio, but every upload is refused server-side by BlockDemoUploads. Without
 * this they would just see an action silently fail and reasonably conclude the
 * site is broken.
 *
 * Deliberately a toast on attempt rather than a permanent banner. A demo is
 * meant to look like the real product; a bar pinned across every page would
 * change the thing being demonstrated. The message arrives at the moment it is
 * relevant and explains itself.
 *
 * Not a security control - the server refuses the request regardless. This only
 * makes the refusal legible.
 */
export function DemoAccountNotice() {
  const isDemo = useAuthStore((s) => Boolean(s.user?.is_demo));

  // A ref, not state: this is throttling bookkeeping, and putting it in state
  // would re-render the whole subtree on every blocked attempt for no visual
  // reason.
  const lastShownAt = useRef(0);

  useEffect(() => {
    if (!isDemo) return;

    function onBlocked(event: Event) {
      const detail = (event as CustomEvent<{ message?: string; code?: string }>).detail;

      // One upload can fire several requests - presign, then complete, then a
      // retry - and each is refused. Without throttling the user gets a stack
      // of identical toasts for a single click.
      const now = Date.now();
      if (now - lastShownAt.current < 3000) return;
      lastShownAt.current = now;

      toast.info("Demo account — posting is disabled", {
        description:
          detail?.message ??
          "You can browse all of Teezer, but this account cannot upload or publish.",
        duration: 5000,
        icon: <Eye size={16} />,
      });
    }

    window.addEventListener("reelsoo:demo-blocked", onBlocked);
    return () => window.removeEventListener("reelsoo:demo-blocked", onBlocked);
  }, [isDemo]);

  return null;
}
