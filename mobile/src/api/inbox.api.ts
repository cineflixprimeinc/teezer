import { api } from "./client";
import { config } from "@/constants/config";

/* ── Direct-message conversations (GET /messages/conversations) ── */
export interface Conversation {
  /** My own view of this thread - see updateConversationSettings. `muted` is
   *  already resolved against the clock, so an expired mute reads as false. */
  pinned?: boolean;
  archived?: boolean;
  muted?: boolean;
  user_id: number;
  username: string;
  name: string | null;
  avatar: string | null;
  is_verified: boolean | number;
  last_message: string | null;
  /** Type of the most recent message - drives the conversation list's preview
   *  text (e.g. "🎬 Sent a video" instead of the raw, often-empty body). */
  last_message_type?: string | null;
  last_ts: string | null;
  last_sender_id: number | null;
  last_read_at: string | null;
  last_delivered_at?: string | null;
  unread_count: number;
  /** True when the other user was active in the last few minutes. */
  is_online?: boolean;
  /** True when this person currently has a live (published, unexpired)
   *  story - drives the same gradient ring the Inbox story rail/profile
   *  screen already draw for the identical fact, now on this row's avatar. */
  has_story?: boolean | number;
  /** Only meaningful when has_story is true - true when at least one of
   *  their active stories has no story_views row for me yet. Same
   *  unseen/seen distinction the Inbox story rail already draws (gradient
   *  vs. flat ring), now on this row's avatar too. */
  has_unseen?: boolean | number;
}

/* ── In-app notifications (GET /notifications) ── */
export interface InboxNotification {
  id: number;
  type: string; // like | comment | follow | follow_request | mention | story_mention | gift | system | ...
  message: string;
  message_preview?: string | null;
  entity_type: string | null;
  entity_id: number | null;
  /** Set when the notification is about a reel/video - used to open it + show its thumbnail. */
  target_reel_id?: number | null;
  /** Set only for comment/mention notifications - the exact comment (root or
   *  reply) to scroll to and highlight inside that video's comments sheet. */
  comment_id?: number | null;
  /** Real reel thumbnail URL (resolved server-side), null when not reel-related. */
  thumbnail?: string | null;
  /** Stable key for bundling similar notifications (e.g. all likes on one reel). */
  group_key?: string | null;
  is_read: boolean;
  action_status: string | null;
  /** Canonical destination, decided server-side (App\Services\DeepLinkService).
   *  Clients route from this instead of re-deriving one from type/entity_type. */
  deep_link?: string | null;
  actor: { id: number; username: string; name: string | null; avatar: string | null; is_verified?: boolean } | null;
  /** # of unique users bundled into this aggregated notification (server-side). */
  actor_count?: number;
  /** True when actor_count > 1 (e.g. "Rahul and 17 others liked your video"). */
  is_aggregated?: boolean;
  /** Latest few actors (newest first) for the avatar stack - no N+1. */
  actors?: NotificationActorItem[];
  created_at: string;
  updated_at?: string;
}

/** One user in an aggregated notification's actor list. */
export interface NotificationActorItem {
  id: number;
  username: string;
  name: string | null;
  avatar: string | null;
  is_verified?: boolean;
}

/** One page of notifications + whether more pages exist (infinite scroll). */
export interface NotificationPage {
  items: InboxNotification[];
  hasMore: boolean;
  page: number;
}

/** One page of conversations + whether more pages exist (infinite scroll). */
export interface ConversationPage {
  items: Conversation[];
  hasMore: boolean;
  page: number;
}

/* ── A single direct message (GET/POST /messages/conversations/{userId}) ── */
export interface DirectMessage {
  id: number;
  conversation_id: number | null;
  sender_id: number;
  receiver_id: number;
  body: string | null;
  message_type: string; // text | image | video | voice | audio | document | story_reply | story_reaction | shared_video | shared_story
  r2_url: string | null;
  thumbnail_url: string | null;
  /** Set on `story_reply`/`story_reaction` messages - the story that was
   *  replied/reacted to + its poster thumbnail, so the bubble can show the
   *  Instagram-style story preview (StoryContextPreview). */
  story_id?: number | null;
  story_thumbnail_url?: string | null;
  /** Set on `shared_video` messages - the Reelsoo video that was shared from the
   *  feed's Share sheet. `thumbnail_url`/`duration`/`body` above double as this
   *  video's thumbnail/length/caption (reused, not duplicated). */
  video_id?: number | null;
  /** Set on `shared_profile` messages. Read live server-side (never copied),
   *  so this rides along fully populated from both send() and history(). */
  shared_user_id?: number | null;
  shared_user?: { id: number; username: string; name: string | null; avatar: string | null; is_verified?: boolean } | null;
  /** Set on `shared_product` messages - same "live, not copied" reasoning. */
  product_id?: number | null;
  product?: {
    id: number; name: string; price: number; currency: string; image_url: string | null;
    shop_id: number; shop?: { id: number; shop_name: string } | null;
  } | null;
  /** Playback length in seconds - set for video/voice/audio messages. */
  duration?: number | null;
  read_at: string | null;
  /** Set when the message reached the recipient's device (✓ delivered). */
  delivered_at?: string | null;
  created_at: string;
  edited_at?: string | null;
  /** Both are kept in step server-side; pinned_at is the one worth ordering by. */
  is_pinned?: boolean;
  pinned_at?: string | null;
  /** Grouped by emoji, with `mine` resolved server-side so a chip knows whether
   *  to read as selected without diffing user lists. */
  reactions?: { emoji: string; count: number; mine: boolean }[];
  /** Only on a `location` message. Numbers - the model casts the decimals. */
  latitude?: number | null;
  longitude?: number | null;
  location_name?: string | null;
  reply_to_message_id?: number | null;
  /** The quoted original, for rendering the reply preview inside the bubble
   *  itself (composer's own "Replying to..." banner is separate - this is
   *  what a message that WAS a reply shows once delivered). Null once the
   *  original was deleted-for-everyone, same as the composer's own check. */
  reply_to_message?: {
    id: number; sender_id: number; body: string | null; message_type: string;
    thumbnail_url: string | null; location_name?: string | null; deleted_for_everyone_at?: string | null;
  } | null;
  deleted_for_everyone_at?: string | null;
  /** Client-only optimistic flags (not from the server). */
  _pending?: boolean;
  _failed?: boolean;
}

/** Conversation status - mirrors the website's messaging rules. */
export type ConversationStatus = "approved" | "pending_request" | "rejected" | "blocked";

/** A pending message request (GET /messages/requests → incoming | sent). */
export interface MessageRequest {
  user_id: number;
  username: string;
  name: string | null;
  avatar: string | null;
  is_verified: boolean | number;
  conversation_id: number;
  status: ConversationStatus;
  direction: "incoming" | "sent";
  last_message: string | null;
  last_message_type: string | null;
  last_ts: string | null;
}

/* ── Stories feed (GET /stories/feed) - grouped per author ── */
export interface StoryFeedItem {
  user: { id: number; username: string; display_name: string | null; avatar: string | null; is_verified: boolean };
  stories: unknown[];
  has_unseen: boolean;
  is_own: boolean;
}

/** One suggested share-to recipient (GET /messages/share-suggestions). */
export interface ShareSuggestion {
  id: number;
  username: string;
  name: string | null;
  avatar: string | null;
  is_verified: boolean | number;
  /** Total messages exchanged (either direction) - the ranking signal. */
  chat_count: number;
}

export const inboxApi = {
  conversations: () =>
    api.get<{ success: boolean; data: Conversation[] }>("/messages/conversations").then((r) => r.data.data ?? []),

  // Followed accounts ranked by chat frequency, for the Share sheet's "Send to
  // friends" carousel - a much wider, ranked pool than just existing DM threads.
  shareSuggestions: (limit = 30) =>
    api.get<{ success: boolean; data: ShareSuggestion[] }>("/messages/share-suggestions", { params: { limit } })
      .then((r) => r.data.data ?? []),

  // Paginated conversations for the "See all" messages list (infinite scroll).
  conversationsPage: (page = 1, perPage = 10): Promise<ConversationPage> =>
    api.get<{ success: boolean; data: Conversation[]; meta?: { current_page: number; has_more: boolean } }>(
      "/messages/conversations", { params: { page, per_page: perPage } },
    ).then((r) => ({ items: r.data.data ?? [], hasMore: r.data.meta?.has_more ?? false, page })),

  // Unread badge + pending message-request count (same shape the website uses).
  messagesUnread: () =>
    api.get<{ success: boolean; data: { count: number; request_count: number } }>("/messages/unread-count")
      .then((r) => ({ count: r.data.data?.count ?? 0, requestCount: r.data.data?.request_count ?? 0 })),

  // Thread with one user - returns the latest messages oldest→newest.
  history: (userId: number, before?: number) =>
    api.get<{ success: boolean; data: DirectMessage[] }>(`/messages/conversations/${userId}`, { params: before ? { before } : undefined })
      .then((r) => r.data.data ?? []),

  // Send enforces the receiver's message-privacy rules server-side; the returned
  // conversation_status tells us whether it landed in the inbox or as a request.
  sendMessage: (userId: number, body: string, replyToMessageId?: number) =>
    api.post<{ success: boolean; data: DirectMessage; conversation_status?: ConversationStatus }>(`/messages/conversations/${userId}`, {
      body, message_type: "text", ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
    }).then((r) => ({ message: r.data.data, status: r.data.conversation_status ?? "approved" })),

  // Edit own text message; delete for me (hide) or for everyone (sender only).
  editMessage: (id: number, body: string) =>
    api.patch<{ success: boolean; data: DirectMessage }>(`/messages/${id}`, { body }).then((r) => r.data.data),
  deleteMessage: (id: number, scope: "me" | "everyone") =>
    api.delete(`/messages/${id}`, { data: { scope } }).then(() => {}),

  /** Share a place. No upload behind it, so unlike every other non-text type
   *  this carries no r2_key - the server exempts `location` from that rule. */
  sendLocation: (
    userId: number,
    place: { latitude: number; longitude: number; location_name?: string | null },
  ) =>
    api
      .post<{ success: boolean; data: DirectMessage; conversation_status?: ConversationStatus }>(
        `/messages/conversations/${userId}`,
        { message_type: "location", ...place },
      )
      .then((r) => ({ message: r.data.data, status: r.data.conversation_status ?? "approved" })),

  /**
   * Pin / archive / mute a conversation - MY view of it, never the other
   * person's. Only the keys passed are changed, so one toggle cannot clobber
   * another that was set a moment earlier.
   */
  updateConversationSettings: (
    userId: number,
    patch: { pinned?: boolean; archived?: boolean; mute?: "off" | "8h" | "1w" | "always" },
  ) =>
    api
      .put<{ success: boolean; data: { pinned: boolean; archived: boolean; muted: boolean } }>(
        `/messages/conversations/${userId}/settings`,
        patch,
      )
      .then((r) => r.data.data),

  /** Pin / unpin a message. Either participant may - a pin marks the thread, it
   *  is not an authoring right the way editing is. */
  /** Toggle: the server removes the reaction when it is the one you already
   *  have, so the client never has to decide between add and remove. */
  reactMessage: (id: number, emoji: string) =>
    api.post(`/messages/${id}/react`, { emoji }).then(() => {}),

  pinMessage: (id: number, duration: "24h" | "7d" | "30d" | "forever" = "forever") =>
    api.post(`/messages/${id}/pin`, { duration }).then(() => {}),
  unpinMessage: (id: number) => api.post(`/messages/${id}/unpin`).then(() => {}),

  markConversationRead: (userId: number) =>
    api.post(`/messages/conversations/${userId}/read`).then(() => {}).catch(() => {}),

  /* ── Media messages (presign → PUT to R2 → send) - same flow as the website ── */
  getUploadUrl: (params: { file_name: string; file_type: string; file_size: number; media_type: "image" | "video" | "voice" | "audio" | "document" | "thumbnail" }) =>
    api.post<{ success: boolean; data: { upload_url: string; object_key: string; expires_in: number; content_type: string } }>("/messages/upload-url", params)
      .then((r) => r.data.data),

  // PUT the picked file straight to the presigned R2 URL.
  uploadToR2: async (uploadUrl: string, uri: string, contentType: string) => {
    const blob = await (await fetch(uri)).blob();
    const res = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: blob });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  },

  sendMedia: (userId: number, payload: { message_type: string; body?: string; r2_key: string; r2_url: string; thumbnail_url?: string; file_size?: number; file_name?: string; mime_type?: string; duration?: number }) =>
    api.post<{ success: boolean; data: DirectMessage; conversation_status?: ConversationStatus }>(`/messages/conversations/${userId}`, payload)
      .then((r) => ({ message: r.data.data, status: r.data.conversation_status ?? "approved" })),

  // Share sheet "Send to friends" - references an EXISTING Reelsoo video (no
  // upload/r2_key involved). thumbnail_url/duration/caption ride along so the
  // recipient's bubble renders instantly, without a round trip.
  shareVideo: (userId: number, video: { id: number; caption?: string | null; thumbnail_url?: string | null; duration?: number | null }) =>
    api.post<{ success: boolean; data: DirectMessage; conversation_status?: ConversationStatus }>(`/messages/conversations/${userId}`, {
      message_type: "shared_video",
      video_id: video.id,
      body: video.caption ?? "",
      thumbnail_url: video.thumbnail_url ?? undefined,
      duration: video.duration ?? undefined,
    }).then((r) => ({ message: r.data.data, status: r.data.conversation_status ?? "approved" })),

  // Story viewer's "Share to..." row - same "no upload, references an
  // existing row by id" shape as shareVideo. thumbnail_url rides along so
  // the recipient's bubble renders instantly, without a round trip back to
  // the (possibly by-then-expired) story.
  shareStory: (userId: number, story: { id: number; thumbnail_url?: string | null }) =>
    api.post<{ success: boolean; data: DirectMessage; conversation_status?: ConversationStatus }>(`/messages/conversations/${userId}`, {
      message_type: "shared_story",
      story_id: story.id,
      thumbnail_url: story.thumbnail_url ?? undefined,
    }).then((r) => ({ message: r.data.data, status: r.data.conversation_status ?? "approved" })),

  // Share sheet "Send to friends" for a Reelsoo profile - references an
  // EXISTING user by id, same "no upload, no r2_key" shape as shareVideo.
  shareProfile: (conversationUserId: number, sharedUserId: number) =>
    api.post<{ success: boolean; data: DirectMessage; conversation_status?: ConversationStatus }>(`/messages/conversations/${conversationUserId}`, {
      message_type: "shared_profile",
      shared_user_id: sharedUserId,
    }).then((r) => ({ message: r.data.data, status: r.data.conversation_status ?? "approved" })),

  // Share sheet "Send to friends" for a Shop product - references an
  // EXISTING product by id.
  shareProduct: (conversationUserId: number, productId: number) =>
    api.post<{ success: boolean; data: DirectMessage; conversation_status?: ConversationStatus }>(`/messages/conversations/${conversationUserId}`, {
      message_type: "shared_product",
      product_id: productId,
    }).then((r) => ({ message: r.data.data, status: r.data.conversation_status ?? "approved" })),

  // Forward an existing message to another conversation. The backend takes
  // an array (up to 10) in one call; SendToSheet calls onSend once per
  // picked friend, so this wraps that as a single-recipient array - N
  // requests for N recipients rather than one bulk request, same tradeoff
  // shareVideo/shareProfile/shareProduct already make.
  forwardMessage: (messageId: number, conversationUserId: number) =>
    api.post<{ success: boolean; data: DirectMessage[] }>(`/messages/${messageId}/forward`, {
      conversation_ids: [conversationUserId],
    }).then((r) => r.data.data),

  // Public URL for an uploaded object (R2 public base + key).
  mediaUrl: (objectKey: string) => `${config.mediaBaseUrl}/${objectKey}`,

  /* ── Message requests (the pending-request inbox + actions) ── */
  messageRequests: () =>
    api.get<{ success: boolean; data: { incoming: MessageRequest[]; sent: MessageRequest[] } }>("/messages/requests")
      .then((r) => ({ incoming: r.data.data?.incoming ?? [], sent: r.data.data?.sent ?? [] })),
  acceptRequest: (conversationId: number) => api.post(`/messages/requests/${conversationId}/accept`).then(() => {}),
  declineRequest: (conversationId: number) => api.post(`/messages/requests/${conversationId}/delete`).then(() => {}),
  cancelRequest: (conversationId: number) => api.post(`/messages/requests/${conversationId}/cancel`).then(() => {}),
  blockRequest: (conversationId: number) => api.post(`/messages/requests/${conversationId}/block`).then(() => {}),
  reportRequest: (conversationId: number, reason?: string) => api.post(`/messages/requests/${conversationId}/report`, { reason }).then(() => {}),

  // The endpoint nests a paginated resource collection under `data`, so the rows
  // live at data.data - fall back gracefully if the shape ever flattens.
  notifications: (perPage = 50) =>
    api.get<{ success: boolean; data: { data?: InboxNotification[] } | InboxNotification[] }>("/notifications", { params: { per_page: perPage } })
      .then((r) => {
        const d = r.data.data as { data?: InboxNotification[] } | InboxNotification[];
        return Array.isArray(d) ? d : d?.data ?? [];
      }),

  // Paginated notifications for infinite scroll. Uses the API's `meta` for hasMore.
  notificationsPage: (page = 1, perPage = 20): Promise<NotificationPage> =>
    api.get<{ success: boolean; data: { data?: InboxNotification[] } | InboxNotification[]; meta?: { current_page: number; last_page: number } }>(
      "/notifications", { params: { page, per_page: perPage } },
    ).then((r) => {
      const raw = r.data.data as { data?: InboxNotification[] } | InboxNotification[];
      const items = Array.isArray(raw) ? raw : raw?.data ?? [];
      const meta = r.data.meta;
      const hasMore = meta ? meta.current_page < meta.last_page : items.length >= perPage;
      return { items, hasMore, page };
    }),

  // Unread notification count (drives the bottom Inbox tab badge alongside DMs).
  //
  // `exclude` lists types this surface never renders as unread rows - profile
  // views are hidden on every inbox surface, so counting them server-side made
  // the badge carry a number the user could see no way to clear.
  notificationsUnread: (exclude?: string[]) =>
    api
      .get<{ success: boolean; data: { count: number } }>("/notifications/unread-count", {
        params: exclude?.length ? { exclude: exclude.join(",") } : undefined,
      })
      .then((r) => r.data.data?.count ?? 0)
      .catch(() => 0),

  // Full paginated list of everyone who triggered an aggregated notification
  // ("everyone who liked your video"), newest actor first.
  notificationActors: (id: number, page = 1, perPage = 30): Promise<{ items: NotificationActorItem[]; hasMore: boolean; page: number }> =>
    api.get<{ success: boolean; data: NotificationActorItem[]; meta?: { current_page: number; last_page: number } }>(
      `/notifications/${id}/actors`, { params: { page, per_page: perPage } },
    ).then((r) => {
      const items = r.data.data ?? [];
      const meta = r.data.meta;
      const hasMore = meta ? meta.current_page < meta.last_page : items.length >= perPage;
      return { items, hasMore, page };
    }),

  // Callers catch their own failure and roll the optimistic local flip back -
  // swallowing it here (like these used to) is what let a row stay "read"
  // on-device while the server still had it unread, so the badge kept
  // reporting the same already-seen notifications on every poll.
  markNotificationRead: (id: number) =>
    api.post(`/notifications/${id}/read`).then(() => {}),
  // Bulk mark-as-read - used when a whole Inbox category is opened, so every
  // notification the user just saw in that list is marked read at once.
  markNotificationsRead: (ids: number[]) =>
    ids.length === 0 ? Promise.resolve() : api.post("/notifications/read-many", { ids }).then(() => {}),

  /**
   * Mark-all-read, optionally SCOPED to a set of types.
   *
   * Reports failure rather than swallowing it - a swallowed failure meant
   * callers ran their success path (clear the badge, refetch) against a server
   * that still had everything unread, and the count came straight back with
   * nothing logged.
   *
   * The scoping is what keeps one inbox menu from wiping the others' unread
   * state: opening System passes `types` (its own set), opening Activity passes
   * `excludeTypes` (System + Gifts + profile_view), and calling it bare keeps
   * the historical mark-everything behaviour.
   */
  markAllNotificationsReadStrict: (opts?: { types?: string[]; excludeTypes?: string[] }) => {
    const body = opts?.types?.length
      ? { types: opts.types }
      : opts?.excludeTypes?.length
        ? { exclude_types: opts.excludeTypes }
        : {};
    return api.post("/notifications/read-all", body).then(() => {});
  },

  storyFeed: () =>
    api.get<{ success: boolean; data: StoryFeedItem[] }>("/stories/feed").then((r) => r.data.data ?? []),

  // "Tag people" approval - id is the tag_request notification's entity_id
  // (a comment_mentions row id). See TagController::accept()/decline().
  acceptTagRequest: (id: number) =>
    api.post<{ success: boolean }>(`/users/tag-requests/${id}/accept`).then((r) => r.data),
  declineTagRequest: (id: number) =>
    api.post<{ success: boolean }>(`/users/tag-requests/${id}/decline`).then((r) => r.data),

  // "Paid partnership" collab approval - same shape as the tag-request pair above.
  acceptCollabRequest: (id: number) =>
    api.post<{ success: boolean }>(`/users/collab-requests/${id}/accept`).then((r) => r.data),
  declineCollabRequest: (id: number) =>
    api.post<{ success: boolean }>(`/users/collab-requests/${id}/decline`).then((r) => r.data),
};

/**
 * The System channel, as an explicit ALLOW-LIST.
 *
 * System carries app and account messages only - announcements, maintenance,
 * security, account warnings, verification, payments, admin. Everything else is
 * a user interaction and belongs to Activity.
 *
 * This has to be an allow-list rather than a `default:` arm. It used to end in
 * `default: return "system"`, which meant any type the switch didn't name fell
 * into System - so `story_react` (a story reaction) showed up in the System tab
 * instead of Activity, and every future engagement type the backend adds would
 * have quietly done the same. Enumerating System instead inverts that failure:
 * an unrecognised type now lands in Activity, where an interaction belongs.
 */
export const SYSTEM_NOTIF_TYPES: ReadonlySet<string> = new Set([
  "system", "verification", "report_actioned",
  "announcement", "maintenance", "security", "account_warning", "payment", "admin",
  // Account-level plumbing rather than engagement, and the Activity list doesn't
  // claim them - they've always lived here.
  "message_request", "message_request_accepted",
  // A programme opening is an announcement about the account, not something
  // another person did. Without this it fell through to Activity - NOT_ACTIVITY
  // is defined as system|gift|profile_view - and sat among likes and follows,
  // which is the wrong menu for it.
  "monetization_available",
]);

/**
 * Gifts and coins - the Inbox's own row, kept out of both Activity and System.
 *
 * These are the types the wallet writes (GiftCommissionService). "gift" is the
 * older bare spelling and is kept so nothing already in a user's feed changes
 * bucket under them.
 */
export const GIFT_NOTIF_TYPES: ReadonlySet<string> = new Set([
  "gift", "gift_received", "gift_sent", "coin_purchase", "coin_gift",
]);

/**
 * Maps a notification type to one of the inbox category buckets.
 *
 * "tagged" is its own bucket, separate from "mentions" - a tag (explicit
 * media tagging, with an accept/decline step) and a mention (@username in a
 * caption/comment) are different actions with different wording; bucketing
 * both under "mentions" is what put "Alex tagged you in a video" behind a
 * Mentions filter, which is the wrong place for something that isn't a
 * mention at all. See CHIPS in NotificationsScreen.tsx for the same split.
 */
export type NotifCategory = "system" | "followers" | "mentions" | "tagged" | "likes" | "comments";
export function categoryOf(type: string): NotifCategory | null {
  switch (type) {
    case "like":
    case "comment_like":
    // A story reaction is a like, not a system message. This omission is what
    // put story reactions in the System tab.
    case "story_react": return "likes";
    case "comment":
    case "reply":
    case "story_reply":
    case "story_comment": return "comments";
    case "mention":
    case "story_mention": return "mentions";
    case "tag_request":
    case "tag_request_accepted":
    case "tag_request_rejected":
    case "collab_request":
    case "collab_request_accepted":
    case "collab_request_rejected": return "tagged";
    case "follow":
    case "follow_request":
    case "follow_request_accepted":
    case "follow_request_rejected": return "followers";
  }
  // Not a named engagement type: System only if it's genuinely a System type,
  // otherwise no category (the Activity list is keyed off notifBucket).
  return SYSTEM_NOTIF_TYPES.has(type) ? "system" : null;
}
