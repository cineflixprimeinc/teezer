"use client";

import { useCallback, useEffect, useState } from "react";
import { Layers } from "lucide-react";
import {
  Card, DeliveryDot, EmptyState, Skeleton, PageHeader,
} from "../ui";
import { money, full } from "../format";
import { adsService, type AdPromotionsOverview, type AdPromotionRow } from "@/services/ads.service";
import { apiMessage } from "@/services/api";

function objLabel(objective: string): string {
  const map: Record<string, string> = {
    more_views: "Video views",
    more_followers: "Followers",
    more_profile_visits: "Profile visits",
    more_engagement: "Engagement",
  };
  return map[objective] ?? objective.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function dailyNumber(x: string | number | null | undefined): number {
  if (x === null || x === undefined || x === "") return 0;
  const n = Number(x);
  return Number.isNaN(n) ? 0 : n;
}

type AdSet = {
  objective: string;
  name: string;
  ads: number;
  spentCents: number;
  resultCount: number;
  resultLabel: string;
  dailyBudgetCents: number;
  currency: string;
  delivery: string;
};

function buildAdSets(campaigns: AdPromotionRow[]): AdSet[] {
  const groups = new Map<string, AdPromotionRow[]>();
  for (const c of campaigns) {
    const arr = groups.get(c.objective) ?? [];
    arr.push(c);
    groups.set(c.objective, arr);
  }

  const sets: AdSet[] = [];
  for (const [objective, rows] of groups) {
    const spentCents = rows.reduce((a, c) => a + (c.spent_cents ?? 0), 0);
    const resultCount = rows.reduce((a, c) => a + (c.result_count ?? 0), 0);
    const dailyBudget = rows.reduce((a, c) => a + dailyNumber(c.daily_budget), 0);

    // delivery: Active if any active, else most common
    const counts: Record<string, number> = {};
    for (const c of rows) counts[c.delivery] = (counts[c.delivery] ?? 0) + 1;
    let delivery = "Off";
    if (rows.some((c) => c.delivery === "Active")) {
      delivery = "Active";
    } else {
      let best = -1;
      for (const [d, n] of Object.entries(counts)) {
        if (n > best) { best = n; delivery = d; }
      }
    }

    sets.push({
      objective,
      name: `${objLabel(objective)} ad set`,
      ads: rows.length,
      spentCents,
      resultCount,
      resultLabel: rows.find((c) => c.result_label)?.result_label ?? "results",
      dailyBudgetCents: Math.round(dailyBudget * 100),
      currency: rows[0]?.currency ?? "USD",
      delivery,
    });
  }
  return sets;
}

export function AdSetsPage() {
  const [data, setData] = useState<AdPromotionsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const sets = buildAdSets(data?.campaigns ?? []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ad Sets"
        subtitle="An ad set groups your ads by objective and audience, and controls budget and delivery."
      />

      {error && (
        <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[13px] font-medium text-[#b91c1c]">
          {error}
        </div>
      )}

      <Card className="overflow-hidden">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
          </div>
        ) : sets.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Layers}
              title="No ad sets yet"
              desc="Create a campaign and your ads will be grouped into ad sets by objective and audience."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead>
                <tr className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af]">
                  <th className="px-4 py-3 font-bold">Ad set</th>
                  <th className="px-4 py-3 text-right font-bold">Ads</th>
                  <th className="px-4 py-3 font-bold">Objective</th>
                  <th className="px-4 py-3 text-right font-bold">Budget/day</th>
                  <th className="px-4 py-3 text-right font-bold">Spent</th>
                  <th className="px-4 py-3 text-right font-bold">Results</th>
                  <th className="px-4 py-3 font-bold">Delivery</th>
                </tr>
              </thead>
              <tbody>
                {sets.map((s) => (
                  <tr key={s.objective} className="border-t border-[#f1f3f5]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-[#fff3ec]">
                          <Layers className="h-[18px] w-[18px] text-[#fd4605]" />
                        </span>
                        <p className="text-[13px] font-bold text-[#111827]">{s.name}</p>
                      </div>
                    </td>
                    <td className="px-4 text-right text-[13px] font-semibold tabular-nums text-[#111827]">{s.ads}</td>
                    <td className="px-4 text-[13px] text-[#374151]">{objLabel(s.objective)}</td>
                    <td className="px-4 text-right text-[13px] tabular-nums text-[#374151]">
                      {s.dailyBudgetCents > 0 ? (
                        <>
                          <span className="font-semibold text-[#111827]">{money(s.dailyBudgetCents, s.currency)}</span>
                          <span className="text-[11px] text-[#9ca3af]">/day</span>
                        </>
                      ) : "-"}
                    </td>
                    <td className="px-4 text-right text-[13px] font-semibold tabular-nums text-[#111827]">
                      {money(s.spentCents, s.currency)}
                    </td>
                    <td className="px-4 text-right text-[13px] tabular-nums text-[#111827]">
                      <span className="font-bold">{full(s.resultCount)}</span>
                      <span className="block text-[11px] text-[#9ca3af]">{s.resultLabel}</span>
                    </td>
                    <td className="px-4"><DeliveryDot delivery={s.delivery} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
