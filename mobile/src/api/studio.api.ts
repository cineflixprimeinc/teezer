import { api } from "./client";
import type { Video } from "@/types";

/* ── Types (mirrors frontend/src/services/studio.service.ts OverviewData) ── */
export type GrowthInfo = { pct: number; up: boolean };
export type SummaryMetric = { value: number; growth: GrowthInfo };
export type ChartPoint = { date: string; label: string; value: number };

export type OverviewSummary = {
  views: SummaryMetric;
  watch_time_hours: SummaryMetric;
  avg_watch_duration: SummaryMetric;
  engagement_rate: SummaryMetric;
  followers_gained: SummaryMetric;
  profile_views: SummaryMetric;
  likes: SummaryMetric;
  comments: SummaryMetric;
  shares: SummaryMetric;
  saves: SummaryMetric;
  estimated_rewards: SummaryMetric;
};

export type LocationItem = { name: string; count: number; pct: number };

export type TopVideo = {
  id: number;
  title: string;
  thumbnail: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  duration: number;
  watch_time_hours: number;
  engagement: number;
  created_at: string;
  created_at_iso: string | null;
};

export type SmartInsight = { type: string; icon: string; label: string; value: string; detail: string };
export type TrafficSource = { source: string; count: number; pct: number };
export type DeviceItem = { device: string; count: number; pct: number };
export type TopComment = { id: number; username: string; name: string; avatar: string | null; text: string; likes: number; date: string };

export type AnalyticsMetric =
  | "views" | "watch_time" | "avg_watch_duration" | "engagement_rate" | "followers_gained"
  | "profile_views" | "likes" | "comments" | "shares" | "saves" | "estimated_rewards";

export type PerformanceOverview = { metric: AnalyticsMetric; value: number; growth: GrowthInfo; chart: ChartPoint[] };
export type RetentionCurvePoint = { pct: number; retention: number };
export type Retention = { average: number; curve: RetentionCurvePoint[] };

export type OverviewData = {
  period: { start: string; end: string };
  previous_period: { start: string; end: string };
  summary: OverviewSummary;
  main_charts: {
    views_over_time: ChartPoint[];
    watch_time_growth: ChartPoint[];
    follower_growth: ChartPoint[];
    engagement_trend: ChartPoint[];
  };
  performance_overview: PerformanceOverview;
  retention: Retention;
  audience: { top_countries: LocationItem[]; traffic_sources: TrafficSource[]; device_platform: DeviceItem[] };
  top_videos: TopVideo[];
  top_comments: TopComment[];
  smart_insights: SmartInsight[];
  audience_locations: { countries: LocationItem[]; cities: LocationItem[] };
};

export type HourScore = { hour: number; label: string; score: number; posts_count: number };
/** GET /studio/analytics/best-time - `heatmap[day][hour]`, day 0=Sunday..6=Saturday, each 0–100. */
export type BestTimeData = {
  bestDay: string;
  bestTime: string;
  bestHour: number;
  timezone: string;
  hasEnoughData: boolean;
  confidence: number;
  message: string;
  activityByHour: HourScore[];
  heatmap: number[][];
};

export type AnalyticsPeriod = 7 | 28 | 90 | 365;

export type ContentStatus = "published" | "draft" | "private" | "unlisted" | "scheduled" | "removed";
export type ContentSort = "newest" | "oldest" | "most_viewed" | "most_liked";
export type ContentCounts = { total: number; published: number; draft: number; scheduled: number; private: number; unlisted: number };
export type ContentResponse = {
  success: boolean;
  data: Video[];
  meta: {
    current_page: number; last_page: number; per_page: number; total: number;
    from: number | null; to: number | null; next_page_url: string | null;
    counts: ContentCounts;
  };
};

/* ── Studio permissions - mirrors frontend/src/lib/studio-permissions.ts PermContext ── */
export type PermContext = {
  isCreator: boolean;
  creatorLevel: number;
  monetizationApproved: boolean;
  hasActiveViolation: boolean;
  payoutInfoCompleted: boolean;
  applicationStatus: "none" | "pending" | "approved" | "rejected";
};

/* ── Monetization - mirrors frontend/src/features/studio/studio-monetization-page.tsx ── */
export type MonetizationRange = "7d" | "28d" | "90d";
export type MoneyGrowth = { amount: number; growth: number; up: boolean };
export type RevenueSources = { ad_revenue: number; live_gift: number; subscription: number; brand_collab: number; series: number; shop: number; total: number };
export type MonetizationStatus = {
  account_standing: boolean;
  ad_revenue_eligible: boolean;
  live_gifts_enabled: boolean;
  subscriptions_enabled: boolean;
  tax_info_completed: boolean;
};
export type PaymentMethod = { provider: string; account_email: string; masked_account: string };
export type PayoutInfo = {
  available_balance: number;
  pending_balance: number;
  lifetime_earnings: number;
  minimum_withdraw: number;
  /** Teezer's cut, applied at WITHDRAWAL - gifts credit in full. Optional so
   *  the app still renders against a server that predates the field. */
  commission_rate?: number;
  /** Coins per USD, set by the admin. Optional for the same reason. */
  coin_usd_rate?: number;
  next_payout: { amount: number; date: string; days_until: number; status: string } | null;
  payment_method: PaymentMethod | null;
};
export type RevenueGoal = { monthly_goal: number; current: number; currency: string; percentage: number };
export type EarningContent = {
  id: number; title: string; thumbnail_url: string | null; duration: number;
  views: number; revenue: number; rpm: number; payout_status: string; created_at: string;
};
export type Transaction = {
  id: number; source: string; label: string; amount: number; currency: string;
  status: string; note: string | null; earned_at: string;
};
export type EarningOpportunity = { key: string; status: "active" | "pending" };

export type MonetizationOverview = {
  range: string;
  summary: {
    total_earnings: MoneyGrowth;
    available_balance: MoneyGrowth;
    this_month: { amount: number };
    estimated_next_payout: { amount: number; date: string; days: number };
    revenue_growth: { percentage: number; up: boolean; current: number; previous: number };
  };
  revenue_overview: { date: string; amount: number }[];
  revenue_sources: RevenueSources;
  monetization_status: MonetizationStatus;
  payouts: PayoutInfo;
  revenue_goal: RevenueGoal;
  top_earning_content: EarningContent[];
  recent_transactions: Transaction[];
  earning_opportunities: EarningOpportunity[];
};

/* ── Post Insights - one video's own performance. Mirrors the website's
   studio-insights-page.tsx, which calls this exact same endpoint. ── */
export type InsightGrowth = { value: number; pct: number; up: boolean };
export type InsightSummary = {
  views: InsightGrowth; likes: InsightGrowth; comments: InsightGrowth;
  shares: InsightGrowth; saves: InsightGrowth;
  watch_time_seconds: InsightGrowth; watch_time_hours: number;
  avg_watch_duration: InsightGrowth; engagement_rate: InsightGrowth;
};
export type InsightChartPoint = { date: string; label: string; value: number };
export type RetentionSegment = { label: string; retention: number };
export type InsightRetention = { average: number; segments: RetentionSegment[] };
export type InsightTrafficSource = { source: string; count: number; pct: number };
export type InsightLocation = { name: string; count: number; pct: number };
export type InsightComment = { id: number; username: string; name: string; avatar: string | null; text: string; likes: number; date: string };
export type PostInsights = {
  video: Video;
  period: { start: string; end: string };
  previous_period: { start: string; end: string };
  summary: InsightSummary;
  chart: InsightChartPoint[];
  retention: InsightRetention;
  traffic_sources: InsightTrafficSource[];
  audience_locations: { countries: InsightLocation[]; cities: InsightLocation[] };
  top_comments: InsightComment[];
};
export type InsightMetric = "views" | "likes" | "comments" | "shares" | "saves" | "watch_time" | "avg_watch_duration" | "engagement_rate";

/* ── Comments inbox counters (the Quick Actions "Comments" badge) ── */
export type CommentStats = {
  all: number; unread: number; needs_reply: number;
  replied: number; held: number; spam: number; trend_7d: number;
};

/* ── Verification Center - GET /verification returns null when the creator
   has never applied, which the card renders as "not started". ── */
export type VerificationStatus = {
  id: number;
  status: string;                 // pending | approved | rejected | …
  verification_step: string | null;
  document_uploaded: boolean;
  selfie_uploaded: boolean;
  supporting_doc_uploaded: boolean;
  submitted_at: string;
  reviewed_at: string | null;
} | null;

export const studioApi = {
  /** GET /studio/analytics/overview - powers the Studio dashboard + analytics screens. */
  overview: (period: AnalyticsPeriod = 7, metric: AnalyticsMetric = "views") =>
    api
      .get<{ success: boolean; data: OverviewData }>("/studio/analytics/overview", { params: { period, metric } })
      .then((r) => r.data.data),

  bestTime: () => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return api
      .get<{ success: boolean; data: BestTimeData }>("/studio/analytics/best-time", { params: { timezone, range: "all" } })
      .then((r) => r.data.data);
  },

  /** GET /studio/content - the creator's own videos, filterable/sortable/searchable. */
  content: (params: { status?: ContentStatus; sort?: ContentSort; search?: string; page?: number; per_page?: number; start_date?: string; end_date?: string } = {}) =>
    api.get<ContentResponse>("/studio/content", { params }).then((r) => r.data),

  /** GET /studio/permissions - same feature-gate context the website's studio-permissions.ts consumes. */
  permissions: (): Promise<PermContext> =>
    api.get<{ success: boolean; data: Record<string, unknown> }>("/studio/permissions").then((r) => {
      const d = r.data.data;
      return {
        isCreator: !!d.is_creator,
        creatorLevel: Number(d.creator_level ?? -1),
        monetizationApproved: !!d.monetization_approved,
        hasActiveViolation: !!d.has_active_violation,
        payoutInfoCompleted: !!d.payout_info_completed,
        applicationStatus: (d.application_status as PermContext["applicationStatus"]) ?? "none",
      };
    }),

  monetizationOverview: (range: MonetizationRange = "28d") =>
    api.get<{ success: boolean; data: MonetizationOverview }>("/studio/monetization/overview", { params: { range } }).then((r) => r.data.data),

  updateRevenueGoal: (monthlyGoal: number) =>
    api.put<{ success: boolean; data: { monthly_goal: number } }>("/studio/monetization/goal", { monthly_goal: monthlyGoal }).then((r) => r.data),

  requestWithdraw: (amount: number) =>
    api.post<{ success: boolean; message?: string; data?: { payout_id: number; amount: number; scheduled: string } }>("/studio/monetization/withdraw", { amount }).then((r) => r.data),

  /** DELETE /studio/content/{id} - removes the creator's own video. */
  deleteContent: (id: number) =>
    api.delete<{ success: boolean; message?: string }>(`/studio/content/${id}`).then((r) => r.data),

  /** PATCH /studio/content/{id}/status - publish / unpublish / make private. */
  updateContentStatus: (id: number, status: ContentStatus) =>
    api.patch<{ success: boolean; message?: string }>(`/studio/content/${id}/status`, { status }).then((r) => r.data),

  /** PATCH /studio/content/{id} (StudioContentController::updateFull) - full
   *  edit; only the fields passed are changed, everything else is left as
   *  the server already has it. Two call sites: right after posting, to
   *  apply "Allow download" (/videos/complete-upload has no such field -
   *  it always creates a post with the column's own default); and Studio
   *  Content's "Edit" button, which reopens the compose screen against an
   *  existing post and PATCHes the full set of editable fields back here
   *  instead of creating a new post. No field here can replace the actual
   *  media file - nothing in the API supports that. */
  updateContent: (id: number, data: {
    title?: string; caption?: string; category?: string; location?: string; link_url?: string; language?: string;
    hashtags?: string[]; status?: ContentStatus; scheduled_at?: string;
    allow_comments?: boolean; allow_duet?: boolean; allow_stitch?: boolean; allow_download?: boolean;
    is_ai_generated?: boolean; tagged_user_ids?: number[]; collab_user_ids?: number[];
    /** "Add link" -> Teezer Product - same omitted-means-unchanged contract
     *  as every other field here; send [] to clear an existing selection. */
    product_ids?: number[];
  }) =>
    api.patch<{ success: boolean; message?: string; data?: Video }>(`/studio/content/${id}`, data).then((r) => r.data),

  /** GET /studio/content/{id}/insights - one video's own performance: views,
   *  engagement, retention, traffic sources, audience locations and top
   *  comments, all scoped to that single post. Same endpoint the website's
   *  Post Insights page already calls. */
  insights: (id: number, params: { metric?: InsightMetric; start_date?: string; end_date?: string } = {}) =>
    api.get<{ success: boolean; data: PostInsights }>(`/studio/content/${id}/insights`, { params }).then((r) => r.data.data),

  /** GET /studio/comments/stats - feeds the Quick Actions comments badge. */
  commentStats: () =>
    api.get<{ success: boolean; data: CommentStats }>("/studio/comments/stats").then((r) => r.data.data),

  /** GET /verification - the creator's latest verification request, or null. */
  verification: () =>
    api.get<{ success: boolean; data: VerificationStatus }>("/verification").then((r) => r.data.data),

  /**
   * GET /studio/ad-account - the server ad account. We use it for the PERMANENT,
   * cross-surface Ad Account number (ACCT-…): the same id the website
   * (ads.teezer.live) and the admin console show, so the app no longer displays a
   * device-local id that differs everywhere else.
   */
  adAccount: () =>
    api
      .get<{ success: boolean; data: { account_number: string; balance_cents: number; lifetime_spent_cents: number; currency: string } }>("/studio/ad-account")
      .then((r) => r.data.data),

  /**
   * PATCH /studio/ad-account/settings - sync the advertiser's Business Info +
   * Billing Preferences to the server so the admin console shows the SAME values.
   * Best-effort: the app keeps its local copy regardless.
   */
  updateAdAccountSettings: (payload: Record<string, unknown>) =>
    api.patch<{ success: boolean; message?: string }>("/studio/ad-account/settings", payload).then((r) => r.data),
};
