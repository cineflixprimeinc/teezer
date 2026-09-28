import { api } from "./api";

/** One catalog gift - GET /gifts. Mirrors the mobile app's Gift type (mobile/src/api/gift.api.ts). */
export interface CatalogGift {
  id: number;
  slug: string | null;
  name: string;
  icon_url: string | null;
  coin_value: number;
  cash_value?: number | null;
}

export const giftService = {
  list: async (): Promise<CatalogGift[]> =>
    (await api.get<{ success: boolean; data: CatalogGift[] }>("/gifts")).data.data,

  /** Whether to show a gift-sending affordance for this user at all - same
   *  check the mobile app's giftApi.eligible() calls before rendering a gift
   *  icon (comments, LIVE). Cached a few minutes server-side. send() still
   *  independently re-checks live at the moment coins would actually move -
   *  this is a display decision, not the enforcement. */
  eligible: async (userId: number): Promise<boolean> =>
    (await api.get<{ success: boolean; data: { active: boolean } }>(`/users/${userId}/gifts-eligible`)).data.data
      .active,

  /**
   * Sending `video_id` (with `gift_id` + `receiver_id`) is what makes the
   * backend create a new top-level VideoComment carrying the gift - see
   * GiftController::send(). It does not push a realtime event for that
   * comment, so callers must invalidate/refetch the comments query on success.
   */
  send: async (payload: {
    receiver_id: number;
    gift_id: number;
    video_id?: number;
    comment_id?: number;
  }): Promise<{ success: boolean; message: string; data: { sender_coin_balance?: number } }> =>
    (await api.post("/gifts/send", payload)).data,
};
