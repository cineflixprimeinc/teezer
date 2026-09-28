import { api } from "./client";
import { Platform } from "react-native";

/**
 * The premium page's catalogue - plans, the feature grid, the comparison matrix
 * and the questions, all in one request.
 *
 * Everything here is server-owned so pricing and marketing copy change in the
 * admin panel rather than in an app release. The screen renders what it is sent
 * and hides any section that arrives empty, which is how a whole block is
 * retired without shipping a build.
 *
 * The caller's own subscription is deliberately NOT part of this - that stays
 * on subscriptionApi.current() (GET /studio/subscriptions), so there is one
 * source of truth for whether the user is already subscribed.
 */

/** A server-computed quote. The client never converts or rounds anything. */
export interface PriceQuote {
  base_usd: number;
  currency: string;
  symbol: string;
  amount: number;
  /** Ready to render, e.g. "Rs. 699" or "$4.99". */
  formatted: string;
  rate: number;
  /** False when the market has no rate and the quote fell back to USD. */
  is_converted: boolean;
  surface: string;
  separate_app_price: boolean;
  /**
   * Discount, when the admin set a price to discount FROM. `compare_at` is
   * already converted through the same rate as `amount`, so the saving is real
   * in every currency rather than an exchange-rate artefact. The percentage is
   * derived server-side from the two amounts, so it can never disagree with
   * them - the app renders it, never recomputes it.
   */
  compare_at?: number | null;
  discount_amount?: number;
  discount_percent?: number;
  discount_label?: string | null;
  has_discount?: boolean;
}

export interface PremiumPlan {
  key: string;
  name: string;
  tagline: string | null;
  price: number;
  currency: string;
  /** "month" | "year" - rendered as the /month suffix. */
  period: string;
  features: string[];
  is_popular: boolean;
  badge_label: string | null;
  /** "light" | "dark" - the design draws Studio as a dark card. */
  theme: string;
  /** Converted price for this caller. Null when the tier has no USD base yet. */
  pricing: PriceQuote | null;
  /** Store product id for THIS platform, or null when the tier is unlisted. */
  product_id: string | null;
  /**
   * The server's verdict on whether THIS caller may buy it, with a reason when
   * not. Never computed here - a client that decides for itself will eventually
   * offer a plan the server refuses at payment.
   */
  can_purchase?: boolean;
  unavailable_reason?: string | null;
  unavailable_message?: string | null;
  /** Machine-readable entitlements, keyed by feature. Absent key = not included. */
  entitlements?: Record<string, { value: string | null; name: string }>;
}

/** Where we sell, and whether that includes the caller. */
export interface PremiumAvailability {
  country: string | null;
  country_name: string | null;
  /** False when the country could not be detected - never guessed. */
  detected: boolean;
  /** At least one plan is actually purchasable here, not merely "enabled". */
  supported: boolean;
  total_countries: number;
  countries: { code: string; name: string }[];
}

/** Result of checking a coupon code. `valid: false` is a normal answer. */
export interface CouponCheck {
  valid: boolean;
  reason: string | null;
  message: string | null;
  discount: number;
  final: number;
  coupon: { code: string; name: string; type: string; value: number } | null;
}

export interface PremiumFeatureCard {
  /** A glyph key, not a URL - unknown keys fall back to a neutral glyph. */
  icon: string;
  title: string;
  description: string | null;
  badge: string | null;
}

export interface PremiumComparisonRow {
  label: string;
  /** Keyed by plan key. A missing key means "not included" and renders a dash. */
  values: Record<string, string>;
  highlight_plan: string | null;
}

export interface PremiumFaqItem {
  question: string;
  answer: string;
}

export interface PremiumConfig {
  plans: PremiumPlan[];
  default_plan: string | null;
  features: PremiumFeatureCard[];
  comparison: PremiumComparisonRow[];
  faq: PremiumFaqItem[];
  trial: { enabled: boolean; days: number };
  legal_note: string;
  /**
   * Null when too few people upgraded to be worth stating. Never invented.
   *
   * `avatars` are the faces shown in the pill. Empty is normal and fine - the
   * pill then shows its sentence alone rather than a row of blank circles.
   */
  social_proof: {
    count: number;
    window_days: number;
    /** True when an admin set the figure rather than it being counted. */
    is_estimate?: boolean;
    avatars?: { name?: string | null; avatar?: string | null }[];
  } | null;
  /**
   * Where Reelsoo sells, from the same country table the admin panel toggles -
   * so switching a market off removes it here with no app release.
   */
  availability?: PremiumAvailability;
}

export const premiumApi = {
  /** GET /premium - public, so the page also sells to signed-out users. */
  config: () =>
    api
      .get<{ success: boolean; data: PremiumConfig }>("/premium", {
        // The server returns the store product id for the asking platform, so
        // the screen never has to know which of the two columns to read.
        // `surface: app` selects the app's USD base price, which the business
        // may set higher than the web one to absorb the store's 15-30% cut.
        params: { platform: Platform.OS, surface: "app" },
      })
      .then((r) => r.data.data),

  /**
   * Check a coupon before paying. A pure read - it never redeems, so it is safe
   * to call as the user types. The server decides the discount; the app only
   * renders what it is told.
   */
  validateCoupon: (code: string, planKey?: string, amount?: number, currency?: string) =>
    api
      .post<{ success: boolean; data: CouponCheck }>("/premium/coupon/validate", {
        code,
        plan_key: planKey ?? null,
        amount: amount ?? 0,
        currency: currency ?? null,
      })
      .then((r) => r.data.data)
      // An unreachable server is not "invalid code" - saying so would blame the
      // customer for a network problem.
      .catch((): CouponCheck => ({
        valid: false,
        reason: "network",
        message: "Couldn't check that code. Try again.",
        discount: 0,
        final: 0,
        coupon: null,
      })),
};

/**
 * Formats a price the way the design writes it - "NPR 1,290", grouped, with no
 * decimals when there are none to show.
 *
 * Intl.NumberFormat is used rather than toLocaleString with a currency style:
 * the design puts the ISO code in front as plain text ("NPR 1,290"), which the
 * currency style would render as "Rs 1,290" or "NPR 1,290.00" depending on the
 * device locale. Grouping still follows the user's locale, which is what makes
 * this different from a hand-rolled regex.
 */
export function formatPrice(amount: number, currency: string): string {
  const hasFraction = Math.abs(amount % 1) > 0.001;
  const num = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${currency} ${num}`;
}
