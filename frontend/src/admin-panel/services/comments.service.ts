import { api } from "./api";

/**
 * Comment moderation. Backs the Comments page, which was a placeholder with
 * hardcoded dashes until the API behind it (AdminCommentController) was built.
 *
 * Nothing here hard-deletes - `delete` is a soft delete and `restore` is its
 * counterpart, so a mis-click during a dispute is recoverable.
 */

export type CommentQueue = "all" | "reported" | "held" | "spam" | "hidden" | "deleted";

export type CommentAction =
  | "hide" | "unhide" | "spam" | "not_spam" | "approve" | "delete" | "restore";

export type AdminComment = {
  id: number;
  body: string | null;
  gif_url: string | null;
  image_path: string | null;
  video_id: number;
  parent_id: number | null;
  user: { id: number; username: string; name: string | null; avatar: string | null } | null;
  video: { id: number; caption: string | null; thumbnail: string | null } | null;
  likes_count: number;
  dislike_count: number;
  reply_count: number;
  reports_count: number;
  is_hidden: boolean;
  is_spam: boolean;
  held_for_review: boolean;
  is_pinned: boolean;
  is_edited: boolean;
  is_deleted: boolean;
  created_at: string | null;
  deleted_at: string | null;
};

export type CommentStats = {
  total: number;
  hidden: number;
  spam: number;
  held: number;
  reported_open: number;
  deleted_today: number;
};

export type CommentReportRow = {
  id: number;
  reason: string;
  details: string | null;
  status: string;
  reporter: string | null;
  /** Count only - evidence objects live in private storage and need a signed URL. */
  evidence: number;
  created_at: string | null;
};

const BASE = "/admin/comments";

export const commentsService = {
  async list(params: {
    queue?: CommentQueue;
    q?: string;
    video_id?: number;
    user_id?: number;
    sort?: "newest" | "oldest" | "reported" | "liked";
    page?: number;
    per_page?: number;
  }): Promise<{
    items: AdminComment[];
    meta: { current_page: number; last_page: number; per_page: number; total: number };
    stats: CommentStats;
  }> {
    const { data } = await api.get(BASE, { params });
    return data.data;
  },

  async show(id: number): Promise<{ comment: AdminComment; reports: CommentReportRow[] }> {
    const { data } = await api.get(`${BASE}/${id}`);
    return data.data;
  },

  async act(id: number, action: CommentAction, reason?: string): Promise<AdminComment> {
    const { data } = await api.post(`${BASE}/${id}/action`, { action, reason });
    return data.data;
  },

  /** Capped server-side at 200 ids per call. */
  async bulk(ids: number[], action: CommentAction, reason?: string): Promise<{ stats: CommentStats }> {
    const { data } = await api.post(`${BASE}/bulk`, { ids, action, reason });
    return data.data;
  },

  async resolveReport(id: number, status: "resolved" | "dismissed"): Promise<void> {
    await api.post(`${BASE}/reports/${id}/resolve`, { status });
  },
};
