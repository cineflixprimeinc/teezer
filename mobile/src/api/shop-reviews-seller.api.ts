import { api } from "./client";
import type { Paginated } from "@/types";

/**
 * Shop Settings > Products > Product Reviews - shop-wide reviews (see
 * ShopReview's own docblock: it's per-shop, not per-product) with the
 * seller-reply this app never had a write path for before now.
 */

export interface SellerShopReview {
  id: number;
  rating: number;
  comment: string | null;
  seller_reply: string | null;
  seller_reply_at: string | null;
  user: { name: string | null; username: string | null; avatar: string | null };
  created_at: string;
}

export const shopReviewsSellerApi = {
  list: (page: number) =>
    api.get<Paginated<SellerShopReview>>("/shop/reviews/mine", { params: { page } }).then((r) => r.data),

  reply: (id: number, reply: string) =>
    api.put<{ success: boolean; data: SellerShopReview }>(`/shop/reviews/${id}/reply`, { reply }).then((r) => r.data.data),
};
