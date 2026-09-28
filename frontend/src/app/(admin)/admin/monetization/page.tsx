"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  CircleDollarSign, CreditCard, TrendingUp, TrendingDown, Users,
  DollarSign, Gift, BarChart3, Wallet, RefreshCw, AlertTriangle,
  ArrowUpRight, Clock, Loader2,
} from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { Button } from "@/admin-panel/components/ui/button";
import { adminService } from "@/admin-panel/services/admin.service";
import { formatCompact } from "@/admin-panel/lib/utils";

const ApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

type Metric = { total: number; period: number; pct: number };
type MonData = {
  range: string; days: number;
  headline: {
    revenue: Metric; paid_out: Metric; pending_payout: Metric;
    commission: Metric; owed: Metric; lifetime_paid: Metric;
  };
  revenue_breakdown: { label: string; value: number; period: number }[];
  series: { date: string; revenue: number; payouts: number }[];
  by_source: { source: string; total: number; count: number }[];
  payout_status: { status: string; count: number; total: number }[];
  top_creators: {
    id: number; username: string; name: string; avatar: string | null;
    lifetime: number; available: number; pending: number;
  }[];
  wallets: { available: number; pending: number; lifetime: number };
  attention: { pending_payouts: number; failed_payouts: number; unpaid_orders: number };
};

const RANGES = [
  { key: "7d",  label: "7 days"  },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "all", label: "All time" },
];

const money = (n: number) =>
  "$" + (Math.abs(n) >= 10000 ? formatCompact(n) : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

const PAYOUT_STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting review", processing: "Processing", scheduled: "Scheduled",
  paid: "Paid", failed: "Failed", rejected: "Rejected", cancelled: "Cancelled",
};

/** Headline card. The delta is hidden when there is no prior period to compare
    against, rather than showing a meaningless 0%. */
function MoneyCard({ label, value, sub, pct, icon, emphasis }: {
  label: string; value: string; sub?: string; pct?: number; icon: React.ReactNode; emphasis?: boolean;
}) {
  const showPct = typeof pct === "number" && pct !== 0;
  const up = (pct ?? 0) > 0;
  return (
    <div className="rounded-2xl border border-[#e8eaed] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${emphasis ? "bg-[#fff3ec] text-[#fd4605]" : "bg-[#f4f5f7] text-[#6b7280]"}`}>
            {icon}
          </span>
          <p className="truncate text-[11px] text-[#9ca3af]">{label}</p>
        </div>
        {showPct && (
          <span className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums
            ${up ? "bg-[#f4f5f7] text-[#374151]" : "bg-[#f4f5f7] text-[#6b7280]"}`}>
            {up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
            {Math.abs(pct!)}%
          </span>
        )}
      </div>
      <p className={`mt-2 text-[23px] font-black leading-tight tabular-nums ${emphasis ? "text-[#fd4605]" : "text-[#111827]"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[10.5px] text-[#9ca3af]">{sub}</p>}
    </div>
  );
}

function BarList({ rows, empty }: { rows: { label: string; value: number; sub?: string }[]; empty: string }) {
  if (!rows.length) return <p className="py-6 text-center text-[12px] text-[#9ca3af]">{empty}</p>;
  const max = Math.max(...rows.map(r => r.value), 1);
  return (
    <div className="space-y-3">
      {rows.map(r => (
        <div key={r.label}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="truncate text-[12px] font-medium capitalize text-[#374151]">{r.label}</span>
            <span className="shrink-0 text-[11.5px] font-bold tabular-nums text-[#111827]">{money(r.value)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#f3f4f6]">
            <div className="h-full rounded-full bg-[#fd4605] transition-all" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          {r.sub && <p className="mt-0.5 text-[10.5px] text-[#9ca3af]">{r.sub}</p>}
        </div>
      ))}
    </div>
  );
}

export default function MonetizationPage() {
  const [range, setRange] = useState("30d");

  const { data, isLoading, isFetching, refetch } = useQuery<MonData>({
    queryKey: ["admin-monetization", range],
    queryFn:  () => adminService.monetizationOverview(range),
    staleTime: 60_000,
  });

  const h = data?.headline;
  const series = data?.series ?? [];
  const hasSeries = series.some(d => d.revenue > 0 || d.payouts > 0);

  const chartOptions = {
    chart:   { type: "area" as const, toolbar: { show: false }, zoom: { enabled: false }, fontFamily: "inherit", stacked: false },
    dataLabels: { enabled: false },
    stroke:  { curve: "smooth" as const, width: [2.5, 2] },
    colors:  ["#fd4605", "#9ca3af"],
    fill: { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.25, opacityTo: 0.02, stops: [0, 100] } },
    grid:    { borderColor: "#f3f4f6", strokeDashArray: 4, padding: { left: 8, right: 8 } },
    legend:  { position: "top" as const, horizontalAlign: "right" as const, fontSize: "11px", markers: { radius: 6 } },
    xaxis: {
      categories: series.map(d => d.date),
      labels: {
        style: { colors: "#9ca3af", fontSize: "10px" },
        formatter: (v: string) => { if (!v) return ""; const d = new Date(v); return `${d.getDate()}/${d.getMonth() + 1}`; },
        hideOverlappingLabels: true, rotate: 0,
      },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: "#9ca3af", fontSize: "10px" }, formatter: (v: number) => "$" + formatCompact(Math.round(v)) } },
    tooltip: { y: { formatter: (v: number) => money(v) } },
  };

  const attention = data?.attention;
  const needsAttention = (attention?.pending_payouts ?? 0) + (attention?.failed_payouts ?? 0) > 0;

  return (
    <AdminShell title="Monetization">
      <div className="space-y-5">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#fff3ec] text-[#fd4605]">
              <CircleDollarSign className="h-[22px] w-[22px]" />
            </span>
            <div>
              <h2 className="text-[20px] font-extrabold tracking-[-0.01em] text-[#111827]">Monetization Overview</h2>
              <p className="text-[13px] text-[#6b7280]">Revenue in, payouts out, and what is waiting on a decision.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#9ca3af]" />}
            <div className="flex items-center gap-0.5 rounded-xl bg-[#f4f5f7] p-0.5">
              {RANGES.map(r => (
                <button key={r.key} onClick={() => setRange(r.key)}
                  className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                    range === r.key ? "bg-white text-[#111827] shadow-sm" : "text-[#6b7280] hover:text-[#374151]"
                  }`}>
                  {r.label}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>
        </div>

        {/* ── Waiting on a human ── */}
        {needsAttention && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#ffd9e2] bg-[#fff3ec] px-4 py-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-[#fd4605]" />
            <p className="text-[12.5px] text-[#7a1229]">
              {(attention?.pending_payouts ?? 0) > 0 && (
                <><span className="font-bold tabular-nums">{attention?.pending_payouts}</span> payout request{attention?.pending_payouts === 1 ? "" : "s"} awaiting review</>
              )}
              {(attention?.pending_payouts ?? 0) > 0 && (attention?.failed_payouts ?? 0) > 0 && " · "}
              {(attention?.failed_payouts ?? 0) > 0 && (
                <><span className="font-bold tabular-nums">{attention?.failed_payouts}</span> failed payout{attention?.failed_payouts === 1 ? "" : "s"} to resolve</>
              )}
            </p>
            <Link href="/admin/payouts" className="ml-auto">
              <Button size="sm" variant="primary">Review payouts <ArrowUpRight className="h-3 w-3" /></Button>
            </Link>
          </div>
        )}

        {/* ── Headline ── */}
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-[#e8eaed] bg-white p-4 shadow-sm">
                <div className="h-8 w-8 animate-pulse rounded-xl bg-[#f1f2f4]" />
                <div className="mt-3 h-6 w-28 animate-pulse rounded bg-[#f1f2f4]" />
                <div className="mt-2 h-2.5 w-20 animate-pulse rounded bg-[#f6f7f8]" />
              </div>
            ))}
          </div>
        ) : !data ? (
          <div className="flex flex-col items-center rounded-2xl border border-[#e8eaed] bg-white py-16 text-[#9ca3af] shadow-sm">
            <CircleDollarSign className="mb-3 h-9 w-9 opacity-30" />
            <p className="text-[13px] font-semibold text-[#374151]">Monetization data unavailable</p>
            <Button variant="outline" className="mt-3" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <MoneyCard label="Total revenue" emphasis value={money(h!.revenue.total)}
                sub={`${money(h!.revenue.period)} in the last ${data.days} days`} pct={h!.revenue.pct}
                icon={<CircleDollarSign className="h-[15px] w-[15px]" />} />
              <MoneyCard label="Paid out to creators" value={money(h!.paid_out.total)}
                sub={`${money(h!.paid_out.period)} in this period`} pct={h!.paid_out.pct}
                icon={<CreditCard className="h-[15px] w-[15px]" />} />
              <MoneyCard label="Pending payouts" value={money(h!.pending_payout.total)}
                sub="requested and not yet paid"
                icon={<Clock className="h-[15px] w-[15px]" />} />
              <MoneyCard label="Platform commission" value={money(h!.commission.total)}
                sub="kept from completed payouts"
                icon={<DollarSign className="h-[15px] w-[15px]" />} />
              <MoneyCard label="Creator balances owed" value={money(h!.owed.total)}
                sub="available for creators to withdraw"
                icon={<Wallet className="h-[15px] w-[15px]" />} />
              <MoneyCard label="Lifetime creator earnings" value={money(h!.lifetime_paid.total)}
                sub="everything credited since launch"
                icon={<TrendingUp className="h-[15px] w-[15px]" />} />
            </div>

            {/* ── Revenue vs payouts ── */}
            <div className="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e8eaed] px-5 py-3.5">
                <h3 className="text-[13px] font-bold text-[#111827]">Revenue in vs. payouts out</h3>
                <span className="text-[11px] text-[#9ca3af]">coin sales, daily · payouts on the day they were paid</span>
              </div>
              <div className="p-3">
                {hasSeries ? (
                  <div className="overflow-x-auto">
                    <ApexChart
                      options={chartOptions as never}
                      series={[
                        { name: "Revenue", data: series.map(d => d.revenue) },
                        { name: "Payouts", data: series.map(d => d.payouts) },
                      ]}
                      type="area" height={290}
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-20 text-[#9ca3af]">
                    <BarChart3 className="mb-2 h-7 w-7 opacity-30" />
                    <p className="text-[12.5px] font-medium text-[#374151]">No money moved in this period</p>
                    <p className="mt-0.5 text-[11px]">Try a longer range.</p>
                  </div>
                )}
              </div>
            </div>

            {/* ── Breakdowns ── */}
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white shadow-sm">
                <div className="border-b border-[#e8eaed] px-5 py-3.5">
                  <h3 className="text-[13px] font-bold text-[#111827]">Where revenue comes from</h3>
                </div>
                <div className="p-5">
                  <BarList
                    rows={data.revenue_breakdown.map(b => ({
                      label: b.label, value: b.value,
                      sub: b.period > 0 ? `${money(b.period)} in this period` : undefined,
                    }))}
                    empty="No revenue recorded yet."
                  />
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white shadow-sm">
                <div className="border-b border-[#e8eaed] px-5 py-3.5">
                  <h3 className="text-[13px] font-bold text-[#111827]">Creator earnings by source</h3>
                </div>
                <div className="p-5">
                  <BarList
                    rows={data.by_source.map(s => ({
                      label: s.source.replace(/_/g, " "), value: s.total,
                      sub: `${formatCompact(s.count)} entries`,
                    }))}
                    empty="No creator earnings recorded yet."
                  />
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white shadow-sm">
                <div className="border-b border-[#e8eaed] px-5 py-3.5">
                  <h3 className="text-[13px] font-bold text-[#111827]">Payout queue</h3>
                </div>
                <div className="p-5">
                  {data.payout_status.length === 0 ? (
                    <p className="py-6 text-center text-[12px] text-[#9ca3af]">No payout requests yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {data.payout_status.map(p => (
                        <div key={p.status} className="flex items-center justify-between gap-2 border-b border-[#f3f4f6] py-2 last:border-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[12.5px] font-medium text-[#374151]">
                              {PAYOUT_STATUS_LABEL[p.status] ?? p.status}
                            </span>
                            <span className="rounded-full bg-[#f3f4f6] px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-[#6b7280]">
                              {p.count}
                            </span>
                          </div>
                          <span className="text-[12.5px] font-bold tabular-nums text-[#111827]">{money(p.total)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <Link href="/admin/payouts">
                    <Button size="sm" variant="outline" className="mt-4 w-full justify-center">
                      Open payout requests <ArrowUpRight className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>

            {/* ── Top creators ── */}
            <div className="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-[#e8eaed] px-5 py-3.5">
                <h3 className="text-[13px] font-bold text-[#111827]">Top earning creators</h3>
                <span className="text-[11px] text-[#9ca3af]">by lifetime earnings</span>
              </div>
              {data.top_creators.length === 0 ? (
                <p className="py-10 text-center text-[12px] text-[#9ca3af]">No creator wallets yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px]">
                    <thead>
                      <tr className="border-b border-[#f3f4f6] bg-[#f9fafb]">
                        {["Creator", "Lifetime", "Available", "Pending", ""].map((th, i) => (
                          <th key={th || i}
                            className={`px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[#9ca3af] ${i === 0 ? "text-left" : "text-right"}`}>
                            {th}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f3f4f6]">
                      {data.top_creators.map((c, i) => (
                        <tr key={c.id} className="transition-colors hover:bg-[#fafbfc]">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2.5">
                              <span className="w-4 shrink-0 text-[11px] font-bold tabular-nums text-[#c4c7ce]">{i + 1}</span>
                              {c.avatar
                                ? <img src={c.avatar} alt="" className="h-8 w-8 shrink-0 rounded-full bg-[#f3f4f6] object-cover" />
                                : <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#f4f5f7] text-[12px] font-bold text-[#6b7280]">
                                    {(c.username?.[0] ?? "?").toUpperCase()}
                                  </span>}
                              <div className="min-w-0">
                                <Link href={`/admin/users/${c.id}`}
                                  className="block truncate text-[12.5px] font-semibold text-[#111827] hover:text-[#fd4605]">
                                  {c.name || c.username}
                                </Link>
                                <p className="truncate text-[10.5px] text-[#9ca3af]">@{c.username}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right text-[12.5px] font-bold tabular-nums text-[#111827]">{money(c.lifetime)}</td>
                          <td className="px-5 py-3 text-right text-[12.5px] tabular-nums text-[#374151]">{money(c.available)}</td>
                          <td className="px-5 py-3 text-right text-[12.5px] tabular-nums text-[#9ca3af]">{money(c.pending)}</td>
                          <td className="px-5 py-3 text-right">
                            <Link href={`/admin/users/${c.id}`}
                              className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#fd4605] hover:underline">
                              View <ArrowUpRight className="h-3 w-3" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Sections ── */}
        <div>
          <h3 className="mb-3 text-[13px] font-bold text-[#111827]">Manage</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { href: "/admin/payouts",             icon: CreditCard, label: "Payout Requests",         desc: "Review and approve creator payouts" },
              { href: "/admin/transactions",        icon: BarChart3,  label: "Transactions",            desc: "Wallet transactions and credits" },
              { href: "/admin/gifts",               icon: Gift,       label: "Gifts & Coins",           desc: "Coin packages and gift pricing" },
              { href: "/admin/revenue",             icon: DollarSign, label: "Revenue Reports",         desc: "Platform revenue breakdown" },
              { href: "/admin/users?role=creator",  icon: Users,      label: "Creator Monetization",    desc: "Creator earnings and levels" },
              { href: "/admin/verification",        icon: TrendingUp, label: "Monetization Eligibility", desc: "Verification and eligibility rules" },
            ].map(({ href, icon: Icon, label, desc }) => (
              <Link key={href} href={href}
                className="group flex items-start gap-3 rounded-2xl border border-[#e8eaed] bg-white p-4 shadow-sm transition-colors hover:border-[#fd4605]/40">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f4f5f7] text-[#6b7280] transition-colors group-hover:bg-[#fff3ec] group-hover:text-[#fd4605]">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-[#111827]">{label}</p>
                  <p className="mt-0.5 text-[11.5px] text-[#9ca3af]">{desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
