"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  AlertTriangle, Bookmark, CheckCircle2, ChevronDown, ChevronRight,
  CircleDollarSign, Clock, CreditCard, DollarSign, Edit3, Heart,
  Info, Lock, Megaphone, RefreshCw, Rocket, Star, Store, ThumbsUp, TrendingUp,
  Tv2, Users, Video, Wallet, X, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";
import { studioService } from "@/services/studio.service";
import { StudioSidebarWrapper } from "./studio-sidebar-wrapper";
import { StudioTopbarShared, type DateRange } from "./studio-topbar-shared";
import { MonetizationPrograms } from "./monetization-programs";
import { WithdrawInAppModal } from "./withdraw-in-app-modal";

const ApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n || 0);
const fmtK = (n: number) => (n >= 1_000_000 ? `${(n / 1e6).toFixed(1)}M` : n >= 1_000 ? `${(n / 1e3).toFixed(1)}K` : String(n));
const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "-";
const fmtShort = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "-";

const RANGE_OPTS = [
  { label: "Last 7 days",   value: "7d"  },
  { label: "Last 28 days",  value: "28d" },
  { label: "Last 3 months", value: "90d" },
];

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-[#f0f0f0] bg-white shadow-sm", className)}>
      {children}
    </div>
  );
}

function CardHead({ title, subtitle, action, badge }: { title: string; subtitle?: string; action?: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
      <div>
        <div className="flex items-center gap-2">
          <p className="text-[13.5px] font-bold text-[#111827]">{title}</p>
          {badge}
        </div>
        {subtitle && <p className="mt-0.5 text-[11px] text-[#9ca3af]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function Spark({ data, color = "#fd4605" }: { data: number[]; color?: string }) {
  const series  = useMemo(() => [{ data: data.length > 1 ? data : [0, 0, 0, 0, 0, 0, 0] }], [data]);
  const options = useMemo(() => ({
    chart:   { type: "area" as const, sparkline: { enabled: true }, toolbar: { show: false }, animations: { enabled: false } },
    stroke:  { curve: "smooth" as const, width: 1.5, colors: [color] },
    fill:    { type: "gradient", gradient: { colorStops: [{ offset: 0, color, opacity: 0.2 }, { offset: 100, color, opacity: 0 }] } },
    tooltip: { enabled: false },
    markers: { size: 0 },
  }), [color]);
  return <div style={{ width: 80, height: 36 }}><ApexChart type="area" series={series} options={options} height={36} width={80} /></div>;
}

type CardStat = { title: string; value: string; sub: string; up?: boolean; icon: React.ReactNode; iconBg: string; spark?: number[]; sparkColor?: string };
function StatCard({ title, value, sub, up, icon, iconBg, spark, sparkColor }: CardStat) {
  return (
    <Card className="flex flex-col gap-0 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className={cn("grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl", iconBg)}>
          {icon}
        </div>
        {sparkColor && <Spark data={spark ?? [0,0,0,0,0,0,0]} color={sparkColor} />}
      </div>
      <p className="mt-2 text-[11.5px] font-medium text-[#6b7280]">{title}</p>
      <p className="mt-0.5 text-[19px] font-black leading-tight text-[#111827]">{value}</p>
      <p className={cn("mt-1 flex items-center gap-0.5 text-[11px] font-semibold",
        up === true ? "text-[#16a34a]" : up === false ? "text-[#dc2626]" : "text-[#6b7280]")}>
        {up === true && "↑"}{up === false && "↓"} {sub}
      </p>
    </Card>
  );
}

function RangeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  const label = RANGE_OPTS.find(o => o.value === value)?.label ?? "Last 28 days";
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 rounded-lg border border-[#e5e7eb] px-3 py-1.5 text-[11.5px] font-semibold text-[#374151] hover:border-[#d1d5db] transition">
        {label} <ChevronDown className="h-3 w-3 text-[#9ca3af]" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 overflow-hidden rounded-xl border border-[#f0f0f0] bg-white py-1 shadow-lg" style={{ minWidth: 150 }}>
          {RANGE_OPTS.map(o => (
            <button key={o.value} onClick={() => { onChange(o.value); setOpen(false); }}
              className={cn("flex w-full items-center px-3 py-2 text-left text-[12px] font-medium transition hover:bg-[#f8f9fb]",
                o.value === value ? "text-[#fd4605] font-bold" : "text-[#374151]")}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RevenueChart({ daily }: { daily: Array<{ date: string; amount: number }> }) {
  const cats   = daily.map(d => fmtShort(d.date) ?? d.date);
  const amounts = daily.map(d => d.amount);
  const series  = useMemo(() => [{ name: "Revenue", data: amounts }], [amounts]);
  const options = useMemo(() => ({
    chart:      { type: "area" as const, toolbar: { show: false }, zoom: { enabled: false }, animations: { enabled: false } },
    stroke:     { curve: "smooth" as const, width: 2, colors: ["#fd4605"] },
    fill:       { type: "gradient", gradient: { shadeIntensity: 1, type: "vertical",
      colorStops: [{ offset: 0, color: "#fd4605", opacity: 0.2 }, { offset: 100, color: "#fd4605", opacity: 0 }] } },
    xaxis:      { categories: cats, tickAmount: Math.min(cats.length, 7),
      labels: { style: { fontSize: "10px", colors: "#9ca3af" }, rotate: 0 },
      axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis:      { labels: { formatter: (v: number) => v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v.toFixed(0)}`,
      style: { fontSize: "10px", colors: "#9ca3af" } }, min: 0 },
    grid:       { borderColor: "#f3f4f6", strokeDashArray: 4, xaxis: { lines: { show: false } } },
    markers:    { size: 4, colors: ["#fd4605"], strokeColors: "#fff", strokeWidth: 2, hover: { size: 6 } },
    dataLabels: { enabled: false },
    tooltip:    { custom: ({ series: s, dataPointIndex: i }: any) =>
      `<div style="padding:8px 12px;background:#fff;border:1px solid #f0f0f0;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.08)">
        <div style="color:#9ca3af;font-size:10px;font-weight:600;margin-bottom:2px">${cats[i] ?? ""}</div>
        <div style="color:#111827;font-size:13px;font-weight:700">${fmt(s[0][i] ?? 0)}</div>
      </div>` },
  }), [cats, amounts]);
  if (!daily.length) return <div className="flex h-52 items-center justify-center text-[12px] text-[#9ca3af]">No revenue data yet.</div>;
  return <ApexChart type="area" series={series} options={options} height={220} />;
}

const SRC_COLORS = ["#fd4605", "#1d8cff", "#8b5cf6", "#22c55e", "#f97316", "#a855f7"];
// "Sell on Teezer" matches the programme's own label (studio-programmes.ts /
// CreatorEarning::sourceLabelMap()), so a Shop sale is named identically
// everywhere it shows up.
const SRC_LABELS = ["Short Video Ads", "Live Gifts", "Subscriptions", "Brand Collabs", "Series Earnings", "Sell on Teezer"];
const SRC_KEYS   = ["ad_revenue", "live_gift", "subscription", "brand_collab", "series", "shop"] as const;

function RevenueDonut({ sources, total }: { sources: Record<string, number>; total: number }) {
  const amounts = SRC_KEYS.map(k => sources[k] ?? 0);
  const safe    = amounts.every(a => a === 0) ? [1, 1, 1, 1, 1] : amounts;
  const series  = useMemo(() => safe, [safe]);
  const options = useMemo(() => ({
    chart:       { type: "donut" as const, toolbar: { show: false }, animations: { enabled: false } },
    labels:      SRC_LABELS,
    colors:      SRC_COLORS,
    legend:      { show: false },
    dataLabels:  { enabled: false },
    stroke:      { width: 0 },
    plotOptions: { pie: { donut: { size: "70%",
      labels: { show: true,
        total: { show: true, showAlways: true, label: "Total", fontSize: "11px", color: "#9ca3af",
          formatter: () => fmt(total) },
        value: { show: true, fontSize: "14px", fontWeight: 700, color: "#111827", formatter: (v: string) => fmt(parseFloat(v)) },
      }
    } } },
    tooltip: { y: { formatter: (v: number, opts: any) => `${fmt(amounts[opts.seriesIndex] ?? 0)} (${total > 0 ? Math.round((amounts[opts.seriesIndex] ?? 0) / total * 100) : 0}%)` } },
  }), [series, total]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex justify-center">
        <ApexChart type="donut" series={series} options={options} height={200} width={200} />
      </div>
      <div className="space-y-1.5 px-1">
        {SRC_KEYS.map((key, i) => {
          const amt = sources[key] ?? 0;
          const pct = total > 0 ? Math.round(amt / total * 100) : 0;
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: SRC_COLORS[i] }} />
              <span className="flex-1 truncate text-[11.5px] font-medium text-[#374151]">{SRC_LABELS[i]}</span>
              <span className="text-[11.5px] font-bold text-[#111827]">{fmt(amt)}</span>
              <span className="w-7 text-right text-[10.5px] text-[#9ca3af]">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type MStatus = { account_standing: boolean; ad_revenue_eligible: boolean; live_gifts_enabled: boolean; subscriptions_enabled: boolean; tax_info_completed: boolean };
function MonetizationStatus({ status }: { status: MStatus }) {
  const rows = [
    { label: "Account in good standing", sub: "No violations or strikes",     ok: status.account_standing      },
    { label: "Eligible for ad revenue",  sub: "You can earn from your videos", ok: status.ad_revenue_eligible   },
    { label: "Live gifts enabled",        sub: "You can receive gifts on Live", ok: status.live_gifts_enabled    },
    { label: "Subscriptions enabled",     sub: "5 active subscription tiers",  ok: status.subscriptions_enabled },
    { label: "Tax info completed",        sub: "W-9 on file",                   ok: status.tax_info_completed    },
  ];
  return (
    <div className="divide-y divide-[#f8f9fb]">
      {rows.map(r => (
        <div key={r.label} className="flex cursor-pointer items-center gap-3 px-5 py-3 transition hover:bg-[#fafafa]">
          <div className={cn("grid h-5 w-5 flex-shrink-0 place-items-center rounded-full",
            r.ok ? "bg-[#dcfce7]" : "bg-[#fef3c7]")}>
            {r.ok
              ? <CheckCircle2 className="h-3.5 w-3.5 text-[#16a34a]" />
              : <AlertTriangle className="h-3 w-3 text-[#d97706]" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-[#111827]">{r.label}</p>
            <p className="text-[10.5px] text-[#9ca3af]">{r.sub}</p>
          </div>
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[#d1d5db]" />
        </div>
      ))}
    </div>
  );
}

type PayoutsData = { available_balance: number; pending_balance: number; minimum_withdraw: number;
  next_payout?: { amount: number; date: string; days_until: number } | null;
  payment_method?: { provider: string; account_email?: string } | null };
function Payouts({ payouts, onWithdraw }: { payouts: PayoutsData; onWithdraw: () => void }) {
  return (
    <div className="grid grid-cols-3 gap-5 px-5 py-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Current Balance</p>
        <p className="mt-1 text-[22px] font-black text-[#111827] leading-tight">{fmt(payouts.available_balance)}</p>
        <button onClick={onWithdraw}
          className="mt-2.5 rounded-xl bg-[#fd4605] px-5 py-2 text-[12.5px] font-bold text-white transition hover:bg-[#e03e04] disabled:cursor-not-allowed disabled:opacity-50 active:scale-95">
          Withdraw
        </button>
        <p className="mt-1.5 text-[10px] text-[#9ca3af]">Minimum ${payouts.minimum_withdraw} to withdraw</p>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Next Payout</p>
        <div className="mt-1 flex items-center gap-1.5">
          <div className="grid h-6 w-6 place-items-center rounded-lg bg-[#f0fdf4]">
            <Clock className="h-3.5 w-3.5 text-[#22c55e]" />
          </div>
          <p className="text-[14.5px] font-bold text-[#111827]">{payouts.next_payout?.date ?? "-"}</p>
        </div>
        <p className="mt-0.5 text-[11px] text-[#9ca3af]">
          {payouts.next_payout?.days_until != null ? `In ${payouts.next_payout.days_until} days` : "No pending payout"}
        </p>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Payment Method</p>
        {payouts.payment_method ? (
          <div className="mt-1">
            <div className="flex items-center gap-2">
              <div className="grid h-7 w-7 place-items-center rounded-lg bg-[#eff6ff]">
                <CreditCard className="h-4 w-4 text-[#1d8cff]" />
              </div>
              <p className="text-[14px] font-bold text-[#111827] capitalize">{payouts.payment_method.provider}</p>
            </div>
            {payouts.payment_method.account_email && (
              <p className="mt-0.5 truncate text-[10.5px] text-[#9ca3af]">{payouts.payment_method.account_email}</p>
            )}
          </div>
        ) : (
          <p className="mt-1 text-[12px] text-[#9ca3af]">Not configured</p>
        )}
        <button className="mt-2 rounded-lg border border-[#e5e7eb] px-3 py-1 text-[11px] font-semibold text-[#374151] transition hover:border-[#fd4605] hover:text-[#fd4605]">
          Manage
        </button>
      </div>
    </div>
  );
}

type GoalData = { monthly_goal: number; current: number; percentage: number };
function RevenueGoal({ goal, onEdit }: { goal: GoalData; onEdit: () => void }) {
  const pct = Math.min(goal.percentage, 100);
  return (
    <div className="flex h-full flex-col gap-3 px-5 py-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-medium text-[#6b7280]">Monthly Goal</p>
        <p className="text-[14px] font-black text-[#111827]">{fmt(goal.monthly_goal)}</p>
      </div>
      <div className="text-[12px] font-semibold text-[#374151]">
        <span className="text-[15px] font-black text-[#111827]">{fmt(goal.current)}</span>
        <span className="text-[#9ca3af]"> / {fmt(goal.monthly_goal)}</span>
      </div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-[#f3f4f6]">
        <div className="h-full rounded-full bg-[#fd4605] transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-[#fd4605]">{pct.toFixed(0)}%</p>
        {pct >= 80 && <p className="text-[10.5px] text-[#6b7280]">🚀 Great progress! Keep it up!</p>}
      </div>
      <button onClick={onEdit} className="mt-auto flex items-center gap-1 self-start text-[11px] font-semibold text-[#fd4605] hover:underline">
        <Edit3 className="h-3 w-3" /> Edit goal
      </button>
    </div>
  );
}

const TIPS = [
  { Icon: Zap,     color: "#fd4605", bg: "#fff3ec", title: "Post consistently", sub: "Creators who post 4+ times/week earn 2.5x more."  },
  { Icon: Tv2,     color: "#1d8cff", bg: "#eff6ff", title: "Go Live",            sub: "Live streams get 3x more gifts on average."         },
  { Icon: Bookmark,color: "#8b5cf6", bg: "#f5f3ff", title: "Create Series",      sub: "Series increase watch time and conversions."        },
  { Icon: Users,   color: "#22c55e", bg: "#f0fdf4", title: "Collaborate",        sub: "Brand collabs can significantly boost earnings."    },
];
function Tips() {
  return (
    <div className="divide-y divide-[#f8f9fb]">
      {TIPS.map(t => (
        <div key={t.title} className="flex cursor-pointer items-center gap-3 px-5 py-3 transition hover:bg-[#fafafa]">
          <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl" style={{ background: t.bg }}>
            <t.Icon className="h-4 w-4" style={{ color: t.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold text-[#111827]">{t.title}</p>
            <p className="text-[10.5px] leading-snug text-[#9ca3af]">{t.sub}</p>
          </div>
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[#d1d5db]" />
        </div>
      ))}
    </div>
  );
}

const STATUS_PILL: Record<string, string> = {
  paid:    "bg-[#dcfce7] text-[#16a34a]",
  pending: "bg-[#fef3c7] text-[#d97706]",
  on_hold: "bg-[#fee2e2] text-[#dc2626]",
};
type TopItem = { id: number; title?: string; thumbnail_url?: string; duration?: number; views: number; revenue: number; rpm: number; payout_status: string; created_at?: string };
function TopContent({ items }: { items: TopItem[] }) {
  const fmtDur = (s?: number) => { if (!s) return ""; const m = Math.floor(s/60); return `${m}:${String(s%60).padStart(2,"0")}`; };
  if (!items.length) return (
    <div className="flex h-40 items-center justify-center text-[12px] text-[#9ca3af]">
      No earning content for this period.
    </div>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[500px] text-left text-[12px]">
        <thead>
          <tr className="border-b border-[#f0f0f0]">
            {["Video", "Revenue", "Views", "RPM", "Payout Status"].map(h => (
              <th key={h} className={cn("px-3 pb-2 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#9ca3af]",
                h !== "Video" && "text-right")}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className="group border-b border-[#f8f9fb] transition hover:bg-[#fafafa] cursor-pointer"
              onClick={() => window.location.href = `/studio/content/${item.id}/insights`}>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="relative h-8 w-[36px] flex-shrink-0 overflow-hidden rounded bg-[#f3f4f6]">
                    {item.thumbnail_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={item.thumbnail_url} alt="" className="h-full w-full object-cover" />
                      : <div className="grid h-full w-full place-items-center"><Video className="h-2.5 w-2.5 text-[#d1d5db]" /></div>}
                    {item.duration ? <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-0.5 text-[6px] font-bold text-white">{fmtDur(item.duration)}</span> : null}
                  </div>
                  <div className="min-w-0">
                    <p className="max-w-[140px] truncate text-[11.5px] font-semibold text-[#111827] group-hover:text-[#fd4605]">{item.title ?? "Untitled"}</p>
                    <p className="text-[9.5px] text-[#9ca3af]">{fmtShort(item.created_at)}</p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2.5 text-right font-bold text-[#111827]">{fmt(item.revenue)}</td>
              <td className="px-3 py-2.5 text-right text-[#374151]">{fmtK(item.views)}</td>
              <td className="px-3 py-2.5 text-right text-[#374151]">${item.rpm.toFixed(2)}</td>
              <td className="px-3 py-2.5 text-right">
                <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-bold capitalize",
                  STATUS_PILL[item.payout_status] ?? "bg-[#f3f4f6] text-[#6b7280]")}>
                  {item.payout_status.replace("_", " ")}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TX_ICON: Record<string, React.ElementType> = {
  ad_revenue: DollarSign, live_gift: Heart, subscription: RefreshCw, brand_collab: Megaphone, series: Bookmark, shop: Store,
};
const TX_CLS: Record<string, string> = {
  ad_revenue: "bg-[#fff3ec] text-[#fd4605]", live_gift: "bg-[#eff6ff] text-[#1d8cff]",
  subscription: "bg-[#f5f3ff] text-[#8b5cf6]", brand_collab: "bg-[#f0fdf4] text-[#22c55e]", series: "bg-[#fff7ed] text-[#f97316]",
  shop: "bg-[#faf5ff] text-[#a855f7]",
};
type TxItem = { id: number; source: string; label: string; amount: number; earned_at?: string | null };
function RecentTransactions({ items }: { items: TxItem[] }) {
  if (!items.length) return <p className="py-6 text-center text-[12px] text-[#9ca3af]">No transactions yet.</p>;
  return (
    <div className="divide-y divide-[#f8f9fb]">
      {items.slice(0, 4).map(t => {
        const Icon = TX_ICON[t.source] ?? DollarSign;
        return (
          <div key={t.id} className="flex items-center gap-2.5 px-4 py-3 transition hover:bg-[#fafafa] text-[11px]">
            <div className={cn("grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg", TX_CLS[t.source] ?? "bg-[#f3f4f6] text-[#6b7280]")}>
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[#111827]">{t.label}</p>
              <p className="text-[9.5px] text-[#9ca3af]">{fmtDate(t.earned_at)}</p>
            </div>
            <p className="flex-shrink-0 font-bold text-[#16a34a]">+{fmt(t.amount)}</p>
          </div>
        );
      })}
    </div>
  );
}

const BRANDS = [
  { name: "GlowUp",     color: "#fd4605" },
  { name: "URBAN WEAR", color: "#111827" },
  { name: "FitLife",    color: "#22c55e" },
];
function Marketplace() {
  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-1">
      <p className="text-[11px] leading-relaxed text-[#6b7280]">
        Get discovered by top brands and earn more through collaborations.
      </p>
      <div className="flex flex-wrap gap-2">
        {BRANDS.map(b => (
          <div key={b.name}
            className="flex flex-shrink-0 items-center justify-center rounded-lg px-2.5 py-1.5 text-[8.5px] font-black text-white"
            style={{ background: b.color }}>
            {b.name}
          </div>
        ))}
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#f3f4f6] text-[10px] font-bold text-[#9ca3af]">+</div>
      </div>
      <button className="w-full rounded-xl bg-[#fd4605] py-2 text-[12px] font-bold text-white transition hover:bg-[#e03e04] active:scale-95">
        Explore Opportunities
      </button>
    </div>
  );
}

function GoalModal({ current, onClose, onSubmit, busy }: {
  current: number; onClose: () => void; onSubmit: (g: number) => void; busy: boolean;
}) {
  const [val, setVal] = useState(String(current));
  const n = parseFloat(val) || 0;
  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[16px] font-bold text-[#111827]">Edit Revenue Goal</p>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-full hover:bg-[#f3f4f6]"><X className="h-4 w-4 text-[#9ca3af]" /></button>
        </div>
        <p className="mb-3 text-[12px] text-[#6b7280]">Set your monthly revenue target.</p>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] font-bold text-[#9ca3af]">$</span>
          <input type="number" value={val} min={0} onChange={e => setVal(e.target.value)}
            className="w-full rounded-xl border border-[#e5e7eb] py-2.5 pl-7 pr-4 text-[14px] font-bold outline-none focus:border-[#fd4605]" />
        </div>
        <div className="mt-4 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-[#e5e7eb] py-2.5 text-[13px] font-semibold text-[#374151] hover:bg-[#f8f9fb] transition">Cancel</button>
          <button onClick={() => n >= 0 && onSubmit(n)} disabled={n < 0 || busy}
            className="flex-1 rounded-xl bg-[#fd4605] py-2.5 text-[13px] font-bold text-white hover:bg-[#e03e04] disabled:opacity-50 transition">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Skeleton({ h = 120, className }: { h?: number; className?: string }) {
  return <div className={cn("animate-pulse rounded-2xl bg-[#f0f0f0]", className)} style={{ height: h }} />;
}

export function StudioMonetizationPage() {
  const router   = useRouter();
  const qc       = useQueryClient();
  const { isAuthenticated, authReady } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);
  const [range,     setRange]     = useState("28d");
  const [dateRange, setDateRange] = useState<DateRange>({
    start: new Date(Date.now() - 27 * 86400000), end: new Date(),
  });
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showGoal,     setShowGoal]     = useState(false);

  useEffect(() => {
    if (authReady && !isAuthenticated) router.replace("/");
  }, [authReady, isAuthenticated, router]);

  const { data: d, isLoading } = useQuery({
    queryKey: ["studio-mon-overview", range],
    queryFn:  () => studioService.monetizationOverview({ range }),
    enabled:  isAuthenticated,
    staleTime: 60_000,
    retry: 1,
  });

  /**
   * The key for the withdrawal attempt in flight.
   *
   * Held in a ref rather than minted per call, because the point of the key is
   * to survive the one case the UI cannot prevent: the request reaches the
   * server, the payout is created, and the response is lost. Retrying with the
   * SAME key makes the server replay the original instead of paying twice.
   *
   * Cleared on success, and on a definitive rejection (4xx) - those did not
   * create a payout, so the next attempt should be a genuinely new one. It is
   * deliberately KEPT on a network error or a 5xx, where whether the payout
   * exists is unknowable from here, and reusing the key is what makes a retry
   * safe.
   */

  const goalMut = useMutation({
    mutationFn: (g: number) => studioService.updateRevenueGoal(g),
    onSuccess:  () => { toast.success("Goal updated."); setShowGoal(false); void qc.invalidateQueries({ queryKey: ["studio-mon-overview"] }); },
    onError:    () => toast.error("Failed to update goal."),
  });

  if (!authReady || !isAuthenticated) return null;

  // Always have at least a flat sparkline so charts show even with no earnings yet.
  const sparkRaw = d?.revenue_overview?.slice(-7).map((r: any) => r.amount as number) ?? [];
  const spark    = sparkRaw.length > 1 ? sparkRaw : [0, 0, 0, 0, 0, 0, 0];
  const summary = d?.summary ?? {};
  const growth  = summary.revenue_growth?.percentage ?? 0;
  const growUp  = summary.revenue_growth?.up ?? true;

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f9fb]">
      <StudioSidebarWrapper collapsed={collapsed} onToggle={() => setCollapsed(o => !o)} activeHref="/studio/monetization" />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <StudioTopbarShared
          title="Monetization"
          subtitle="Track your earnings and revenue growth"
          dateRange={dateRange}
          onDateRangeChange={(dr) => {
            setDateRange(dr);
            const days = Math.round((dr.end.getTime() - dr.start.getTime()) / 86400000);
            setRange(days <= 7 ? "7d" : days <= 35 ? "28d" : "90d");
          }}
        />

        <main className="flex-1 overflow-y-auto px-6 py-5 space-y-4" style={{ scrollbarWidth: "none" }}>

          {isLoading && (
            <div className="space-y-4">
              <div className="grid grid-cols-5 gap-4">{Array.from({length:5}).map((_,i)=><Skeleton key={i} h={110}/>)}</div>
              <div className="grid grid-cols-12 gap-4">
                <Skeleton h={280} className="col-span-5"/><Skeleton h={280} className="col-span-4"/><Skeleton h={280} className="col-span-3"/>
              </div>
              <div className="grid grid-cols-12 gap-4">
                <Skeleton h={160} className="col-span-5"/><Skeleton h={160} className="col-span-4"/><Skeleton h={160} className="col-span-3"/>
              </div>
              <Skeleton h={240}/>
              <div className="grid grid-cols-12 gap-4">
                <Skeleton h={300} className="col-span-5"/>
                <Skeleton h={300} className="col-span-3"/>
                <div className="col-span-4 flex flex-col gap-4">
                  <Skeleton h={140}/>
                  <Skeleton h={150}/>
                </div>
              </div>
            </div>
          )}

          {!isLoading && (
            <>
              <div className="grid grid-cols-5 gap-4">
                <StatCard title="Total Earnings" value={fmt(summary.total_earnings?.amount ?? 0)} sub={`${Math.abs(summary.total_earnings?.growth ?? 0).toFixed(1)}% vs last ${range}`} up={summary.total_earnings?.up}
                  icon={<Wallet className="h-4.5 w-4.5 text-[#fd4605]" />} iconBg="bg-[#fff3ec]" spark={spark} sparkColor="#fd4605" />
                <StatCard title="Available Balance" value={fmt(summary.available_balance?.amount ?? 0)} sub={`${Math.abs(growth).toFixed(1)}% vs last ${range}`} up={growUp}
                  icon={<CircleDollarSign className="h-4.5 w-4.5 text-[#1d8cff]" />} iconBg="bg-[#eff6ff]" spark={spark} sparkColor="#1d8cff" />
                <StatCard title="This Month" value={fmt(summary.this_month?.amount ?? 0)} sub="vs last month" up={true}
                  icon={<TrendingUp className="h-4.5 w-4.5 text-[#22c55e]" />} iconBg="bg-[#f0fdf4]" spark={spark} sparkColor="#22c55e" />
                <StatCard title="Estimated Next Payout" value={fmt(summary.estimated_next_payout?.amount ?? 0)} sub={summary.estimated_next_payout?.date ?? "-"}
                  icon={<Clock className="h-4.5 w-4.5 text-[#8b5cf6]" />} iconBg="bg-[#f5f3ff]" />
                <StatCard title="Revenue Growth" value={`${growUp ? "+" : ""}${growth.toFixed(1)}%`} sub={`vs last ${range}`} up={growUp}
                  icon={<Rocket className="h-4.5 w-4.5 text-[#f97316]" />} iconBg="bg-[#fff7ed]" spark={spark} sparkColor="#f97316" />
              </div>

              <div className="grid grid-cols-12 gap-4">
                <Card className="col-span-5">
                  <CardHead title="Revenue Overview" subtitle="Monthly earnings" action={<RangeSelect value={range} onChange={setRange} />} />
                  <div className="px-3 pb-4"><RevenueChart daily={d?.revenue_overview ?? []} /></div>
                </Card>
                <Card className="col-span-4">
                  <CardHead title="Revenue Sources" />
                  <div className="pb-4"><RevenueDonut sources={d?.revenue_sources ?? {}} total={d?.revenue_sources?.total ?? 0} /></div>
                </Card>
                <Card className="col-span-3">
                  <CardHead title="Monetization Status" />
                  <MonetizationStatus status={d?.monetization_status ?? {
                    account_standing: true, ad_revenue_eligible: false,
                    live_gifts_enabled: false, subscriptions_enabled: false, tax_info_completed: false,
                  }} />
                </Card>
              </div>

              <div className="grid grid-cols-12 gap-4">
                <Card className="col-span-5"><CardHead title="Payouts" /><Payouts payouts={d?.payouts ?? { available_balance: 0, pending_balance: 0, minimum_withdraw: 50 }} onWithdraw={() => setShowWithdraw(true)} /></Card>
                <Card className="col-span-4"><CardHead title="Revenue Goal" action={<button onClick={() => setShowGoal(true)} className="text-[11.5px] font-semibold text-[#fd4605] hover:underline">Edit goal</button>} /><RevenueGoal goal={d?.revenue_goal ?? { monthly_goal: 10000, current: 0, percentage: 0 }} onEdit={() => setShowGoal(true)} /></Card>
                <Card className="col-span-3"><CardHead title="Monetization Tips" /><Tips /></Card>
              </div>

              <div className="grid grid-cols-12 gap-4">
                {/* ── Top Earning Content - LEFT WIDE ── */}
                <Card className="col-span-5">
                  <CardHead title="Top Earning Content" subtitle={`Your best performing videos · ${range === "7d" ? "Last 7 days" : range === "90d" ? "Last 3 months" : "Last 28 days"}`} action={<RangeSelect value={range} onChange={setRange} />} />
                  <div className="px-2 pb-3"><TopContent items={d?.top_earning_content ?? []} /></div>
                </Card>

                {/* ── Recent Transactions - CENTER ── */}
                <Card className="col-span-3">
                  <CardHead title="Recent Transactions" action={<button className="text-[11px] font-semibold text-[#fd4605] hover:underline">View all</button>} />
                  <RecentTransactions items={d?.recent_transactions ?? []} />
                </Card>

                {/* ── Creator Marketplace (top) + Eligible Opportunities (below) - RIGHT STACKED ── */}
                <div className="col-span-4 flex flex-col gap-4">
                  <Card>
                    <CardHead title="Creator Marketplace" badge={<span className="rounded-full bg-[#fd4605] px-1.5 py-0.5 text-[8px] font-black text-white">New</span>} />
                    <Marketplace />
                  </Card>

                  <Card>
                    <CardHead title="Eligible Earning Opportunities" />
                    <MonetizationPrograms />
                  </Card>
                </div>
              </div>

              <div className="h-2" />
            </>
          )}
        </main>
      </div>

      {/* Withdrawals happen in the app, where identity, tax forms and payout
          methods are established. The web form that used to be here could take
          a request the platform was not in a position to honour, which is worse
          than not offering it - it looks like it worked. */}
      {showWithdraw && (
        <WithdrawInAppModal
          available={d?.payouts?.available_balance ?? 0}
          pending={d?.payouts?.pending_balance ?? 0}
          minimum={d?.payouts?.minimum_withdraw ?? 50}
          onClose={() => setShowWithdraw(false)}
        />
      )}
      {showGoal && (
        <GoalModal
          current={d?.revenue_goal?.monthly_goal ?? 10000}
          onClose={() => setShowGoal(false)}
          onSubmit={g => goalMut.mutate(g)}
          busy={goalMut.isPending}
        />
      )}
    </div>
  );
}
