import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1';

const api = axios.create({
  baseURL: API.replace(/\/+$/, ''),
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('reelsoo_token') : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/* ── Types ──────────────────────────────────────────────────────────────── */

export type PayPalConfig = {
  enabled: boolean;
  mode: 'sandbox' | 'live';
  client_id: string;
  client_secret: string;
  secret_is_set: boolean;
};

export type StripeConfig = {
  enabled: boolean;
  mode: 'test' | 'live';
  publishable_key: string;
  secret_key: string;
  secret_key_is_set: boolean;
  webhook_secret: string;
  webhook_is_set: boolean;
};

export type RazorpayConfig = {
  enabled: boolean;
  key_id: string;
  key_secret: string;
  secret_is_set: boolean;
};

export type BankConfig = {
  enabled: boolean;
  account_holder: string;
  bank_name: string;
  account_number: string;
  routing_number: string;
  swift_code: string;
  instructions: string;
};

export type PricingConfig = {
  subscription_monthly: number;
  subscription_annual: number;
  badge_price: number;
};

export type PaymentMethods = {
  card: boolean;
  paypal: boolean;
  applepay: boolean;
  googlepay: boolean;
  upi: boolean;
  bank: boolean;
};

export type CoinConfig = {
  commission_rate: number;
  min_withdrawal_usd: number;
  coin_usd_rate: number;
};

export type PaymentSettings = {
  paypal: PayPalConfig;
  stripe: StripeConfig;
  razorpay: RazorpayConfig;
  bank: BankConfig;
  pricing: PricingConfig;
  methods: PaymentMethods;
  coins: CoinConfig;
};

export type PaymentSettingsUpdate = {
  // PayPal
  paypal_enabled?: boolean;
  paypal_mode?: 'sandbox' | 'live';
  paypal_client_id?: string;
  paypal_client_secret?: string;
  // Stripe
  stripe_enabled?: boolean;
  stripe_mode?: 'test' | 'live';
  stripe_publishable_key?: string;
  stripe_secret_key?: string;
  stripe_webhook_secret?: string;
  // Razorpay
  razorpay_enabled?: boolean;
  razorpay_key_id?: string;
  razorpay_key_secret?: string;
  // Bank
  bank_enabled?: boolean;
  bank_name?: string;
  bank_account_holder?: string;
  bank_account_number?: string;
  bank_routing_number?: string;
  bank_swift_code?: string;
  bank_enabled_instructions?: string;
  // Pricing
  subscription_monthly_price?: number;
  subscription_annual_price?: number;
  badge_price?: number;
  // Methods
  card_enabled?: boolean;
  applepay_enabled?: boolean;
  googlepay_enabled?: boolean;
  upi_enabled?: boolean;
  // Coins
  commission_rate?: number;
  min_withdrawal_usd?: number;
  coin_usd_rate?: number;
};

/* ── API calls ──────────────────────────────────────────────────────────── */

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const { data } = await api.get<{ success: boolean; data: PaymentSettings }>(
    '/admin/payment-settings',
  );
  return data.data;
}

export async function updatePaymentSettings(
  payload: PaymentSettingsUpdate,
): Promise<void> {
  await api.post('/admin/payment-settings', payload);
}

export async function testPaypalConnection(): Promise<{ connected: boolean; message: string }> {
  const { data } = await api.post<{
    success: boolean;
    data: { connected: boolean; message: string };
  }>('/admin/payment-settings/paypal/test');
  return data.data;
}

export async function testStripeConnection(): Promise<{ connected: boolean; message: string }> {
  const { data } = await api.post<{
    success: boolean;
    data: { connected: boolean; message: string };
  }>('/admin/payment-settings/stripe/test');
  return data.data;
}
