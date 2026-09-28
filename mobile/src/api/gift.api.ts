import { api } from "./client";

export interface Gift {
  id: number;
  name: string;
  icon_url: string | null;
  coin_value: number;
  /** Stable key for the icon set; also picks which animation the gift plays. */
  slug?: string | null;
  cash_value?: number;
}

export interface CoinPackage {
  id: number;
  plan_name: string;
  coins: number;
  price_usd: number;
  badge: string | null;
  per_coin_usd?: number;
  /** Catalog position 1–200; the order the web picker lists plans in. */
  sort_order?: number;
  /** Gift slug - the plan's artwork lives at /gifts/{sort_order}-{icon}.svg. */
  icon?: string | null;
}

export interface CoinWallet {
  coin_balance: number;
  bonus_coin_balance: number;
  earned_coin_balance: number;
  wallet_balance_usd: number;
  total_purchased_coins: number;
}

/** The other person on a gift, plus what it was. */
export interface GiftPerson {
  id: number;
  username: string;
  name: string | null;
  avatar: string | null;
  is_verified: boolean;
}

/**
 * One gift, from `coin_gifts` rather than the coin ledger.
 *
 * wallet_transactions only records a description string, which is why the app
 * could never name who sent something or draw the gift they sent. This carries
 * both, plus the full split.
 */
export interface GiftHistoryItem {
  id: number;
  direction: "received" | "sent";
  gift_name: string;
  gross_coins: number;
  commission_coins: number;
  net_coins: number;
  video_id: number | null;
  created_at: string | null;
  user: GiftPerson | null;
}

export interface TopSupporter {
  coins: number;
  gifts: number;
  user: GiftPerson;
}

/** Gifts + coin wallet/packages - same backend the website's Wallets & Coins uses. */
export const giftApi = {
  gifts: () => api.get<{ success: boolean; data: Gift[] }>("/gifts").then((r) => r.data.data),

  /** Whether to show a gift-sending affordance for this user at all - call
   *  before rendering a gift icon against someone else's content (comments,
   *  LIVE). Cached a few minutes server-side, so this is cheap to call once
   *  per screen (once per opened comment sheet / joined LIVE), not something
   *  to poll. send() still independently re-checks live at the moment coins
   *  would actually move - this is a display decision, not the enforcement. */
  eligible: (userId: number) =>
    api.get<{ success: boolean; data: { active: boolean } }>(`/users/${userId}/gifts-eligible`).then((r) => r.data.data.active),

  /**
   * Spend coins to gift a user; receiver_id is required (e.g. a comment author).
   *
   * `idempotencyKey` must stay the SAME across retries of one send and differ
   * between sends. Without it a request that reached the server and then timed
   * out is charged again when retried - the server can only tell a retry from a
   * genuine second gift by this key, since sending the same gift twice is
   * perfectly legitimate.
   */
  send: (
    receiverId: number,
    giftId: number,
    opts?: { commentId?: number; videoId?: number; idempotencyKey?: string },
  ) =>
    api
      .post<{ success: boolean; message: string; data: { sender_coin_balance?: number } }>(
        "/gifts/send",
        {
          receiver_id: receiverId,
          gift_id: giftId,
          comment_id: opts?.commentId,
          video_id: opts?.videoId,
        },
        opts?.idempotencyKey
          ? { headers: { "Idempotency-Key": opts.idempotencyKey } }
          : undefined,
      )
      .then((r) => r.data),

  /** Gifts you received (default) or sent, newest first, with the other person. */
  history: (direction: "received" | "sent" = "received", page = 1, perPage = 20) =>
    api
      .get<{
        success: boolean;
        data: GiftHistoryItem[];
        meta?: { current_page: number; last_page: number; total: number };
      }>("/gifts/history", { params: { direction, page, per_page: perPage } })
      .then((r) => ({
        items: r.data.data ?? [],
        hasMore: (r.data.meta?.current_page ?? 1) < (r.data.meta?.last_page ?? 1),
        page: r.data.meta?.current_page ?? page,
      })),

  /** Who has gifted you the most - ranked by coins that actually landed. */
  topSupporters: (period: "month" | "all" = "month", limit = 10) =>
    api
      .get<{ success: boolean; data: TopSupporter[] }>("/gifts/top-supporters", { params: { period, limit } })
      .then((r) => r.data.data ?? []),

  wallet: () =>
    api.get<{ success: boolean; data: { wallet: CoinWallet } }>("/studio/wallets-coins").then((r) => r.data.data.wallet),

  packages: () =>
    api
      .get<{ success: boolean; data: CoinPackage[] }>("/studio/wallets-coins/packages", { params: { all: true } })
      .then((r) => r.data.data),
};
