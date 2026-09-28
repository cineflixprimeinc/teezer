import { api } from "./api";

export type CommentReactionType = "love" | "dislike";
export type CommentRank = 1 | 2 | 3 | null;

export interface CommentUser {
  id: number;
  username: string;
  name?: string;
  avatar?: string | null;
  is_verified?: boolean;
}

export interface Comment {
  id: number;
  body: string;
  love_count: number;
  dislike_count: number;
  reply_count: number;
  reaction_score: number;
  is_pinned: boolean;
  pin_order: number | null;
  parent_id: number | null;
  root_id: number | null;   // ID of the top-level comment that owns this thread
  comment_rank: CommentRank;
  current_user_reaction: CommentReactionType | null;
  is_own: boolean;
  is_author: boolean;  // true when commenter is the video owner
  is_edited: boolean;
  edited_at: string | null;
  gif_url?: string | null;
  gif_preview_url?: string | null;
  gif_provider?: string | null;
  gif_provider_id?: string | null;
  /** An uploaded photo attached to the comment - already a full URL, not a storage key. */
  image_url?: string | null;
  /** Present only on a gift comment - the client renders this instead of body/gif_url. */
  gift?: { id: number; name: string; slug: string | null; icon_url: string | null; coins: number } | null;
  user?: CommentUser;
  replies_count?: number;
  created_at: string;
}

export interface CommentListResponse {
  success: boolean;
  data: Comment[];
  visible_comments_count: number;
  video_comments_count?: number;
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    next_page_url: string | null;
  };
}

const REPORT_REASONS = [
  { value: "spam",           label: "Spam" },
  { value: "harassment",     label: "Harassment or bullying" },
  { value: "hate_speech",    label: "Hate speech" },
  { value: "nudity",         label: "Nudity or sexual content" },
  { value: "violence",       label: "Violence or harmful content" },
  { value: "misinformation", label: "False information" },
  { value: "other",          label: "Other" },
] as const;

export { REPORT_REASONS };

export const commentService = {
  list: async (videoId: number, page = 1, perPage = 20): Promise<CommentListResponse> =>
    (await api.get(`/videos/${videoId}/comments`, { params: { page, per_page: perPage } })).data,

  create: async (
    videoId: number,
    payload: {
      body?: string; parent_id?: number;
      gif_url?: string; gif_preview_url?: string; gif_provider?: string; gif_provider_id?: string;
      /** A photo picked from the composer's file input - sent as multipart/form-data. */
      image?: File;
    },
  ): Promise<{ success: boolean; data: Comment; video_comments_count?: number; root_comment_id?: number | null; root_replies_count?: number }> => {
    if (payload.image) {
      // Matches profile.service.ts's uploadAvatar() convention: FormData only
      // when a real file is involved, so the plain text/GIF path (the common
      // case) stays a simple JSON POST like it always was.
      const form = new FormData();
      if (payload.body)      form.append("body", payload.body);
      if (payload.parent_id) form.append("parent_id", String(payload.parent_id));
      form.append("image", payload.image);
      return (await api.post(`/videos/${videoId}/comments`, form)).data;
    }
    return (await api.post(`/videos/${videoId}/comments`, payload)).data;
  },

  replies: async (commentId: number): Promise<{ success: boolean; data: Comment[] }> =>
    (await api.get(`/comments/${commentId}/replies`)).data,

  react: async (commentId: number, reaction_type: CommentReactionType) =>
    (await api.post(`/comments/${commentId}/react`, { reaction_type })).data,

  edit: async (commentId: number, body: string): Promise<{ success: boolean; data: Comment }> =>
    (await api.put(`/comments/${commentId}`, { body })).data,

  delete: async (commentId: number): Promise<{ success: boolean; message?: string; video_comments_count?: number }> =>
    (await api.delete(`/comments/${commentId}`)).data,

  report: async (commentId: number, reason: string, details?: string) =>
    (await api.post(`/comments/${commentId}/report`, { reason, details })).data,

  pin: async (commentId: number) =>
    (await api.post(`/comments/${commentId}/pin`)).data,

  unpin: async (commentId: number) =>
    (await api.post(`/comments/${commentId}/unpin`)).data,

  // Legacy - kept for backward compat with old code paths
  like: async (videoId: number, commentId: number) =>
    (await api.post(`/videos/${videoId}/comments/${commentId}/like`)).data,
  unlike: async (videoId: number, commentId: number) =>
    (await api.delete(`/videos/${videoId}/comments/${commentId}/like`)).data,
};
