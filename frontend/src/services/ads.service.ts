import { api } from "./api";

/* ── Types ─────────────────────────────────────────────────────────────── */
export type AdSeriesPoint = {
  stat_date: string;
  impressions: number;
  clicks: number;
  spend_cents: number;
};

export type AdOverview = {
  active_campaigns: number;
  impressions: number;
  reach: number;
  clicks: number;
  conversions: number;
  spend_cents: number;
  ctr: number;
  balance_cents: number;
  currency: string;
  series: AdSeriesPoint[];
};

export type AdCampaign = {
  id: number;
  name: string;
  objective: string;
  status: string;
  budget_type: string;
  daily_budget_cents: number | null;
  total_budget_cents: number | null;
  spent_cents: number;
  currency: string;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
};

export type AdCreativeStat = {
  creative_id: number;
  impressions: number;
  clicks: number;
};

export type AdCampaignInsights = {
  campaign: AdCampaign;
  totals: {
    impressions: number;
    reach: number;
    clicks: number;
    conversions: number;
    spend_cents: number;
    ctr: number;
  };
  series: AdSeriesPoint[];
  by_creative: AdCreativeStat[];
};

/* ── Ads Manager dashboard types ───────────────────────────────────────── */
export type AdTile = {
  value: number;
  prev: number;
  delta_pct: number;
  positive: boolean;
};

export type AdDashRow = {
  id: number;
  campaign_id: number | null;
  cam_id: string | null;
  name: string;
  objective: string;
  objective_label: string;
  status: string;
  delivery: string;
  thumbnail_url: string | null;
  result_label: string;
  result_count: number;
  reach: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  spent_cents: number;
  cost_per_result_cents: number;
  currency: string;
  created_at: string | null;
};

export type AdDashPlacement = {
  placement: string;
  impressions: number;
  clicks: number;
  spend_cents: number;
};

export type AdDashboard = {
  range: { from: string; to: string; days: number; prev_from: string; prev_to: string };
  currency: string;
  tiles: {
    spend_cents: AdTile;
    impressions: AdTile;
    clicks: AdTile;
    ctr: AdTile;
    conversions: AdTile;
    cost_per_result_cents: AdTile;
  };
  series: { date: string; spend_cents: number; clicks: number; conversions: number }[];
  status_breakdown: {
    active: number; paused: number; completed: number;
    in_review: number; draft: number; rejected: number; total: number;
  };
  top_campaigns: AdDashRow[];
  recent_campaigns: AdDashRow[];
  placements: AdDashPlacement[];
  account: {
    balance_cents: number;
    lifetime_spent_cents: number;
    spent_this_month_cents: number;
    currency: string;
  };
};

/**
 * Per-campaign cards from /studio/promotions/overview - used by Campaigns / Ads /
 * Ad Sets / Creative Library. NOTE: this is a raw Promotion row (budgets are decimal
 * strings in major currency units, there is no `name` - use video.title), plus the
 * delivery fields the controller appends.
 */
export type AdPromotionRow = {
  id: number;
  user_id?: number;
  video_id?: number;
  objective: string;
  status: string;
  daily_budget: string | number | null;
  total_budget: string | number | null;
  currency: string;
  headline?: string | null;
  body?: string | null;
  cta_type?: string | null;
  destination_url?: string | null;
  display_name?: string | null;
  placements?: string[] | null;
  country?: string | null;
  gender?: string | null;
  age_range?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at: string;
  video?: {
    id: number; title: string | null; thumbnail_url: string | null;
    views_count?: number; likes_count?: number; comments_count?: number;
  } | null;
  spent_cents: number;
  result_label: string;
  result_count: number;
  cost_per_result_cents: number;
  delivery: string;
  tag: string | null;
};

export type AdPromotionsOverview = {
  summary: {
    total_spent_cents: number;
    currency: string;
    spending_limit_cents: number | null;
    limit_reached: boolean;
    opportunity_score: number;
    recommendations: number;
  };
  campaigns: AdPromotionRow[];
};

export type AdLedgerEntry = {
  id: number;
  type: string;
  amount_cents: number;
  balance_after_cents?: number;
  description: string | null;
  created_at: string;
};

export type AdAccountData = {
  account: {
    id: number; name: string; type: string; status: string;
    balance_cents: number; lifetime_spent_cents: number; currency: string;
    timezone?: string | null; contact_email?: string | null;
  };
  /** Stable, public Ad Account number (e.g. ACCT-83271-9920) - same in admin. */
  account_number: string;
  balance_cents: number;
  currency: string;
  ledger: AdLedgerEntry[];
};

export type AdEstimate = {
  currency: string;
  audience: { min: number; max: number };
  per_day: {
    reach: { min: number; max: number };
    impressions: { min: number; max: number };
    views: { min: number; max: number };
    clicks: { min: number; max: number };
  };
  note: string;
};

/* ── Service ───────────────────────────────────────────────────────────── */
export const adsService = {
  overview: () =>
    api.get("/studio/ad-insights/overview").then((r) => r.data.data as AdOverview),

  /** The consolidated Ads Manager dashboard (tiles+deltas, series, donut, tables). */
  dashboard: (from?: string, to?: string) =>
    api
      .get("/studio/ad-insights/dashboard", { params: { from, to } })
      .then((r) => r.data.data as AdDashboard),

  /** Per-campaign cards with real spend/results (drives Campaigns & Ads pages). */
  promotionsOverview: () =>
    api.get("/studio/promotions/overview").then((r) => r.data.data as AdPromotionsOverview),

  campaigns: () =>
    api.get("/studio/ad-campaigns").then((r) => (r.data.data ?? []) as AdCampaign[]),

  insights: (id: number) =>
    api.get(`/studio/ad-campaigns/${id}/insights`).then((r) => r.data.data as AdCampaignInsights),

  pause: (id: number) =>
    api.post(`/studio/ad-campaigns/${id}/pause`).then((r) => r.data),

  resume: (id: number) =>
    api.post(`/studio/ad-campaigns/${id}/resume`).then((r) => r.data),

  /** Turn an approved promotion on/off (active <-> paused). */
  toggle: (id: number, active: boolean) =>
    api.post(`/studio/promotions/${id}/toggle`, { active }).then((r) => r.data),

  /** Advertiser wallet + last ledger entries (Billing page). */
  adAccount: () =>
    api.get("/studio/ad-account").then((r) => r.data.data as AdAccountData),

  topup: (amount_cents: number) =>
    api.post("/studio/ad-account/topup", { amount_cents }).then((r) => r.data),

  /** Live audience + delivery estimate from real targeting (Audience page). */
  estimate: (payload: Record<string, unknown>) =>
    api.post("/studio/promotions/estimate", payload).then((r) => r.data.data as AdEstimate),
};

/* ── Helpers ───────────────────────────────────────────────────────────── */
export function adMoney(cents: number | null | undefined, currency = "USD") {
  const v = (cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(v);
  } catch {
    return `$${v.toFixed(2)}`;
  }
}

export function adNum(n: number | null | undefined) {
  const v = n ?? 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return `${v}`;
}
