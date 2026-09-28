import { api } from "./api";

/* ── Types ─────────────────────────────────────────────────────────────── */
export type AnalyticsMetric =
  | "views"
  | "watch_time"
  | "avg_watch_duration"
  | "followers"
  | "followers_gained"
  | "engagement_rate"
  | "profile_views"
  | "likes"
  | "comments"
  | "shares"
  | "saves"
  | "estimated_rewards";

export type GrowthInfo = { pct: number; up: boolean };

export type AnalyticsSummary = {
  views:              number;
  watch_time_mins:    number;
  watch_time_hours:   number;
  followers:          number;
  engagement_rate:    number;
  profile_views:      number;
  likes:              number;
  comments:           number;
  shares:             number;
  estimated_rewards:  number;
  growth: {
    views:             GrowthInfo;
    watch_time:        GrowthInfo;
    followers:         GrowthInfo;
    engagement_rate:   GrowthInfo;
    profile_views:     GrowthInfo;
    likes:             GrowthInfo;
    comments:          GrowthInfo;
    shares:            GrowthInfo;
    estimated_rewards: GrowthInfo;
  };
};

export type ChartPoint   = { date: string; label: string; value: number };

export type HourScore    = { hour: number; label: string; score: number; posts_count?: number };
export type BestTimeData = {
  bestDay:        string;
  bestTime:       string;
  bestHour:       number;
  timezone:       string;
  activityByHour: HourScore[];
  hasEnoughData:  boolean;
  confidence?:    number;
  message?:       string;
};
export type AnalyticsParams = {
  metric?:     AnalyticsMetric;
  period?:     number;
  start_date?: string;
  end_date?:   string;
  timezone?:   string;
};
export type AnalyticsResponse = {
  period:          { start: string; end: string };
  previous_period: { start: string; end: string };
  summary:         AnalyticsSummary;
  chart:           ChartPoint[];
};

/* ── Overview types ─────────────────────────────────────────────────────── */
export type SummaryMetric = { value: number; growth: GrowthInfo };

export type OverviewSummary = {
  views:              SummaryMetric;
  watch_time_hours:   SummaryMetric;
  avg_watch_duration: SummaryMetric;
  engagement_rate:    SummaryMetric;
  followers_gained:   SummaryMetric;
  profile_views:      SummaryMetric;
  likes:              SummaryMetric;
  estimated_rewards:  SummaryMetric;
};

export type TrafficSource    = { source: string; count: number; pct: number };
export type LocationItem     = { name: string; count: number; pct: number };
export type DeviceItem       = { device: string; count: number; pct: number };
export type RetentionCurve   = { pct: number; retention: number };

export type TopVideo = {
  id: number; title: string; thumbnail: string | null;
  views: number; likes: number; comments: number;
  watch_time_hours: number; engagement: number; created_at: string;
};

export type TopComment = {
  id: number; username: string; name: string; avatar: string | null;
  text: string; likes: number; date: string;
};

export type SmartInsight = { type: string; icon: string; label: string; value: string; detail: string };

export type OverviewData = {
  period:          { start: string; end: string };
  previous_period: { start: string; end: string };
  summary:         OverviewSummary;
  main_charts: {
    views_over_time:   ChartPoint[];
    watch_time_growth: ChartPoint[];
    follower_growth:   ChartPoint[];
    engagement_trend:  ChartPoint[];
  };
  performance_overview: {
    metric: string; value: number; growth: GrowthInfo; chart: ChartPoint[];
  };
  audience: {
    traffic_sources: TrafficSource[];
    top_countries:   LocationItem[];
    device_platform: DeviceItem[];
    age_groups:      Array<{ group: string; pct: number }>;
    gender_split:    Array<{ label: string; pct: number }>;
  };
  retention:         { average: number; curve: RetentionCurve[] };
  top_videos:        TopVideo[];
  top_comments:      TopComment[];
  smart_insights:    SmartInsight[];
  audience_locations:{ countries: LocationItem[]; cities: LocationItem[] };
  best_time:         BestTimeData;
};

/* ── Creator Eligibility Types ──────────────────────────────────────────── */
export type EligibilityRequirement = {
  key:      string;
  label:    string;
  passed:   boolean;
  display:  string;
  value:    number | null;
  required: number | null;
};

export type EligibilityData = {
  is_creator:          boolean;
  application_status:  "none" | "pending" | "approved" | "rejected";
  rejection_reason:    string | null;
  requirements:        EligibilityRequirement[];
  completed_count:     number;
  total_count:         number;
  is_eligible:         boolean;
  stats: {
    public_videos: number;
    total_views:   number;
    followers:     number;
    account_age:   number;
  };
};

/* ── Verification Types ─────────────────────────────────────────────────── */
export type VerificationSocialLink = { platform: string; url: string };

export type VerificationStep = "plan_selected" | "account_checked" | "documents_uploaded" | null;

export type AccountCheck = {
  key: string;
  label: string;
  status: "passed" | "failed" | "pending" | "ready" | "checking";
  detail: string | null;
};

export type VerificationData = {
  id: number;
  status: "draft" | "pending" | "approved" | "rejected";
  verification_step: VerificationStep;
  plan_id: "monthly" | "annual" | "business" | null;
  category?: string | null;
  full_name?: string | null;
  phone?: string | null;
  brand_name?: string | null;
  social_links?: VerificationSocialLink[] | null;
  website?: string | null;
  country?: string | null;
  reason?: string | null;
  rejection_reason?: string | null;
  submitted_at: string;
  reviewed_at?: string | null;
  document_uploaded: boolean;
  selfie_uploaded: boolean;
  supporting_doc_uploaded: boolean;

  /**
   * When the Blue Verified badge renews. Null for a PERMANENT badge (nothing to renew)
   * and null for one approved before expiry was tracked (date unknown). `is_permanent`
   * is what separates them - never infer "never expires" from a missing date, and never
   * show a computed one. Nothing bills on a date we made up client-side.
   */
  expires_at?: string | null;
  has_lapsed?: boolean;
  /** Staff / official badge: not billed, no renewal, never expires. */
  is_permanent?: boolean;
  /** Granted and then taken back. Not the same as rejected, not the same as lapsed. */
  is_revoked?: boolean;
  revoke_reason?: string | null;
  /**
   * Whether Renew is allowed RIGHT NOW. The SERVER decides this, not us - if the client
   * re-derived the window, the button and the endpoint could disagree and we'd ship a
   * button that 422s the moment it's pressed.
   */
  can_renew?: boolean;
  renew_window_days?: number;

  /**
   * Whether this application has been PAID for. The server checks it again on submit -
   * this only decides which screen to show, it is not the rule itself.
   */
  is_paid?: boolean;
  plan_price_usd?: number | null;
} | null;

/* ── Blue Verified payment ──────────────────────────────────────────────── */

export type PaymentMethod = "card" | "paypal" | "applepay" | "googlepay" | "upi" | "bank";

export type VerificationPaymentMethods = {
  plan_id: string | null;
  amount_usd: number | null;
  currency: string;
  /** Toggled by the same admin settings the coins page uses. */
  methods: Record<PaymentMethod, boolean>;
  paid: boolean;
};

export type VerificationPaymentOrder = {
  payment_id: number;
  reference: string;
  amount_usd: number;
  payment_method: PaymentMethod;
  payment_status: "pending" | "paid" | "failed";
  paypal_order_id?: string;
};

/* ── Service ────────────────────────────────────────────────────────────── */
export const studioService = {
  dashboard: async () =>
    (await api.get("/studio/dashboard")).data.data,


  analytics: async (params: AnalyticsParams = {}): Promise<AnalyticsResponse> => {
    const { data } = await api.get<{ success: boolean; data: AnalyticsResponse }>(
      "/studio/analytics",
      { params },
    );
    return data.data;
  },

  analyticsOverview: async (params: AnalyticsParams = {}): Promise<OverviewData> => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const { data } = await api.get<{ success: boolean; data: OverviewData }>(
      "/studio/analytics/overview",
      { params: { ...params, timezone: tz } },
    );
    return data.data;
  },

  bestTimeToPost: async (range: "7d" | "28d" | "90d" | "all" = "all"): Promise<BestTimeData> => {
    const fallback = (): BestTimeData => {
      const pat = [18,12,10,8,6,7,14,20,25,32,38,46,55,48,40,36,44,58,72,84,100,75,62,50];
      const lbl = (h: number) => h===0?"12AM":h===12?"12PM":h<12?`${h}AM`:`${h-12}PM`;
      return {
        bestDay:"Today", bestTime:"8:00 PM", bestHour:20,
        timezone:"UTC", hasEnoughData:false,
        confidence: 0,
        message: "Based on general activity - post more for personalized data.",
        activityByHour: pat.map((score,hour)=>({hour,label:lbl(hour),score,posts_count:0})),
      };
    };
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const { data } = await api.get<{ success: boolean; data: BestTimeData }>(
        "/studio/analytics/best-time",
        { params: { timezone: tz, range } },
      );
      return data.data;
    } catch {
      return fallback();
    }
  },

  content: async (params?: Record<string, string | number>) =>
    (await api.get("/studio/content", { params })).data,

  monetization: async () =>
    (await api.get("/studio/monetization")).data.data,

  monetizationOverview: async (params?: { range?: string; start_date?: string; end_date?: string }) =>
    (await api.get("/studio/monetization/overview", { params })).data.data,

  updateRevenueGoal: async (monthlyGoal: number) =>
    (await api.put("/studio/monetization/goal", { monthly_goal: monthlyGoal })).data,

  /**
   * Request a withdrawal.
   *
   * `amount` is the GROSS taken off the balance; the commission is applied
   * server-side. `idempotencyKey` must stay the SAME across retries of one
   * attempt and differ between attempts - the caller owns that lifetime, not
   * this function, because a key minted here would be new on every call and
   * defeat the whole mechanism.
   */
  requestWithdraw: async (amount: number, idempotencyKey: string) =>
    (await api.post(
      "/studio/monetization/withdraw",
      { amount },
      // Without this a request that succeeded server-side but timed out on the
      // way back becomes a SECOND payout when the client retries - the balance
      // debited twice and commission charged twice. The server already replays
      // the original response for a key it has seen, and there is a unique
      // index on (user_id, idempotency_key) behind it; the website simply was
      // not sending one. The mobile app always has.
      { headers: { "Idempotency-Key": idempotencyKey } },
    )).data,

  verification: async (): Promise<VerificationData> =>
    (await api.get("/verification")).data.data,

  verificationSelectPlan: async (planId: string): Promise<{ success: boolean; message: string }> =>
    (await api.post("/verification/select-plan", { plan_id: planId })).data,

  verificationAccountCheck: async (): Promise<{ success: boolean; can_proceed: boolean; checks: import("./studio.service").AccountCheck[] }> =>
    (await api.post("/verification/account-check")).data,

  verificationUploadDocuments: async (formData: FormData): Promise<{ success: boolean; message: string }> =>
    (await api.post("/verification/upload-documents", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })).data,

  verificationSubmit: async (): Promise<{ success: boolean; message: string }> =>
    (await api.post("/verification/submit")).data,

  /** Extend the badge by one plan period. Server enforces the renewal window. */
  verificationRenew: async (): Promise<{ success: boolean; message: string; expires_at: string }> =>
    (await api.post("/verification/renew")).data,

  /* ── Blue Verified payment ────────────────────────────────────────────── */

  verificationPaymentMethods: async (): Promise<VerificationPaymentMethods> =>
    (await api.get("/verification/payment/methods")).data.data,

  verificationCreatePayment: async (method: PaymentMethod): Promise<VerificationPaymentOrder> =>
    (await api.post("/verification/payment/order", { payment_method: method })).data.data,

  verificationStripeIntent: async (paymentId: number): Promise<{ client_secret: string; payment_id: number; amount_usd: number }> =>
    (await api.post("/verification/payment/stripe/intent", { payment_id: paymentId })).data.data,

  verificationStripeCapture: async (paymentId: number, intentId: string) =>
    (await api.post("/verification/payment/stripe/capture", { payment_id: paymentId, payment_intent_id: intentId })).data,

  verificationPaypalCapture: async (paymentId: number, paypalOrderId: string) =>
    (await api.post("/verification/payment/paypal/capture", { payment_id: paymentId, paypal_order_id: paypalOrderId })).data,

  verificationApply: async (formData: FormData): Promise<{ success: boolean; message: string }> =>
    (await api.post("/verification/apply", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })).data,

  eligibility: async (): Promise<EligibilityData> =>
    (await api.get("/studio/become-creator")).data.data,

};
