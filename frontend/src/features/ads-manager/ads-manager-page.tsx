"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart2, CircleDollarSign, Megaphone, MousePointerClick,
  Pause, Play, Plus, Target, TrendingUp,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { useAuthStore } from "@/store/auth.store";
import { cn } from "@/lib/utils";
import {
  adsService, adMoney, adNum,
  type AdOverview, type AdCampaign,
} from "@/services/ads.service";
import { apiMessage } from "@/services/api";

/* ── Stat card ─────────────────────────────────────────────────────────── */
function AdStatCard({ icon: Icon, iconBg, iconColor, label, value, sub }: {
  icon: React.ElementType; iconBg: string; iconColor: string;
  label: string; value: string; sub: string;
}) {
  return (
    <div className="flex-1 rounded-2xl border border-[#f0f0f0] bg-white p-5">
      <div className="mb-3 flex items-center gap-3">
        <div className={cn("grid h-10 w-10 place-items-center rounded-full", iconBg)}>
          <Icon className={cn("h-5 w-5", iconColor)} />
        </div>
        <span className="text-[13px] font-semibold text-[#6b7280]">{label}</span>
      </div>
      <p className="text-[28px] font-extrabold text-[#111827] leading-none">{value}</p>
      <p className="mt-1.5 text-[12px] text-[#9ca3af]">{sub}</p>
    </div>
  );
}

/* ── Status pill ───────────────────────────────────────────────────────── */
const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  draft:          { bg: "bg-[#f3f4f6]", text: "text-[#6b7280]", label: "Draft" },
  pending_review: { bg: "bg-[#fef3c7]", text: "text-[#b45309]", label: "In review" },
  approved:       { bg: "bg-[#dbeafe]", text: "text-[#1d4ed8]", label: "Approved" },
  active:         { bg: "bg-[#dcfce7]", text: "text-[#15803d]", label: "Active" },
  paused:         { bg: "bg-[#fff0f4]", text: "text-[#be123c]", label: "Paused" },
  rejected:       { bg: "bg-[#fee2e2]", text: "text-[#b91c1c]", label: "Rejected" },
  completed:      { bg: "bg-[#e5e7eb]", text: "text-[#374151]", label: "Ended" },
  archived:       { bg: "bg-[#e5e7eb]", text: "text-[#374151]", label: "Archived" },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.draft;
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", s.bg, s.text)}>
      {s.label}
    </span>
  );
}

/* ── Empty campaigns list ──────────────────────────────────────────────── */
function EmptyCampaigns() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#e5e7eb] py-16 text-center">
      <div className="mb-4 grid h-16 w-16 place-items-center rounded-full bg-[#fff0f4]">
        <Megaphone className="h-8 w-8 text-[#fe2c55]" />
      </div>
      <p className="text-[15px] font-bold text-[#374151]">No campaigns yet</p>
      <p className="mt-1 max-w-[280px] text-[13px] text-[#9ca3af]">
        Promote a video from your Studio to reach more people and grow your audience.
      </p>
    </div>
  );
}

const TABS = ["All", "Active", "Paused", "Ended"] as const;
type Tab = typeof TABS[number];

function matchesTab(status: string, tab: Tab) {
  if (tab === "All") return true;
  if (tab === "Active") return status === "active";
  if (tab === "Paused") return status === "paused";
  return ["completed", "archived", "rejected"].includes(status); // Ended
}

/* ── Main page ─────────────────────────────────────────────────────────── */
export function AdsManagerPage() {
  const router = useRouter();
  const { isAuthenticated, authReady } = useAuthStore();

  const [overview, setOverview]   = useState<AdOverview | null>(null);
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [tab, setTab]             = useState<Tab>("All");
  const [busyId, setBusyId]       = useState<number | null>(null);

  useEffect(() => {
    if (authReady && !isAuthenticated) router.replace("/");
  }, [authReady, isAuthenticated, router]);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [ov, cs] = await Promise.all([adsService.overview(), adsService.campaigns()]);
      setOverview(ov);
      setCampaigns(cs);
    } catch (e) {
      setError(apiMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authReady && isAuthenticated) load();
  }, [authReady, isAuthenticated, load]);

  const toggle = async (c: AdCampaign) => {
    setBusyId(c.id);
    try {
      if (c.status === "active") await adsService.pause(c.id);
      else await adsService.resume(c.id);
      await load();
    } catch (e) {
      setError(apiMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  if (!authReady || !isAuthenticated) return null;

  const currency = overview?.currency ?? "USD";
  const visible = campaigns.filter((c) => matchesTab(c.status, tab));

  return (
    <AppShell>
      <div className="page-scroll bg-[#f8f9fb]">
        <div className="mx-auto max-w-[1200px] px-6 py-8">

          {/* Header */}
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h1 className="text-[24px] font-extrabold text-[#111827]">Ads Manager</h1>
              <p className="mt-0.5 text-[14px] text-[#6b7280]">
                Create, manage and track your promotions
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/studio")}
              className="flex items-center gap-2 rounded-full bg-[#fe2c55] px-5 py-2.5 text-[13px] font-bold text-white shadow-sm transition hover:bg-[#e0243d]"
            >
              <Plus className="h-4 w-4" />
              Create Campaign
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[13px] font-medium text-[#b91c1c]">
              {error}
            </div>
          )}

          {/* Stat cards */}
          <div className="mb-6 flex flex-wrap gap-4">
            <AdStatCard icon={TrendingUp} iconBg="bg-[#fff0f4]" iconColor="text-[#fe2c55]"
              label="Active Campaigns"
              value={loading ? "-" : adNum(overview?.active_campaigns)}
              sub={overview?.active_campaigns ? "Currently running" : "No campaigns running"} />
            <AdStatCard icon={CircleDollarSign} iconBg="bg-[#dcfce7]" iconColor="text-[#16a34a]"
              label="Total Spend"
              value={loading ? "-" : adMoney(overview?.spend_cents, currency)}
              sub="Last 30 days" />
            <AdStatCard icon={Target} iconBg="bg-[#ede9fe]" iconColor="text-[#7c3aed]"
              label="Reach"
              value={loading ? "-" : adNum(overview?.reach)}
              sub="People reached" />
            <AdStatCard icon={MousePointerClick} iconBg="bg-[#fef3c7]" iconColor="text-[#d97706]"
              label="Clicks"
              value={loading ? "-" : adNum(overview?.clicks)}
              sub={overview ? `${overview.ctr}% CTR` : "Total link clicks"} />
          </div>

          {/* Campaigns section */}
          <div className="rounded-2xl border border-[#f0f0f0] bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-extrabold text-[#111827]">Campaigns</h2>
              <div className="flex items-center gap-2">
                {TABS.map((t) => (
                  <button key={t} type="button" onClick={() => setTab(t)}
                    className={cn(
                      "rounded-full px-3 py-1 text-[12px] font-semibold transition",
                      t === tab
                        ? "bg-[#fe2c55] text-white"
                        : "bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e5e7eb]"
                    )}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-[#f3f4f6]" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <EmptyCampaigns />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[#f0f0f0] text-[11px] font-bold uppercase tracking-wide text-[#9ca3af]">
                      <th className="pb-2 pr-3 font-bold">Campaign</th>
                      <th className="pb-2 px-3 font-bold">Status</th>
                      <th className="pb-2 px-3 text-right font-bold">Spend</th>
                      <th className="pb-2 px-3 text-right font-bold">Impressions</th>
                      <th className="pb-2 px-3 text-right font-bold">Clicks</th>
                      <th className="pb-2 pl-3 text-right font-bold"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((c) => {
                      const budget = c.total_budget_cents ?? c.daily_budget_cents ?? 0;
                      const canToggle = c.status === "active" || c.status === "paused";
                      return (
                        <tr key={c.id} className="border-b border-[#f6f6f6] last:border-0">
                          <td className="py-3 pr-3">
                            <p className="text-[13px] font-bold text-[#111827]">{c.name}</p>
                            <p className="text-[11px] text-[#9ca3af]">{c.objective.replaceAll("_", " ")}</p>
                          </td>
                          <td className="px-3"><StatusPill status={c.status} /></td>
                          <td className="px-3 text-right text-[13px] tabular-nums text-[#374151]">
                            {adMoney(c.spent_cents, c.currency)}
                            {budget > 0 && (
                              <span className="text-[#9ca3af]"> / {adMoney(budget, c.currency)}</span>
                            )}
                          </td>
                          <td className="px-3 text-right text-[13px] tabular-nums text-[#374151]">-</td>
                          <td className="px-3 text-right text-[13px] tabular-nums text-[#374151]">-</td>
                          <td className="pl-3 text-right">
                            {canToggle && (
                              <button type="button" disabled={busyId === c.id}
                                onClick={() => toggle(c)}
                                className="inline-flex items-center gap-1 rounded-full border border-[#e5e7eb] px-3 py-1 text-[12px] font-semibold text-[#374151] transition hover:bg-[#f9fafb] disabled:opacity-50">
                                {c.status === "active"
                                  ? (<><Pause className="h-3.5 w-3.5" /> Pause</>)
                                  : (<><Play className="h-3.5 w-3.5" /> Resume</>)}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Quick tips */}
          <div className="mt-5 rounded-2xl border border-[#f0f0f0] bg-white p-6">
            <h2 className="mb-4 text-[15px] font-extrabold text-[#111827]">Getting started with Ads</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { icon: <Megaphone className="h-5 w-5 text-[#fe2c55]" />, bg: "bg-[#fff0f4]",
                  title: "Promote a Video",   desc: "Boost reach on your best content" },
                { icon: <Target className="h-5 w-5 text-[#7c3aed]" />,   bg: "bg-[#ede9fe]",
                  title: "Target Audience",   desc: "Reach the right people by interest & location" },
                { icon: <BarChart2 className="h-5 w-5 text-[#16a34a]" />, bg: "bg-[#dcfce7]",
                  title: "Track Performance", desc: "Real-time stats on your campaigns" },
              ].map(({ icon, bg, title, desc }) => (
                <div key={title}
                  className="flex items-start gap-3 rounded-xl border border-[#f0f0f0] p-4 transition hover:border-[#ffd6df]">
                  <div className={cn("mt-0.5 grid h-10 w-10 flex-shrink-0 place-items-center rounded-full", bg)}>
                    {icon}
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-[#111827]">{title}</p>
                    <p className="mt-0.5 text-[12px] text-[#9ca3af]">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </AppShell>
  );
}
