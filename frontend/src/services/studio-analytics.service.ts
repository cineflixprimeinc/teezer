import { api } from "./api";

/**
 * Client for GET /api/studio/analytics/dashboard - the ClickHouse-backed Studio
 * analytics page.
 *
 * Separate from studio.service.ts's `overview` on purpose: that endpoint is
 * consumed by the shipped mobile app, so its payload shape is frozen. This one is
 * free to evolve with the web dashboard.
 *
 * A note on empty arrays, because it governs every component that reads this:
 * an empty list means "no data source", NOT "zero". `cities` is always empty today
 * (nothing populates video_views.city - Cloudflare only sends CF-IPCity on
 * Enterprise plans), and a creator with no views has no countries. Both must render
 * an empty state. Rendering an empty donut, or a "0" that looks authoritative, tells
 * the creator something false.
 */

/* ── Filters ────────────────────────────────────────────────────────────────── */

export type PeriodPreset = "today" | "7" | "28" | "90" | "custom";

export type DashboardFilters = {
  period:       PeriodPreset;
  start_date?:  string;
  end_date?:    string;
  timezone?:    string;
  video_id?:    number;
  country?:     string;
  device?:      "mobile" | "tablet" | "desktop";
  content_type?: "video" | "photo" | "live";
};

/* ── Payload ────────────────────────────────────────────────────────────────── */

/**
 * `comparable` is false when the previous period had no data at all. Going from
 * 0 to 5 views is not "+100%" - it is the first data that has ever existed, and a
 * growth chip there would be meaningless. The UI hides the chip in that case.
 */
export type Growth = { pct: number; up: boolean; comparable: boolean };

export type Metric = { value: number; growth: Growth };
export type MetricWithSeries = Metric & { series: SeriesPoint[] };

export type SeriesPoint = { date: string; value: number };
export type RetentionPoint = { pct: number; retention: number };
export type AudienceRow = { name: string; count: number; pct: number };

export type HeatCell = { dow: number; hour: number; views: number; intensity: number };

export type BestTime = {
  has_data: boolean;
  cells:    HeatCell[];
  peak:     { day: string; window: string; activity: number } | null;
  timezone?: string;
};

export type TopVideo = {
  id: number;
  title: string;
  thumbnail: string | null;
  duration: number;
  created_at: string;
  views: number;
  watch_time_hours: number;
  avg_watch_duration: number;
  completion: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  revenue: number;
};

export type TopAudio = {
  id: number;
  title: string;
  artist: string | null;
  cover: string | null;
  videos_count: number;
  views: number;
};

export type TrendingVideo = {
  id: number;
  title: string;
  thumbnail: string | null;
  views: number;
  growth: number;
  velocity: number;
};

export type Insight = { type: string; icon: string; text: string };

export type DashboardData = {
  period:          { start: string; end: string };
  previous_period: { start: string; end: string };

  summary: {
    views:              Metric;
    watch_time_hours:   Metric;
    avg_watch_duration: Metric;
    audience_retention: Metric;
    engagement_rate:    Metric;
    followers_gained:   Metric;
    profile_visits:     Metric;
    estimated_earnings: Metric;
  };

  charts: {
    views_over_time:   SeriesPoint[];
    watch_time_growth: SeriesPoint[];
    retention_curve:   RetentionPoint[];
    retention_average: number;
  };

  best_time: BestTime;

  audience: {
    countries:       AudienceRow[];
    cities:          AudienceRow[];   // always [] until GeoIP lands
    devices:         AudienceRow[];
    traffic_sources: AudienceRow[];
  };

  engagement: {
    likes:           MetricWithSeries;
    comments:        MetricWithSeries;
    shares:          MetricWithSeries;
    saves:           MetricWithSeries;
    rewatch_rate:    MetricWithSeries;
    completion_rate: MetricWithSeries;
  };

  top_videos:      TopVideo[];
  top_audio:       TopAudio[];
  trending_videos: TrendingVideo[];

  followers: {
    total:  number;
    gained: number;
    lost:   number;
    net:    number;
    series: SeriesPoint[];
  };

  monetization: {
    estimated:      number;
    coins:          number;
    creator_fund:   number;
    ad_revenue:     number;
    subscriptions:  number;
    gifts:          number;
    payout_balance: number;
    withdrawn:      number;
  };

  insights: Insight[];
};

/* ── API ────────────────────────────────────────────────────────────────────── */

export const studioAnalyticsApi = {
  async dashboard(filters: DashboardFilters): Promise<DashboardData> {
    const params: Record<string, string> = {
      period: filters.period,
      // Dates are resolved server-side in the creator's timezone. "Today" in
      // Kathmandu is not the same 24 hours as UTC today, and a dashboard that
      // disagrees with the clock on the creator's wall reads as broken.
      timezone: filters.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    };

    if (filters.period === "custom") {
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date)   params.end_date   = filters.end_date;
    }
    if (filters.video_id)     params.video_id     = String(filters.video_id);
    if (filters.country)      params.country      = filters.country;
    if (filters.device)       params.device       = filters.device;
    if (filters.content_type) params.content_type = filters.content_type;

    const { data } = await api.get("/studio/analytics/dashboard", { params });

    return data.data as DashboardData;
  },
};

/* ── Formatting ─────────────────────────────────────────────────────────────── */

/** 1234567 → "1.23M". Keeps the KPI cards readable at a glance. */
export function compact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (abs >= 1_000)     return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function money(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Seconds → "28.6s", or "1m 05s" once it stops fitting. */
export function duration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

/** ISO-2 → flag emoji, by offsetting into the regional-indicator block. */
export function flag(iso2: string): string {
  if (!/^[A-Za-z]{2}$/.test(iso2)) return "🏳️";
  return String.fromCodePoint(
    ...iso2.toUpperCase().split("").map(c => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

const COUNTRY_NAMES: Record<string, string> = {
  NP: "Nepal", IN: "India", US: "USA", AE: "UAE", GB: "UK",
  CN: "China", TW: "Taiwan", KZ: "Kazakhstan", TR: "Turkey",
  AU: "Australia", CA: "Canada", DE: "Germany", FR: "France",
  JP: "Japan", BR: "Brazil", ID: "Indonesia", PK: "Pakistan",
  BD: "Bangladesh", PH: "Philippines", VN: "Vietnam",
};

export function countryName(iso2: string): string {
  return COUNTRY_NAMES[iso2?.toUpperCase()] ?? iso2;
}

/** feed sources arrive as snake_case keys; render them the way the design does. */
const SOURCE_LABELS: Record<string, string> = {
  for_you:   "For You Feed",
  following: "Follow Feed",
  profile:   "Profile",
  search:    "Search",
  share:     "Share Link",
  direct:    "Direct",
  other:     "Others",
};

export function sourceLabel(key: string): string {
  return SOURCE_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
