import { api } from "./client";
import type { Paginated } from "@/types";
import type { ShopPolicies } from "./seller-application.api";

export type ProductSort = "recommended" | "best_sellers" | "new_arrivals" | "price_asc" | "price_desc";

export interface ShopProfile {
  /** False whenever there's no shop, or one exists but isn't admin-approved
   *  (draft/pending review/rejected/suspended/etc) - the server already
   *  degrades every other field to the same empty/fallback shape in that
   *  case, but the screen must gate its OWN storefront chrome on this flag
   *  rather than inferring availability from shop_name/tagline being set. */
  available: boolean;
  shop_name: string;
  tagline: string | null;
  /** The seller's own shop logo if set, else their personal avatar - never
   *  null while `available` (or `is_paused`) is true. See Shop::logoUrl(). */
  logo_url: string | null;
  category: string | null;
  /** Only populated while `available` or `is_paused` - null for every other
   *  non-approved state, same rule as logo_url/category. */
  policies: ShopPolicies | null;
  is_live: boolean;
  rating_avg: number;
  rating_count: number;
  sold_count: number;
  /** True only when the SELLER paused via Shop Settings - a shop that's
   *  merely unapproved/rejected/suspended is `available: false` with this
   *  staying false too. pause_message/paused_until are the seller's own
   *  words, meant for customers to read while checkout is disabled. */
  is_paused: boolean;
  pause_message: string | null;
  paused_until: string | null;
  user: {
    id: number;
    username: string;
    name: string | null;
    avatar: string | null;
    is_verified: boolean;
  };
  counts: {
    products: number;
    videos: number;
    collections: number;
    reviews: number;
  };
}

export interface ShopProduct {
  id: number;
  name: string;
  price: number;
  currency: string;
  image_url: string | null;
  badge: "bestseller" | "new" | null;
  rating_avg: number;
  rating_count: number;
  sold_count: number;
  colors: { label: string; hex: string }[];
}

export interface ShopCollection {
  id: number;
  name: string;
  cover_image_url: string | null;
  products_count: number;
}

export interface ShopReview {
  id: number;
  rating: number;
  comment: string | null;
  seller_reply: string | null;
  seller_reply_at: string | null;
  user: { name: string | null; username: string | null; avatar: string | null };
  created_at: string;
}

/** The [All] [Fashion] [Beauty]... carousel pill. "All" itself isn't a row here - it's the absence of a `category` filter. */
export interface ShopCategory {
  id: number;
  parent_id: number | null;
  name: string;
  slug: string;
  /** Curation for the Shop marketplace home's category grid - independent
   *  of whether the category exists/is offered elsewhere in the app. */
  is_featured_home?: boolean;
  home_sort_order?: number;
}

/** The Shop marketplace home's promo carousel - admin-authored, see
 *  ShopController::promoBanners(). */
export interface ShopPromoBanner {
  id: number;
  title: string;
  subtitle: string | null;
  description: string | null;
  image_url: string | null;
  gradient_start: string | null;
  gradient_end: string | null;
  cta_label: string;
  cta_link: string | null;
}

/** One "deal of the day" - a real product an admin picked, at a set price -
 *  see ShopController::deals(). */
export interface ShopDeal {
  id: number;
  product_id: number;
  name: string;
  image_url: string | null;
  currency: string;
  original_price: number;
  deal_price: number;
  discount_percent: number;
  rating_avg: number;
  sold_count: number;
  ends_at: string | null;
}

/** A marketplace coupon - see ShopController::coupons(). `claimed` reflects
 *  the CURRENT signed-in viewer only (false/omitted for a guest). */
export interface ShopCoupon {
  id: number;
  code: string;
  title: string;
  description: string | null;
  type: "percentage" | "fixed" | "free_delivery";
  value: number | null;
  min_spend: number | null;
  claimed: boolean;
}

/** One row of the Add Product currency picker - see ShopController::currencies(). */
export interface ShopCurrency {
  code: string;
  symbol: string;
  name: string;
}

export interface NewProductVariation {
  name: string;
  options: string[];
}

/** One preset row of the Add Variation sheet's type dropdown - see
 *  ProductVariationType/ShopController::variationTypes(). */
export interface ShopVariationType {
  id: number;
  name: string;
  options: string[];
}

/** The "Add New Product" form's payload - see ShopController::storeProduct. */
export interface NewProduct {
  name: string;
  description: string;
  category_id: number;
  subcategory_id?: number | null;
  price: number;
  /** Omit to let the server default to the seller's own detected currency
   *  (ShopController::storeProduct) - only send it once they've actually
   *  picked one, so a client that skips the currency picker entirely still
   *  gets a sensible currency instead of silently landing on NPR. */
  currency?: string;
  compare_at_price?: number | null;
  sku?: string | null;
  stock: number;
  shipping_type?: string | null;
  is_digital: boolean;
  allow_cod: boolean;
  is_active: boolean;
  variations?: NewProductVariation[];
  /** RN's FormData file shape - see ReportSheet's evidence picker for the same pattern. */
  images: { uri: string; name: string; type: string }[];
}

/** Full detail for one product - GET /products/{id}, everything the
 *  storefront grid's card omits (description, stock, variations,
 *  allow_cod/is_digital) that a detail/checkout screen needs. See
 *  ShopController::productShow. */
export interface ProductDetail {
  id: number;
  name: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  currency: string;
  image_url: string | null;
  images: string[];
  badge: "bestseller" | "new" | null;
  colors: { label: string; hex: string }[];
  variations: NewProductVariation[];
  rating_avg: number;
  rating_count: number;
  sold_count: number;
  stock: number;
  is_digital: boolean;
  allow_cod: boolean;
  shipping_type: string | null;
  shop: {
    username: string | null;
    name: string | null;
    avatar: string | null;
    is_verified: boolean;
  };
}

export const shopApi = {
  profile: (username: string) =>
    api.get<{ success: boolean; data: ShopProfile }>(`/shops/${username}`).then((r) => r.data.data),

  product: (id: number) =>
    api.get<{ success: boolean; data: ProductDetail }>(`/products/${id}`).then((r) => r.data.data),

  categories: () =>
    api.get<{ success: boolean; data: ShopCategory[] }>("/shops/categories").then((r) => r.data.data),

  /** The Shop marketplace home's promo carousel. */
  homeBanners: () =>
    api.get<{ success: boolean; data: ShopPromoBanner[] }>("/shops/promo-banners").then((r) => r.data.data),

  /** "Deals of the day". */
  homeDeals: () =>
    api.get<{ success: boolean; data: ShopDeal[] }>("/shops/deals").then((r) => r.data.data),

  /** Marketplace coupons - each already carries `claimed` for the current viewer. */
  homeCoupons: () =>
    api.get<{ success: boolean; data: ShopCoupon[] }>("/shops/coupons").then((r) => r.data.data),

  /** Adds a coupon to the caller's own wallet - not a checkout redemption,
   *  see ShopCouponClaim's server-side doc comment for why. */
  claimCoupon: (id: number) =>
    api.post<{ success: boolean; message?: string }>(`/shops/coupons/${id}/claim`).then((r) => r.data),

  currencies: () =>
    api.get<{ success: boolean; data: ShopCurrency[] }>("/shops/currencies").then((r) => r.data.data),

  /** Auto-fill for the Add Product price field - see ShopController::detectCurrency. */
  detectCurrency: () =>
    api
      .get<{ success: boolean; data: { country_code: string; currency: string; symbol: string } }>(
        "/shops/detect-currency",
      )
      .then((r) => r.data.data),

  variationTypes: () =>
    api.get<{ success: boolean; data: ShopVariationType[] }>("/shops/variation-types").then((r) => r.data.data),

  products: (username: string, page: number, sort: ProductSort = "recommended", category?: string | null, search?: string) =>
    api
      .get<Paginated<ShopProduct>>(`/shops/${username}/products`, { params: { page, sort, category: category || undefined, search: search || undefined } })
      .then((r) => r.data),

  collections: (username: string) =>
    api
      .get<{ success: boolean; data: ShopCollection[] }>(`/shops/${username}/collections`)
      .then((r) => r.data.data),

  reviews: (username: string, page: number) =>
    api.get<Paginated<ShopReview>>(`/shops/${username}/reviews`, { params: { page } }).then((r) => r.data),

  createProduct: (payload: NewProduct) => {
    const fd = new FormData();
    fd.append("name", payload.name);
    fd.append("description", payload.description);
    fd.append("category_id", String(payload.category_id));
    if (payload.subcategory_id) fd.append("subcategory_id", String(payload.subcategory_id));
    fd.append("price", String(payload.price));
    if (payload.currency) fd.append("currency", payload.currency);
    if (payload.compare_at_price) fd.append("compare_at_price", String(payload.compare_at_price));
    if (payload.sku) fd.append("sku", payload.sku);
    fd.append("stock", String(payload.stock));
    if (payload.shipping_type) fd.append("shipping_type", payload.shipping_type);
    fd.append("is_digital", payload.is_digital ? "1" : "0");
    fd.append("allow_cod", payload.allow_cod ? "1" : "0");
    fd.append("is_active", payload.is_active ? "1" : "0");
    (payload.variations ?? []).forEach((v, i) => {
      fd.append(`variations[${i}][name]`, v.name);
      v.options.forEach((opt, j) => fd.append(`variations[${i}][options][${j}]`, opt));
    });
    payload.images.forEach((file) =>
      fd.append("images[]", { uri: file.uri, name: file.name, type: file.type } as unknown as Blob),
    );
    return api.post<{ success: boolean; data: ShopProduct }>("/shop/products", fd).then((r) => r.data.data);
  },
};
