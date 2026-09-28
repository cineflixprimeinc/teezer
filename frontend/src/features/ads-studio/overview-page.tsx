"use client";

import Link from "next/link";
import Image from "next/image";
import {
  CircleDollarSign, Eye, MousePointerClick, Percent, ShoppingCart, Tag,
  Plus, Megaphone, Layers, MonitorPlay, Users, BarChart3, CreditCard,
  Wallet, ArrowUpRight, Film,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import {
  Card, CardHead, StatTile, StatusPill, DeliveryDot, Skeleton, PrimaryButton,
} from "./ui";
import { PerformanceChart, StatusDonut } from "./charts";
import { DateRangePicker } from "./date-picker";
import { useDashboard } from "./use-dashboard";
import {
  money, moneyPrecise, compact, full, pct, shortDate, shortTime, axisDate,
} from "./format";
import type { AdDashRow, AdTile } from "@/services/ads.service";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/* ── Status donut legend ───────────────────────────────────────────────── */
const DONUT = [
  { key: "active",    label: "Active",    color: "#fe2c55" },
  { key: "paused",    label: "Paused",    color: "#f59e0b" },
  { key: "completed", label: "Completed", color: "#3b82f6" },
  { key: "in_review", label: "In review", color: "#a855f7" },
  { key: "draft",     label: "Draft",     color: "#d1d5db" },
] as const;

/* ── Campaign thumbnail ────────────────────────────────────────────────── */
function Thumb({ src, size = 40 }: { src: string | null; size?: number }) {
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

export function OverviewPage() {
  const { user } = useAuthStore();
  const { data, loading, error } = useDashboard();

  const currency = data?.currency ?? "USD";
  const days = data?.range.days ?? 7;
  const compareLabel = `vs prev ${days}d`;

  const tile = (t?: AdTile) => ({
    deltaPct: t?.delta_pct ?? 0,
    positive: t?.positive ?? true,
  });

  const firstName = (user?.name ?? "there").split(" ")[0];

  const s = data?.tiles;
  const account = data?.account;
  const spentMonth = account?.spent_this_month_cents ?? 0;
  const balance = account?.balance_cents ?? 0;
  const budgetTotal = spentMonth + balance;
  const spentPct = budgetTotal > 0 ? Math.min(100, (spentMonth / budgetTotal) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Greeting + actions */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight text-[#111827]">
            {greeting()}, {firstName}! <span className="align-middle">👋</span>
          </h1>
          <p className="mt-1 text-[14px] text-[#6b7280]">Here&apos;s what&apos;s happening with your ads today.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <DateRangePicker />
          <PrimaryButton href="/studio/promote">
            <Plus className="h-4 w-4" /> Create Campaign
          </PrimaryButton>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[13px] font-medium text-[#b91c1c]">
          {error}
        </div>
      )}

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[128px]" />)
        ) : (
          <>
            <StatTile icon={CircleDollarSign} iconBg="bg-[#fff0f4]" iconColor="text-[#fe2c55]"
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

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Performance */}
        <Card className="xl:col-span-6">
          <CardHead title="Performance Overview"
            action={
              <div className="flex items-center gap-3 text-[12px] font-semibold">
                <Legend color="#fe2c55" label="Spend" />
                <Legend color="#2563eb" label="Clicks" />
                <Legend color="#7c3aed" label="Conversions" />
              </div>
            } />
          <div className="px-3 pb-3 pt-2">
            {loading ? <Skeleton className="mx-2 h-[300px]" /> : (
              <PerformanceChart
                categories={(data?.series ?? []).map((p) => axisDate(p.date))}
                series={[
                  { name: "Spend", color: "#fe2c55", isMoney: true, data: (data?.series ?? []).map((p) => Math.round(p.spend_cents / 100)) },
                  { name: "Clicks", color: "#2563eb", data: (data?.series ?? []).map((p) => p.clicks) },
                  { name: "Conversions", color: "#7c3aed", data: (data?.series ?? []).map((p) => p.conversions) },
                ]}
              />
            )}
          </div>
        </Card>

        {/* Status donut */}
        <Card className="xl:col-span-3">
          <CardHead title="Campaigns by Status" />
          <div className="px-5 pb-5 pt-2">
            {loading ? <Skeleton className="h-[260px]" /> : (
              <>
                <StatusDonut
                  total={data?.status_breakdown.total ?? 0}
                  labels={DONUT.map((d) => d.label)}
                  colors={DONUT.map((d) => d.color)}
                  values={DONUT.map((d) => (data?.status_breakdown as Record<string, number> | undefined)?.[d.key] ?? 0)}
                />
                <div className="mt-3 space-y-2">
                  {DONUT.map((d) => {
                    const v = (data?.status_breakdown as Record<string, number> | undefined)?.[d.key] ?? 0;
                    const total = data?.status_breakdown.total ?? 0;
                    const p = total > 0 ? Math.round((v / total) * 100) : 0;
                    return (
                      <div key={d.key} className="flex items-center gap-2 text-[12px]">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                        <span className="text-[#6b7280]">{d.label}</span>
                        <span className="ml-auto font-bold text-[#111827] tabular-nums">{v}</span>
                        <span className="w-9 text-right text-[#9ca3af] tabular-nums">({p}%)</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </Card>

        {/* Top campaigns */}
        <Card className="xl:col-span-3">
          <CardHead title="Top Campaigns"
            action={<Link href="/ads-manager/campaigns" className="text-[12px] font-bold text-[#fe2c55]">View all</Link>} />
          <div className="px-5 pb-4 pt-3">
            {loading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : (data?.top_campaigns.length ?? 0) === 0 ? (
              <p className="py-10 text-center text-[13px] text-[#9ca3af]">No spend yet in this period.</p>
            ) : (
              <div className="space-y-3.5">
                {data?.top_campaigns.map((c) => (
                  <div key={c.id} className="flex items-center gap-3">
                    <Thumb src={c.thumbnail_url} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold text-[#111827]">{c.name}</p>
                      <p className="truncate text-[11px] text-[#9ca3af]">{c.objective_label}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-bold text-[#111827] tabular-nums">{money(c.spent_cents, c.currency)}</p>
                      <p className="text-[11px] text-[#9ca3af] tabular-nums">{full(c.result_count)} {c.result_label}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Recent campaigns + right rail */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHead title="Recent Campaigns"
            action={<Link href="/ads-manager/campaigns" className="text-[12px] font-bold text-[#fe2c55]">View all</Link>} />
          <div className="mt-3 overflow-x-auto px-2 pb-4">
            <RecentTable rows={data?.recent_campaigns ?? []} loading={loading} />
          </div>
        </Card>

        <div className="space-y-5 xl:col-span-4">
          {/* Quick actions */}
          <Card className="p-5">
            <h2 className="mb-4 text-[15px] font-bold text-[#111827]">Quick Actions</h2>
            <div className="grid grid-cols-4 gap-3">
              <QuickAction icon={Megaphone} label="Campaign" href="/studio/promote" />
              <QuickAction icon={Layers} label="Ad Set" href="/ads-manager/ad-sets" />
              <QuickAction icon={MonitorPlay} label="Ad" href="/ads-manager/ads" />
              <QuickAction icon={Users} label="Audience" href="/ads-manager/audience" />
              <QuickAction icon={BarChart3} label="Reports" href="/ads-manager/reports" />
              <QuickAction icon={CreditCard} label="Billing" href="/ads-manager/billing" />
              <QuickAction icon={MonitorPlay} label="Creative" href="/ads-manager/creative-library" />
              <QuickAction icon={Wallet} label="Account" href="/ads-manager/account" />
            </div>
          </Card>

          {/* Account summary */}
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-bold text-[#111827]">Account Summary</h2>
              <PrimaryButton href="/ads-manager/billing" className="px-4 py-2 text-[12px]">
                Add Funds
              </PrimaryButton>
            </div>
            <p className="text-[12px] font-semibold text-[#9ca3af]">Total Balance</p>
            <p className="mt-1 text-[28px] font-extrabold tracking-tight text-[#111827] tabular-nums">
              {loading ? "-" : money(balance, currency)}
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#f1f3f5]">
              <div className="h-full rounded-full bg-[#fe2c55]" style={{ width: `${spentPct}%` }} />
            </div>
            <div className="mt-3 flex items-center justify-between text-[12px]">
              <div>
                <p className="text-[#9ca3af]">Spent this month</p>
                <p className="font-bold text-[#111827] tabular-nums">{money(spentMonth, currency)}</p>
              </div>
              <div className="text-right">
                <p className="text-[#9ca3af]">Remaining</p>
                <p className="font-bold text-[#111827] tabular-nums">{money(balance, currency)}</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
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

function QuickAction({ icon: Icon, label, href }: { icon: typeof Plus; label: string; href: string }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-1.5 rounded-xl border border-[#eef0f3] py-3 transition hover:border-[#ffd6df] hover:bg-[#fff8fa]">
      <Icon className="h-5 w-5 text-[#fe2c55]" />
      <span className="text-[11px] font-semibold text-[#374151]">{label}</span>
    </Link>
  );
}

function RecentTable({ rows, loading }: { rows: AdDashRow[]; loading: boolean }) {
  if (loading) {
    return <div className="space-y-2 px-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>;
  }
  if (rows.length === 0) {
    return <p className="px-3 py-12 text-center text-[13px] text-[#9ca3af]">No campaigns yet. Create one to see it here.</p>;
  }
  return (
    <table className="w-full min-w-[820px] border-collapse text-left">
      <thead>
        <tr className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af]">
          <th className="px-3 pb-2 font-bold">Campaign</th>
          <th className="px-3 pb-2 font-bold">Objective</th>
          <th className="px-3 pb-2 font-bold">Status</th>
          <th className="px-3 pb-2 font-bold">Delivery</th>
          <th className="px-3 pb-2 text-right font-bold">Results</th>
          <th className="px-3 pb-2 text-right font-bold">Reach</th>
          <th className="px-3 pb-2 text-right font-bold">Spend</th>
          <th className="px-3 pb-2 text-right font-bold">CTR</th>
          <th className="px-3 pb-2 text-right font-bold">Created</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id} className="border-t border-[#f1f3f5]">
            <td className="px-3 py-3">
              <div className="flex items-center gap-3">
                <Thumb src={c.thumbnail_url} size={38} />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold text-[#111827]">{c.name}</p>
                  <p className="truncate text-[11px] text-[#9ca3af]">{c.cam_id ?? `#${c.id}`}</p>
                </div>
              </div>
            </td>
            <td className="px-3 text-[13px] text-[#374151]">{c.objective_label}</td>
            <td className="px-3"><StatusPill status={c.status} /></td>
            <td className="px-3"><DeliveryDot delivery={c.delivery} /></td>
            <td className="px-3 text-right text-[13px] tabular-nums text-[#111827]">
              <span className="font-bold">{full(c.result_count)}</span>
              <span className="block text-[11px] text-[#9ca3af]">{c.result_label}</span>
            </td>
            <td className="px-3 text-right text-[13px] tabular-nums text-[#374151]">{compact(c.reach)}</td>
            <td className="px-3 text-right text-[13px] font-semibold tabular-nums text-[#111827]">{money(c.spent_cents, c.currency)}</td>
            <td className="px-3 text-right text-[13px] tabular-nums text-[#374151]">{pct(c.ctr)}</td>
            <td className="px-3 text-right text-[12px] tabular-nums text-[#6b7280]">
              {shortDate(c.created_at)}
              <span className="block text-[11px] text-[#9ca3af]">{shortTime(c.created_at)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
