import { api } from "./api";

/* ── ONE catalog of 200 gifts.
   The data lives in two tables for historical reasons - coin_packages holds the
   gift's DOLLAR price (buy it) and gifts holds the same gift's COIN value (send
   it), joined on coin_packages.icon == gifts.slug. The API stitches them back
   together, so one row here is one gift and one save moves both. ── */
export type GiftRow = {
  id: number;
  plan_name: string;
  coins: number;
  /** Real money: what a user is charged to buy this gift. */
  price_usd: number;
  badge: string | null;
  bonus_coins?: number;
  bonus_percent?: number;
  bonus_label?: string | null;
  bonus_ends_at?: string | null;
  /**
   * Store product ids. Coins are digital content, so StoreKit and Play Billing
   * are the only permitted checkout in the apps - a pack without an id for a
   * platform cannot be sold there at all. `sellable_*` is derived server-side
   * so it cannot disagree with the ids.
   */
  ios_product_id?: string | null;
  android_product_id?: string | null;
  sellable_ios?: boolean;
  sellable_android?: boolean;
  bonus_enabled?: boolean;
  /** Derived server-side - the one shape every surface renders from. */
  bonus?: {
    has_bonus: boolean;
    base_coins: number;
    bonus_coins: number;
    total_coins: number;
    bonus_label: string | null;
    bonus_text: string | null;
    bonus_ends_at: string | null;
  };
  /** Slug naming the static SVG shipped with the web app. */
  icon: string | null;
  /** Uploaded artwork. Overrides `icon` everywhere when set. */
  icon_url: string | null;
  is_active: boolean;
  is_front_visible: boolean;
  sort_order: number;
  coins_per_usd: number;

  /** The coin half of the same gift - null if it has no `gifts` row. */
  gift_id: number | null;
  /** What it costs a user, in coins, to SEND this gift. */
  coin_value: number | null;
  gift_active: boolean | null;
};

export type Paged<T> = {
  data: T[];
  meta: { current_page: number; last_page: number; per_page: number; total: number };
};

export type GiftCoinStats = {
  /** The live catalog - what a user can actually buy. Matches the storefront. */
  packages_active: number;
  /** Retired packs from the old pricing model. Invisible to users. */
  packages_retired: number;
  packages: number;
  gifts_active: number;
  gifts: number;
  gifts_sent: number;
  coins_spent: number;
};

export type ListQuery = {
  search?: string;
  /** Defaults to "active" server-side: the 200 live gifts. */
  status?: "active" | "retired" | "all";
  page?: number;
  per_page?: number;
};

/** The web app serves the seeded artwork statically; there is no DB row for it. */
const WEB_ORIGIN = process.env.NEXT_PUBLIC_WEB_URL || "https://teezer.live";

/** What to render: the upload wins, else the slug artwork shipped with the app. */
export function giftIcon(g: GiftRow): string | null {
  if (g.icon_url) return g.icon_url;
  if (!g.icon) return null;
  return `${WEB_ORIGIN}/gifts/${String(g.sort_order).padStart(3, "0")}-${g.icon}.svg`;
}

export const giftCoinService = {
  stats: () =>
    api.get<{ success: boolean; data: GiftCoinStats }>("/admin/gift-coins/stats").then((r) => r.data.data),

  list: (params: ListQuery = {}) =>
    api.get<Paged<GiftRow>>("/admin/coin-packages", { params }).then((r) => r.data),

  create: (body: FormData) =>
    api.post("/admin/coin-packages", body).then((r) => r.data),

  update: (id: number, body: Partial<GiftRow>) =>
    api.put(`/admin/coin-packages/${id}`, body).then((r) => r.data),

  uploadIcon: (id: number, file: File) => {
    const fd = new FormData();
    fd.append("icon_file", file);
    return api.post(`/admin/coin-packages/${id}/icon`, fd).then((r) => r.data);
  },

  resetIcon: (id: number) =>
    api.delete(`/admin/coin-packages/${id}/icon`).then((r) => r.data),

  remove: (id: number) =>
    api.delete(`/admin/coin-packages/${id}`).then((r) => r.data),
};
