import { api } from "./api";
import type { Paginated, ApiResponse } from "@/types/api";
import type { ReelsooVideo } from "@/types/video";

export type SharePlatform = "whatsapp" | "instagram" | "telegram" | "twitter" | "facebook" | "copy_link" | "native" | "other";
export type ReportReason  = "spam" | "nudity" | "hate" | "misinformation" | "violence" | "copyright" | "harassment" | "other";

export const videoService = {
  async feed(opts: { page?: number; perPage?: number; excludeIds?: number[] } = {}) {
    const params: Record<string, string | number | number[]> = {
      page:     opts.page ?? 1,
      per_page: opts.perPage ?? 15,
    };
    if (opts.excludeIds?.length) {
      params["exclude_ids[]"] = opts.excludeIds;
    }
    const { data } = await api.get<Paginated<ReelsooVideo>>("/videos/feed", { params });
    return data;
  },

  /** Recommendation-engine powered For You feed (GET /api/feed/for-you) */
  async forYouFeed(opts: { page?: number; perPage?: number; excludeIds?: number[] } = {}) {
    const params: Record<string, string | number | number[]> = {
      page:     opts.page ?? 1,
      per_page: opts.perPage ?? 15,
    };
    if (opts.excludeIds?.length) {
      params["exclude_ids[]"] = opts.excludeIds;
    }
    const { data } = await api.get<Paginated<ReelsooVideo>>("/feed/for-you", { params });
    return data;
  },
  async getById(id: number) {
    const { data } = await api.get<ApiResponse<ReelsooVideo>>(`/videos/${id}`);
    return data.data;
  },
  async trending(page = 1) {
    const { data } = await api.get<Paginated<ReelsooVideo>>("/explore/trending", { params: { page } });
    return data;
  },
  async following(page = 1) {
    const { data } = await api.get<Paginated<ReelsooVideo>>("/videos/following", { params: { page } });
    return data;
  },
  async like(id: number) {
    const { data } = await api.post<{ success: boolean; liked: boolean; likes_count: number }>(`/videos/${id}/like`);
    return data;
  },
  async unlike(id: number) {
    const { data } = await api.delete<{ success: boolean; liked: boolean; likes_count: number }>(`/videos/${id}/like`);
    return data;
  },
  /** Single idempotent toggle - preferred over separate like/unlike. */
  async toggleLike(id: number) {
    const { data } = await api.post<{ success: boolean; liked: boolean; likes_count: number }>(`/videos/${id}/toggle-like`);
    return data;
  },
  async save(id: number) {
    const { data } = await api.post<{ success: boolean; saved: boolean; saves_count: number }>(`/videos/${id}/save`);
    return data;
  },
  async unsave(id: number) {
    const { data } = await api.delete<{ success: boolean; saved: boolean; saves_count: number }>(`/videos/${id}/save`);
    return data;
  },
  /** Single idempotent toggle - preferred over separate save/unsave. */
  async toggleSave(id: number) {
    const { data } = await api.post<{ success: boolean; saved: boolean; saves_count: number }>(`/videos/${id}/toggle-save`);
    return data;
  },
  async share(id: number, platform: SharePlatform) {
    const { data } = await api.post<{ success: boolean; shares_count: number }>(`/videos/${id}/share`, { platform });
    return data;
  },
  /** Record a view - fire after 2 s or 30 % completion, whichever comes first. */
  async recordView(id: number, payload: { watchDuration: number; source?: string }) {
    await api.post(`/videos/${id}/view`, {
      watch_duration: payload.watchDuration,
      ...(payload.source ? { source: payload.source } : {}),
    }).catch(() => {});
  },
  async report(id: number, payload: { reason: ReportReason; description?: string }) {
    const { data } = await api.post<{ success: boolean; message?: string }>(`/videos/${id}/report`, payload);
    return data;
  },
  async notInterested(id: number) {
    const { data } = await api.post<{ success: boolean; message?: string }>(`/videos/${id}/not-interested`);
    return data;
  },
  async upload(formData: FormData) {
    const { data } = await api.post<ApiResponse<ReelsooVideo>>("/videos", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },
  async pin(id: number) {
    const { data } = await api.post<{ success: boolean; message?: string }>(`/videos/${id}/pin`);
    return data;
  },
  async unpin(id: number) {
    const { data } = await api.post<{ success: boolean; message?: string }>(`/videos/${id}/unpin`);
    return data;
  },
  async deleteVideo(id: number) {
    const { data } = await api.delete<{ success: boolean; message?: string }>(`/videos/${id}`);
    return data;
  },
  async updatePrivacy(id: number, payload: { visibility?: string; allow_comments?: boolean; allow_duet?: boolean; allow_stitch?: boolean }) {
    const { data } = await api.patch<ApiResponse<ReelsooVideo>>(`/videos/${id}/privacy`, payload);
    return data;
  },
};
