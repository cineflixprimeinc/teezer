import { api } from "./client";

/* ── Ad campaigns (server calls them promotions).
   NOTE what is NOT here: impressions, clicks, spend. The promotions table stores
   an objective, targeting, budgets, dates and a status - plus the ESTIMATES shown
   at create time. Nothing records delivery, so any "spent" or "impressions" figure
   on this screen would be invented. The video's own counters are real and are what
   the campaign cards show instead. ── */
export type PromotionObjective =
  | "more_views"
  | "more_followers"
  | "more_profile_visits"
  | "more_engagement";

export type PromotionStatus =
  | "draft"
  | "pending_review"
  | "active"
  | "rejected"
  | "completed"
  | "paused";

export type PromotionVideo = {
  id: number;
  title: string | null;
  caption: string | null;
  thumbnail_url: string | null;
  category: string | null;
  status: string;
  views_count: number;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  saves_count: number;
};

export type Promotion = {
  id: number;
  user_id: number;
  video_id: number;
  objective: PromotionObjective;
  country: string | null;
  city: string | null;
  region: string | null;
  target_lat: number | null;
  target_lng: number | null;
  target_radius_km: number | null;
  age_range: string | null;
  gender: "all" | "male" | "female" | null;
  interests: string[] | null;
  daily_budget: string | number;
  total_budget: string | number;
  /** Canonical settlement currency (always USD). */
  currency: string;
  /** The currency the advertiser originally entered (e.g. NPR), when it differed from USD. */
  budget_currency?: string | null;
  daily_budget_original?: string | number | null;
  total_budget_original?: string | number | null;
  start_date: string | null;
  end_date: string | null;
  duration_days: number | null;
  payment_method: string | null;
  est_impressions_min: number | null;
  est_impressions_max: number | null;
  est_views_min: number | null;
  est_views_max: number | null;
  est_profile_visits_min: number | null;
  est_profile_visits_max: number | null;
  status: PromotionStatus;
  rejection_reason: string | null;
  created_at: string;
  // Creative copy + placements the advertiser set (stored on the promotion).
  headline?: string | null;
  body?: string | null;
  cta_type?: CtaType | null;
  destination_url?: string | null;
  destination_type?: "website" | "instant_page" | null;
  display_name?: string | null;
  placements?: string[] | null;
  promote_target?: "profile" | "videos" | null;
  promoted_video_ids?: number[] | null;
  follow_button_text?: string | null;
  video_settings?: VideoSettings | null;
  message_settings?: MessageSettings | null;
  app_settings?: AppSettings | null;
  engagement_settings?: EngagementSettings | null;
  conversion_settings?: ConversionSettings | null;
  video?: PromotionVideo;
};

/** "Sales / Conversions" flow - the conversion + tracking/optimisation settings. */
export type ConversionSettings = {
  location?: "website" | "app";
  event?: string;
  value_type?: "same" | "different" | "none";
  optimization_goal?: string;
  bid_strategy?: string;
  attribution_window?: string;
  payment_event?: string;
};

/** "More Engagement" flow - which engagement to optimise for + delivery style. */
export type EngagementSettings = {
  optimize_for?: "all_engagements" | "comments" | "shares" | "likes";
  engagement_style?: "balanced" | "high_engagement_users";
};

/** "App Installs" flow - the app being promoted + its ad copy/CTA. */
export type AppSettings = {
  source?: "my_app" | "app_store_url" | "google_play_url";
  app_name?: string;
  app_store_url?: string;
  google_play_url?: string;
  platforms?: string[];
  deep_link?: string;
  primary_text?: string;
  cta?: string;
  tracking?: string;
};

/** "Messages" flow - how a conversation starts from the sponsored card. */
export type MessageSettings = {
  greeting?: string | null;
  quick_replies?: string[];
  action_button?: string;
};

/** "More Video Views" flow - delivery settings collected on the Video Settings step. */
export type VideoSettings = {
  optimization_goal?: string;
  play_behavior?: "auto_play" | "tap_to_play";
  sound?: "on" | "off";
  tracking_parameters?: string | null;
};

export type PromotionPage = {
  data: Promotion[];
  meta: { current_page: number; last_page: number; total: number };
};

/** A promotion enriched with real delivery metrics (from the bridged campaign). */
export type PromotionCard = Promotion & {
  spent_cents: number;
  result_label: string;
  result_count: number;
  cost_per_result_cents: number;
  delivery: string;
  tag: string | null;
};

export type AdsSummary = {
  total_spent_cents: number;
  currency: string;
  spending_limit_cents: number | null;
  limit_reached: boolean;
  opportunity_score: number;
  recommendations: number;
};

export type AdsOverview = { summary: AdsSummary; campaigns: PromotionCard[] };

/** One time-range's rolled-up delivery metrics for the Ad Details page. */
export type RangeStat = {
  result_label: string;
  result_count: number;
  cost_per_result_cents: number;
  spent_cents: number;
  reach: number;
  impressions: number;
};

/** Full Ad Details payload (GET /studio/promotions/:id). */
export type PromotionDetail = {
  promotion: Promotion;
  campaign_id: number | null;
  cam_id: string | null;
  objective_label: string;
  delivery: string;
  can_toggle: boolean;
  currency: string;
  daily_budget_cents: number;
  total_budget_cents: number;
  /** Advertiser's original (pre-USD-conversion) budget, when they entered a non-USD currency. */
  original_currency?: string | null;
  original_daily_budget_cents?: number | null;
  original_total_budget_cents?: number | null;
  /** Real engagement on the promoted post (likes + comments + shares). */
  engagement?: number;
  stats: { max: RangeStat; last_30: RangeStat; today: RangeStat };
};

export type CtaType =
  | "learn_more" | "shop_now" | "sign_up" | "download"
  | "watch_more" | "book_now" | "contact_us" | "get_offer"
  | "visit_website" | "send_message" | "order_now" | "subscribe" | "none";

export type CreatePromotion = {
  video_id: number;
  objective: PromotionObjective;
  daily_budget: number;
  total_budget: number;
  /** The currency the advertiser is budgeting in (e.g. "NPR"). Server converts to USD. */
  currency?: string;
  // "More Followers" flow: promote the whole profile or up to 3 videos + a follow-card label.
  promote_target?: "profile" | "videos";
  promoted_video_ids?: number[];
  follow_button_text?: string;
  video_settings?: VideoSettings;
  message_settings?: MessageSettings;
  app_settings?: AppSettings;
  engagement_settings?: EngagementSettings;
  conversion_settings?: ConversionSettings;
  // Creative copy for the in-feed sponsored card.
  headline?: string;
  body?: string;
  cta_type?: CtaType;
  destination_url?: string;
  destination_type?: "website" | "instant_page";
  display_name?: string;
  placements?: string[];
  country?: string;
  city?: string;
  region?: string;
  target_lat?: number;
  target_lng?: number;
  target_radius_km?: number;
  age_range?: string;
  gender?: "all" | "male" | "female";
  interests?: string[];
  target_languages?: string[];
  demographics?: {
    relationship?: string[];
    education?: string[];
    parental?: string;
    behaviors?: string[];
  };
  duration_days?: number;
  start_date?: string;
  end_date?: string;
  payment_method?: "teezer_balance" | "credit_card" | "e_wallet" | "bank_transfer";
  status?: "draft" | "pending_review";
};

/* ── Live audience + delivery estimate (computed from real matching accounts) ── */
export type EstimateRange = { min: number; max: number };
export type PromotionEstimate = {
  currency: string;
  audience: EstimateRange;
  per_day: {
    reach: EstimateRange;
    impressions: EstimateRange;
    views: EstimateRange;
    clicks: EstimateRange;
  };
  note: string;
};
export type EstimateInput = {
  country?: string;
  city?: string;
  region?: string;
  age_range?: string;
  gender?: "all" | "male" | "female";
  interests?: string[];
  daily_budget: number;
  currency?: string;
};

export const promotionApi = {
  list: () =>
    api.get<PromotionPage>("/studio/promotions").then((r) => r.data),

  /** Ads home: account summary + campaigns with real spend/results. */
  overview: () =>
    api.get<{ success: boolean; data: AdsOverview }>("/studio/promotions/overview").then((r) => r.data.data),

  /** Full Ad Details for one campaign (setup the advertiser entered + delivery by range). */
  detail: (id: number) =>
    api.get<{ success: boolean; data: PromotionDetail }>(`/studio/promotions/${id}`).then((r) => r.data.data),

  /** Turn an approved ad on (active) or off (paused). */
  toggle: (id: number, active: boolean) =>
    api.post<{ success: boolean; data: Promotion; message?: string }>(`/studio/promotions/${id}/toggle`, { active }).then((r) => r.data),

  create: (body: CreatePromotion) =>
    api
      .post<{ success: boolean; data: Promotion; message?: string }>("/studio/promotions", body)
      .then((r) => r.data),

  /** Real-time reach/audience estimate for the current targeting + budget. */
  estimate: (body: EstimateInput) =>
    api
      .post<{ success: boolean; data: PromotionEstimate }>("/studio/promotions/estimate", body)
      .then((r) => r.data.data),

  /** Draft and rejected campaigns only - the server 422s on anything live. */
  update: (id: number, body: Partial<CreatePromotion>) =>
    api.patch<{ success: boolean; data: Promotion }>(`/studio/promotions/${id}`, body).then((r) => r.data),

  /** Draft, rejected and completed only - an active campaign cannot be deleted. */
  remove: (id: number) =>
    api.delete<{ success: boolean; message?: string }>(`/studio/promotions/${id}`).then((r) => r.data),
};

/** The four objectives, in the order the create form offers them. */
export const OBJECTIVES: { key: PromotionObjective; label: string; desc: string }[] = [
  { key: "more_views",          label: "More views",          desc: "Get the video in front of more people" },
  { key: "more_followers",      label: "More followers",      desc: "Grow your audience" },
  { key: "more_profile_visits", label: "Profile visits",      desc: "Send viewers to your profile" },
  { key: "more_engagement",     label: "More engagement",     desc: "Drive likes, comments and shares" },
];

export const objectiveLabel = (o: PromotionObjective): string =>
  OBJECTIVES.find((x) => x.key === o)?.label ?? o;

/** Status pill colours. `active` is green, review is amber, rejected is red. */
export const STATUS_STYLE: Record<string, { label: string; color: string; tint: string }> = {
  draft:          { label: "Draft",       color: "#6b7280", tint: "#f3f4f6" },
  pending_review: { label: "In review",   color: "#d97706", tint: "#fffbeb" },
  active:         { label: "Active",      color: "#16a34a", tint: "#f0fdf4" },
  paused:         { label: "Paused",      color: "#f97316", tint: "#fff7ed" },
  rejected:       { label: "Rejected",    color: "#dc2626", tint: "#fef2f2" },
  completed:      { label: "Completed",   color: "#2563eb", tint: "#eff6ff" },
};
