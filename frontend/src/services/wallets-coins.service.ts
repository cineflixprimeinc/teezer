import { api } from "./api";
import type { ApiResponse, Paginated } from "@/types/api";

/* ── Types ─────────────────────────────────────────────────────────────── */
export type WalletSummary = {
  coin_balance: number;
  bonus_coin_balance: number;
  earned_coin_balance: number;
  wallet_balance_usd: number;
  pending_balance_usd: number;
  total_received_coins: number;
  total_commission_coins: number;
  total_net_earned_coins: number;
  total_spent_coins: number;
  total_purchased_coins: number;
};

export type CommissionInfo = {
  rate: number;
  min_withdrawal_usd: number;
  coin_usd_rate: number;
};

export type PaymentMethodsAvailability = {
  card: boolean;
  paypal: boolean;
  applepay: boolean;
  googlepay: boolean;
  upi: boolean;
  bank: boolean;
};

export type WalletDashboardData = {
  wallet: WalletSummary;
  commission: CommissionInfo;
  payment_methods: PaymentMethodsAvailability;
};

export type CoinPackage = {
  id: number;
  plan_name: string;
  coins: number;
  price_usd: number;
  badge: string | null;
  /**
   * Bonus coins, derived server-side. `total_coins` is what the wallet is
   * actually credited, so nothing here is ever recomputed on the client - the
   * number shown is the number paid.
   */
  bonus?: {
    has_bonus: boolean;
    base_coins: number;
    bonus_coins: number;
    total_coins: number;
    bonus_label: string | null;
    /** "+10 bonus coins" - always set when a bonus runs. */
    bonus_text: string | null;
    bonus_ends_at: string | null;
  };
  /** Gift slug (e.g. "heart-ribbon") - resolves to the animated icon in /gifts/. */
  icon: string | null;
  /** Admin-uploaded artwork. Overrides the slug artwork when set. */
  icon_url?: string | null;
  is_front_visible: boolean;
  sort_order: number;
  per_coin_usd: number;
};

export type WalletTransaction = {
  id: number;
  type: string;
  description: string;
  gross_coins: number;
  commission_coins: number;
  net_coins: number;
  amount_usd: number;
  balance_after_coins: number;
  wallet_balance_after_usd: number;
  status: string;
  reference_id: string | null;
  created_at: string;
};

export type CoinOrderResult = {
  order_id: number;
  reference: string;
  coins: number;
  price_usd: number;
  payment_method: string;
  payment_status: string;
  /** Returned only when payment_method === 'paypal' */
  paypal_order_id?: string;
};

export type BankDetails = {
  account_holder: string;
  bank_name: string;
  account_number: string;
  routing_number: string;
  swift_code: string;
  instructions: string;
};

export type PaymentConfig = {
  paypal: { enabled: boolean; client_id: string; mode: string };
  stripe: { enabled: boolean; publishable_key: string };
  razorpay: { enabled: boolean; key_id: string };
  bank: BankDetails & { enabled: boolean };
  pricing: {
    subscription_monthly: number;
    subscription_annual: number;
    badge_price: number;
  };
};

export type StripeIntentResult = {
  client_secret: string;
  order_id: number;
  amount: number;
  coins: number;
};

export type RazorpayOrderResult = {
  razorpay_order_id: string;
  order_id: number;
  amount: number;
  coins: number;
  key_id: string;
};

export type BankTransferResult = {
  order_id: number;
  reference: string;
  bank_details: BankDetails;
  amount: number;
  coins: number;
};

export type SubscriptionData = {
  id: number;
  plan: string;
  status: string;
  price: number;
  currency: string;
  started_at: string | null;
  expires_at: string | null;
  cancelled_at: string | null;
  is_active: boolean;
};

export type SubscriptionResult = {
  subscription: SubscriptionData;
};

/* ── Service ───────────────────────────────────────────────────────────── */
export const walletCoinsService = {
  paymentConfig: async (): Promise<PaymentConfig> => {
    const res = await api.get<{ success: boolean; data: PaymentConfig }>("/payment-config");
    return res.data.data;
  },

  dashboard: async (): Promise<WalletDashboardData> => {
    const res = await api.get<ApiResponse<WalletDashboardData>>("/studio/wallets-coins");
    return res.data.data;
  },

  packages: async (all = false): Promise<CoinPackage[]> => {
    const res = await api.get<ApiResponse<CoinPackage[]>>(
      `/studio/wallets-coins/packages${all ? "?all=true" : ""}`,
    );
    return res.data.data;
  },

  transactions: async (params?: {
    type?: string;
    page?: number;
    per_page?: number;
  }): Promise<Paginated<WalletTransaction>> => {
    const res = await api.get<Paginated<WalletTransaction>>(
      "/studio/wallets-coins/transactions",
      { params },
    );
    return res.data;
  },

  createOrder: async (payload: {
    package_id: number;
    payment_method: string;
  }): Promise<CoinOrderResult> => {
    const res = await api.post<ApiResponse<CoinOrderResult>>(
      "/studio/wallets-coins/orders",
      payload,
    );
    return res.data.data;
  },

  capturePaypalOrder: async (payload: {
    order_id: number;
    paypal_order_id: string;
  }): Promise<{ coins_added: number }> => {
    const res = await api.post<ApiResponse<{ coins_added: number }>>(
      "/studio/wallets-coins/orders/paypal/capture",
      payload,
    );
    return res.data.data;
  },

  // ── Stripe ────────────────────────────────────────────────────────────

  createStripeIntent: async (packageId: number): Promise<StripeIntentResult> => {
    const res = await api.post<ApiResponse<StripeIntentResult>>(
      "/studio/wallets-coins/orders/stripe/intent",
      { package_id: packageId },
    );
    return res.data.data;
  },

  captureStripePayment: async (
    orderId: number,
    paymentIntentId: string,
  ): Promise<{ coins_added: number }> => {
    const res = await api.post<ApiResponse<{ coins_added: number }>>(
      "/studio/wallets-coins/orders/stripe/capture",
      { order_id: orderId, payment_intent_id: paymentIntentId },
    );
    return res.data.data;
  },

  // ── Razorpay ──────────────────────────────────────────────────────────

  createRazorpayOrder: async (packageId: number): Promise<RazorpayOrderResult> => {
    const res = await api.post<ApiResponse<RazorpayOrderResult>>(
      "/studio/wallets-coins/orders/razorpay/create",
      { package_id: packageId },
    );
    return res.data.data;
  },

  captureRazorpayPayment: async (payload: {
    order_id: number;
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }): Promise<{ coins_added: number }> => {
    const res = await api.post<ApiResponse<{ coins_added: number }>>(
      "/studio/wallets-coins/orders/razorpay/capture",
      payload,
    );
    return res.data.data;
  },

  // ── Bank Transfer ─────────────────────────────────────────────────────

  createBankTransferOrder: async (packageId: number): Promise<BankTransferResult> => {
    const res = await api.post<ApiResponse<BankTransferResult>>(
      "/studio/wallets-coins/orders/bank/create",
      { package_id: packageId },
    );
    return res.data.data;
  },

  // ── Subscriptions ─────────────────────────────────────────────────────

  getCurrentSubscription: async (): Promise<SubscriptionResult | null> => {
    const res = await api.get<ApiResponse<SubscriptionData | null>>("/studio/subscriptions");
    return res.data.data ? { subscription: res.data.data } : null;
  },

  /**
   * `couponCode` is the CODE only - never the discount. The backend
   * re-validates it and computes the amount itself, so a coupon the UI thinks
   * it applied cannot change what is actually charged.
   */
  createSubscriptionIntent: async (
    plan: string,
    paymentMethod: string,
    couponCode?: string | null,
    // Which tier. The backend prices from this; omitting it falls back to the
    // legacy flat price, which is what older clients still send.
    planKey?: string | null,
  ): Promise<Record<string, unknown>> => {
    const res = await api.post<ApiResponse<Record<string, unknown>>>(
      "/studio/subscriptions/intent",
      {
        plan,
        payment_method: paymentMethod,
        coupon_code: couponCode || null,
        plan_key: planKey || null,
      },
    );
    return res.data.data;
  },

  captureSubscriptionStripe: async (
    orderId: number,
    paymentIntentId: string,
  ): Promise<SubscriptionResult> => {
    const res = await api.post<ApiResponse<SubscriptionResult>>(
      "/studio/subscriptions/capture/stripe",
      { order_id: orderId, payment_intent_id: paymentIntentId },
    );
    return res.data.data;
  },

  captureSubscriptionPaypal: async (
    orderId: number,
    paypalOrderId: string,
  ): Promise<SubscriptionResult> => {
    const res = await api.post<ApiResponse<SubscriptionResult>>(
      "/studio/subscriptions/capture/paypal",
      { order_id: orderId, paypal_order_id: paypalOrderId },
    );
    return res.data.data;
  },

  captureSubscriptionRazorpay: async (payload: {
    order_id: number;
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }): Promise<SubscriptionResult> => {
    const res = await api.post<ApiResponse<SubscriptionResult>>(
      "/studio/subscriptions/capture/razorpay",
      payload,
    );
    return res.data.data;
  },

  cancelSubscription: async (): Promise<void> => {
    await api.post("/studio/subscriptions/cancel");
  },
};
