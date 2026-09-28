import { api } from "./api";
import type { Comment } from "./comment.service";

/* ── Types ──────────────────────────────────────────────────────────────── */
export type StudioCommentStatus = "unread" | "needs_reply" | "replied" | "held" | "spam";
export type StudioSortOption    = "top" | "newest" | "oldest" | "most_liked" | "most_replied";
export type StudioStatusFilter  = "all" | StudioCommentStatus;

export interface StudioCommentUser {
  id: number;
  username: string;
  name?: string | null;
  avatar?: string | null;
  is_verified?: boolean;
  followers_count?: number;
  joined_at?: string | null;
}

export interface StudioCommentVideo {
  id: number;
  title: string;
  thumbnail_url: string | null;
  media_type: "video" | "image" | "image_carousel";
  status: string;
}

export interface StudioComment {
  id: number;
  body: string;
  status: StudioCommentStatus;
  love_count: number;
  dislike_count: number;
  reply_count: number;
  is_pinned: boolean;
  is_hidden: boolean;
  is_spam: boolean;
  held_for_review: boolean;
  is_own: boolean;
  is_edited: boolean;
  creator_replied: boolean;
  seen: boolean;
  pending_reports: number;
  note: string | null;
  gif_url?: string | null;
  gif_preview_url?: string | null;
  created_at: string;
  user?: StudioCommentUser;
  video?: StudioCommentVideo;
}

export interface StudioCommentMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
}

export interface StudioCommentListResponse {
  success: boolean;
  data: StudioComment[];
  meta: StudioCommentMeta;
}

export interface StudioCommentStats {
  all: number;
  unread: number;
  needs_reply: number;
  replied: number;
  held: number;
  spam: number;
  trend_7d: number;
}

export interface StudioContentOption {
  id: number;
  title: string;
  comments_count: number;
}

export interface StudioCommentListParams {
  status?: StudioStatusFilter;
  sort?: StudioSortOption;
  content_id?: number;
  search?: string;
  page?: number;
  per_page?: number;
  start_date?: string;
  end_date?: string;
}

export type StudioBulkAction = "read" | "spam" | "hide" | "unhide" | "hold" | "delete";

/* ── Service ────────────────────────────────────────────────────────────── */
export const studioCommentService = {
  list: async (params: StudioCommentListParams): Promise<StudioCommentListResponse> =>
    (await api.get("/studio/comments", { params })).data,

  stats: async (params: Pick<StudioCommentListParams, "content_id" | "start_date" | "end_date">): Promise<{ success: boolean; data: StudioCommentStats }> =>
    (await api.get("/studio/comments/stats", { params })).data,

  contents: async (): Promise<{ success: boolean; data: StudioContentOption[] }> =>
    (await api.get("/studio/comments/contents")).data,

  thread: async (commentId: number): Promise<{ success: boolean; data: Comment[]; total: number }> =>
    (await api.get(`/studio/comments/${commentId}/thread`)).data,

  reply: async (commentId: number, body: string): Promise<{ success: boolean; data: Comment }> =>
    (await api.post(`/studio/comments/${commentId}/reply`, { body })).data,

  markSeen: async (commentId: number) =>
    (await api.post(`/studio/comments/${commentId}/seen`)).data,

  markAllSeen: async (params: Pick<StudioCommentListParams, "content_id" | "start_date" | "end_date">) =>
    (await api.post("/studio/comments/read-all", params)).data,

  pin:        async (id: number) => (await api.post(`/studio/comments/${id}/pin`)).data,
  unpin:      async (id: number) => (await api.post(`/studio/comments/${id}/unpin`)).data,
  hide:       async (id: number) => (await api.post(`/studio/comments/${id}/hide`)).data,
  unhide:     async (id: number) => (await api.post(`/studio/comments/${id}/unhide`)).data,
  spam:       async (id: number) => (await api.post(`/studio/comments/${id}/spam`)).data,
  unspam:     async (id: number) => (await api.post(`/studio/comments/${id}/unspam`)).data,
  hold:       async (id: number) => (await api.post(`/studio/comments/${id}/hold`)).data,
  unhold:     async (id: number) => (await api.post(`/studio/comments/${id}/unhold`)).data,
  restrict:   async (id: number) => (await api.post(`/studio/comments/${id}/restrict`)).data,
  unrestrict: async (id: number) => (await api.post(`/studio/comments/${id}/unrestrict`)).data,

  note: async (id: number, note: string): Promise<{ success: boolean; note: string | null }> =>
    (await api.post(`/studio/comments/${id}/note`, { note })).data,

  remove: async (id: number) => (await api.delete(`/studio/comments/${id}`)).data,

  bulk: async (action: StudioBulkAction, ids: number[]) =>
    (await api.post("/studio/comments/bulk", { action, ids })).data,
};
