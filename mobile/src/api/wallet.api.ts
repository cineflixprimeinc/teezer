import { api } from "./client";

/**
 * Coin wallet + creator payouts - the two money surfaces behind "Gifts & coins".
 *
 * They are genuinely two systems in the backend and are NOT interchangeable:
 *
 *   `wallets` / `wallet_transactions`  - the COIN ledger. Gifts move coins
 *     between users; a purchase mints them. Served by /studio/wallets-coins.
 *   `creator_wallets` / `creator_payouts` - the USD earnings side, i.e. what a
 *     creator actually cashes out. Served by /studio/monetization/overview.
 *
 * The screen shows a coin balance from the first and a payout schedule from the
 * second, which is why both live here rather than in one "wallet" call.
 */

/* ── GET /studio/wallets-coins ─────────────────────────────────────────── */

export interface CoinWallet {
  /** Spendable coins (purchased + bonus), the headline balance. */
  coin_balance: number;
  bonus_coin_balance: number;
  /** Coins received from gifts, net of commission. */
  earned_coin_balance: number;
  wallet_balance_usd: number;
  pending_balance_usd: number;
  total_received_coins: number;
  total_commission_coins: number;
  total_net_earned_coins: number;
  total_spent_coins: number;
  total_purchased_coins: number;
}

export interface CommissionInfo {
  /** Platform cut on a received gift, as a percentage (e.g. 30). */
  rate: number;
  min_withdrawal_usd: number;
  /** How many coins make up one USD. */
  coin_usd_rate: number;
}

export interface WalletSummary {
  wallet: CoinWallet;
  commission: CommissionInfo;
  payment_methods: Record<string, boolean>;
}

/* ── GET /studio/wallets-coins/transactions ────────────────────────────── */

/** Every `type` the backend actually writes into `wallet_transactions`.
 *  `gift_sent`/`gift_received` come from GiftCommissionService, `coin_purchase`
 *  from a paid order, `premium_bonus` from PremiumBonusService, `ad_income`
 *  from AdBillingService. The open `string` keeps an unknown future type from
 *  breaking the list. */
export type WalletTxType =
  | "gift_received"
  | "gift_sent"
  | "coin_purchase"
  | "premium_bonus"
  | "ad_income"
  | (string & {});

export interface WalletTransaction {
  id: number;
  type: WalletTxType;
  description: string | null;
  /** The other person on a gift row, joined from coin_gifts. Null on rows that
   *  have no counterparty (a purchase, a bonus, ad income). */
  counterparty?: {
    id: number;
    username: string;
    name: string | null;
    avatar: string | null;
    is_verified: boolean;
  } | null;
  /** The gift itself, so the row can name it without parsing `description`. */
  gift_name?: string | null;
  gross_coins: number;
  commission_coins: number;
  /** Signed balance impact in coins - negative on `gift_sent`. Zero on
   *  `ad_income`, which is a USD-only row (see `amount_usd`). */
  net_coins: number;
  amount_usd: number;
  balance_after_coins: number;
  wallet_balance_after_usd: number;
  status: string;
  reference_id: string | null;
  created_at: string;
}

export interface WalletTxPage {
  items: WalletTransaction[];
  hasMore: boolean;
  page: number;
}

/* ── GET /studio/monetization/overview (the payout slice) ──────────────── */

export interface PayoutMethod {
  provider: string;
  account_email: string | null;
  masked_account: string | null;
}

/** One saved destination for a payout. */
export interface PayoutMethodRow {
  id: number;
  provider: string;
  account_email: string | null;
  masked_account: string | null;
  is_default: boolean;
}

export interface NextPayout {
  amount: number;
  /** Preformatted server-side as "Aug 05, 2026". */
  date: string | null;
  days_until: number;
  status: string;
}

export interface PayoutInfo {
  available_balance: number;
  pending_balance: number;
  lifetime_earnings: number;
  minimum_withdraw: number;
  /** Reelsoo's cut, taken at withdrawal - gifts credit in full. Percent. */
  commission_rate?: number;
  /** Coins per USD, from the admin panel. Used to show a coin balance and its
   *  cash value with the same arithmetic the website uses. */
  coin_usd_rate?: number;
  /** False until an admin has APPROVED the creator's tax form. */
  can_withdraw: boolean;
  tax: { required: boolean; approved: boolean; status: string; message: string | null };
  next_payout: NextPayout | null;
  payment_method: PayoutMethod | null;
  /** Earnings change vs the previous window of the same length. Requested with
   *  `range=7d`, so this is literally "% vs last week". */
  growth: { percentage: number; up: boolean } | null;
}

/** A buyable coin plan. The catalog runs to 200, ordered by `sort_order`. */
export type CoinPackage = {
  id: number;
  plan_name: string;
  coins: number;
  price_usd: number;
  badge: string | null;
  icon: string | null;
  /** Admin-uploaded artwork. When set it replaces the slug artwork everywhere. */
  icon_url?: string | null;
  is_front_visible?: boolean;
  sort_order: number;
  per_coin_usd?: number;
  /**
   * Bonus coins, derived server-side. `total_coins` is what the wallet is
   * actually credited, so the client never recomputes it - what is displayed
   * is what is paid.
   */
  bonus?: {
    has_bonus: boolean;
    base_coins: number;
    bonus_coins: number;
    total_coins: number;
    bonus_label: string | null;
    bonus_text: string | null;
    bonus_ends_at: string | null;
  };
};

export const walletApi = {
  summary: () =>
    api
      .get<{ success: boolean; data: WalletSummary }>("/studio/wallets-coins")
      .then((r) => r.data.data),

  /** The coin catalog. `all` returns every plan; without it the server sends
   *  only the front-visible ones. */
  packages: async (all = false): Promise<CoinPackage[]> => {
    const res = await api.get("/studio/wallets-coins/packages", {
      params: all ? { all: 1 } : undefined,
    });
    return res.data.data ?? [];
  },

  /** One page of the coin ledger. `type` filters server-side; omit it for the
   *  unfiltered list (which is the only way purchases/bonuses/ad income show). */
  transactions: (page = 1, perPage = 20, type?: WalletTxType): Promise<WalletTxPage> =>
    api
      .get<{
        success: boolean;
        data: WalletTransaction[];
        meta?: { current_page: number; last_page: number; per_page: number; total: number };
      }>("/studio/wallets-coins/transactions", { params: { page, per_page: perPage, ...(type ? { type } : {}) } })
      .then((r) => {
        const items = r.data.data ?? [];
        const meta = r.data.meta;
        // A wallet-less user gets `meta:{total:0}` with no current_page, so fall
        // back to a length check rather than comparing two undefineds.
        const hasMore =
          meta && meta.current_page != null && meta.last_page != null
            ? meta.current_page < meta.last_page
            : items.length >= perPage;
        return { items, hasMore, page };
      }),

  /**
   * Payout schedule + withdrawal eligibility.
   *
   * Resolves to null rather than throwing: this is the one call on the screen
   * whose absence is survivable - the payout card and the trend pill simply do
   * not render. The endpoint is also much heavier than the others (it computes
   * a daily chart and a top-content join we don't use), so a failure here must
   * never take the coin balance down with it.
   */
  /** Every payout method on the account, default first. */
  payoutMethods: (): Promise<PayoutMethodRow[]> =>
    api
      .get<{ success: boolean; data: PayoutMethodRow[] }>("/studio/monetization/payout-methods")
      .then((r) => r.data.data ?? [])
      .catch(() => []),

  /**
   * Request a withdrawal.
   *
   * `amount` is the GROSS taken off the balance; Reelsoo's commission is
   * applied server-side and the response carries what will actually be paid.
   * The idempotency key is what stops a double-tap or a retry-after-timeout
   * becoming two payouts, so it is required here rather than optional.
   */
  withdraw: (amount: number, idempotencyKey: string) =>
    api
      .post<{ success: boolean; message?: string; data?: unknown }>(
        "/studio/monetization/withdraw",
        { amount },
        { headers: { "Idempotency-Key": idempotencyKey } },
      )
      .then((r) => r.data),

  payouts: (): Promise<PayoutInfo | null> =>
    api
      .get<{
        success: boolean;
        data: {
          payouts: Omit<PayoutInfo, "growth">;
          summary?: { revenue_growth?: { percentage: number; up: boolean } };
        };
      }>("/studio/monetization/overview", { params: { range: "7d" } })
      .then((r) => {
        const d = r.data.data;
        if (!d?.payouts) return null;
        const g = d.summary?.revenue_growth;
        return {
          ...d.payouts,
          growth: g && typeof g.percentage === "number" ? { percentage: g.percentage, up: !!g.up } : null,
        };
      })
      .catch(() => null),
};
