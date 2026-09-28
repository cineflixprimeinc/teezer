import { api } from "./client";

/** Mirrors the server's formatSubscription(). Null when there is no active one. */
export type Subscription = {
  id: number;
  plan: "monthly" | "annual";
  status: string;
  price: number;
  currency: string;
  started_at: string | null;
  expires_at: string | null;
  cancelled_at: string | null;
  is_active: boolean;
} | null;

/** Prices come from /payment-config, the same place the website reads them, so a
 *  price change in the admin panel moves both surfaces at once. */
export type PremiumPricing = {
  subscription_monthly: number;
  subscription_annual: number;
  badge_price: number;
};

export const subscriptionApi = {
  /** GET /studio/subscriptions */
  current: () =>
    api
      .get<{ success: boolean; data: Subscription }>("/studio/subscriptions")
      .then((r) => r.data.data),

  pricing: () =>
    api
      .get<{ success: boolean; data: { pricing: PremiumPricing } }>("/payment-config")
      .then((r) => r.data.data.pricing),

  /** POST /studio/subscriptions/cancel - access continues until it expires. */
  cancel: () =>
    api
      .post<{ success: boolean; message?: string }>("/studio/subscriptions/cancel")
      .then((r) => r.data),
};
