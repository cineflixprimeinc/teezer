"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart2, ChevronDown, Clock, Download, Eye, Heart, Info,
  Play, TrendingUp, Upload, Users, Zap,
} from "lucide-react";
import { cn, formatCompact } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";
import { studioService, type AnalyticsMetric } from "@/services/studio.service";
import { StudioSidebarWrapper } from "./studio-sidebar-wrapper";
import { StudioTopbarShared, type DateRange } from "./studio-topbar-shared";
import { Loader2 } from "lucide-react";

const ApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function fv(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  if (n % 1 !== 0)    return n.toFixed(2);
  return String(n);
}
function fmtSec(s: number): string {
  if (!s) return "0s";
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}
function csvExport(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const lines = [cols.join(","), ...rows.map(r => cols.map(c => JSON.stringify(r[c] ?? "")).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click(); URL.revokeObjectURL(url);
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative cursor-help">
      <Info className="h-3.5 w-3.5 text-[#9ca3af]" />
      <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 w-44 -translate-x-1/2 rounded-xl bg-[#1f2937] px-2.5 py-1.5 text-[11px] leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
}

function GrowthBadge({ pct, up }: { pct: number; up: boolean }) {
  return (
    <span className={cn("flex items-center gap-0.5 text-[11px] font-bold", up ? "text-[#16a34a]" : "text-[#dc2626]")}>
      {up ? "↑" : "↓"} {pct.toFixed(1)}%
    </span>
  );
}

/* ── Sparkline ── */
function Sparkline({ data, color = "#fd4605" }: { data: number[]; color?: string }) {
  const series = useMemo(() => [{ data }], [data]);
  const options = useMemo(() => ({
    chart: { type: "area" as const, toolbar: { show: false }, zoom: { enabled: false }, sparkline: { enabled: true }, animations: { enabled: false } },
    stroke: { curve: "smooth" as const, width: 2, colors: [color] },
    fill: { type: "gradient", gradient: { type: "vertical", colorStops: [{ offset: 0, color, opacity: 0.2 }, { offset: 100, color, opacity: 0 }] } },
    tooltip: { enabled: false },
    markers: { size: 0 },
  }), [color]);
  if (!data.length) return <div className="h-10 w-20" />;
  return <div style={{ width: 80, height: 40 }}><ApexChart type="area" series={series} options={options} height={40} width={80} /></div>;
}

/* ── Donut chart ── */
function DonutChart({ series, labels, colors, height = 120, centerLabel }: {
  series: number[]; labels: string[]; colors: string[]; height?: number; centerLabel?: string;
}) {
  const opts = useMemo(() => ({
    chart: { type: "donut" as const, toolbar: { show: false }, animations: { enabled: true, speed: 400 } },
    labels,
    colors,
    dataLabels: { enabled: false },
    legend: { show: false },
    plotOptions: { pie: { donut: { size: "68%", labels: { show: !!centerLabel, total: { show: true, label: "", fontSize: "13px", fontWeight: 700, color: "#111827", formatter: () => centerLabel ?? "" } } } } },
    stroke: { width: 2, colors: ["#fff"] },
    tooltip: { enabled: true, theme: "dark", style: { fontSize: "12px" }, y: { formatter: (v: number) => `${v.toFixed(1)}%` } },
  }), [labels, colors, centerLabel]);
  if (!series.length) return <div style={{ height }} className="flex items-center justify-center text-[12px] text-[#9ca3af]">No data</div>;
  return <ApexChart type="donut" series={series} options={opts as any} height={height} width="100%" />;
}

/* ── Area chart (reusable) ── */
function AreaChart({ data, color = "#fd4605", height = 130, label = "Value" }: {
  data: { label: string; value: number }[]; color?: string; height?: number; label?: string;
}) {
  const series  = useMemo(() => [{ name: label, data: data.map(d => d.value) }], [data, label]);
  const options = useMemo(() => ({
    chart: { type: "area" as const, toolbar: { show: false }, zoom: { enabled: false }, animations: { enabled: true, speed: 400 }, background: "transparent", fontFamily: "inherit" },
    stroke: { curve: "smooth" as const, width: 2.5, colors: [color] },
    fill: { type: "gradient", gradient: { type: "vertical", colorStops: [{ offset: 0, color, opacity: 0.2 }, { offset: 100, color, opacity: 0.02 }] } },
    markers: { size: data.length <= 31 ? 3 : 0, colors: ["#fff"], strokeColors: color, strokeWidth: 2 },
    xaxis: { categories: data.map(d => d.label), labels: { style: { colors: "#9ca3af", fontSize: "10px", fontFamily: "inherit" }, hideOverlappingLabels: true }, axisBorder: { show: false }, axisTicks: { show: false }, tooltip: { enabled: false } },
    yaxis: { forceNiceScale: true, min: 0, labels: { style: { colors: "#9ca3af", fontSize: "10px", fontFamily: "inherit" }, formatter: (v: number) => fv(Math.round(v)), offsetX: -4 } },
    grid: { borderColor: "#f0f0f0", strokeDashArray: 4, xaxis: { lines: { show: false } }, padding: { top: 4, right: 8, bottom: 0, left: 4 } },
    dataLabels: { enabled: false },
    tooltip: { enabled: true, theme: "dark" as const, style: { fontSize: "11px" }, x: { show: true }, y: { formatter: (v: number) => fv(v), title: { formatter: () => `${label}: ` } } },
    colors: [color], legend: { show: false },
  }), [data, color, label]);

  if (!data.length || data.every(d => d.value === 0)) {
    return (
      <div className="flex flex-col items-center justify-center text-center" style={{ height }}>
        <BarChart2 className="mb-1 h-5 w-5 text-[#d1d5db]" />
        <p className="text-[11px] text-[#9ca3af]">No data for this period</p>
      </div>
    );
  }
  return <div style={{ marginLeft: -8 }}><ApexChart type="area" series={series} options={options} height={height} width="100%" /></div>;
}

/* ── Horizontal bar row ── */
function HBar({ label, pct, color = "#fd4605" }: { label: string; pct: number; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 flex-shrink-0 truncate text-[12px] text-[#374151]">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-[#f0f0f0] overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }} />
      </div>
      <span className="w-10 flex-shrink-0 text-right text-[11px] font-semibold text-[#374151]">{pct.toFixed(1)}%</span>
    </div>
  );
}

/* ── Best time grid ── */
function BestTimeGrid({ hours, bestHour }: { hours: { hour: number; label: string; score: number }[]; bestHour: number }) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const timeSlots = [0, 4, 8, 12, 16, 20];
  return (
    <div>
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `32px repeat(${timeSlots.length}, 1fr)` }}>
        <div />
        {timeSlots.map(h => (
          <div key={h} className="text-center text-[9px] text-[#9ca3af]">{hours[h]?.label ?? ""}</div>
        ))}
        {days.map(day => (
          /* React.Fragment required here to support the key prop */
          <React.Fragment key={day}>
            <div className="flex items-center text-[9px] text-[#9ca3af]">{day}</div>
            {timeSlots.map(h => {
              const score = hours[h]?.score ?? 0;
              const isBest = h === bestHour;
              const opacity = 0.1 + (score / 100) * 0.85;
              return (
                <div
                  key={`${day}-${h}`}
                  className={cn("rounded-sm aspect-square", isBest && "ring-1 ring-[#fd4605]")}
                  style={{ backgroundColor: `rgba(253,70,5,${opacity})` }}
                  title={`${hours[h]?.label}: ${score}%`}
                />
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/* ── Card shell ── */
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-[#f0f0f0] bg-white p-4 shadow-sm", className)}>
      {children}
    </div>
  );
}

/* ── Card header ── */
function CardHeader({ title, tip, right }: { title: string; tip?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-1.5">
      <span className="text-[13px] font-bold text-[#111827]">{title}</span>
      {tip && <InfoTip text={tip} />}
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}

/* ── Skeleton ── */
function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-[#f0f0f0]", className)} />;
}

/* ─── Main page ────────────────────────────────────────────────────────────── */

const METRIC_OPTIONS: { value: AnalyticsMetric; label: string }[] = [
  { value: "views",              label: "Views"              },
  { value: "watch_time",        label: "Watch Time"         },
  { value: "avg_watch_duration",label: "Avg. Watch Duration" },
  { value: "engagement_rate",   label: "Engagement Rate"    },
  { value: "followers_gained",  label: "Followers Gained"   },
  { value: "profile_views",     label: "Profile Visits"     },
  { value: "likes",             label: "Likes"              },
  { value: "comments",          label: "Comments"           },
  { value: "shares",            label: "Shares"             },
  { value: "estimated_rewards", label: "Estimated Rewards"  },
];

export function StudioAnalyticsPage() {
  const router   = useRouter();
  const { isAuthenticated, authReady } = useAuthStore();
  const [collapsed, setCollapsed]       = useState(false);
  const [perfMetric, setPerfMetric]     = useState<AnalyticsMetric>("views");
  const [metricOpen, setMetricOpen]     = useState(false);
  const [locTab, setLocTab]             = useState<"countries" | "cities">("countries");

  const [dateRange, setDateRange] = useState<DateRange>({
    start: new Date(Date.now() - 27 * 86_400_000),
    end:   new Date(),
  });

  useEffect(() => {
    if (authReady && !isAuthenticated) router.replace("/");
  }, [authReady, isAuthenticated, router]);

  const startStr = dateRange.start.toISOString().split("T")[0];
  const endStr   = dateRange.end.toISOString().split("T")[0];

  const { data, isLoading } = useQuery({
    queryKey: ["studio-analytics-overview", startStr, endStr, perfMetric],
    queryFn:  () => studioService.analyticsOverview({ start_date: startStr, end_date: endStr, metric: perfMetric }),
    enabled:  !!isAuthenticated,
    staleTime: 5 * 60_000,
  });

  if (!authReady || !isAuthenticated) return null;

  const s = data?.summary;

  /* ── Summary cards config ── */
  const summaryCards = [
    { key: "views",              label: "Total Views",        icon: <Eye className="h-4 w-4" />,       iconBg: "#fff1f4", iconColor: "#fd4605", format: (v: number) => fv(v) },
    { key: "watch_time_hours",   label: "Watch Time",         icon: <Clock className="h-4 w-4" />,      iconBg: "#f0fdf4", iconColor: "#16a34a", format: (v: number) => `${fv(v)}h` },
    { key: "avg_watch_duration", label: "Avg. Watch Duration",icon: <Play className="h-4 w-4" />,       iconBg: "#eff6ff", iconColor: "#2563eb", format: (v: number) => fmtSec(v) },
    { key: "engagement_rate",    label: "Engagement Rate",    icon: <Heart className="h-4 w-4" />,      iconBg: "#fdf4ff", iconColor: "#9333ea", format: (v: number) => `${v}%` },
    { key: "followers_gained",   label: "Followers Gained",   icon: <Users className="h-4 w-4" />,      iconBg: "#fff7ed", iconColor: "#ea580c", format: (v: number) => fv(v) },
    { key: "profile_views",      label: "Profile Visits",     icon: <TrendingUp className="h-4 w-4" />, iconBg: "#f0fdf4", iconColor: "#059669", format: (v: number) => fv(v) },
    { key: "likes",              label: "Likes",              icon: <Heart className="h-4 w-4" />,      iconBg: "#fff1f4", iconColor: "#fd4605", format: (v: number) => fv(v) },
    { key: "estimated_rewards",  label: "Estimated Rewards",  icon: <Zap className="h-4 w-4" />,        iconBg: "#fefce8", iconColor: "#ca8a04", format: (v: number) => `$${v.toFixed(2)}` },
  ] as const;

  /* ── Chart cards config ── */
  const mainCharts = [
    { key: "views_over_time",   label: "Views Over Time",    color: "#fd4605",  total: s?.views.value            ?? 0, totalFmt: fv(s?.views.value ?? 0),             growth: s?.views.growth            },
    { key: "watch_time_growth", label: "Watch Time Growth",  color: "#7c3aed",  total: s?.watch_time_hours.value ?? 0, totalFmt: `${fv(s?.watch_time_hours.value ?? 0)}h`, growth: s?.watch_time_hours.growth },
    { key: "follower_growth",   label: "Follower Growth",    color: "#16a34a",  total: s?.followers_gained.value ?? 0, totalFmt: fv(s?.followers_gained.value ?? 0),  growth: s?.followers_gained.growth },
    { key: "engagement_trend",  label: "Engagement Trend",   color: "#e879f9",  total: s?.engagement_rate.value  ?? 0, totalFmt: `${(s?.engagement_rate.value ?? 0)}%`, growth: s?.engagement_rate.growth },
  ] as const;

  /* ── Export handler ── */
  function handleExport() {
    if (!data) return;
    const rows = data.performance_overview.chart.map(p => ({ date: p.date, [perfMetric]: p.value }));
    csvExport(rows, `teezer-analytics-${startStr}-${endStr}.csv`);
  }

  /* ─── Render ─────────────────────────────────────────────────────────── */
  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f9fb]">
      <StudioSidebarWrapper collapsed={collapsed} onToggle={() => setCollapsed(o => !o)} activeHref="/studio/analytics" />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <StudioTopbarShared
          title="Analytics"
          subtitle="Track your overall content performance, audience, and engagement across all your content."
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
        />

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1600px] p-5 space-y-5">

            {/* ── Page header with action buttons ── */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-[22px] font-black text-[#111827]">Analytics</h1>
                <p className="mt-0.5 text-[13px] text-[#6b7280]">
                  Track your overall content performance, audience, and engagement across all your content.
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <button
                  onClick={handleExport}
                  className="flex items-center gap-1.5 rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-[12px] font-semibold text-[#374151] shadow-sm hover:border-[#fd4605] transition"
                >
                  <Download className="h-3.5 w-3.5" /> Export Report
                </button>
                <Link
                  href="/studio/upload"
                  className="flex items-center gap-1.5 rounded-xl bg-[#fd4605] px-3 py-2 text-[12px] font-bold text-white shadow-sm hover:bg-[#e03e04] transition"
                >
                  <Upload className="h-3.5 w-3.5" /> Upload New Video
                </Link>
              </div>
            </div>

            {/* ── 1. Summary cards ── */}
            <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              {summaryCards.map((card) => {
                const metric = s?.[card.key as keyof typeof s] as { value: number; growth: { pct: number; up: boolean } } | undefined;
                const val    = metric?.value ?? 0;
                const growth = metric?.growth;
                const chartData = (data?.main_charts as Record<string, Array<{value: number}>>)?.[
                  card.key === "views" ? "views_over_time" : card.key === "watch_time_hours" ? "watch_time_growth" : card.key === "followers_gained" ? "follower_growth" : card.key === "engagement_rate" ? "engagement_trend" : "views_over_time"
                ]?.map((p) => p.value) ?? [];
                return (
                  <div key={card.key} className="min-w-[170px] flex-shrink-0 rounded-2xl border border-[#f0f0f0] bg-white p-3.5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="grid h-7 w-7 place-items-center rounded-lg" style={{ backgroundColor: card.iconBg, color: card.iconColor }}>
                          {card.icon}
                        </div>
                        <span className="text-[11px] font-semibold text-[#6b7280]">{card.label}</span>
                      </div>
                    </div>
                    {isLoading ? (
                      <div className="mt-2 space-y-1">
                        <Skeleton className="h-5 w-20" />
                        <Skeleton className="h-3 w-14" />
                      </div>
                    ) : (
                      <>
                        <p className="mt-2 text-[18px] font-black text-[#111827] leading-none">{card.format(val)}</p>
                        {growth && (
                          <div className="mt-1 flex items-center gap-1">
                            <GrowthBadge pct={growth.pct} up={growth.up} />
                            <span className="text-[10px] text-[#9ca3af]">vs prev</span>
                          </div>
                        )}
                      </>
                    )}
                    {!isLoading && chartData.length > 0 && (
                      <div className="mt-2">
                        <Sparkline data={chartData} color={card.iconColor} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── 2. Four main chart cards ── */}
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              {mainCharts.map((chart) => {
                const chartData = (data?.main_charts as Record<string, Array<{label: string; value: number}>>)?.[chart.key] ?? [];
                return (
                  <Card key={chart.key}>
                    <CardHeader title={chart.label} tip={`Daily ${chart.label.toLowerCase()} trend`} />
                    {isLoading ? (
                      <><Skeleton className="mb-2 h-5 w-24" /><Skeleton className="h-[130px] w-full" /></>
                    ) : (
                      <>
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-[20px] font-black text-[#111827]">{chart.totalFmt}</span>
                          {chart.growth && <GrowthBadge pct={chart.growth.pct} up={chart.growth.up} />}
                        </div>
                        <AreaChart data={chartData} color={chart.color} height={130} label={chart.label} />
                      </>
                    )}
                  </Card>
                );
              })}
            </div>

            {/* ── 3. Performance Overview + Top Content ── */}
            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              {/* Performance overview */}
              <Card>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-bold text-[#111827]">Performance Overview</span>
                  <InfoTip text="Track a single metric over the selected date range." />
                  <div className="ml-auto flex items-center gap-2">
                    {/* Metric dropdown */}
                    <div className="relative">
                      <button
                        onClick={() => setMetricOpen(o => !o)}
                        className="flex items-center gap-1.5 rounded-xl border border-[#e5e7eb] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#374151] hover:border-[#fd4605] transition"
                      >
                        {METRIC_OPTIONS.find(m => m.value === perfMetric)?.label ?? "Views"}
                        <ChevronDown className={cn("h-3.5 w-3.5 text-[#9ca3af] transition-transform", metricOpen && "rotate-180")} />
                      </button>
                      {metricOpen && (
                        <div className="absolute right-0 top-full z-40 mt-1 w-48 rounded-2xl border border-[#f0f0f0] bg-white py-1.5 shadow-xl">
                          {METRIC_OPTIONS.map(opt => (
                            <button key={opt.value} onClick={() => { setPerfMetric(opt.value); setMetricOpen(false); }}
                              className={cn("flex w-full items-center px-3 py-2 text-left text-[12px] font-medium hover:bg-[#f8f9fb] transition",
                                perfMetric === opt.value ? "font-bold text-[#fd4605]" : "text-[#374151]")}>
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {isLoading ? (
                  <><Skeleton className="mb-2 h-6 w-32" /><Skeleton className="h-[200px] w-full" /></>
                ) : (
                  <>
                    <div className="mb-2 flex items-center gap-3">
                      <span className="text-[26px] font-black text-[#111827]">
                        {METRIC_OPTIONS.find(m => m.value === perfMetric)?.label === "Avg. Watch Duration"
                          ? fmtSec(data?.performance_overview.value ?? 0)
                          : perfMetric === "engagement_rate"
                            ? `${data?.performance_overview.value ?? 0}%`
                            : perfMetric === "estimated_rewards"
                              ? `$${(data?.performance_overview.value ?? 0).toFixed(2)}`
                              : fv(data?.performance_overview.value ?? 0)}
                      </span>
                      {data?.performance_overview.growth && (
                        <GrowthBadge pct={data.performance_overview.growth.pct} up={data.performance_overview.growth.up} />
                      )}
                      <span className="text-[11px] text-[#9ca3af]">vs previous period</span>
                    </div>
                    <AreaChart data={data?.performance_overview.chart ?? []} color="#fd4605" height={200}
                      label={METRIC_OPTIONS.find(m => m.value === perfMetric)?.label ?? "Value"} />
                  </>
                )}
              </Card>

              {/* Top Performing Content */}
              <Card>
                <CardHeader title="Top Performing Content" right={
                  <Link href="/studio/content" className="text-[11px] font-semibold text-[#fd4605] hover:underline">See all →</Link>
                } />
                {isLoading ? (
                  <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex gap-2">
                      <Skeleton className="h-12 w-20 flex-shrink-0 rounded-lg" />
                      <div className="flex-1 space-y-1.5 py-1">
                        <Skeleton className="h-3 w-full" /><Skeleton className="h-2.5 w-2/3" />
                      </div>
                    </div>
                  ))}</div>
                ) : (data?.top_videos ?? []).length === 0 ? (
                  <p className="text-center text-[12px] text-[#9ca3af] py-8">No published videos yet.</p>
                ) : (
                  <div className="space-y-3">
                    {(data?.top_videos ?? []).slice(0, 4).map((v) => (
                      <Link key={v.id} href={`/studio/content/${v.id}/insights`} className="flex gap-2.5 hover:opacity-80 transition">
                        <div className="h-12 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-[#f0f0f0]">
                          {v.thumbnail ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={v.thumbnail} alt={v.title} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center">
                              <Play className="h-4 w-4 text-[#9ca3af]" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-semibold text-[#111827]">{v.title}</p>
                          <p className="text-[10px] text-[#9ca3af]">{v.created_at}</p>
                          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[#6b7280]">
                            <span>▶ {fv(v.views)}</span>
                            <span>♥ {fv(v.likes)}</span>
                            <span>💬 {fv(v.comments)}</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* ── 4. Audience Insights ── */}
            <div>
              <h2 className="mb-3 text-[15px] font-bold text-[#111827] flex items-center gap-1.5">
                Audience Insights <InfoTip text="Based on viewers of your content." />
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">

                {/* Age Groups */}
                <Card className="xl:col-span-1">
                  <CardHeader title="Age Groups" />
                  {isLoading ? <Skeleton className="h-24 w-full" /> : (() => {
                    const real = data?.audience.age_groups ?? [];
                    const groups = real.length > 0 ? real : [
                      { group: "18-24", pct: 34 },
                      { group: "25-34", pct: 38 },
                      { group: "35-44", pct: 16 },
                      { group: "45-54", pct: 8  },
                      { group: "55+",   pct: 4  },
                    ];
                    return (
                      <>
                        <div className="space-y-2">
                          {groups.map(g => <HBar key={g.group} label={g.group} pct={g.pct} />)}
                        </div>
                        {real.length === 0 && (
                          <p className="mt-2 text-center text-[9px] text-[#9ca3af]">Estimated - grows with views</p>
                        )}
                      </>
                    );
                  })()}
                </Card>

                {/* Gender Split */}
                <Card className="xl:col-span-1">
                  <CardHeader title="Gender Split" />
                  {isLoading ? <Skeleton className="h-24 w-full" /> : (() => {
                    const real = data?.audience.gender_split ?? [];
                    const split = real.length > 0 ? real : [
                      { label: "Female", pct: 62 },
                      { label: "Male",   pct: 38 },
                    ];
                    return (
                      <>
                        <DonutChart
                          series={split.map(g => g.pct)}
                          labels={split.map(g => g.label)}
                          colors={["#fd4605", "#1d8cff", "#9ca3af"]}
                          centerLabel={`${split[0]?.pct ?? 0}%`}
                          height={110}
                        />
                        {real.length === 0 && (
                          <p className="mt-1 text-center text-[9px] text-[#9ca3af]">Estimated - grows with views</p>
                        )}
                      </>
                    );
                  })()}
                </Card>

                {/* Top Countries */}
                <Card className="xl:col-span-1">
                  <CardHeader title="Top Countries" />
                  {isLoading ? <Skeleton className="h-24 w-full" /> : (data?.audience.top_countries ?? []).length === 0 ? (
                    <p className="text-[11px] text-[#9ca3af] text-center py-4">No location data yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {(data?.audience.top_countries ?? []).slice(0, 5).map(c => (
                        <div key={c.name} className="flex items-center gap-2">
                          <span className="flex-1 truncate text-[12px] text-[#374151]">{c.name}</span>
                          <span className="text-[11px] font-semibold text-[#374151]">{c.pct.toFixed(1)}%</span>
                        </div>
                      ))}
                      <button className="mt-1 text-[11px] font-semibold text-[#fd4605] hover:underline">View all countries →</button>
                    </div>
                  )}
                </Card>

                {/* Traffic Sources */}
                <Card className="xl:col-span-1">
                  <CardHeader title="Traffic Sources" />
                  {isLoading ? <Skeleton className="h-24 w-full" /> : (data?.audience.traffic_sources ?? []).length === 0 ? (
                    <p className="text-[11px] text-[#9ca3af] text-center py-4">No traffic data yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {(data?.audience.traffic_sources ?? []).slice(0, 5).map(t => (
                        <HBar key={t.source} label={t.source} pct={t.pct} color="#7c3aed" />
                      ))}
                    </div>
                  )}
                </Card>

                {/* Device / Platform */}
                <Card className="xl:col-span-1">
                  <CardHeader title="Device / Platform" />
                  {isLoading ? <Skeleton className="h-24 w-full" /> : (data?.audience.device_platform ?? []).length === 0 ? (
                    <p className="text-[11px] text-[#9ca3af] text-center py-4">Device data not available yet.</p>
                  ) : (
                    <DonutChart
                      series={data!.audience.device_platform.map(d => d.pct)}
                      labels={data!.audience.device_platform.map(d => d.device)}
                      colors={["#fd4605", "#1d8cff", "#16a34a"]}
                      centerLabel={`${data!.audience.device_platform[0]?.pct ?? 0}%`}
                      height={110}
                    />
                  )}
                </Card>

                {/* Best Time to Post */}
                <Card className="xl:col-span-1">
                  <CardHeader title="Best Time to Post" tip="Optimal time based on your video engagement history." />
                  {isLoading ? <Skeleton className="h-24 w-full" /> : (
                    <>
                      <BestTimeGrid hours={data?.best_time.activityByHour ?? []} bestHour={data?.best_time.bestHour ?? 20} />
                      <p className="mt-2 text-center text-[11px] font-bold text-[#fd4605]">
                        Best time: {data?.best_time.bestTime ?? "8:00 PM"}
                      </p>
                    </>
                  )}
                </Card>
              </div>
            </div>

            {/* ── 5. Bottom row: Retention + Top Videos + Top Comments ── */}
            <div className="grid gap-4 lg:grid-cols-3">

              {/* Audience Retention */}
              <Card>
                <CardHeader title="Audience Retention" tip="Average percentage of videos your audience watches." />
                {isLoading ? (
                  <><Skeleton className="mb-2 h-5 w-16" /><Skeleton className="h-[150px] w-full" /></>
                ) : (
                  <>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-[22px] font-black text-[#111827]">{data?.retention.average ?? 0}%</span>
                      <span className="text-[11px] text-[#9ca3af]">Average retention</span>
                    </div>
                    {(data?.retention.curve ?? []).length > 0 ? (
                      <AreaChart
                        data={(data?.retention.curve ?? []).map(c => ({ label: `${c.pct}%`, value: c.retention }))}
                        color="#16a34a"
                        height={150}
                        label="Retention %"
                      />
                    ) : (
                      <p className="py-8 text-center text-[12px] text-[#9ca3af]">Not enough watch data yet.</p>
                    )}
                  </>
                )}
              </Card>

              {/* Top Performing Videos table */}
              <Card>
                <CardHeader title="Top Performing Videos" right={
                  <Link href="/studio/content" className="text-[11px] font-semibold text-[#fd4605] hover:underline">See all →</Link>
                } />
                {isLoading ? (
                  <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
                ) : (data?.top_videos ?? []).length === 0 ? (
                  <p className="py-8 text-center text-[12px] text-[#9ca3af]">No videos yet.</p>
                ) : (
                  <div className="space-y-2">
                    {(data?.top_videos ?? []).map((v) => (
                      <Link key={v.id} href={`/studio/content/${v.id}/insights`}
                        className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-[#f8f9fb] transition">
                        <div className="h-9 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-[#f0f0f0]">
                          {v.thumbnail
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={v.thumbnail} alt={v.title} className="h-full w-full object-cover" />
                            : <div className="flex h-full items-center justify-center"><Play className="h-3 w-3 text-[#9ca3af]" /></div>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-semibold text-[#111827]">{v.title}</p>
                          <div className="flex items-center gap-2 text-[10px] text-[#6b7280]">
                            <span>▶ {fv(v.views)}</span>
                            <span>{v.watch_time_hours.toFixed(1)}h</span>
                            <span>{v.engagement.toFixed(1)}%</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>

              {/* Top Comments */}
              <Card>
                <CardHeader title="Top Comments" right={
                  <Link href="/studio/comments" className="text-[11px] font-semibold text-[#fd4605] hover:underline">See all →</Link>
                } />
                {isLoading ? (
                  <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex gap-2">
                      <Skeleton className="h-7 w-7 flex-shrink-0 rounded-full" />
                      <div className="flex-1 space-y-1"><Skeleton className="h-2.5 w-1/3" /><Skeleton className="h-2.5 w-2/3" /></div>
                    </div>
                  ))}</div>
                ) : (data?.top_comments ?? []).length === 0 ? (
                  <p className="py-8 text-center text-[12px] text-[#9ca3af]">No comments yet.</p>
                ) : (
                  <div className="space-y-3">
                    {(data?.top_comments ?? []).map((c) => (
                      <div key={c.id} className="flex gap-2">
                        <div className="h-7 w-7 flex-shrink-0 overflow-hidden rounded-full bg-[#f0f0f0]">
                          {c.avatar
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={c.avatar} alt={c.name} className="h-full w-full object-cover" />
                            : <div className="flex h-full items-center justify-center text-[10px] font-bold text-[#9ca3af]">{c.name[0]}</div>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-bold text-[#111827]">@{c.username}</p>
                          <p className="truncate text-[11px] text-[#6b7280]">{c.text}</p>
                          <div className="flex items-center gap-1.5 text-[10px] text-[#9ca3af]">
                            <span>♥ {fv(c.likes)}</span>
                            <span>·</span>
                            <span>{c.date}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* ── 6. Smart Insights + Audience Locations ── */}
            <div className="grid gap-4 lg:grid-cols-2">

              {/* Smart Insights */}
              <Card>
                <CardHeader title="Smart Insights" tip="AI-powered insights from your analytics data." />
                {isLoading ? (
                  <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : (data?.smart_insights ?? []).length === 0 ? (
                  <p className="py-8 text-center text-[12px] text-[#9ca3af]">Upload more content to unlock insights.</p>
                ) : (
                  <div className="space-y-3">
                    {(data?.smart_insights ?? []).map((ins) => {
                      const icons: Record<string, React.ReactNode> = {
                        best_posting_hour:  <Clock className="h-4 w-4" />,
                        highest_retention:  <Heart className="h-4 w-4" />,
                        top_video:          <Play className="h-4 w-4" />,
                      };
                      const colors: Record<string, string> = {
                        best_posting_hour:  "#fff7ed",
                        highest_retention:  "#fff1f4",
                        top_video:          "#eff6ff",
                      };
                      const iconColors: Record<string, string> = {
                        best_posting_hour:  "#ea580c",
                        highest_retention:  "#fd4605",
                        top_video:          "#2563eb",
                      };
                      return (
                        <div key={ins.type} className="flex items-start gap-3 rounded-xl border border-[#f0f0f0] p-3">
                          <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg"
                            style={{ backgroundColor: colors[ins.type] ?? "#f8f9fb", color: iconColors[ins.type] ?? "#374151" }}>
                            {icons[ins.type] ?? <Zap className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[12px] font-bold text-[#111827]">{ins.label}</p>
                            <p className="truncate text-[11px] text-[#6b7280]">
                              <span className="font-semibold text-[#374151]">{ins.value}</span>{" "}
                              {ins.detail}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* Audience Locations */}
              <Card>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-[13px] font-bold text-[#111827]">Audience Locations</span>
                  <div className="ml-auto flex gap-1 rounded-xl bg-[#f8f9fb] p-0.5">
                    {(["countries", "cities"] as const).map(tab => (
                      <button key={tab} onClick={() => setLocTab(tab)}
                        className={cn("rounded-lg px-3 py-1 text-[11px] font-semibold transition", locTab === tab ? "bg-white text-[#111827] shadow-sm" : "text-[#9ca3af] hover:text-[#374151]")}>
                        {tab === "countries" ? "Top Countries" : "Top Cities"}
                      </button>
                    ))}
                  </div>
                </div>
                {isLoading ? (
                  <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
                ) : ((locTab === "countries" ? data?.audience_locations.countries : data?.audience_locations.cities) ?? []).length === 0 ? (
                  <p className="py-8 text-center text-[12px] text-[#9ca3af]">No location data yet.</p>
                ) : (
                  <div className="space-y-2">
                    {((locTab === "countries" ? data?.audience_locations.countries : data?.audience_locations.cities) ?? []).slice(0, 8).map((loc, i) => (
                      <div key={loc.name} className="flex items-center gap-2">
                        <span className="w-4 flex-shrink-0 text-[11px] font-bold text-[#9ca3af]">{i + 1}</span>
                        <span className="flex-1 truncate text-[12px] text-[#374151]">{loc.name}</span>
                        <div className="w-24 h-1.5 rounded-full bg-[#f0f0f0] overflow-hidden">
                          <div className="h-full rounded-full bg-[#fd4605]" style={{ width: `${Math.min(100, loc.pct)}%` }} />
                        </div>
                        <span className="w-10 flex-shrink-0 text-right text-[11px] font-semibold text-[#374151]">{loc.pct.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
