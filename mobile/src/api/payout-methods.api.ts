import { api } from "./client";

/**
 * Creator payout methods - the accounts a creator RECEIVES earnings to.
 *
 * These are payouts (money out), never purchases: coins, gifts and subscriptions
 * are always bought through the App Store's in-app purchase, so this stays
 * within Apple's guidelines.
 *
 * Server-backed on `creator_payout_methods`, which is the same table the
 * Monetization tab, the Withdraw screen, Gifts & Coins and the admin panel all
 * read. They used to disagree with the app because the app kept its methods on
 * the device and never sent them anywhere.
 *
 * Every write returns the full refreshed list, so a caller never needs a
 * follow-up GET to stay in sync.
 */

export type PayoutMethodRow = {
  id: number;
  provider: string;
  account_email: string | null;
  /** The one-line summary, masked server-side so every client renders it the
   *  same way. */
  masked_account: string | null;
  /** Per-provider fields, exactly as the payout editor collected them. */
  details: Record<string, string>;
  is_default: boolean;
};

export type PayoutMethodPayload = {
  provider: string;
  account_email?: string | null;
  details?: Record<string, string>;
  is_default?: boolean;
};

const BASE = "/studio/monetization/payout-methods";

/** Writes answer with `data`; the plain GET answers with `data` too. */
type ListResponse = { success: boolean; data: PayoutMethodRow[] };

export const payoutMethodsApi = {
  list: () => api.get<ListResponse>(BASE).then((r) => r.data.data ?? []),

  create: (payload: PayoutMethodPayload) =>
    api.post<ListResponse>(BASE, payload).then((r) => r.data.data ?? []),

  update: (id: number, payload: PayoutMethodPayload) =>
    api.patch<ListResponse>(`${BASE}/${id}`, payload).then((r) => r.data.data ?? []),

  setDefault: (id: number) =>
    api.post<ListResponse>(`${BASE}/${id}/default`).then((r) => r.data.data ?? []),

  remove: (id: number) =>
    api.delete<ListResponse>(`${BASE}/${id}`).then((r) => r.data.data ?? []),
};
