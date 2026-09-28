import { api } from "./client";
import type { FeedComment } from "./video.api";

/* ── The creator's comment inbox - GET /studio/comments.
   Shapes mirror server StudioCommentResource. `status` is derived server-side,
   not stored: spam › held › replied › unread › needs_reply, in that order. ── */
export type CommentInboxStatus = "unread" | "needs_reply" | "replied" | "held" | "spam";
export type CommentFilter = "all" | CommentInboxStatus;
export type CommentSort = "top" | "newest" | "oldest" | "most_liked" | "most_replied";

export type StudioComment = {
  id: number;
  body: string | null;
  status: CommentInboxStatus;
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
  gif_url: string | null;
  gif_preview_url: string | null;
  /** The creator's own reaction, so a card's heart renders its real state. */
  current_user_reaction: "love" | "dislike" | null;
  created_at: string;
  user?: {
    id: number;
    username: string;
    name: string | null;
    avatar: string | null;
    is_verified: boolean;
    followers_count: number;
    joined_at: string | null;
  };
  video?: {
    id: number;
    title: string;
    thumbnail_url: string | null;
    media_type: "video" | "image" | "image_carousel";
    status: string;
  };
};

export type CommentPage = {
  data: StudioComment[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
  };
};

/** The six counters behind the filter chips, plus the 7-day volume trend. */
export type CommentInboxStats = {
  all: number;
  unread: number;
  needs_reply: number;
  replied: number;
  held: number;
  spam: number;
  trend_7d: number;
  /** Mean hours to the creator's first reply, last 30 days. Null when nothing
   *  has been answered in that window. */
  avg_response_hours: number | null;
};

/**
 * One post in the Comments page's video list - GET /studio/comments/contents.
 *
 * The counts are aggregated over the same rows the inbox lists (top-level
 * comments on live content), so a card agrees with the thread it opens.
 * `comments_count` is the post's own total including replies and is what the
 * website's content filter reads; `inbox_count` is what this page shows.
 */
export type CommentContent = {
  id: number;
  title: string;
  comments_count: number;
  thumbnail_url: string | null;
  views_count: number;
  created_at: string | null;
  status: string | null;
  inbox_count: number;
  unreplied_count: number;
  flagged_count: number;
  last_comment_at: string | null;
  latest_comment: {
    id: number;
    body: string | null;
    name: string;
    avatar: string | null;
  } | null;
};

export type BulkAction = "read" | "spam" | "hide" | "unhide" | "hold" | "delete";

export type CommentQuery = {
  status?: CommentFilter;
  sort?: CommentSort;
  search?: string;
  /** Scope to one post - what the video-grouped page opens a thread with. */
  content_id?: number;
  page?: number;
  per_page?: number;
};

export const studioCommentsApi = {
  list: (params: CommentQuery = {}) =>
    api.get<CommentPage>("/studio/comments", { params }).then((r) => r.data),

  /** Pass `contentId` for the counters of a single post. */
  stats: (contentId?: number) =>
    api
      .get<{ success: boolean; data: CommentInboxStats }>("/studio/comments/stats", {
        params: contentId ? { content_id: contentId } : undefined,
      })
      .then((r) => r.data.data),

  /** The creator's posts that have comments, newest comment first. */
  contents: () =>
    api
      .get<{ success: boolean; data: CommentContent[] }>("/studio/comments/contents")
      .then((r) => r.data.data),

  /** Every reply under the comment's root, oldest first. Also marks it seen. */
  thread: (id: number) =>
    api
      .get<{ success: boolean; data: FeedComment[] }>(`/studio/comments/${id}/thread`)
      .then((r) => r.data.data),

  reply: (id: number, body: string) =>
    api
      .post<{ success: boolean; data: FeedComment }>(`/studio/comments/${id}/reply`, { body })
      .then((r) => r.data.data),

  markAllSeen: () =>
    api.post<{ success: boolean; message?: string }>("/studio/comments/read-all").then((r) => r.data),

  /** Every single-comment moderation action is POST /{id}/{verb} with no body,
   *  so they collapse into one call rather than a dozen near-identical thunks. */
  act: (
    id: number,
    verb:
      | "seen" | "pin" | "unpin" | "hide" | "unhide"
      | "spam" | "unspam" | "hold" | "unhold" | "restrict" | "unrestrict",
  ) => api.post<{ success: boolean; message?: string }>(`/studio/comments/${id}/${verb}`).then((r) => r.data),

  note: (id: number, note: string | null) =>
    api.post<{ success: boolean; message?: string }>(`/studio/comments/${id}/note`, { note }).then((r) => r.data),

  remove: (id: number) =>
    api.delete<{ success: boolean; message?: string }>(`/studio/comments/${id}`).then((r) => r.data),

  bulk: (action: BulkAction, ids: number[]) =>
    api.post<{ success: boolean; message?: string }>("/studio/comments/bulk", { action, ids }).then((r) => r.data),
};
