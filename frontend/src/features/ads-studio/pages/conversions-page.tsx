"use client";

import { useEffect, useState } from "react";
import { ShoppingCart, Tag, BarChart3 } from "lucide-react";
import {
  Card, CardHead, StatTile, PageHeader, GhostButton, Skeleton,
} from "../ui";
import { BarChart } from "../charts";
import { DateRangePicker } from "../date-picker";
import { useDateRange } from "../date-range";
import { moneyPrecise, full, axisDate } from "../format";
import { adsService, type AdDashboard } from "@/services/ads.service";
import { apiMessage } from "@/services/api";
import { cn } from "@/lib/utils";

type EventRow = { name: string; count: number };

function EventStatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold",
        active ? "bg-[#dcfce7] text-[#15803d]" : "bg-[#f3f4f6] text-[#9ca3af]",
      )}
    >
      {active ? "Active" : "Not set up"}
    </span>
  );
}

export function ConversionsPage() {
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
  const days = data?.range.days ?? 7;
  const compareLabel = `vs prev ${days}d`;
  const conv = data?.tiles.conversions;
  const cpr = data?.tiles.cost_per_result_cents;
  const series = data?.series ?? [];
  const categories = series.map((p) => axisDate(p.date));

  const totalConversions = conv?.value ?? 0;
  const events: EventRow[] = [
    { name: "Purchase", count: totalConversions },
    { name: "Add to cart", count: 0 },
    { name: "Lead", count: 0 },
    { name: "Sign up", count: 0 },
    { name: "Page view", count: 0 },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conversions"
        subtitle="Actions people took after seeing your ads, and what each one cost."
      >
        <DateRangePicker />
      </PageHeader>

      {error && (
        <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[13px] font-medium text-[#b91c1c]">
          {error}
        </div>
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {loading ? (
          <>
            <Skeleton className="h-[128px]" />
            <Skeleton className="h-[128px]" />
          </>
        ) : (
          <>
            <StatTile
              icon={ShoppingCart} iconBg="bg-[#fee2e2]" iconColor="text-[#dc2626]"
              label="Total conversions" value={full(conv?.value)}
              compareLabel={compareLabel}
              deltaPct={conv?.delta_pct ?? 0} positive={conv?.positive ?? true}
            />
            <StatTile
              icon={Tag} iconBg="bg-[#dcfce7]" iconColor="text-[#16a34a]"
              label="Cost per conversion" value={moneyPrecise(cpr?.value, currency)}
              compareLabel={compareLabel}
              deltaPct={cpr?.delta_pct ?? 0} positive={cpr?.positive ?? true}
            />
          </>
        )}
      </div>

      {/* Daily conversions chart */}
      <Card>
        <CardHead title="Daily conversions" subtitle="Conversions recorded per day in the selected range." />
        <div className="px-3 pb-3 pt-2">
          {loading ? (
            <Skeleton className="mx-2 h-[260px]" />
          ) : series.length === 0 ? (
            <div className="flex h-[260px] items-center justify-center text-[13px] text-[#9ca3af]">
              No conversions in this range
            </div>
          ) : (
            <BarChart
              categories={categories}
              data={series.map((p) => p.conversions)}
              color="#7c3aed"
            />
          )}
        </div>
      </Card>

      {/* Conversion events */}
      <Card>
        <CardHead
          title="Conversion events"
          subtitle="Breakdown of the standard events attributed to your ads."
          action={
            <GhostButton href="/ads-manager/pixel">Set up Pixel</GhostButton>
          }
        />
        <div className="mt-3 overflow-x-auto px-2 pb-2">
          {loading ? (
            <div className="space-y-2 px-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11" />)}
            </div>
          ) : (
            <table className="w-full min-w-[420px] border-collapse text-left">
              <thead>
                <tr className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af]">
                  <th className="px-3 pb-2 font-bold">Event</th>
                  <th className="px-3 pb-2 text-right font-bold">Count</th>
                  <th className="px-3 pb-2 text-right font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.name} className="border-t border-[#f1f3f5]">
                    <td className="px-3 py-3 text-[13px] font-semibold text-[#111827]">{e.name}</td>
                    <td className="px-3 text-right text-[13px] tabular-nums text-[#374151]">{full(e.count)}</td>
                    <td className="px-3 text-right">
                      <EventStatusPill active={e.count > 0} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex items-start gap-1.5 px-5 pb-5 pt-1 text-[12px] text-[#9ca3af]">
          <BarChart3 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>
            Per-event tracking requires the Teezer Pixel. Until it&apos;s installed, all conversions are
            attributed to Purchase.
          </span>
        </div>
      </Card>
    </div>
  );
}
