import { api } from "./client";

/**
 * Reelsoo Ads delivery metrics - GET /studio/ad-insights/dashboard.
 *
 * This is the one place real ad delivery lives: `ad_stats_daily` rolled up
 * against the caller's promotions. The `promotions` table itself records only
 * what was COMMITTED (objective, targeting, budget, dates) and nothing about
 * what was DELIVERED, which is why spend, impressions, clicks, CTR and
 * conversions have to come from here rather than from the campaign list.
 *
 * Every tile carries the same metric for the immediately-preceding window of
 * equal length, so a delta is measured, never estimated.
 */

export type InsightTile = {
  value: number;
  prev: number;
  delta_pct: number;
  /** Already accounts for cost metrics, where a fall is the good direction. */
  positive: boolean;
};

export type AdInsightsDashboard = {
  range: { from: string; to: string; days: number; prev_from: string; prev_to: string };
  currency: string;
  tiles: {
    spend_cents: InsightTile;
    impressions: InsightTile;
    clicks: InsightTile;
    ctr: InsightTile;
    conversions: InsightTile;
    cost_per_result_cents: InsightTile;
  };
  status_breakdown: {
    active: number; paused: number; completed: number;
    in_review: number; draft: number; rejected: number; total: number;
  };
  placements: { placement: string; impressions: number; clicks: number; spend_cents: number }[];
  account: {
    balance_cents: number;
    lifetime_spent_cents: number;
    spent_this_month_cents: number;
    currency: string;
  };
};

/** `days` maps onto the endpoint's [from,to]; the server caps the window at a year. */
function rangeParams(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

export const adInsightsApi = {
  /** Resolves to null rather than throwing: the campaign list must still render
   *  on an account that has never delivered an impression. */
  dashboard: (days: number): Promise<AdInsightsDashboard | null> =>
    api
      .get<{ success: boolean; data: AdInsightsDashboard }>("/studio/ad-insights/dashboard", {
        params: rangeParams(days),
      })
      .then((r) => r.data.data)
      .catch(() => null),
};
