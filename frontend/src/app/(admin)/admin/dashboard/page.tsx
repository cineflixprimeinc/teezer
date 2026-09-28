"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import {
  Users, Video, TrendingUp, TrendingDown, DollarSign,
  Zap, RefreshCw, CheckCircle2, AlertCircle, CalendarDays,
} from "lucide-react";
import { dashboardService, type DateRange } from "@/admin-panel/services/dashboard.service";

/* ── Dynamic ApexCharts (SSR-safe) ─────────────────────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false }) as any;

/* ── Helpers ────────────────────────────────────────────────────────────────── */
function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.?0+$/, "") + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString("en-US");
}
function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}
function fmtCurrency(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtGrowth(g: number) {
  const up = g >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? "text-emerald-600" : "text-red-500"}`}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {up ? "+" : ""}{g.toFixed(1)}%
    </span>
  );
}
function dateRangeStr(range: DateRange): string {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const end   = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days + 1);
  const o: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString("en-US", o)} – ${end.toLocaleDateString("en-US", o)}, ${end.getFullYear()}`;
}
function Avatar({ name, src, size = 32 }: { name: string; src: string | null; size?: number }) {
  const [err, setErr] = useState(false);
  const initials = name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
  const PALETTE = ["#3b82f6","#8b5cf6","#f59e0b","#10b981","#fe2c55","#06b6d4","#ec4899","#14b8a6"];
  const bg = PALETTE[name.charCodeAt(0) % PALETTE.length];
  if (src && !err) {
    return (
      <img src={src} alt={name} onError={() => setErr(true)}
        className="rounded-full object-cover shrink-0 select-none"
        style={{ width: size, height: size }} />
    );
  }
  return (
    <div className="rounded-full flex items-center justify-center text-white font-semibold shrink-0 select-none"
      style={{ width: size, height: size, background: bg, fontSize: Math.max(Math.round(size * 0.36), 10) }}>
      {initials}
    </div>
  );
}

const TYPE_COLORS: Record<string, string> = {
  "Gift Received":  "bg-emerald-100 text-emerald-700",
  "Coins Purchase": "bg-blue-100 text-blue-700",
  "Subscription":   "bg-violet-100 text-violet-700",
  "Promotion":      "bg-amber-100 text-amber-700",
  "Gift Sent":      "bg-pink-100 text-pink-700",
  "Withdrawal":     "bg-gray-100 text-gray-700",
};

/* ── Skeleton ────────────────────────────────────────────────────────────────── */
function Sk({ w, h, r }: { w: string; h: string; r?: string }) {
  return <div className={`bg-gray-200 animate-pulse rounded${r ? `-${r}` : ""} ${w} ${h}`} />;
}

/* ── Card wrapper ────────────────────────────────────────────────────────────── */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-xl border border-gray-200 ${className}`}>{children}</div>;
}

/* ── Custom icons ────────────────────────────────────────────────────────────── */
function IconUsers({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <circle cx="10" cy="9" r="4.5" fill="#3b82f6" opacity="0.85"/>
      <ellipse cx="10" cy="19.5" rx="7" ry="4" fill="#3b82f6" opacity="0.5"/>
      <circle cx="19" cy="9.5" r="3.5" fill="#3b82f6" opacity="0.6"/>
      <ellipse cx="21" cy="19" rx="5" ry="3.5" fill="#3b82f6" opacity="0.3"/>
    </svg>
  );
}
function IconCreator({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <circle cx="12" cy="9" r="5" fill="#8b5cf6" opacity="0.85"/>
      <ellipse cx="12" cy="20" rx="7.5" ry="4.5" fill="#8b5cf6" opacity="0.5"/>
      <path d="M20 4l1 2.5L23.5 7l-2.5 1L20 10.5 19 8 16.5 7l2.5-1z" fill="#f59e0b"/>
    </svg>
  );
}
function IconVideo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <rect x="2" y="6" width="18" height="16" rx="3" fill="#0d9488" opacity="0.8"/>
      <path d="M20 11l6-3v12l-6-3V11z" fill="#0d9488" opacity="0.6"/>
      <path d="M9 11.5l5 2.5-5 2.5V11.5z" fill="white"/>
    </svg>
  );
}
function IconLive({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <circle cx="14" cy="14" r="3.5" fill="#f97316"/>
      <path d="M7 14a7 7 0 0 1 7-7" stroke="#f97316" strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
      <path d="M14 7a7 7 0 0 1 7 7" stroke="#f97316" strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
      <path d="M4 14a10 10 0 0 1 10-10" stroke="#f97316" strokeWidth="2" strokeLinecap="round" opacity="0.35"/>
      <path d="M14 4a10 10 0 0 1 10 10" stroke="#f97316" strokeWidth="2" strokeLinecap="round" opacity="0.35"/>
    </svg>
  );
}
function IconCoins({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <ellipse cx="14" cy="21" rx="9" ry="3.5" fill="#d97706" opacity="0.4"/>
      <rect x="5" y="16" width="18" height="5.5" rx="2.75" fill="#f59e0b"/>
      <ellipse cx="14" cy="16" rx="9" ry="2.75" fill="#fcd34d"/>
      <rect x="5" y="11" width="18" height="5.5" rx="2.75" fill="#f59e0b" opacity="0.85"/>
      <ellipse cx="14" cy="11" rx="9" ry="2.75" fill="#fcd34d" opacity="0.9"/>
      <rect x="5" y="6" width="18" height="5.5" rx="2.75" fill="#f59e0b" opacity="0.7"/>
      <ellipse cx="14" cy="6" rx="9" ry="2.75" fill="#fde68a"/>
    </svg>
  );
}
function IconWallet({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <rect x="2" y="7" width="24" height="16" rx="3" fill="#fe2c55" opacity="0.8"/>
      <rect x="2" y="7" width="24" height="5" rx="2" fill="#fe2c55"/>
      <rect x="16" y="12.5" width="8" height="5.5" rx="2.75" fill="white" opacity="0.9"/>
      <circle cx="20" cy="15.25" r="1.25" fill="#fe2c55"/>
    </svg>
  );
}

/* ── KPI Card ────────────────────────────────────────────────────────────────── */
interface KpiProps {
  label: string;
  value: string;
  growth: number;
  icon: React.ReactNode;
  iconBg: string;
  rangeLabel: string;
}
function KpiCard({ label, value, growth, icon, iconBg, rangeLabel }: KpiProps) {
  const up = growth >= 0;
  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3.5">
        <div className={`w-[52px] h-[52px] rounded-2xl flex items-center justify-center shrink-0 ${iconBg}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-gray-500 mb-0.5 truncate">{label}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[17px] font-bold text-gray-900 leading-tight">{value}</span>
            <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${up ? "text-emerald-500" : "text-red-500"}`}>
              {up ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
              {up ? "+" : ""}{growth.toFixed(1)}%
            </span>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">{rangeLabel}</p>
        </div>
      </div>
    </Card>
  );
}

/* ── Range Picker ──────────────────────────────────────────────────────────── */
const RANGES: { label: string; value: DateRange }[] = [
  { label: "Last 7 Days", value: "7d" },
  { label: "Last 30 Days", value: "30d" },
  { label: "Last 90 Days", value: "90d" },
];
function CalendarRangePicker({ value, onChange }: { value: DateRange; onChange: (v: DateRange) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 border border-gray-200 bg-white rounded-lg px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
      >
        <CalendarDays size={14} className="text-gray-400" />
        <span>{dateRangeStr(value)}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="ml-0.5">
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-20 bg-white border border-gray-200 rounded-xl shadow-xl py-1 w-44">
            {RANGES.map(r => (
              <button key={r.value} onClick={() => { onChange(r.value); setOpen(false); }}
                className={`w-full text-left px-4 py-2.5 text-xs transition-colors hover:bg-gray-50 ${r.value === value ? "text-[#fe2c55] font-semibold" : "text-gray-700"}`}>
                <span className="block font-medium">{r.label}</span>
                <span className="block text-[10px] text-gray-400 mt-0.5">{dateRangeStr(r.value)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}


/* ── Per-card range dropdown ──────────────────────────────────────────────── */
function RangeDropdown({ value, onChange }: { value: DateRange; onChange: (v: DateRange) => void }) {
  const [open, setOpen] = useState(false);
  const label = RANGES.find(r => r.value === value)?.label ?? "Last 7 Days";
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        {label}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-36">
            {RANGES.map(r => (
              <button key={r.value} onClick={() => { onChange(r.value); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 ${r.value === value ? "text-[#fe2c55] font-semibold" : "text-gray-700"}`}>
                {r.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Overview Analytics Chart ─────────────────────────────────────────────── */
function AnalyticsChart() {
  const [range, setRange] = useState<DateRange>("7d");
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-analytics", range],
    queryFn:  () => dashboardService.analytics(range),
    refetchInterval: 60_000,
  });

  const series = data ? [
    { name: "Users",   data: data.users   },
    { name: "Videos",  data: data.videos  },
    { name: "Coins",   data: data.coins   },
    { name: "Revenue", data: data.revenue },
  ] : [];

  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#fe2c55"];

  const options = {
    chart: { type: "area", toolbar: { show: false }, animations: { enabled: true }, zoom: { enabled: false } },
    colors: COLORS,
    stroke: { curve: "smooth", width: 2.5 },
    markers: { size: 4, strokeWidth: 0, fillOpacity: 1, hover: { size: 6 } },
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        type: "vertical",
        opacityFrom: 0.18,
        opacityTo: 0.01,
        stops: [0, 95, 100],
      },
    },
    xaxis: {
      categories: data?.labels || [],
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { style: { fontSize: "11px", colors: Array(7).fill("#9ca3af") } },
    },
    yaxis: {
      labels: {
        formatter: (v: number) => v >= 1000 ? (v / 1000).toFixed(0) + "K" : String(v),
        style: { fontSize: "11px", colors: ["#9ca3af"] },
      },
    },
    grid: {
      borderColor: "#f1f5f9",
      strokeDashArray: 0,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
    },
    legend: {
      show: true,
      position: "top" as const,
      horizontalAlign: "left" as const,
      fontSize: "12px",
      fontWeight: 500,
      markers: { size: 7, strokeWidth: 0 },
      itemMargin: { horizontal: 12, vertical: 0 },
      offsetY: 4,
    },
    tooltip: {
      shared: true,
      intersect: false,
      y: { formatter: (v: number) => fmt(v) },
      theme: "light",
    },
    dataLabels: { enabled: false },
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-gray-900">Overview Analytics</h2>
        <RangeDropdown value={range} onChange={setRange} />
      </div>
      {isLoading ? (
        <div className="h-[290px]"><Sk w="w-full" h="h-full" r="lg" /></div>
      ) : (
        <ReactApexChart type="area" series={series} options={options} height={290} />
      )}
    </Card>
  );
}

/* ── Revenue Overview ──────────────────────────────────────────────────────── */
function RevenueChart() {
  const [range, setRange] = useState<DateRange>("7d");
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-revenue", range],
    queryFn:  () => dashboardService.revenue(range),
    refetchInterval: 60_000,
  });

  const series = data?.breakdown.map(b => b.value) || [];
  const colors = data?.breakdown.map(b => b.color) || [];
  const labels = data?.breakdown.map(b => b.label) || [];
  const total  = data?.totalRevenue || 0;
  const rangeLabel = RANGES.find(r => r.value === range)?.label ?? "Last 7 Days";

  const donutOptions = {
    chart: { type: "donut", toolbar: { show: false }, animations: { enabled: true } },
    colors,
    labels,
    legend: { show: false },
    dataLabels: { enabled: false },
    plotOptions: {
      pie: {
        donut: {
          size: "65%",
          labels: {
            show: true,
            name: {
              show: true,
              fontSize: "11px",
              color: "#9ca3af",
              offsetY: -4,
            },
            value: {
              show: true,
              fontSize: "15px",
              fontWeight: "700",
              color: "#111827",
              offsetY: 4,
              formatter: (v: string) => {
                const n = Number(v);
                return n >= 1000 ? "$" + (n / 1000).toFixed(1) + "K" : "$" + n.toFixed(0);
              },
            },
            total: {
              show: true,
              showAlways: true,
              label: "Total",
              fontSize: "11px",
              color: "#6b7280",
              formatter: () => {
                return total >= 1000 ? "$" + (total / 1000).toFixed(1) + "K" : "$" + total.toFixed(0);
              },
            },
          },
        },
      },
    },
    stroke: { width: 2, colors: ["#fff"] },
    tooltip: { y: { formatter: (v: number) => fmtCurrency(v) } },
  };

  return (
    <Card className="p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900">Revenue Overview</h2>
        <RangeDropdown value={range} onChange={setRange} />
      </div>

      {isLoading ? (
        <div className="h-[280px] flex items-center justify-center">
          <Sk w="w-full" h="h-full" r="lg" />
        </div>
      ) : (
        <div className="flex gap-4">
          {/* Left: stats + breakdown */}
          <div className="flex-1 flex flex-col justify-between min-w-0">
            {/* Total */}
            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-1">Total Revenue</p>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-2xl font-bold text-gray-900">{fmtCurrency(total)}</span>
                {data && (
                  <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${data.growth >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {data.growth >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {data.growth >= 0 ? "+" : ""}{data.growth.toFixed(1)}%
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">vs {rangeLabel.toLowerCase()}</p>
            </div>

            {/* Breakdown */}
            <div className="space-y-2.5 flex-1">
              {(data?.breakdown || []).map(b => (
                <div key={b.label} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: b.color }} />
                    <span className="text-xs text-gray-600 truncate">{b.label}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-semibold text-gray-900">{fmtCurrency(b.value)}</span>
                    <span className={`text-xs font-medium flex items-center gap-0.5 ${b.growth >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {b.growth >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                      {b.growth >= 0 ? "+" : ""}{b.growth.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* View Full Report button */}
            <button className="mt-4 w-full flex items-center justify-center gap-1.5 bg-[#fff0f2] hover:bg-[#ffe0e4] text-[#fe2c55] text-xs font-semibold py-2.5 rounded-xl transition-colors">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18M9 21V9"/>
              </svg>
              View Full Report
            </button>
          </div>

          {/* Right: donut */}
          <div className="shrink-0 flex items-center justify-center" style={{ width: 160 }}>
            <ReactApexChart type="donut" series={series} options={donutOptions} height={200} width={160} />
          </div>
        </div>
      )}
    </Card>
  );
}

/* ── Small coin badge for transactions table ──────────────────────────────────── */
function CoinBadge({ n }: { n: number | null }) {
  if (n == null) return <span className="text-gray-400">-</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-xs font-medium text-gray-800">{fmtNum(n)}</span>
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full shrink-0"
        style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)" }}>
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
          <circle cx="5" cy="5" r="4" fill="#fde68a"/>
          <text x="5" y="7.5" textAnchor="middle" fontSize="5" fontWeight="bold" fill="#92400e">$</text>
        </svg>
      </span>
    </span>
  );
}

/* ── Recent Transactions ─────────────────────────────────────────────────────── */
function RecentTransactions() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-transactions"],
    queryFn:  () => dashboardService.recentTransactions(5),
    refetchInterval: 30_000,
  });

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900">Recent Transactions</h2>
        <button className="text-xs font-medium text-[#fe2c55] border border-[#fe2c55]/30 px-3 py-1 rounded-lg hover:bg-red-50 transition-colors">
          View All
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <Sk key={i} w="w-full" h="h-12" r="lg" />)}</div>
      ) : (
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="border-b border-gray-100">
                {["ID","User / Creator","Type","Coins","Amount (USD)","Status","Date"].map(h => (
                  <th key={h} className="text-left pb-2.5 pr-3 text-[11px] font-semibold text-gray-400 whitespace-nowrap first:pl-0">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data || []).map(tx => {
                const [datePart, timePart] = tx.date.split(" ").reduce<[string, string]>(
                  (acc, p, i) => i === 0 ? [p, acc[1]] : i === 1 ? [acc[0], p] : [acc[0] + " " + p, acc[1]],
                  ["", ""]
                );
                return (
                  <tr key={tx.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors">
                    <td className="py-3 pr-3 whitespace-nowrap">
                      <span className="text-xs font-semibold text-[#fe2c55]">{tx.id}</span>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={tx.userName} src={tx.avatar} size={34} />
                        <div>
                          <p className="text-xs font-semibold text-gray-900 whitespace-nowrap leading-tight">{tx.userName}</p>
                          <p className="text-[11px] text-gray-400 leading-tight">@{tx.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap ${TYPE_COLORS[tx.type] || "bg-gray-100 text-gray-600"}`}>
                        {tx.type}
                      </span>
                    </td>
                    <td className="py-3 pr-3"><CoinBadge n={tx.coins} /></td>
                    <td className="py-3 pr-3">
                      <span className="text-xs font-semibold text-gray-900 whitespace-nowrap">{fmtCurrency(tx.amountUsd)}</span>
                    </td>
                    <td className="py-3 pr-3">
                      <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                        Completed
                      </span>
                    </td>
                    <td className="py-3 whitespace-nowrap">
                      <p className="text-[11px] text-gray-700 leading-tight">{datePart}</p>
                      <p className="text-[11px] text-gray-400 leading-tight">{timePart || tx.date}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ── Top Creators ─────────────────────────────────────────────────────────────── */
function TopCreators() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-top-creators"],
    queryFn:  () => dashboardService.topCreators(5),
    refetchInterval: 60_000,
  });

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900">Top Creators</h2>
        <button className="text-xs font-medium text-[#fe2c55] border border-[#fe2c55]/30 px-3 py-1 rounded-lg hover:bg-red-50 transition-colors">
          View All
        </button>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-2 pb-2 mb-1 border-b border-gray-100">
        <span className="w-4 shrink-0" />
        <div className="flex-1 min-w-0" />
        <span className="text-[11px] font-semibold text-gray-400 w-24 text-right shrink-0">RC Coins</span>
        <span className="text-[11px] font-semibold text-gray-400 w-14 text-right shrink-0">Growth</span>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <Sk key={i} w="w-full" h="h-12" r="lg" />)}</div>
      ) : (
        <div className="space-y-1">
          {(data || []).map((c, i) => (
            <div key={c.username} className="flex items-center gap-2 py-2 rounded-lg hover:bg-gray-50/70 transition-colors -mx-1 px-1">
              <span className="w-4 text-center text-[11px] font-bold text-gray-400 shrink-0">{c.rank}</span>
              <Avatar name={c.name} src={c.avatar} size={36} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-900 truncate leading-tight">{c.name}</p>
                <p className="text-[11px] text-gray-400 truncate leading-tight">@{c.username}</p>
              </div>
              <div className="w-24 text-right shrink-0">
                <p className="text-xs font-semibold text-gray-900 whitespace-nowrap">{fmtNum(c.coins)} RC</p>
              </div>
              <div className="w-14 text-right shrink-0">
                <span className={`text-xs font-semibold inline-flex items-center justify-end gap-0.5 ${c.growth >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {c.growth >= 0 ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
                  {c.growth >= 0 ? "+" : ""}{c.growth.toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ── System Overview - live sparklines ────────────────────────────────────────── */
function SystemOverview() {
  const { data, isLoading, refetch } = useQuery({
    queryKey:        ["dashboard-system"],
    queryFn:         dashboardService.systemStatus,
    refetchInterval: 15_000,
  });

  const sOpts = (color: string) => ({
    chart:  { type: "line", sparkline: { enabled: true }, animations: { speed: 400, enabled: true } },
    colors: [color],
    stroke: { width: 2, curve: "smooth" },
    tooltip:{ enabled: false },
  });

  const storageColor = (pct: number) =>
    pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-400" : "bg-emerald-500";

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900">System Overview</h2>
        <button onClick={() => refetch()} title="Refresh" className="text-gray-400 hover:text-gray-600 transition-colors">
          <RefreshCw size={13} />
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(6)].map((_, i) => <Sk key={i} w="w-full" h="h-9" r="md" />)}</div>
      ) : data ? (
        <div className="space-y-0">
          {/* Server Status */}
          {[
            { icon: "🖥", label: "Server Status", status: data.serverStatus },
            { icon: "🗄", label: "Database",      status: data.databaseStatus },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between py-2.5 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <span className="text-sm">{row.icon}</span>
                <span className="text-xs text-gray-700">{row.label}</span>
              </div>
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${row.status === "operational" ? "text-emerald-600" : "text-red-500"}`}>
                <span className={`w-2 h-2 rounded-full ${row.status === "operational" ? "bg-emerald-500" : "bg-red-500"}`} />
                {row.status === "operational" ? "Operational" : "Issue"}
              </span>
            </div>
          ))}

          {/* Storage */}
          <div className="py-2.5 border-b border-gray-50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm">☁</span>
                <span className="text-xs text-gray-700">Storage Usage</span>
              </div>
              <span className="text-xs font-bold text-gray-900">{data.storageUsage}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className={`h-2 rounded-full transition-all duration-700 ${storageColor(data.storageUsage)}`}
                style={{ width: `${data.storageUsage}%` }} />
            </div>
          </div>

          {/* Metric rows with live sparklines */}
          {[
            { icon: "⏱",  label: "API Response",    value: `${data.apiResponseMs}ms`, spark: data.apiSparkline,     color: "#10b981" },
            { icon: "👥", label: "Active Sessions",  value: fmtNum(data.activeSessions), spark: data.sessionSparkline, color: "#3b82f6" },
            { icon: "💬", label: "Support Tickets",  value: String(data.supportTickets), spark: data.ticketSparkline,  color: "#fe2c55" },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-sm shrink-0">{row.icon}</span>
                <div className="min-w-0">
                  <p className="text-[11px] text-gray-500 leading-tight">{row.label}</p>
                  <p className="text-xs font-bold text-gray-900 leading-tight">{row.value}</p>
                </div>
              </div>
              <div className="shrink-0 ml-2" style={{ width: 72, height: 34 }}>
                <ReactApexChart type="line" series={[{ data: row.spark }]} options={sOpts(row.color)} height={34} width={72} />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

/* ── Mini Sparkline Card ──────────────────────────────────────────────────────── */
interface MiniCardProps {
  label: string;
  value: string;
  growth: number;
  spark: number[];
  color: string;
  icon: React.ReactNode;
  iconBg: string;
  vsLabel: string;
}
function MiniCard({ label, value, growth, spark, color, icon, iconBg, vsLabel }: MiniCardProps) {
  const up = growth >= 0;
  const sparkOpts = {
    chart:  { type: "line", sparkline: { enabled: true }, animations: { enabled: true, speed: 500 } },
    colors: [color],
    stroke: { width: 2.5, curve: "smooth" },
    tooltip:{ enabled: false },
  };
  return (
    <Card className="pt-4 pb-0 px-4 overflow-hidden">
      {/* Icon + label row */}
      <div className="flex items-center gap-2.5 mb-2">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>{icon}</div>
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      {/* Value + growth */}
      <div className="flex items-baseline gap-2">
        <span className="text-[18px] font-bold text-gray-900 leading-tight">{value}</span>
        <span className={`text-[11px] font-semibold inline-flex items-center gap-0.5 ${up ? "text-emerald-500" : "text-red-500"}`}>
          {up ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
          {up ? "+" : ""}{growth.toFixed(1)}%
        </span>
      </div>
      <p className="text-[11px] text-gray-400 mt-0.5 mb-3">{vsLabel}</p>
      {/* Full-width sparkline flush to edges */}
      <div className="-mx-4">
        <ReactApexChart type="line" series={[{ data: spark }]} options={sparkOpts} height={52} />
      </div>
    </Card>
  );
}

/* ── Coin icon ──────────────────────────────────────────────────────────────── */

/* ── Main Page ────────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const [range, setRange] = useState<DateRange>("7d");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data: overview, isLoading: ovLoading } = useQuery({
    queryKey: ["dashboard-overview", range],
    queryFn:  () => dashboardService.overview(range),
    refetchInterval: 60_000,
  });

  const { data: mini, isLoading: miniLoading } = useQuery({
    queryKey: ["dashboard-mini", range],
    queryFn:  () => dashboardService.miniMetrics(range),
    refetchInterval: 60_000,
  });

  const vsLabel = `vs ${RANGES.find(r => r.value === range)?.label.toLowerCase() || "last 7 days"}`;

  const kpiCards = overview ? [
    {
      label: "Total Users",
      value: fmtNum(overview.totalUsers),
      growth: overview.growth.users,
      icon: <IconUsers size={28} />,
      iconBg: "bg-blue-50",
      rangeLabel: vsLabel,
    },
    {
      label: "Active Creators",
      value: fmtNum(overview.activeCreators),
      growth: overview.growth.creators,
      icon: <IconCreator size={28} />,
      iconBg: "bg-violet-50",
      rangeLabel: vsLabel,
    },
    {
      label: "Total Videos",
      value: fmtNum(overview.totalVideos),
      growth: overview.growth.videos,
      icon: <IconVideo size={28} />,
      iconBg: "bg-teal-50",
      rangeLabel: vsLabel,
    },
    {
      label: "Live Sessions",
      value: fmtNum(overview.liveSessions),
      growth: overview.growth.liveSessions,
      icon: <IconLive size={28} />,
      iconBg: "bg-orange-50",
      rangeLabel: vsLabel,
    },
    {
      label: "Total Coins Transacted",
      value: fmtNum(overview.totalCoinsTransacted),
      growth: overview.growth.coins,
      icon: <IconCoins size={28} />,
      iconBg: "bg-amber-50",
      rangeLabel: vsLabel,
    },
    {
      label: "Platform Revenue",
      value: fmtCurrency(overview.platformRevenue),
      growth: overview.growth.revenue,
      icon: <IconWallet size={28} />,
      iconBg: "bg-red-50",
      rangeLabel: vsLabel,
    },
  ] : null;

  const miniCards = mini && mounted ? [
    {
      label:   "New Users",
      value:   fmtNum(mini.newUsers),
      growth:  mini.growth.newUsers,
      spark:   mini.sparklines.newUsers,
      color:   "#3b82f6",
      icon:    <Users size={15} className="text-blue-600" />,
      iconBg:  "bg-blue-50",
      vsLabel: vsLabel,
    },
    {
      label:   "New Videos",
      value:   fmtNum(mini.newVideos),
      growth:  mini.growth.newVideos,
      spark:   mini.sparklines.newVideos,
      color:   "#10b981",
      icon:    <Video size={15} className="text-emerald-600" />,
      iconBg:  "bg-emerald-50",
      vsLabel: vsLabel,
    },
    {
      label:   "Live Views",
      value:   fmt(mini.liveViews),
      growth:  mini.growth.liveViews,
      spark:   mini.sparklines.liveViews,
      color:   "#f59e0b",
      icon:    <Zap size={15} className="text-amber-600" />,
      iconBg:  "bg-amber-50",
      vsLabel: vsLabel,
    },
    {
      label:   "Coins Sold",
      value:   fmt(mini.coinsSold) + " RC",
      growth:  mini.growth.coinsSold,
      spark:   mini.sparklines.coinsSold,
      color:   "#fe2c55",
      icon:    <IconCoins size={15} />,
      iconBg:  "bg-red-50",
      vsLabel: vsLabel,
    },
    {
      label:   "Revenue",
      value:   fmtCurrency(mini.revenue),
      growth:  mini.growth.revenue,
      spark:   mini.sparklines.revenue,
      color:   "#8b5cf6",
      icon:    <DollarSign size={15} className="text-violet-600" />,
      iconBg:  "bg-violet-50",
      vsLabel: vsLabel,
    },
  ] : null;

  return (
    <AdminShell title="Overview">
      {/* Header row: subtitle left, calendar picker right */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <p className="text-sm text-gray-500">
          Welcome back, Admin! Here&apos;s what&apos;s happening on Teezer today.
        </p>
        <CalendarRangePicker value={range} onChange={setRange} />
      </div>

      {/* Row 1 - 6 KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3.5 mb-5">
        {ovLoading || !kpiCards
          ? [...Array(6)].map((_, i) => <Card key={i} className="p-4 h-[90px]"><Sk w="w-full" h="h-full" r="lg" /></Card>)
          : kpiCards.map(c => <KpiCard key={c.label} {...c} />)
        }
      </div>

      {/* Row 2 - Analytics + Revenue donut */}
      {mounted && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-5 mb-5">
          <div className="xl:col-span-3"><AnalyticsChart /></div>
          <div className="xl:col-span-2"><RevenueChart /></div>
        </div>
      )}

      {/* Row 3 - Transactions / Top Creators / System */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 mb-5">
        <div className="xl:col-span-6"><RecentTransactions /></div>
        <div className="xl:col-span-3"><TopCreators /></div>
        <div className="xl:col-span-3">{mounted && <SystemOverview />}</div>
      </div>

      {/* Row 4 - 5 mini sparkline cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
        {!miniCards
          ? [...Array(5)].map((_, i) => <Card key={i} className="p-4 h-[130px]"><Sk w="w-full" h="h-full" r="lg" /></Card>)
          : miniCards.map(c => <MiniCard key={c.label} {...c} />)
        }
      </div>
    </AdminShell>
  );
}
