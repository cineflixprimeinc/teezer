"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, Crown, CircleDollarSign } from "lucide-react";
import {
  Card, CardHead, StatTile, PageHeader, Skeleton, EmptyState,
} from "@/features/ads-studio/ui";
import { StatusDonut } from "@/features/ads-studio/charts";
import { DateRangePicker } from "@/features/ads-studio/date-picker";
import { useDateRange } from "@/features/ads-studio/date-range";
import { money, compact, pct, placementLabel } from "@/features/ads-studio/format";
import { adsService, type AdDashboard } from "@/services/ads.service";
import { apiMessage } from "@/services/api";

const PALETTE = ["#fd4605", "#2563eb", "#7c3aed", "#16a34a", "#f59e0b", "#06b6d4", "#ec4899"];

export function PlacementsPage() {
  const { range } = useDateRange();
  const [data, setData] = useState<AdDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    setLoading(true);
    adsService.dashboard(range.from, range.to)
      .then((d) => { if (on) { setData(d); setError(null); } })
      .catch((e) => { if (on) setError(apiMessage(e)); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [range.from, range.to]);

  const currency = data?.currency ?? "USD";
  const placements = data?.placements ?? [];
  const totalSpend = placements.reduce((sum, p) => sum + p.spend_cents, 0);
  const topPlacement = placements[0];

  return (
    <div className="space-y-6">
      <PageHeader title="Placements" subtitle="See where your ads deliver and which surfaces perform best.">
        <DateRangePicker />
      </PageHeader>

      {error && (
        <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[13px] font-medium text-[#b91c1c]">
          {error}
        </div>
      )}

      {/* Intro tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[128px]" />)
        ) : (
          <>
            <StatTile icon={LayoutGrid} iconBg="bg-[#dbeafe]" iconColor="text-[#2563eb]"
              label="Active placements" value={String(placements.length)} hint="delivering in this range" />
            <StatTile icon={Crown} iconBg="bg-[#fef3c7]" iconColor="text-[#d97706]"
              label="Top placement" value={topPlacement ? placementLabel(topPlacement.placement) : "-"}
              hint="by spend" />
            <StatTile icon={CircleDollarSign} iconBg="bg-[#fff3ec]" iconColor="text-[#fd4605]"
              label="Total spend" value={money(totalSpend, currency)} hint="across placements" />
          </>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-[360px]" />
      ) : placements.length === 0 ? (
        <Card className="p-6">
          <EmptyState icon={LayoutGrid} title="No placement data yet"
            desc="Once your ads start delivering, you'll see performance by placement here." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          {/* Performance list */}
          <Card className="xl:col-span-8">
            <CardHead title="Placement performance" subtitle="Ranked by spend. Bar shows share of total spend." />
            <div className="mt-3 overflow-x-auto px-2 pb-4">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af]">
                    <th className="px-3 pb-2 font-bold">Placement</th>
                    <th className="px-3 pb-2 text-right font-bold">Impressions</th>
                    <th className="px-3 pb-2 text-right font-bold">Clicks</th>
                    <th className="px-3 pb-2 text-right font-bold">CTR</th>
                    <th className="px-3 pb-2 text-right font-bold">Spend</th>
                    <th className="px-3 pb-2 font-bold">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {placements.map((p, i) => {
                    const ctr = p.impressions > 0 ? (p.clicks / p.impressions) * 100 : 0;
                    const share = totalSpend > 0 ? (p.spend_cents / totalSpend) * 100 : 0;
                    return (
                      <tr key={p.placement} className="border-t border-[#f1f3f5]">
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                            <span className="text-[13px] font-bold text-[#111827]">{placementLabel(p.placement)}</span>
                          </div>
                        </td>
                        <td className="px-3 text-right text-[13px] tabular-nums text-[#374151]">{compact(p.impressions)}</td>
                        <td className="px-3 text-right text-[13px] tabular-nums text-[#374151]">{compact(p.clicks)}</td>
                        <td className="px-3 text-right text-[13px] tabular-nums text-[#374151]">{pct(ctr)}</td>
                        <td className="px-3 text-right text-[13px] font-semibold tabular-nums text-[#111827]">{money(p.spend_cents, currency)}</td>
                        <td className="w-[200px] px-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#f1f3f5]">
                              <div className="h-full rounded-full bg-[#fd4605]" style={{ width: `${share}%` }} />
                            </div>
                            <span className="w-10 text-right text-[11px] tabular-nums text-[#9ca3af]">{Math.round(share)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Spend share donut + legend */}
          <Card className="xl:col-span-4">
            <CardHead title="Spend share" subtitle="By placement" />
            <div className="px-5 pb-5 pt-2">
              <StatusDonut
                values={placements.map((p) => p.spend_cents)}
                labels={placements.map((p) => placementLabel(p.placement))}
                colors={placements.map((_, i) => PALETTE[i % PALETTE.length])}
                total={placements.length}
              />
              <div className="mt-3 space-y-2">
                {placements.map((p, i) => {
                  const share = totalSpend > 0 ? Math.round((p.spend_cents / totalSpend) * 100) : 0;
                  return (
                    <div key={p.placement} className="flex items-center gap-2 text-[12px]">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                      <span className="truncate text-[#6b7280]">{placementLabel(p.placement)}</span>
                      <span className="ml-auto font-bold text-[#111827] tabular-nums">{money(p.spend_cents, currency)}</span>
                      <span className="w-9 text-right text-[#9ca3af] tabular-nums">({share}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
