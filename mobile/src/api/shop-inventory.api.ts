import { api } from "./client";
import type { Paginated } from "@/types";

/**
 * Shop Settings > Products > Products & Inventory - the seller's own product
 * list (unfiltered by is_active, unlike shopApi.products()'s public read)
 * plus the stock/visibility/low-stock-threshold update shopApi.createProduct
 * never had a follow-up for. Full re-editing (name/price/images/description)
 * stays out of scope - see ShopController::updateProduct's own comment.
 */

export interface SellerProduct {
  id: number;
  name: string;
  price: number;
  currency: string;
  image_url: string | null;
  stock: number;
  low_stock_threshold: number;
  is_low_stock: boolean;
  is_active: boolean;
  sold_count: number;
  created_at: string;
  category_id: number | null;
  category_name: string | null;
}

export interface SellerProductUpdate {
  stock?: number;
  is_active?: boolean;
  low_stock_threshold?: number;
}

/** The list response's meta, plus the shop-wide low-stock count the Settings hub's status line needs. */
export type SellerProductPage = Paginated<SellerProduct> & { meta: { low_stock_count: number } };

export const shopInventoryApi = {
  // `search`/`activeOnly` are additive - also used by the "Add link" ->
  // Teezer Product picker (PostCameraScreenImpl) to search the same
  // seller's own products and show only ones that can actually be
  // attached to a post (see myProducts's own comment for why - omitted,
  // both default to the original unfiltered/unsearched behavior Shop
  // Settings > Products & Inventory already relies on).
  list: (page: number, search?: string, activeOnly?: boolean) =>
    api
      .get<SellerProductPage>("/shop/products/mine", {
        params: { page, search: search || undefined, active_only: activeOnly ? 1 : undefined },
      })
      .then((r) => r.data),

  update: (id: number, payload: SellerProductUpdate) =>
    api.patch<{ success: boolean; data: SellerProduct }>(`/shop/products/${id}`, payload).then((r) => r.data.data),
};
