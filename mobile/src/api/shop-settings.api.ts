import { api } from "./client";
import type { ShopPolicies } from "./seller-application.api";

/**
 * Settings -> Sell on Reelsoo -> Shop -> Edit Shop. Editing an ALREADY-
 * APPROVED shop's storefront fields - server-backed on
 * ShopSettingsController.php, a DIFFERENT endpoint from
 * seller-application.api.ts's onboarding one (that one refuses writes once
 * approved; this one refuses them until approved - see that controller's
 * own docblock).
 *
 * Deliberately narrower than the application: no seller_type, country,
 * legal_data, documents or agreements here - those are onboarding-only.
 */

export interface ShopSettings {
  shop_name: string | null;
  description: string | null;
  logo_url: string | null;
  category_id: number | null;
  policies: ShopPolicies | null;
  status: string;
  is_paused: boolean;
  paused_until: string | null;
  pause_message: string | null;
}

/** Shop Settings > Customer Experience > Notifications - same JSON-column +
 *  merge-defaults pattern as profileApi's own notification prefs, shop-scoped. */
export interface ShopNotificationPrefs {
  new_order: boolean;
  order_update: boolean;
  payment: boolean;
  return: boolean;
  low_stock: boolean;
  customer_message: boolean;
  review: boolean;
}

export interface ShopSettingsUpdate {
  shop_name?: string;
  description?: string | null;
  category_id?: number | null;
  policies?: Partial<ShopPolicies>;
}

const BASE = "/shop/settings";
type Envelope<T> = { success: boolean; data: T };

export const shopSettingsApi = {
  get: () => api.get<Envelope<ShopSettings>>(BASE).then((r) => r.data.data),

  update: (payload: ShopSettingsUpdate) =>
    api.put<Envelope<ShopSettings>>(BASE, payload).then((r) => r.data.data),

  uploadLogo: (file: { uri: string; name: string; type: string }) => {
    const form = new FormData();
    form.append("logo", file as unknown as Blob);
    return api.post<Envelope<{ logo_url: string }>>(`${BASE}/logo`, form).then((r) => r.data.data);
  },

  /** Shop Operations > Pause Shop. Never deletes products/orders - only flips status, same as AdminShopController's suspend/reactivate. */
  pause: (payload: { resume_date?: string | null; message?: string | null }) =>
    api.post<Envelope<ShopSettings>>(`${BASE}/pause`, payload).then((r) => r.data.data),

  resume: () => api.post<Envelope<ShopSettings>>(`${BASE}/resume`).then((r) => r.data.data),

  getNotificationPrefs: () =>
    api.get<Envelope<ShopNotificationPrefs>>(`${BASE}/notifications`).then((r) => r.data.data),

  updateNotificationPrefs: (payload: Partial<ShopNotificationPrefs>) =>
    api.put<Envelope<ShopNotificationPrefs>>(`${BASE}/notifications`, payload).then((r) => r.data.data),
};
