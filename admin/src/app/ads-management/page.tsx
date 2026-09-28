"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Megaphone, PlayCircle, Clock, ShieldX, Users, Eye, MousePointerClick, DollarSign,
  TrendingUp, TrendingDown, Plus, Download, AlertTriangle, Copyright, ShieldAlert,
} from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { StatusBadge } from "@/components/ui/badge";
import {
  adsService, adMoney, adNum, type AdRange, type AdStat,
} from "@/services/ads.service";

// ApexCharts must load client-side only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false }) as any;

/* ── helpers ──────────────────────────────────────────────────────────────── */
function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "") + "K";
  return (n || 0).toLocaleString();
}
function Growth({ g, size = 11 }: { g: number; size?: number }) {
  const up = g >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${up ? "text-emerald-500" : "text-red-500"}`}>
      {up ? <TrendingUp size={size} /> : <TrendingDown size={size} />}{up ? "+" : ""}{g.toFixed(1)}%
    </span>
  );
}
function ago(iso: string | null): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hour${Math.floor(s / 3600) > 1 ? "s" : ""} ago`;
  return `${Math.floor(s / 86400)} day${Math.floor(s / 86400) > 1 ? "s" : ""} ago`;
}
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-2xl border border-[#eef0f3] ${className}`}>{children}</div>;
}
const RANGES: { label: string; value: AdRange }[] = [
  { label: "Last 7 Days", value: "7d" },
  { label: "Last 30 Days", value: "30d" },
  { label: "Last 90 Days", value: "90d" },
];
function RangeDropdown({ value, onChange }: { value: AdRange; onChange: (v: AdRange) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 border border-[#e8eaed] rounded-lg px-3 py-1.5 text-[12px] font-medium text-[#374151] hover:bg-[#f8f9fb]">
        {RANGES.find((r) => r.value === value)?.label}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-[#e8eaed] rounded-xl shadow-lg py-1 w-40">
            {RANGES.map((r) => (
              <button key={r.value} onClick={() => { onChange(r.value); setOpen(false); }} className={`w-full text-left px-3 py-2 text-[12px] hover:bg-[#f8f9fb] ${r.value === value ? "text-[#fe2c55] font-semibold" : "text-[#374151]"}`}>{r.label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── stat tile ────────────────────────────────────────────────────────────── */
function StatTile({ label, value, stat, icon, tint, color }: {
  label: string; value: string; stat?: AdStat; icon: React.ReactNode; tint: string; color: string;
}) {
  const sparkOpts = {
    chart: { type: "area", sparkline: { enabled: true }, animations: { enabled: true } },
    colors: [color],
    stroke: { width: 2, curve: "smooth" },
    fill: { type: "gradient", gradient: { opacityFrom: 0.2, opacityTo: 0.01 } },
    tooltip: { enabled: false },
  };
  const spark = stat?.spark ?? [];
  const hasSpark = spark.some((v) => v > 0);
  return (
    <Card className="p-4 overflow-hidden">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: tint, color }}>{icon}</div>
          <span className="text-[12px] font-medium text-[#6b7280]">{label}</span>
        </div>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[22px] font-bold text-[#111827] leading-none">{value}</span>
        {stat && <Growth g={stat.growth} />}
      </div>
      <p className="text-[11px] text-[#9ca3af] mt-1">{label === "Revenue" ? "Total revenue" : `Total ${label.toLowerCase()}`}</p>
      <div className="-mx-4 -mb-4 mt-2 h-[36px]">
        {hasSpark && <ReactApexChart type="area" series={[{ data: spark }]} options={sparkOpts} height={36} />}
      </div>
    </Card>
  );
}

/* ── Performance line chart ───────────────────────────────────────────────── */
function PerformanceChart({ range }: { range: AdRange }) {
  const { data } = useQuery({ queryKey: ["ads-perf", range], queryFn: () => adsService.performance(range), refetchInterval: 60_000 });
  const series = data ? [
    { name: "Impressions", data: data.impr },
    { name: "Clicks", data: data.clk },
    { name: "CTR", data: data.ctr },
    { name: "Spend", data: data.spend },
  ] : [];
  const options = {
    chart: { type: "line", toolbar: { show: false }, zoom: { enabled: false } },
    colors: ["#fe2c55", "#3b82f6", "#a855f7", "#22c55e"],
    stroke: { curve: "smooth", width: 2.5 },
    markers: { size: 3, strokeWidth: 0, hover: { size: 5 } },
    xaxis: { categories: data?.labels ?? [], axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: { fontSize: "11px", colors: "#9ca3af" }, rotate: 0, hideOverlappingLabels: true } },
    yaxis: { labels: { formatter: (v: number) => fmt(v), style: { fontSize: "11px", colors: ["#9ca3af"] } } },
    grid: { borderColor: "#f1f5f9", xaxis: { lines: { show: false } } },
    legend: { position: "top" as const, horizontalAlign: "left" as const, fontSize: "12px", markers: { size: 6 }, itemMargin: { horizontal: 12 } },
    tooltip: { shared: true, intersect: false, theme: "light" },
    dataLabels: { enabled: false },
  };
  return <ReactApexChart type="line" series={series} options={options} height={300} />;
}

/* ── Revenue bar chart ────────────────────────────────────────────────────── */
function RevenueChart({ range }: { range: AdRange }) {
  const { data } = useQuery({ queryKey: ["ads-rev", range], queryFn: () => adsService.revenue(range), refetchInterval: 60_000 });
  const options = {
    chart: { type: "bar", toolbar: { show: false } },
    colors: ["#fe2c55"],
    plotOptions: { bar: { columnWidth: "55%", borderRadius: 3 } },
    xaxis: { categories: data?.labels ?? [], axisBorder: { show: false }, axisTicks: { show: false }, labels: { show: false } },
    yaxis: { labels: { formatter: (v: number) => v >= 1000 ? "$" + (v / 1000).toFixed(0) + "K" : "$" + v.toFixed(0), style: { fontSize: "11px", colors: ["#9ca3af"] } } },
    grid: { borderColor: "#f1f5f9", xaxis: { lines: { show: false } } },
    dataLabels: { enabled: false },
    tooltip: { theme: "light", y: { formatter: (v: number) => "$" + v.toLocaleString() } },
    fill: { opacity: 1 },
    states: { hover: { filter: { type: "darken", value: 0.9 } } },
  };
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-[26px] font-bold text-[#111827]">${(data?.today ?? 0).toLocaleString()}</span>
        {data && <Growth g={data.growth} size={12} />}
      </div>
      <p className="text-[12px] text-[#9ca3af] mb-2">Today vs yesterday</p>
      <ReactApexChart type="bar" series={[{ name: "Revenue", data: data?.bars ?? [] }]} options={options} height={190} />
      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-[#f1f2f4] text-center">
        {[["Yesterday", data?.yesterday], ["This Week", data?.this_week], ["This Month", data?.this_month]].map(([l, v]) => (
          <div key={l as string}>
            <p className="text-[11px] text-[#9ca3af]">{l}</p>
            <p className="text-[14px] font-bold text-[#111827]">${(Number(v) || 0).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── main page ────────────────────────────────────────────────────────────── */
export default function AdsOverviewPage() {
  const [mounted, setMounted] = useState(false);
  const [range, setRange] = useState<AdRange>("30d");
  useEffect(() => setMounted(true), []);

  const { data } = useQuery({ queryKey: ["ads-overview"], queryFn: adsService.overview, refetchInterval: 60_000 });
  const s = data?.stats;

  const tiles = [
    { label: "Campaigns", value: adNum(s?.campaigns.value ?? 0), stat: s?.campaigns, icon: <Megaphone size={18} />, tint: "#ffe4ec", color: "#fe2c55" },
    { label: "Active Ads", value: adNum(s?.active_ads.value ?? 0), stat: s?.active_ads, icon: <PlayCircle size={18} />, tint: "#dcfce7", color: "#16a34a" },
    { label: "Pending Review", value: adNum(s?.pending_review.value ?? 0), stat: s?.pending_review, icon: <Clock size={18} />, tint: "#fef3c7", color: "#d97706" },
    { label: "Rejected", value: adNum(s?.rejected.value ?? 0), stat: s?.rejected, icon: <ShieldX size={18} />, tint: "#fee2e2", color: "#dc2626" },
    { label: "Advertisers", value: adNum(s?.advertisers.value ?? 0), stat: s?.advertisers, icon: <Users size={18} />, tint: "#ede9fe", color: "#7c3aed" },
    { label: "Impressions", value: fmt(s?.impressions.value ?? 0), stat: s?.impressions, icon: <Eye size={18} />, tint: "#e0f2fe", color: "#0284c7" },
    { label: "Clicks", value: fmt(s?.clicks.value ?? 0), stat: s?.clicks, icon: <MousePointerClick size={18} />, tint: "#cffafe", color: "#0891b2" },
    { label: "Revenue", value: adMoney(s?.revenue_cents.value ?? 0), stat: s?.revenue_cents, icon: <DollarSign size={18} />, tint: "#dcfce7", color: "#16a34a" },
  ];

  const statusTotal = data?.campaign_status_total ?? 0;
  const donutSeries = (data?.campaign_status ?? []).map((x) => x.value);
  const donutColors = (data?.campaign_status ?? []).map((x) => x.color);
  const donutOptions = {
    chart: { type: "donut", toolbar: { show: false } },
    colors: donutColors,
    labels: (data?.campaign_status ?? []).map((x) => x.label),
    legend: { show: false },
    dataLabels: { enabled: false },
    stroke: { width: 2, colors: ["#fff"] },
    plotOptions: { pie: { donut: { size: "72%", labels: { show: true, name: { show: true, offsetY: 18, fontSize: "11px", color: "#9ca3af" }, value: { show: true, offsetY: -18, fontSize: "22px", fontWeight: 700, color: "#111827", formatter: (v: string) => adNum(Number(v)) }, total: { show: true, showAlways: true, label: "Total", fontSize: "11px", color: "#9ca3af", formatter: () => adNum(statusTotal) } } } } },
    tooltip: { theme: "light" },
  };

  const mod = data?.moderation;
  const modRows = [
    { label: "Adult Content", n: mod?.adult ?? 0, icon: <AlertTriangle size={16} />, tint: "#fee2e2", color: "#dc2626" },
    { label: "Copyright Issues", n: mod?.copyright ?? 0, icon: <Copyright size={16} />, tint: "#fef3c7", color: "#d97706" },
    { label: "Policy Violations", n: mod?.policy ?? 0, icon: <ShieldAlert size={16} />, tint: "#ffe4ec", color: "#fe2c55" },
  ];

  return (
    <AdminShell title="Ads Management">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-bold text-[#111827]">Ads Overview</h1>
            <p className="text-[13px] text-[#6b7280]">Manage campaigns, approvals, revenue and ad performance.</p>
          </div>
          <div className="flex items-center gap-2">
            <RangeDropdown value={range} onChange={setRange} />
            <button className="flex items-center gap-1.5 border border-[#e8eaed] rounded-lg px-3 py-2 text-[12px] font-medium text-[#374151] hover:bg-[#f8f9fb]"><Download size={14} /> Export</button>
            <Link href="/ads-management/campaigns" className="flex items-center gap-1.5 bg-[#fe2c55] text-white rounded-lg px-3.5 py-2 text-[12px] font-semibold hover:bg-[#e0243d]"><Plus size={15} /> New Campaign</Link>
          </div>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {mounted && tiles.map((t) => <StatTile key={t.label} {...t} />)}
        </div>

        {/* Performance / Revenue / Status */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <Card className="p-5 xl:col-span-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[15px] font-bold text-[#111827]">Performance Overview</h2>
              <RangeDropdown value={range} onChange={setRange} />
            </div>
            {mounted && <PerformanceChart range={range} />}
          </Card>

          <Card className="p-5 xl:col-span-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[15px] font-bold text-[#111827]">Revenue Overview</h2>
              <RangeDropdown value={range} onChange={setRange} />
            </div>
            {mounted && <RevenueChart range={range} />}
          </Card>

          <Card className="p-5 xl:col-span-3">
            <h2 className="text-[15px] font-bold text-[#111827] mb-2">Campaign Status</h2>
            <div className="flex items-center gap-3">
              <div className="shrink-0" style={{ width: 140 }}>
                {mounted && donutSeries.length > 0 && <ReactApexChart type="donut" series={donutSeries} options={donutOptions} height={160} width={140} />}
              </div>
              <div className="flex-1 space-y-1.5 min-w-0">
                {(data?.campaign_status ?? []).map((x) => (
                  <div key={x.key} className="flex items-center gap-2 text-[12px]">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: x.color }} />
                    <span className="text-[#6b7280] flex-1 truncate">{x.label}</span>
                    <span className="font-semibold text-[#111827] tabular-nums">{adNum(x.value)}</span>
                    <span className="text-[#9ca3af] tabular-nums w-12 text-right">({x.pct}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Approval / Placements / Top advertisers / Top campaigns */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <Card className="p-5 xl:col-span-3">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-[14px] font-bold text-[#111827]">Approval Queue</h2>
              <span className="w-8 h-8 rounded-lg bg-[#ffe4ec] text-[#fe2c55] grid place-items-center"><Megaphone size={16} /></span>
            </div>
            <p className="text-[34px] font-bold text-[#111827] leading-tight">{adNum(data?.approval_queue.count ?? 0)}</p>
            <p className="text-[12px] text-[#9ca3af] mb-3">Ads awaiting review</p>
            <div className="border-t border-[#f1f2f4] pt-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-[#9ca3af]">Avg. review time</p>
                <p className="text-[15px] font-bold text-[#111827]">{fmtDuration(data?.approval_queue.avg_review_minutes ?? 0)}</p>
              </div>
              <Link href="/ads-management/approvals" className="bg-[#fff0f2] text-[#fe2c55] text-[12px] font-semibold px-3.5 py-2 rounded-lg hover:bg-[#ffe0e4]">Review Ads</Link>
            </div>
          </Card>

          <Card className="p-5 xl:col-span-3">
            <h2 className="text-[14px] font-bold text-[#111827] mb-3">Ad Placements Performance</h2>
            <div className="space-y-2.5">
              {(data?.placements ?? []).map((p) => (
                <div key={p.key} className="flex items-center gap-2.5">
                  <span className="text-[12px] text-[#6b7280] w-24 shrink-0 truncate">{p.label}</span>
                  <div className="flex-1 h-1.5 bg-[#f1f2f4] rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-[#fe2c55]" style={{ width: `${p.pct}%` }} />
                  </div>
                  <span className="text-[12px] font-semibold text-[#111827] w-9 text-right tabular-nums">{p.pct}%</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5 xl:col-span-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[14px] font-bold text-[#111827]">Top Advertisers</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="text-[11px] text-[#9ca3af]">
                  <th className="text-left font-semibold pb-2">Advertiser</th>
                  <th className="text-right font-semibold pb-2">Spend</th>
                  <th className="text-right font-semibold pb-2">Status</th>
                </tr></thead>
                <tbody>
                  {(data?.top_advertisers ?? []).length === 0 && <tr><td colSpan={3} className="py-4 text-center text-[12px] text-[#9ca3af]">No advertisers yet.</td></tr>}
                  {(data?.top_advertisers ?? []).map((a, i) => (
                    <tr key={i} className="border-t border-[#f4f5f7]">
                      <td className="py-2 text-[12.5px] font-medium text-[#111827] truncate max-w-[120px]">{a.name}</td>
                      <td className="py-2 text-[12.5px] text-right font-semibold text-[#111827] tabular-nums">{adMoney(a.spend_cents)}</td>
                      <td className="py-2 text-right"><StatusBadge status={a.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Link href="/ads-management/advertisers" className="block text-center text-[12px] font-semibold text-[#fe2c55] mt-2">View all advertisers →</Link>
          </Card>

          <Card className="p-5 xl:col-span-3">
            <h2 className="text-[14px] font-bold text-[#111827] mb-3">Top Performing Campaigns</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="text-[11px] text-[#9ca3af]">
                  <th className="text-left font-semibold pb-2">Campaign</th>
                  <th className="text-right font-semibold pb-2">CTR</th>
                  <th className="text-right font-semibold pb-2">Revenue</th>
                </tr></thead>
                <tbody>
                  {(data?.top_campaigns ?? []).length === 0 && <tr><td colSpan={3} className="py-4 text-center text-[12px] text-[#9ca3af]">No campaigns yet.</td></tr>}
                  {(data?.top_campaigns ?? []).map((c, i) => (
                    <tr key={i} className="border-t border-[#f4f5f7]">
                      <td className="py-2 text-[12.5px] font-medium text-[#111827] truncate max-w-[120px]">{c.name}</td>
                      <td className="py-2 text-[12.5px] text-right text-[#374151] tabular-nums">{c.ctr}%</td>
                      <td className="py-2 text-[12.5px] text-right font-semibold text-[#111827] tabular-nums">{adMoney(c.revenue_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Link href="/ads-management/campaigns" className="block text-center text-[12px] font-semibold text-[#fe2c55] mt-2">View all campaigns →</Link>
          </Card>
        </div>

        {/* Activities / Moderation / Drafts */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <Card className="p-5 xl:col-span-4">
            <h2 className="text-[14px] font-bold text-[#111827] mb-3">Recent Activities</h2>
            <div className="space-y-3">
              {(data?.recent_activities ?? []).length === 0 && <p className="text-[12px] text-[#9ca3af]">No recent activity.</p>}
              {(data?.recent_activities ?? []).map((a, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] text-[#374151] leading-snug">{a.text}</p>
                  </div>
                  <span className="text-[11px] text-[#9ca3af] shrink-0">{ago(a.at)}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5 xl:col-span-3">
            <h2 className="text-[14px] font-bold text-[#111827] mb-3">Moderation Alerts</h2>
            <div className="space-y-3">
              {modRows.map((m) => (
                <div key={m.label} className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-full grid place-items-center shrink-0" style={{ background: m.tint, color: m.color }}>{m.icon}</span>
                  <span className="flex-1 text-[13px] font-medium text-[#374151]">{m.label}</span>
                  <div className="text-right">
                    <span className="text-[18px] font-bold text-[#111827]">{m.n}</span>
                    <span className="text-[11px] text-[#9ca3af] block leading-none">Ads</span>
                  </div>
                </div>
              ))}
            </div>
            <Link href="/ads-management/approvals" className="block text-center text-[12px] font-semibold text-[#fe2c55] mt-4">View moderation queue →</Link>
          </Card>

          <Card className="p-5 xl:col-span-5">
            <h2 className="text-[14px] font-bold text-[#111827] mb-3">Recent Campaign Drafts</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[440px]">
                <thead><tr className="text-[11px] text-[#9ca3af]">
                  <th className="text-left font-semibold pb-2">Campaign</th>
                  <th className="text-left font-semibold pb-2">Advertiser</th>
                  <th className="text-left font-semibold pb-2">Placement</th>
                  <th className="text-right font-semibold pb-2">Budget</th>
                </tr></thead>
                <tbody>
                  {(data?.recent_drafts ?? []).length === 0 && <tr><td colSpan={4} className="py-4 text-center text-[12px] text-[#9ca3af]">No drafts.</td></tr>}
                  {(data?.recent_drafts ?? []).map((d, i) => (
                    <tr key={i} className="border-t border-[#f4f5f7]">
                      <td className="py-2 text-[12.5px] font-medium text-[#111827] truncate max-w-[130px]">{d.campaign}</td>
                      <td className="py-2 text-[12.5px] text-[#6b7280] truncate max-w-[110px]">{d.advertiser}</td>
                      <td className="py-2 text-[12px] text-[#6b7280]">{d.placement}</td>
                      <td className="py-2 text-[12.5px] text-right font-semibold text-[#111827] tabular-nums">{adMoney(d.budget_cents)}<span className="text-[10px] text-[#9ca3af]">/day</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Link href="/ads-management/campaigns" className="block text-center text-[12px] font-semibold text-[#fe2c55] mt-2">View all drafts →</Link>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}

function fmtDuration(minutes: number): string {
  if (minutes <= 0) return "-";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
