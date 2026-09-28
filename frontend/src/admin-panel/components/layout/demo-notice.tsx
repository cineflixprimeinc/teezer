"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, Lock } from "lucide-react";
import { useAuthStore } from "@/admin-panel/store/auth.store";

/**
 * Tells a demo administrator, up front and then again on each attempt, that
 * nothing they do here will save.
 *
 * Two halves, because one is not enough:
 *
 *  - A persistent banner, so the constraint is known BEFORE someone fills in a
 *    form. Discovering it only after clicking Save wastes their time and reads
 *    like a bug rather than a policy.
 *  - A toast on each refused write, because a banner at the top of a long page
 *    is easy to have scrolled past by the time the button is pressed.
 *
 * Neither is a security control. BlockDemoWrites refuses the request
 * server-side; this only makes the refusal comprehensible.
 */
export function DemoNotice() {
  const user = useAuthStore((s) => s.user);
  const isDemo = Boolean(user?.is_demo);

  const [lastBlockedAt, setLastBlockedAt] = useState(0);

  useEffect(() => {
    if (!isDemo) return;

    function onBlocked(event: Event) {
      const detail = (event as CustomEvent<{ message?: string }>).detail;

      // Bulk actions and multi-field forms can fire several writes at once;
      // without this every one of them would raise its own toast for the same
      // single cause.
      const now = Date.now();
      setLastBlockedAt((prev) => {
        if (now - prev < 3000) return prev;

        toast.info("Demo account — changes are disabled", {
          description:
            detail?.message ??
            "You can browse every page, but nothing can be saved, edited or deleted.",
          duration: 5000,
        });

        return now;
      });
    }

    window.addEventListener("reelsoo:demo-blocked", onBlocked);
    return () => window.removeEventListener("reelsoo:demo-blocked", onBlocked);
  }, [isDemo]);

  // Referenced so the state is not flagged unused; the value itself is only
  // meaningful inside the throttle above.
  void lastBlockedAt;

  if (!isDemo) return null;

  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-amber-200 bg-amber-50 px-4 py-2.5 lg:px-6">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-200/70 text-amber-800">
        <Eye size={13} />
      </span>
      <p className="text-[12.5px] text-amber-900">
        <span className="font-bold">Demo account.</span>{" "}
        You can open every page and inspect real data, but saving, editing and deleting are
        disabled.
      </p>
      <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-200/60 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
        <Lock size={10} /> Read only
      </span>
    </div>
  );
}
