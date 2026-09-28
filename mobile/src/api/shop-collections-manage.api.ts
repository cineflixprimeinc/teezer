import { api } from "./client";
import type { ShopCollection } from "./shop.api";

/**
 * Shop Settings > Products > Collections - real create/edit/delete. Reads
 * the same shape shopApi.collections() already returns (public), just
 * seller-scoped and mutable - before this, the ONLY thing that ever wrote a
 * ProductCollection row was a demo seeder.
 */

export const shopCollectionsManageApi = {
  list: () =>
    api.get<{ success: boolean; data: ShopCollection[] }>("/shop/collections").then((r) => r.data.data),

  create: (payload: { name: string; sort_order?: number; cover?: { uri: string; name: string; type: string } }) => {
    const fd = new FormData();
    fd.append("name", payload.name);
    if (payload.sort_order != null) fd.append("sort_order", String(payload.sort_order));
    if (payload.cover) fd.append("cover", payload.cover as unknown as Blob);
    return api.post<{ success: boolean; data: ShopCollection }>("/shop/collections", fd).then((r) => r.data.data);
  },

  /** Name/sort_order only - no cover-image replacement here, see the backend's own comment on why a PUT can't safely carry a file. */
  update: (id: number, payload: { name?: string; sort_order?: number }) =>
    api.put<{ success: boolean; data: ShopCollection }>(`/shop/collections/${id}`, payload).then((r) => r.data.data),

  remove: (id: number) => api.delete<{ success: boolean }>(`/shop/collections/${id}`).then((r) => r.data.success),
};
