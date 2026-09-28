"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3, CheckCircle2, DollarSign, Upload, Video } from "lucide-react";
import { StudioLayout } from "@/components/layout/studio-layout";
import { Card, StatCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { studioService } from "@/services/studio.service";
import { formatCompact } from "@/lib/utils";

export function StudioOverviewPage() {
  const dashboard = useQuery({ queryKey: ["studio-dashboard"], queryFn: studioService.dashboard });
  const data = dashboard.data;
  return (
    <StudioLayout title="Overview">
      <div className="grid gap-5 lg:grid-cols-4">
        <StatCard label="Total views" value={formatCompact(data?.period_30d?.views)} sub={data?.period_30d?.views_trend || "+0%"} />
        <StatCard label="Watch time" value={`${formatCompact(data?.period_30d?.watch_time_mins || 0)}m`} />
        <StatCard label="New followers" value={formatCompact(data?.period_30d?.new_followers)} />
        <StatCard label="Engagement" value={formatCompact((data?.period_30d?.likes || 0) + (data?.period_30d?.comments || 0))} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card className="p-6">
          <h3 className="font-bold text-black">Content Performance</h3>
          <div className="mt-5 h-64 rounded-2xl bg-[#f8f9fb]" />
        </Card>
        <Card className="p-6">
          <h3 className="font-bold text-black">Quick Actions</h3>
          <div className="mt-4 grid gap-3">
            {[[Upload, "Upload Video"], [Video, "Drafts"], [BarChart3, "Analytics"], [DollarSign, "Monetization"], [CheckCircle2, "Verification Center"]].map(([Icon, label]) => {
              const I = Icon as React.ElementType;
              return <Button key={label as string} variant="outline" className="justify-start rounded-2xl"><I className="h-4 w-4" />{label as string}</Button>;
            })}
          </div>
        </Card>
      </div>
    </StudioLayout>
  );
}

export function StudioSimplePage({ title, description }: { title: string; description: string }) {
  return (
    <StudioLayout title={title}>
      <Card className="p-6">
        <p className="text-sm text-[#5f6675]">{description}</p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <StatCard label="Published" value="0" />
          <StatCard label="Drafts" value="0" />
          <StatCard label="Under Review" value="0" />
        </div>
      </Card>
    </StudioLayout>
  );
}
