"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { StudioSidebarWrapper } from "./studio-sidebar-wrapper";
import { StudioTopbarShared } from "./studio-topbar-shared";
import { RestrictionBanner } from "@/components/restriction-banner";

export function StudioSubPage({ activeHref, title, restrictionTypes }: { activeHref: string; title: string; restrictionTypes?: string[] }) {
  const router = useRouter();
  const { isAuthenticated, authReady } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 6 * 86400000),
    end:   new Date(),
  });

  useEffect(() => {
    if (authReady && !isAuthenticated) router.replace("/");
  }, [authReady, isAuthenticated, router]);

  if (!authReady || !isAuthenticated) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f9fb]">
      <StudioSidebarWrapper
        collapsed={collapsed}
        onToggle={() => setCollapsed(o => !o)}
        activeHref={activeHref}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <StudioTopbarShared
          title={title}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
        />
        <div className="flex flex-1 flex-col overflow-y-auto p-6">
          {restrictionTypes && restrictionTypes.length > 0 && (
            <RestrictionBanner types={restrictionTypes} className="mb-4" />
          )}
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <p className="text-[15px] font-bold text-[#374151]">{title}</p>
              <p className="mt-1 text-[13px] text-[#9ca3af]">This section is coming soon.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
