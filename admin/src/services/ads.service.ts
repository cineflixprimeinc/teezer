import { api } from "./api";

export type Paged<T> = {
  data: T[];
  meta: { current_page: number; last_page: number; per_page: number; total: number };
};

export type AdStat = { value: number; growth: number; spark: number[] };
export type AdStatusSlice = { key: string; label: string; color: string; value: number; pct: number };
export type AdPlacementPerf = { key: string; label: string; pct: number };
export type AdTopAdvertiser = { name: string; spend_cents: number; campaigns: number; status: string };
export type AdTopCampaign = { name: string; ctr: number; views: number; conversions: number; revenue_cents: number };
export type AdActivity = { text: string; severity: string; at: string | null };
export type AdDraft = { campaign: string; advertiser: string; placement: string; budget_cents: number; created_at: string | null };

export type AdOverview = {
  stats: {
    campaigns: AdStat; active_ads: AdStat; pending_review: AdStat; rejected: AdStat;
    advertisers: AdStat; impressions: AdStat; clicks: AdStat; revenue_cents: AdStat;
  };
  campaign_status: AdStatusSlice[];
  campaign_status_total: number;
  placements: AdPlacementPerf[];
  approval_queue: { count: number; avg_review_minutes: number };
  moderation: { adult: number; copyright: number; policy: number };
  top_advertisers: AdTopAdvertiser[];
  top_campaigns: AdTopCampaign[];
  recent_activities: AdActivity[];
  recent_drafts: AdDraft[];
};

export type AdPerformance = { labels: string[]; impr: number[]; clk: number[]; ctr: number[]; spend: number[] };
export type AdRevenue = {
  labels: string[]; bars: number[];
  today: number; yesterday: number; this_week: number; this_month: number; growth: number;
};
export type AdRange = "7d" | "30d" | "90d";

export type AdUser = { id: number; username: string; name: string | null; avatar: string | null; email?: string };

export type AdCampaignRow = {
  id: number;
  name: string;
  objective: string;
  status: string;
  daily_budget_cents: number;
  total_budget_cents: number;
  spent_cents: number;
  currency: string;
  groups_count?: number;
  rejection_reason?: string | null;
  created_at: string;
  account?: { id: number; user?: AdUser };
};

export type CampaignListRow = {
  id: number;
  cam_id: string;
  ad_id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget_cents: number;
  total_budget_cents: number;
  spent_cents: number;
  spent_pct: number;
  currency: string;
  ad_groups: number;
  ads: number;
  advertiser: { name: string; username: string | null; avatar: string | null; is_verified: boolean };
  start_at: string | null;
  end_at: string | null;
  created_at: string | null;
  created_by: string;
  preview: { thumbnail_url: string | null };
};

export type CampaignSummary = {
  total: { value: number; growth: number };
  active: { value: number; growth: number };
  draft: { value: number; growth: number };
  completed: { value: number; growth: number };
  total_spent_cents: { value: number; growth: number };
};

export type AdvertiserRow = {
  id: number;
  name: string;
  type: string;
  status: string;
  balance_cents: number;
  currency: string;
  campaigns_count?: number;
  created_at: string;
  user?: AdUser;
};

export type PlacementRow = {
  id: number;
  key: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  first_slot: number;
  cadence: number;
  floor_cpm_cents: number;
  sort_order: number;
};

export type FraudRow = {
  id: number;
  kind: string;
  campaign_id: number | null;
  ip_hash: string | null;
  device_fp: string | null;
  score: number;
  action: string;
  amount_refunded_cents: number;
  created_at: string;
};

export type ApprovalTab = "pending" | "needs_changes" | "approved" | "rejected";

export type ApprovalRow = {
  id: number;
  ad_id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget_cents: number;
  currency: string;
  submitted_at: string | null;
  submitted_by: string;
  rejection_reason: string | null;
  advertiser: { name: string; username: string | null; avatar: string | null; is_verified: boolean };
  placements: string[];
  preview: { thumbnail_url: string | null; duration: number | null };
};

export type AdDetail = {
  id: number;
  ad_id: string;
  name: string;
  status: string;
  objective: string;
  ad_format: string;
  duration: number | null;
  campaign_type: string;
  bidding_strategy: string;
  budget: { daily_cents: number; total_cents: number; currency: string };
  start_at: string | null;
  end_at: string | null;
  submitted_at: string | null;
  submitted_by: { name: string; email: string | null };
  advertiser: { name: string; username: string | null; avatar: string | null; is_verified: boolean; user_id: number | null };
  placements: string[];
  preview: { video_url: string | null; thumbnail_url: string | null };
  creative: { headline: string | null; body: string | null; cta_type: string | null; destination_url: string | null; display_name: string | null; thumbnail_url: string | null };
  ad_info: {
    ad_name: string; landing_page: string | null; caption: string | null; description: string | null;
    cta_type: string | null; hashtags: string[]; language: string; countries: string[];
    age_range: string; gender: string; devices: string; interests: string[];
  };
  targeting: Record<string, unknown>;
  reviews: { decision: string; reason: string | null; reviewer: string | null; policy_flags: string[]; at: string | null }[];
  activity: { text: string; at: string | null }[];
  policy: { label: string; pass: boolean }[];
  prev_id: number | null;
  next_id: number | null;
};

export type ApprovalSummary = {
  pending: number;
  needs_changes: number;
  approved_month: number;
  rejected_month: number;
  avg_review_minutes: number;
};

export type AdSettings = Record<string, { value: unknown; type: string }>;

export type ListQuery = { search?: string; status?: string; kind?: string; page?: number; per_page?: number };

export const adsService = {
  overview: () =>
    api.get<{ success: boolean; data: AdOverview }>("/admin/ads/overview").then((r) => r.data.data),

  performance: (range: AdRange = "30d") =>
    api.get<{ success: boolean; data: AdPerformance }>("/admin/ads/overview/performance", { params: { range } }).then((r) => r.data.data),

  revenue: (range: AdRange = "30d") =>
    api.get<{ success: boolean; data: AdRevenue }>("/admin/ads/overview/revenue", { params: { range } }).then((r) => r.data.data),

  campaigns: (params: ListQuery & { objective?: string } = {}) =>
    api.get<Paged<CampaignListRow>>("/admin/ads/campaigns", { params }).then((r) => r.data),

  campaignsSummary: () =>
    api.get<{ success: boolean; data: CampaignSummary }>("/admin/ads/campaigns/summary").then((r) => r.data.data),

  campaign: (id: number) =>
    api.get<{ success: boolean; data: AdCampaignRow }>(`/admin/ads/campaigns/${id}`).then((r) => r.data.data),

  campaignDetail: (id: number) =>
    api.get<{ success: boolean; data: AdDetail }>(`/admin/ads/campaigns/${id}/detail`).then((r) => r.data.data),

  pauseCampaign: (id: number) => api.post(`/admin/ads/campaigns/${id}/pause`).then((r) => r.data),
  resumeCampaign: (id: number) => api.post(`/admin/ads/campaigns/${id}/resume`).then((r) => r.data),
  endCampaign: (id: number) => api.post(`/admin/ads/campaigns/${id}/end`).then((r) => r.data),
  duplicateCampaign: (id: number) => api.post(`/admin/ads/campaigns/${id}/duplicate`).then((r) => r.data),
  deleteCampaign: (id: number) => api.delete(`/admin/ads/campaigns/${id}`).then((r) => r.data),

  approvals: (params: { tab?: ApprovalTab; search?: string; page?: number; per_page?: number } = {}) =>
    api.get<Paged<ApprovalRow>>("/admin/ads/approvals", { params }).then((r) => r.data),

  approvalsSummary: () =>
    api.get<{ success: boolean; data: ApprovalSummary }>("/admin/ads/approvals/summary").then((r) => r.data.data),

  approve: (id: number) =>
    api.post(`/admin/ads/campaigns/${id}/approve`).then((r) => r.data),

  reject: (id: number, reason: string) =>
    api.post(`/admin/ads/campaigns/${id}/reject`, { reason }).then((r) => r.data),

  ban: (id: number, reason: string) =>
    api.post(`/admin/ads/campaigns/${id}/ban`, { reason }).then((r) => r.data),

  requestChanges: (id: number, reason: string) =>
    api.post(`/admin/ads/campaigns/${id}/request-changes`, { reason }).then((r) => r.data),

  advertisers: (params: ListQuery = {}) =>
    api.get<Paged<AdvertiserRow>>("/admin/ads/advertisers", { params }).then((r) => r.data),

  fraud: (params: ListQuery = {}) =>
    api.get<Paged<FraudRow>>("/admin/ads/fraud", { params }).then((r) => r.data),

  placements: () =>
    api.get<{ success: boolean; data: PlacementRow[] }>("/admin/ads/placements").then((r) => r.data.data),

  updatePlacement: (id: number, body: Partial<PlacementRow>) =>
    api.patch(`/admin/ads/placements/${id}`, body).then((r) => r.data),

  settings: () =>
    api.get<{ success: boolean; data: AdSettings }>("/admin/ads/settings").then((r) => r.data.data),

  updateSetting: (key: string, value: unknown) =>
    api.post("/admin/ads/settings", { key, value }).then((r) => r.data),
};

/** cents -> "$1,234.00" */
export const adMoney = (cents: number) =>
  `$${((cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const adNum = (n: number) => (n || 0).toLocaleString();
