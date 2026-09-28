import { api } from "./api";
import type { ApiResponse } from "@/types/api";

/**
 * Teezer Shop checkout - the web page mobile hands off to for card/UPI
 * payment (no Stripe/Razorpay SDK exists in the mobile app; this mirrors the
 * exact hand-off pattern coins already use for the same reason - see
 * StudioWalletsSection.tsx's Linking.openURL(WEB_COINS_URL)).
 *
 * Talks to ShopOrderController, which mirrors walletCoinsService's Stripe/
 * Razorpay create->capture calls method-for-method.
 */

export type CheckoutProduct = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  currency: string;
  image_url: string | null;
  images: string[];
  colors: { label: string; hex: string }[];
  variations: { name: string; options: string[] }[];
  stock: number;
  is_digital: boolean;
  allow_cod: boolean;
  shop: {
    username: string | null;
    name: string | null;
    avatar: string | null;
    is_verified: boolean;
  };
};

export type ShippingAddress = {
  name: string;
  phone: string;
  line1: string;
  city: string;
  country: string;
};

export type CheckoutPayload = {
  product_id: number;
  quantity: number;
  variation?: Record<string, string>;
  shipping_address?: ShippingAddress;
};

export type StripeIntentResult = {
  client_secret: string;
  order_id: number;
  amount: number;
  currency: string;
};

export type RazorpayOrderResult = {
  razorpay_order_id: string;
  order_id: number;
  amount: number;
  currency: string;
  key_id: string;
};

export const shopCheckoutService = {
  product: async (id: number): Promise<CheckoutProduct> => {
    const res = await api.get<ApiResponse<CheckoutProduct>>(`/products/${id}`);
    return res.data.data;
  },

  createStripeIntent: async (payload: CheckoutPayload): Promise<StripeIntentResult> => {
    const res = await api.post<ApiResponse<StripeIntentResult>>("/shop/orders/stripe/intent", payload);
    return res.data.data;
  },

  captureStripePayment: async (orderId: number, paymentIntentId: string): Promise<{ order_id: number }> => {
    const res = await api.post<ApiResponse<{ order_id: number }>>("/shop/orders/stripe/capture", {
      order_id: orderId,
      payment_intent_id: paymentIntentId,
    });
    return res.data.data;
  },

  createRazorpayOrder: async (payload: CheckoutPayload): Promise<RazorpayOrderResult> => {
    const res = await api.post<ApiResponse<RazorpayOrderResult>>("/shop/orders/razorpay/create", payload);
    return res.data.data;
  },

  captureRazorpayPayment: async (payload: {
    order_id: number;
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }): Promise<{ order_id: number }> => {
    const res = await api.post<ApiResponse<{ order_id: number }>>("/shop/orders/razorpay/capture", payload);
    return res.data.data;
  },
};
