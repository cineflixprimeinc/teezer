import { api } from "./client";
import type { Paginated } from "@/types";

/**
 * Shop Settings > Selling > Orders & Returns - the SELLER's own view of
 * orders placed against their shop. Distinct from shop-orders.api.ts (if
 * one exists) or any buyer-facing order client: that surface is the
 * buyer's own checkout/purchase history (GET /shop/orders, buyer_id-
 * scoped); this one is server-scoped to the caller's OWN shop
 * (GET /shop/seller/orders, ShopOrderController::sellerOrders) - separate
 * endpoints on purpose so the two can never be confused by URL alone.
 */

export type ShopOrderStatus = "pending" | "paid" | "cod_pending" | "fulfilled" | "cancelled" | "failed";

export interface SellerOrderItem {
  product_id: number | null;
  product_name: string;
  unit_price: number;
  quantity: number;
  variation: Record<string, string> | null;
  line_total: number;
}

export interface SellerOrder {
  id: number;
  status: ShopOrderStatus;
  payment_method: string;
  currency: string;
  subtotal: number;
  commission_amount: number;
  net_amount: number;
  shipping_address: Record<string, string> | null;
  buyer_note: string | null;
  paid_at: string | null;
  fulfilled_at: string | null;
  created_at: string;
  buyer: { username: string | null; name: string | null; avatar: string | null };
  items: SellerOrderItem[];
}

const BASE = "/shop/seller/orders";

export const shopSellerOrdersApi = {
  list: (page: number, status?: ShopOrderStatus) =>
    api.get<Paginated<SellerOrder>>(BASE, { params: { page, status } }).then((r) => r.data),

  show: (id: number) =>
    api.get<{ success: boolean; data: SellerOrder }>(`${BASE}/${id}`).then((r) => r.data.data),

  /** Only "fulfilled" or "cancelled" - see ShopOrderController::updateOrderStatus for exactly which transitions are allowed. */
  updateStatus: (id: number, status: "fulfilled" | "cancelled") =>
    api.patch<{ success: boolean; data: SellerOrder }>(`${BASE}/${id}/status`, { status }).then((r) => r.data.data),
};
