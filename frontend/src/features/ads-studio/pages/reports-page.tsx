"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  CircleDollarSign, Eye, MousePointerClick, Percent, ShoppingCart, Tag,
  Download, Film, BarChart3,
} from "lucide-react";
import {
  Card, CardHead, StatTile, PageHeader, GhostButton, Skeleton, EmptyState,
} from "@/features/ads-studio/ui";
import { PerformanceChart, BarChart } from "@/features/ads-studio/charts";
import { DateRangePicker } from "@/features/ads-studio/date-picker";
import { useDateRange } from "@/features/ads-studio/date-range";
import {
  money, moneyPrecise, compact, full, pct, axisDate,
} from "@/features/ads-studio/format";
import { adsService, type AdDashboard, type AdDashRow, type AdTile } from "@/services/ads.service";
import { apiMessage } from "@/services/api";

/* ── Campaign thumbnail ────────────────────────────────────────────────── */
function Thumb({ src, size = 38 }: { src: string | null; size?: number }) {
  if (src) {
    return (
      <Image src={src} alt="" width={size} height={size}
        className="rounded-lg object-cover" style={{ width: size, height: size }} unoptimized />
    );
  }
  return (
    <span className="grid flex-shrink-0 place-items-center rounded-lg bg-[#f1f3f5]" style={{ width: size, height: size }}>
      <Film className="h-4 w-4 text-[#9ca3af]" />
    </span>
  );
}

/* ── CSV builder + download ────────────────────────────────────────────── */
function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(rows: AdDashRow[]) {
  const header = [
    "Campaign name", "Objective", "Status", "Impressions", "Reach",
    "Clicks", "CTR%", "Conversions", "Spend", "Cost per result",
  ];
  const lines = rows.map((c) => [
    c.name,
    c.objective_label,
    c.status,
    c.impressions,
    c.reach,
    c.clicks,
    c.ctr.toFixed(2),
    c.conversions,
    (c.spent_cents / 100).toFixed(2),
    (c.cost_per_result_cents / 100).toFixed(2),
  ].map(csvCell).join(","));
  const csv = [header.map(csvCell).join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `teezer-ads-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ReportsPage() {
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
  const s = data?.tiles;
  const rows = data?.recent_campaigns ?? [];
  const series = data?.series ?? [];
  const categories = series.map((p) => axisDate(p.date));

  const tile = (t?: AdTile) => ({ deltaPct: t?.delta_pct ?? 0, positive: t?.positive ?? true });

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" subtitle="Track spend, delivery and results across your campaigns.">
        <DateRangePicker />
        <GhostButton onClick={() => downloadCsv(rows)}>
          <Download className="h-4 w-4" /> Download CSV
        </GhostButton>
      </PageHeader>

      {error && (
        <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[13px] font-medium text-[#b91c1c]">
          {error}
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[128px]" />)
        ) : (
          <>
            <StatTile icon={CircleDollarSign} iconBg="bg-[#fff3ec]" iconColor="text-[#fd4605]"
              label="Spend" value={money(s?.spend_cents.value, currency)}
              compareLabel={compareLabel} {...tile(s?.spend_cents)} />
            <StatTile icon={Eye} iconBg="bg-[#ede9fe]" iconColor="text-[#7c3aed]"
              label="Impressions" value={compact(s?.impressions.value)}
              compareLabel={compareLabel} {...tile(s?.impressions)} />
            <StatTile icon={MousePointerClick} iconBg="bg-[#dbeafe]" iconColor="text-[#2563eb]"
              label="Clicks" value={compact(s?.clicks.value)}
              compareLabel={compareLabel} {...tile(s?.clicks)} />
            <StatTile icon={Percent} iconBg="bg-[#fef3c7]" iconColor="text-[#d97706]"
              label="CTR" value={pct(s?.ctr.value)}
              compareLabel={compareLabel} {...tile(s?.ctr)} />
            <StatTile icon={ShoppingCart} iconBg="bg-[#fee2e2]" iconColor="text-[#dc2626]"
              label="Conversions" value={full(s?.conversions.value)}
              compareLabel={compareLabel} {...tile(s?.conversions)} />
            <StatTile icon={Tag} iconBg="bg-[#dcfce7]" iconColor="text-[#16a34a]"
              label="Cost per Result" value={moneyPrecise(s?.cost_per_result_cents.value, currency)}
              compareLabel={compareLabel} {...tile(s?.cost_per_result_cents)} />
          </>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHead title="Daily spend" subtitle="Amount spent per day in the selected range." />
          <div className="px-3 pb-3 pt-2">
            {loading ? <Skeleton className="mx-2 h-[260px]" /> : (
              <BarChart
                categories={categories}
                data={series.map((p) => Math.round(p.spend_cents / 100))}
                money
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHead
            title="Clicks & conversions"
            action={
              <div className="flex items-center gap-3 text-[12px] font-semibold">
                <Legend color="#2563eb" label="Clicks" />
                <Legend color="#7c3aed" label="Conversions" />
              </div>
            }
          />
          <div className="px-3 pb-3 pt-2">
            {loading ? <Skeleton className="mx-2 h-[260px]" /> : (
              <PerformanceChart
                height={260}
                categories={categories}
                series={[
                  { name: "Clicks", color: "#2563eb", data: series.map((p) => p.clicks) },
                  { name: "Conversions", color: "#7c3aed", data: series.map((p) => p.conversions) },
                ]}
              />
            )}
          </div>
        </Card>
      </div>

      {/* Breakdown table */}
      <Card>
        <CardHead title="Campaign breakdown" subtitle="Results by campaign for the selected range." />
        <div className="mt-3 overflow-x-auto px-2 pb-4">
          {loading ? (
            <div className="space-y-2 px-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="px-3 py-4">
              <EmptyState icon={BarChart3} title="No data for this range"
                desc="There are no campaigns with delivery in the selected period. Try a wider date range." />
            </div>
          ) : (
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead>
                <tr className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af]">
                  <th className="px-3 pb-2 font-bold">Campaign</th>
                  <th className="px-3 pb-2 font-bold">Objective</th>
                  <th className="px-3 pb-2 text-right font-bold">Impressions</th>
                  <th className="px-3 pb-2 text-right font-bold">Reach</th>
                  <th className="px-3 pb-2 text-right font-bold">Clicks</th>
                  <th className="px-3 pb-2 text-right font-bold">CTR</th>
                  <th className="px-3 pb-2 text-right font-bold">Conversions</th>
                  <th className="px-3 pb-2 text-right font-bold">Spend</th>
                  <th className="px-3 pb-2 text-right font-bold">Cost/result</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t border-[#f1f3f5]">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <Thumb src={c.thumbnail_url} />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-bold text-[#111827]">{c.name}</p>
                          <p className="truncate text-[11px] text-[#9ca3af]">{c.cam_id ?? `#${c.id}`}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 text-[13px] text-[#374151]">{c.objective_label}</td>
                    <td className="px-3 text-right text-[13px] tabular-nums text-[#374151]">{compact(c.impressions)}</td>
                    <td className="px-3 text-right text-[13px] tabular-nums text-[#374151]">{compact(c.reach)}</td>
                    <td className="px-3 text-right text-[13px] tabular-nums text-[#374151]">{compact(c.clicks)}</td>
                    <td className="px-3 text-right text-[13px] tabular-nums text-[#374151]">{pct(c.ctr)}</td>
                    <td className="px-3 text-right text-[13px] tabular-nums text-[#374151]">{full(c.conversions)}</td>
                    <td className="px-3 text-right text-[13px] font-semibold tabular-nums text-[#111827]">{money(c.spent_cents, c.currency)}</td>
                    <td className="px-3 text-right text-[13px] tabular-nums text-[#374151]">{moneyPrecise(c.cost_per_result_cents, c.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ── Small pieces ──────────────────────────────────────────────────────── */
function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[#6b7280]">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
