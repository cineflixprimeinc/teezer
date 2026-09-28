"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  Plus, Megaphone, Film, Layers, PlayCircle, DollarSign, Target,
} from "lucide-react";
import {
  Card, StatTile, StatusPill, DeliveryDot, EmptyState, Skeleton, PrimaryButton, PageHeader,
} from "../ui";
import { money, moneyPrecise, full, shortDate, shortTime } from "../format";
import { adsService, type AdPromotionsOverview, type AdPromotionRow } from "@/services/ads.service";
import { apiMessage } from "@/services/api";
import { toast } from "sonner";

function objLabel(objective: string): string {
  const map: Record<string, string> = {
    more_views: "Video views",
    more_followers: "Followers",
    more_profile_visits: "Profile visits",
    more_engagement: "Engagement",
  };
  return map[objective] ?? objective.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function campaignName(c: AdPromotionRow): string {
  return c.video?.title || `Promotion #${c.id}`;
}

function dailyCents(c: AdPromotionRow): number | null {
  if (c.daily_budget === null || c.daily_budget === undefined || c.daily_budget === "") return null;
  const n = Number(c.daily_budget);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
}

function Thumb({ src, size = 40 }: { src: string | null; size?: number }) {
  if (src) {
    return (
      <Image src={src} alt="" width={size} height={size}
        className="flex-shrink-0 rounded-lg object-cover" style={{ width: size, height: size }} unoptimized />
    );
  }
  return (
    <span className="grid flex-shrink-0 place-items-center rounded-lg bg-[#f1f3f5]" style={{ width: size, height: size }}>
      <Film className="h-4 w-4 text-[#9ca3af]" />
    </span>
  );
}

const TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
  { key: "pending_review", label: "In review" },
  { key: "completed", label: "Completed" },
  { key: "draft", label: "Draft" },
] as const;

/* On/Off pill toggle for active|paused campaigns. */
function TogglePill({ row, onDone }: { row: AdPromotionRow; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const on = row.status === "active";
  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await adsService.toggle(row.id, !on);
      toast.success(on ? "Campaign paused" : "Campaign resumed");
      await onDone();
    } catch (e) {
      toast.error(apiMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold transition disabled:opacity-50 " +
        (on
          ? "bg-[#dcfce7] text-[#15803d] hover:bg-[#bbf7d0]"
          : "bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e5e7eb]")
      }
    >
      <span className={"h-2 w-2 rounded-full " + (on ? "bg-[#22c55e]" : "bg-[#9ca3af]")} />
      {on ? "On" : "Off"}
    </button>
  );
}

export function CampaignsPage() {
  const [data, setData] = useState<AdPromotionsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await adsService.promotionsOverview());
      setError(null);
    } catch (e) {
      setError(apiMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const currency = data?.summary.currency ?? "USD";
  const campaigns = data?.campaigns ?? [];
  const activeCount = campaigns.filter((c) => c.status === "active").length;
  const rows = tab === "all" ? campaigns : campaigns.filter((c) => c.status === tab);

  const createBtn = (
    <PrimaryButton href="/studio/promote">
      <Plus className="h-4 w-4" /> Create Campaign
    </PrimaryButton>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Campaigns" subtitle="Manage your promotions, budgets and delivery in one place.">
        {createBtn}
      </PageHeader>

      {error && (
        <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[13px] font-medium text-[#b91c1c]">
          {error}
        </div>
      )}

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[128px]" />)
        ) : (
          <>
            <StatTile icon={Layers} iconBg="bg-[#ede9fe]" iconColor="text-[#7c3aed]"
              label="Total campaigns" value={full(campaigns.length)} />
            <StatTile icon={PlayCircle} iconBg="bg-[#dcfce7]" iconColor="text-[#16a34a]"
              label="Active" value={full(activeCount)} />
            <StatTile icon={DollarSign} iconBg="bg-[#fff0f4]" iconColor="text-[#fe2c55]"
              label="Total spent" value={money(data?.summary.total_spent_cents, currency)} />
            <StatTile icon={Target} iconBg="bg-[#fef3c7]" iconColor="text-[#d97706]"
              label="Opportunity score" value={`${data?.summary.opportunity_score ?? 0}/100`} />
          </>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={
                "rounded-full px-4 py-1.5 text-[13px] font-semibold transition " +
                (on
                  ? "bg-[#fe2c55] text-white"
                  : "border border-[#eef0f3] bg-white text-[#6b7280] hover:bg-[#f9fafb]")
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
          </div>
        ) : campaigns.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Megaphone}
              title="No campaigns yet"
              desc="Create your first campaign to start reaching more people."
              action={createBtn}
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Megaphone}
              title="No campaigns in this view"
              desc="Try a different status filter to see your campaigns."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead>
                <tr className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af]">
                  <th className="px-4 py-3 font-bold">Campaign</th>
                  <th className="px-4 py-3 font-bold">Objective</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold">Delivery</th>
                  <th className="px-4 py-3 text-right font-bold">Budget</th>
                  <th className="px-4 py-3 text-right font-bold">Spent</th>
                  <th className="px-4 py-3 text-right font-bold">Results</th>
                  <th className="px-4 py-3 text-right font-bold">Cost/result</th>
                  <th className="px-4 py-3 text-right font-bold">Created</th>
                  <th className="px-4 py-3 text-right font-bold"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const dc = dailyCents(c);
                  return (
                    <tr key={c.id} className="border-t border-[#f1f3f5]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Thumb src={c.video?.thumbnail_url ?? null} />
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-bold text-[#111827]">{campaignName(c)}</p>
                            <p className="truncate text-[11px] text-[#9ca3af] tabular-nums">#{c.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 text-[13px] text-[#374151]">{objLabel(c.objective)}</td>
                      <td className="px-4"><StatusPill status={c.status} /></td>
                      <td className="px-4"><DeliveryDot delivery={c.delivery} /></td>
                      <td className="px-4 text-right text-[13px] tabular-nums text-[#374151]">
                        {dc !== null ? (
                          <>
                            <span className="font-semibold text-[#111827]">{money(dc, c.currency)}</span>
                            <span className="text-[11px] text-[#9ca3af]">/day</span>
                          </>
                        ) : "-"}
                      </td>
                      <td className="px-4 text-right text-[13px] font-semibold tabular-nums text-[#111827]">
                        {money(c.spent_cents, c.currency)}
                      </td>
                      <td className="px-4 text-right text-[13px] tabular-nums text-[#111827]">
                        <span className="font-bold">{full(c.result_count)}</span>
                        <span className="block text-[11px] text-[#9ca3af]">{c.result_label}</span>
                      </td>
                      <td className="px-4 text-right text-[13px] tabular-nums text-[#374151]">
                        {moneyPrecise(c.cost_per_result_cents, c.currency)}
                      </td>
                      <td className="px-4 text-right text-[12px] tabular-nums text-[#6b7280]">
                        {shortDate(c.created_at)}
                        <span className="block text-[11px] text-[#9ca3af]">{shortTime(c.created_at)}</span>
                      </td>
                      <td className="px-4 text-right">
                        {(c.status === "active" || c.status === "paused") && (
                          <TogglePill row={c} onDone={load} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
