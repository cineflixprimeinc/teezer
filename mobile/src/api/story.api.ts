import { Platform } from "react-native";

import { api, apiErrorMessage } from "./client";

/**
 * Stories - the SAME backend the website uses (`POST /stories`, `/stories/*`).
 * A story published from the app therefore shows up on the web instantly (and
 * vice-versa): identical endpoints, identical payload, one source of truth.
 * Mirrors frontend/src/services/story.service.ts.
 */

export type StoryVisibility = "everyone" | "followers" | "close_friends" | "only_me";

export interface StoryMediaItem {
  id: number;
  media_type: "image" | "video" | "text";
  source_type?: "upload" | "shared_video";
  shared_video_id?: number | null;
  media_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  order_index: number;
}

export type StoryLayerType = "text" | "link" | "mention" | "hashtag" | "location" | "emoji";
export type StoryLayerFont = "classic" | "modern" | "typewriter" | "strong" | "minimal";

/** A positioned overlay drawn on top of a story slide (mirrors the web serializer). */
export interface StoryLayer {
  id?: number;
  type: StoryLayerType;
  text: string;
  url?: string | null;
  username?: string | null;
  userId?: number | null;
  locationName?: string | null;
  hashtag?: string | null;
  slideIndex: number;
  x: number; // % from left
  y: number; // % from top
  scale: number;
  rotation: number;
  color: string;
  font: StoryLayerFont;
  zIndex: number;
}

/** The original creator, resolved live - shown as attribution on a repost. */
export interface StoryRepostAttribution {
  story_id: number;
  user_id: number;
  username: string | null;
  name: string | null;
  avatar: string | null;
  is_verified: boolean;
}

export interface Story {
  id: number;
  user_id: number;
  caption: string | null;
  visibility: StoryVisibility;
  allow_replies: boolean;
  allow_resharing: boolean;
  /** Set once, server-side; a repost of an AI-generated story keeps this true
   *  even if the reposter didn't check the box themselves - see repost(). */
  is_ai_generated: boolean;
  /** Present only when this story is a repost of someone else's. */
  reposted_from: StoryRepostAttribution | null;
  save_to_archive: boolean;
  status: "draft" | "published" | "archived" | "expired";
  /** The track chosen in the composer, if any - drives the viewer's sound control. */
  music_id?: number | null;
  /**
   * The per-story settings document - see server config/stories.php.
   *
   * An ABSENT key means "use the current default", never false. Reading it as a
   * plain boolean would turn every unset setting off, which is the opposite of
   * what the server does - so read it through `storySetting`.
   */
  settings?: Record<string, unknown> | null;
  location?: string | null;
  link?: string | null;
  expires_at: string | null;
  created_at: string;
  media: StoryMediaItem[];
  layers?: StoryLayer[];
}

/** The story author shown in the viewer header (from GET /users/{username}/stories). */
export interface StoryAuthor {
  id: number;
  username: string;
  display_name: string;
  avatar: string | null;
  is_verified: boolean;
}

/** One author's active stories, grouped - the unit the StoryViewer pages through. */
export interface StoryUser {
  user: StoryAuthor;
  stories: Story[];
  has_unseen: boolean;
  is_own: boolean;
}

export type StoryReactionType = "heart" | "fire" | "wow" | "haha" | "sad";

/** The server's reaction vocabulary, in the order pickers show them. Single
 *  source for the Story viewer's quick-reaction row, the viewers sheet's
 *  reaction breakdown, and any inbox/chat surface rendering a
 *  story_reaction message - all read the same list so they can never show
 *  different emoji for the same reaction_type. */
export const STORY_REACTIONS: { key: StoryReactionType; emoji: string }[] = [
  { key: "heart", emoji: "❤️" },
  { key: "fire", emoji: "🔥" },
  { key: "wow", emoji: "😮" },
  { key: "haha", emoji: "😂" },
  { key: "sad", emoji: "😢" },
];

/** Same list, keyed for lookup - e.g. `STORY_REACTION_EMOJI[msg.body]` for a
 *  story_reaction message, whose body carries the reaction_type key. */
export const STORY_REACTION_EMOJI: Record<string, string> = Object.fromEntries(
  STORY_REACTIONS.map((r) => [r.key, r.emoji]),
);

/** One row of GET /stories/{id}/viewers - a viewer, plus what they did with it. */
export interface StoryViewer {
  id: number;
  username: string;
  display_name: string;
  avatar: string | null;
  is_verified: boolean;
  viewed_at: string;
  reaction_type: StoryReactionType | null;
  /** They sent a reply (story_messages) - the row reads "Replied · 6m ago". */
  replied: boolean;
  /** They follow you back - decides Message vs Follow on the row. */
  follows_me: boolean;
}

/**
 * The authoritative story counters, straight off the backend rollup.
 *
 * Every number is computed server-side. The app never totals a list to produce
 * one - that is precisely how the app and the website came to disagree, since
 * two clients counting the same rows their own way eventually count them
 * differently. Same shape as the web's StoryAnalytics, deliberately.
 */
export interface StoryAnalytics {
  story_id?: number;
  /** THE headline number. Unique people, not total plays. */
  unique_viewers: number;
  reaction_count: number;
  reply_count: number;
  share_count: number;
  reactions_breakdown: Record<string, number>;
  /** Internal analytics - kept separate so it can't be mistaken for viewers. */
  total_view_events: number;
  completion_count: number;
  total_watch_seconds: number;
  avg_watch_seconds: number;
  completion_rate: number;
}

/** Zeros, so callers never have to handle undefined counters. */
export const EMPTY_STORY_ANALYTICS: StoryAnalytics = {
  unique_viewers: 0,
  reaction_count: 0,
  reply_count: 0,
  share_count: 0,
  reactions_breakdown: {},
  total_view_events: 0,
  completion_count: 0,
  total_watch_seconds: 0,
  avg_watch_seconds: 0,
  completion_rate: 0,
};

/** What the client reports about HOW a story was watched - never WHO. */
export interface StoryViewContext {
  watch_duration?: number;
  completed?: boolean;
  slide_index?: number;
}

/**
 * GET /stories/{id}/viewers response - owner-only.
 *
 * Carries the full analytics alongside the list, so the sheet's numbers and its
 * rows come from one request and cannot disagree.
 */
export interface StoryViewersResult extends StoryAnalytics {
  total: number;
  /** Viewers who reacted / replied - the sheet's stat cards. */
  reactions: number;
  replies: number;
  shares: number;
  viewers: StoryViewer[];
}

/**
 * One id per app launch. Attributes concurrent events to a surface; it is NEVER
 * identity - the backend dedupes unique viewers on the authenticated user id,
 * so two devices are still one viewer.
 */
const SESSION_ID = `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

/** ios | android - the backend ignores anything it does not recognise. */
const PLATFORM = Platform.OS === "ios" ? "ios" : "android";

/** A picked/captured file, ready for multipart upload (RN FormData file shape). */
export interface StoryUpload {
  uri: string;
  name: string;
  type: string; // mime, e.g. "image/jpeg" | "video/mp4"
}

export interface CreateStoryInput {
  media: StoryUpload[];
  caption?: string;
  /** Text / sticker overlays, positioned as percentages of the slide. */
  layers?: StoryLayer[];
  visibility?: StoryVisibility;
  allow_replies?: boolean;
  allow_resharing?: boolean;
  /** Off by default - only set when the creator actually marks it. */
  is_ai_generated?: boolean;
  save_to_archive?: boolean;
  status?: "draft" | "published";
  /** The track picked in the editor. Stored on the story, not just logged as a
   *  usage stat - the viewer needs to know whether there is sound to offer. */
  music_id?: number | null;
}

/** Audience settings for a repost - no media, no caption: those come from the
 *  original (see StoryController::repost). */
export interface RepostStoryInput {
  layers?: StoryLayer[];
  visibility?: StoryVisibility;
  allow_replies?: boolean;
  allow_resharing?: boolean;
  /** OR'd server-side with the original's own flag - see the Story.is_ai_generated
   *  doc comment above. Sending false here can never clear an original's true. */
  is_ai_generated?: boolean;
}

/**
 * One setting off a story, with the default the server would use.
 *
 * Defaults are deliberately never written into the row, so an absent key is the
 * normal case rather than an edge one. These mirror config/stories.php - the
 * server is authoritative, this is what the UI assumes until it is told
 * otherwise.
 */
const STORY_SETTING_DEFAULTS: Record<string, boolean> = {
  show_view_count: true,
  allow_reactions: true,
  allow_save: false,
};

export function storySetting(story: Story | undefined, key: string): boolean {
  const v = story?.settings?.[key];
  return typeof v === "boolean" ? v : (STORY_SETTING_DEFAULTS[key] ?? false);
}

export const storyApi = {
  /**
   * Publish (or draft) a story. Multipart, exactly like the website's
   * storyService.create: media files go in `media[]`, booleans as "1"/"0".
   */
  create: (input: CreateStoryInput) => {
    const fd = new FormData();
    if (input.caption) fd.append("caption", input.caption);
    fd.append("visibility", input.visibility ?? "everyone");
    fd.append("allow_replies", (input.allow_replies ?? true) ? "1" : "0");
    fd.append("allow_resharing", (input.allow_resharing ?? true) ? "1" : "0");
    fd.append("is_ai_generated", input.is_ai_generated ? "1" : "0");
    fd.append("save_to_archive", (input.save_to_archive ?? true) ? "1" : "0");
    fd.append("status", input.status ?? "published");
    if (input.music_id) fd.append("music_id", String(input.music_id));
    // The server takes `layers` as a JSON *string* and decodes it (see
    // StoryController::store) - not as repeated form fields.
    if (input.layers?.length) fd.append("layers", JSON.stringify(input.layers));
    input.media.forEach((m) =>
      // The RN FormData file shape ({ uri, name, type }); the axios client strips
      // its own Content-Type for FormData so the multipart boundary is set.
      fd.append("media[]", { uri: m.uri, name: m.name, type: m.type } as unknown as Blob),
    );
    return api
      // No explicit Content-Type: the request interceptor strips it for FormData
      // so React Native sets the multipart boundary itself (exactly like the
      // working avatar upload). Setting it manually risks a boundary-less header
      // that the server can't parse, dropping the media.
      .post<{ success: boolean; data: Story; message: string }>("/stories", fd)
      .then((r) => r.data);
  },

  /** User ids that currently have an active story (drives the gradient ring). */
  activeUserIds: (): Promise<number[]> =>
    api
      /* The endpoint plucks user_id, so this is a flat array of integers -
         [3, 7, 12], not [{id: 3}, ...]. It was read as objects and mapped over
         `.id`, which turned every entry into undefined, so nothing ever matched
         and the ring never drew. Rows are accepted in either shape now, since a
         silent undefined is exactly the failure that hid this. */
      .get<{ success: boolean; data: (number | { id: number })[] }>("/stories/active-user-ids")
      .then((r) =>
        (r.data.data ?? [])
          .map((u) => (typeof u === "number" ? u : u?.id))
          .filter((id): id is number => typeof id === "number"),
      )
      .catch(() => []),

  /** The signed-in creator's own stories. */
  myStories: (): Promise<Story[]> =>
    api.get<{ success: boolean; data: Story[] }>("/stories/my").then((r) => r.data.data ?? []),

  /**
   * A single user's currently-viewable stories, grouped under their author info
   * (GET /users/{username}/stories). Returns null when the user has no active
   * story, or when a private account hasn't shared with the viewer. This is what
   * the StoryViewer opens and what drives the profile ring's unread state.
   */
  userStories: (username: string): Promise<StoryUser | null> =>
    api
      .get<{ success: boolean; data: StoryUser | null }>(`/users/${username}/stories`)
      .then((r) => r.data.data ?? null),

  /**
   * Record that the viewer has seen a story (fire-and-forget; never blocks UI).
   *
   * The backend decides whether this is a NEW unique viewer - nothing here
   * increments a count, so watching from phone and laptop is still one viewer.
   */
  markViewed: (id: number, ctx: StoryViewContext = {}): Promise<void> =>
    api
      .post(`/stories/${id}/view`, {
        platform: PLATFORM,
        session_id: SESSION_ID,
        watch_duration: ctx.watch_duration ?? 0,
        completed: ctx.completed ?? false,
        slide_index: ctx.slide_index ?? 0,
      })
      .then(() => {})
      // Swallowed on purpose - fire-and-forget, this must never block or error
      // the viewer UI. But silently, with nothing logged anywhere, is how a
      // failed view (a 404 because the viewer can't actually see this story, an
      // expired story, a dropped connection) went completely undetectable: it
      // looked exactly like a normal watched story with no view counted, and
      // nothing anywhere distinguished that from the system working correctly.
      .catch((err) => {
        if (__DEV__) console.warn(`[story] markViewed(${id}) failed:`, apiErrorMessage(err));
      }),

  /**
   * Report how long a story was watched, after the fact.
   *
   * Duration is only knowable once the viewer leaves, which means a second call
   * after markViewed. `progress_only` folds it into the view already recorded
   * instead of counting a second watch, so this can never inflate the count.
   */
  reportProgress: (id: number, ctx: StoryViewContext): Promise<void> =>
    api
      .post(`/stories/${id}/view`, {
        platform: PLATFORM,
        session_id: SESSION_ID,
        progress_only: true,
        watch_duration: ctx.watch_duration ?? 0,
        completed: ctx.completed ?? false,
        slide_index: ctx.slide_index ?? 0,
      })
      .then(() => {})
      .catch(() => {}),

  /** Owner-only: the authoritative counters for one story. */
  analytics: (id: number): Promise<StoryAnalytics> =>
    api
      .get<{ success: boolean; data: StoryAnalytics }>(`/stories/${id}/analytics`)
      .then((r) => ({ ...EMPTY_STORY_ANALYTICS, ...(r.data.data ?? {}) }))
      .catch(() => EMPTY_STORY_ANALYTICS),

  /** Take back a reaction. Idempotent - removing nothing is still a success. */
  removeReaction: (id: number): Promise<void> =>
    api.delete(`/stories/${id}/reaction`).then(() => {}),

  /** Record a share. Not deduplicated - sharing twice really is two shares. */
  share: (
    id: number,
    channel: "dm" | "copy_link" | "external" | "repost" = "copy_link",
    targetUserId?: number,
  ): Promise<void> =>
    api
      .post(`/stories/${id}/share`, {
        channel,
        target_user_id: targetUserId ?? null,
        platform: PLATFORM,
      })
      .then(() => {})
      .catch(() => {}),

  /** React to a story with one of the five emoji reactions. */
  react: (id: number, reactionType: StoryReactionType): Promise<void> =>
    api.post(`/stories/${id}/react`, { reaction_type: reactionType }).then(() => {}),

  /** Send a direct reply to a story (delivered to the author's inbox). */
  reply: (id: number, message: string): Promise<void> =>
    api.post(`/stories/${id}/reply`, { message }).then(() => {}),

  /** Report a story for review. */
  report: (id: number, reason: string): Promise<void> =>
    api.post(`/stories/${id}/report`, { reason }).then(() => {}),

  /**
   * Who viewed a story (owner-only) - id, name, avatar, verified, viewed_at, and
   * their reaction_type if they reacted. No follow-status / pagination / search
   * server-side, so sort + search + the reactions split are done client-side.
   */
  viewers: (id: number): Promise<StoryViewersResult> =>
    api
      .get<{ success: boolean; data: StoryViewersResult }>(`/stories/${id}/viewers`)
      .then((r) => {
        const d = r.data.data;
        const viewers = d?.viewers ?? [];
        // The server is authoritative for every counter. The row-derived
        // fallbacks below exist ONLY for an older server that predates the
        // analytics rollup - they are a compatibility shim, not a second way of
        // computing the numbers, and on a current server none of them is used.
        return {
          ...EMPTY_STORY_ANALYTICS,
          ...(d ?? {}),
          total: d?.total ?? d?.unique_viewers ?? viewers.length,
          reactions: d?.reactions ?? d?.reaction_count ?? viewers.filter((v) => !!v.reaction_type).length,
          replies: d?.replies ?? d?.reply_count ?? viewers.filter((v) => v.replied).length,
          shares: d?.shares ?? d?.share_count ?? 0,
          viewers,
        };
      })
      .catch(() => ({
        ...EMPTY_STORY_ANALYTICS,
        total: 0,
        reactions: 0,
        replies: 0,
        shares: 0,
        viewers: [],
      })),

  delete: (id: number) => api.delete(`/stories/${id}`).then((r) => r.data),

  /**
   * Repost someone else's story to your own story rail - a real, independent
   * Story row (POST /stories/{id}/repost), not a re-upload: the server
   * points the new StoryMedia at the original's already-hosted file. JSON,
   * not multipart - unlike create(), there is no file to send.
   */
  repost: (id: number, input: RepostStoryInput = {}): Promise<Story> =>
    api
      .post<{ success: boolean; data: Story; message: string }>(`/stories/${id}/repost`, {
        visibility: input.visibility ?? "everyone",
        allow_replies: input.allow_replies ?? true,
        allow_resharing: input.allow_resharing ?? true,
        is_ai_generated: input.is_ai_generated ?? false,
        layers: input.layers?.length ? JSON.stringify(input.layers) : undefined,
      })
      .then((r) => r.data.data),
};
