import { api } from "./api";

export interface StoryMediaItem {
  id:               number;
  media_type:       "image" | "video" | "text";
  media_url:        string | null;
  thumbnail_url:    string | null;
  duration_seconds: number | null;
  order_index:      number;
}

export type LayerType = "text" | "link" | "mention" | "hashtag" | "location" | "emoji";
export type LayerFont = "classic" | "modern" | "typewriter" | "strong" | "minimal";

export interface StoryLayer {
  id?:          number;      // server id (undefined when locally created)
  localId?:     string;      // client-side uuid
  type:         LayerType;
  text:         string;
  url?:         string;
  username?:    string;
  userId?:      number;
  locationName?: string;
  hashtag?:     string;
  slideIndex:   number;
  x:            number;      // % from left
  y:            number;      // % from top
  scale:        number;
  rotation:     number;
  color:        string;
  font:         LayerFont;
  zIndex:       number;
}

export interface Story {
  id:              number;
  user_id:         number;
  caption:         string | null;
  visibility:      "everyone" | "followers" | "close_friends" | "only_me";
  allow_replies:   boolean;
  allow_resharing: boolean;
  save_to_archive: boolean;
  status:          "draft" | "published" | "archived" | "expired";
  location:        string | null;
  link:            string | null;
  expires_at:      string | null;
  created_at:      string;
  media:           StoryMediaItem[];
  layers:          StoryLayer[];
  /** The per-story settings document (allow_reactions etc, see
   *  server config/stories.php). An absent key means "use the current
   *  default", never false - read it the same way the mobile client's
   *  storySetting() does, not as a plain boolean. */
  settings?:       Record<string, unknown> | null;
}

export interface StoryAuthor {
  id:          number;
  username:    string;
  display_name: string;
  avatar:      string | null;
  is_verified: boolean;
}

export interface StoryUser {
  user:       StoryAuthor;
  stories:    Story[];
  has_unseen: boolean;
  is_own:     boolean;
}

export interface CreateStoryPayload {
  files:            File[];
  caption?:         string;
  visibility?:      Story["visibility"];
  allow_replies?:   boolean;
  allow_resharing?: boolean;
  save_to_archive?: boolean;
  location?:        string;
  link?:            string;
  status:           "draft" | "published";
  layers?:          StoryLayer[];
}

function buildFormData(payload: CreateStoryPayload): FormData {
  const fd = new FormData();
  if (payload.caption)    fd.append("caption",         payload.caption);
  if (payload.visibility) fd.append("visibility",      payload.visibility);
  fd.append("allow_replies",   (payload.allow_replies   ?? true)  ? "1" : "0");
  fd.append("allow_resharing", (payload.allow_resharing ?? true) ? "1" : "0");
  fd.append("save_to_archive", (payload.save_to_archive ?? true) ? "1" : "0");
  if (payload.location)   fd.append("location", payload.location);
  if (payload.link)       fd.append("link",     payload.link);
  fd.append("status", payload.status);
  payload.files.forEach((f) => fd.append("media[]", f));
  if (payload.layers?.length) {
    fd.append("layers", JSON.stringify(payload.layers));
  }
  return fd;
}

export interface StoryReaction {
  reaction_type: "heart" | "fire" | "wow" | "haha" | "sad";
}

export interface StoryViewer {
  id:            number;
  username:      string;
  display_name:  string;
  avatar:        string | null;
  is_verified:   boolean;
  viewed_at:     string;
  reaction_type: "heart" | "fire" | "wow" | "haha" | "sad" | null;
}

export type StoryReactionType = StoryReaction["reaction_type"];

/**
 * The authoritative story counters, straight off GET /stories/{id}/analytics.
 *
 * Every number here is computed by the backend. The client never totals a list
 * to produce one - that is what let web and mobile disagree, because two
 * clients counting the same rows their own way will eventually count them
 * differently.
 */
export interface StoryAnalytics {
  story_id?:            number;
  /** THE headline number. Unique people, not total plays. */
  unique_viewers:       number;
  reaction_count:       number;
  reply_count:          number;
  share_count:          number;
  reactions_breakdown:  Record<string, number>;
  /** Internal analytics - deliberately separate from unique_viewers. */
  total_view_events:    number;
  completion_count:     number;
  total_watch_seconds:  number;
  avg_watch_seconds:    number;
  completion_rate:      number;
}

/** Context the client reports about HOW a story was watched - never WHO. */
export interface StoryViewContext {
  watch_duration?: number;
  completed?:      boolean;
  slide_index?:    number;
}

/** Zeros used when analytics cannot be loaded, so callers never see undefined. */
export const EMPTY_STORY_ANALYTICS: StoryAnalytics = {
  unique_viewers: 0, reaction_count: 0, reply_count: 0, share_count: 0,
  reactions_breakdown: {}, total_view_events: 0, completion_count: 0,
  total_watch_seconds: 0, avg_watch_seconds: 0, completion_rate: 0,
};

/**
 * Which surface this is, reported with every view.
 *
 * Only ever describes the device - the viewer's identity always comes from the
 * auth token on the backend, so this can never affect who is counted.
 */
function detectPlatform(): "web" | "mobile_web" | "desktop_web" {
  if (typeof navigator === "undefined") return "web";
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) ? "mobile_web" : "desktop_web";
}

/**
 * Per-tab id, so two tabs of the same account are attributable as separate
 * sessions while still counting as ONE unique viewer (the backend dedupes on
 * user id, never on this).
 */
function sessionId(): string {
  if (typeof window === "undefined") return "";
  const KEY = "teezer:story:session";
  try {
    let id = window.sessionStorage.getItem(KEY);
    if (!id) {
      id = `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      window.sessionStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // Private mode / storage disabled - a missing session id is fine, it is
    // optional metadata and never identity.
    return "";
  }
}

export const storyService = {
  create: async (payload: CreateStoryPayload): Promise<{ success: boolean; data: Story; message: string }> => {
    const fd = buildFormData(payload);
    // Do NOT pass Content-Type header - let browser/Axios auto-set multipart boundary
    return (await api.post("/stories", fd)).data;
  },

  feed: async (limit = 20): Promise<StoryUser[]> => {
    const { data } = await api.get<{ success: boolean; data: StoryUser[] }>("/stories/feed", { params: { limit } });
    return data.data ?? [];
  },

  drafts: async (): Promise<{ success: boolean; data: Story[] }> =>
    (await api.get("/stories/drafts")).data,

  myStories: async (): Promise<{ success: boolean; data: Story[] }> =>
    (await api.get("/stories/my")).data,

  getUserStories: async (username: string): Promise<StoryUser | null> => {
    const { data } = await api.get<{ success: boolean; data: StoryUser | null }>(`/users/${username}/stories`);
    return data.data ?? null;
  },

  /**
   * Record a view. The backend decides whether this is a NEW unique viewer -
   * the client never increments anything itself, so watching the same story
   * from two tabs still counts once.
   *
   * Every context field is optional metadata about the watch; omitting them
   * still records the view.
   */
  markViewed: async (storyId: number, ctx: StoryViewContext = {}): Promise<void> => {
    await api.post(`/stories/${storyId}/view`, {
      platform:       detectPlatform(),
      session_id:     sessionId(),
      watch_duration: ctx.watch_duration ?? 0,
      completed:      ctx.completed ?? false,
      slide_index:    ctx.slide_index ?? 0,
    }).catch(() => {});
  },

  /**
   * Report how long a story was watched, after the fact.
   *
   * Duration is only knowable once the viewer leaves, which means a second call
   * after markViewed. `progress_only` tells the backend to fold the measurement
   * into the view it already recorded instead of counting a second watch - so
   * this can never inflate the view count.
   */
  reportProgress: async (storyId: number, ctx: StoryViewContext): Promise<void> => {
    await api.post(`/stories/${storyId}/view`, {
      platform:       detectPlatform(),
      session_id:     sessionId(),
      progress_only:  true,
      watch_duration: ctx.watch_duration ?? 0,
      completed:      ctx.completed ?? false,
      slide_index:    ctx.slide_index ?? 0,
    }).catch(() => {});
  },

  react: async (storyId: number, reactionType: StoryReaction["reaction_type"]): Promise<void> => {
    await api.post(`/stories/${storyId}/react`, { reaction_type: reactionType });
  },

  /** Take back a reaction. Idempotent - removing nothing is still a success. */
  removeReaction: async (storyId: number): Promise<void> => {
    await api.delete(`/stories/${storyId}/reaction`);
  },

  /** Owner-only: the authoritative counters for one story. */
  analytics: async (storyId: number): Promise<StoryAnalytics> => {
    try {
      const { data } = await api.get<{ success: boolean; data: StoryAnalytics }>(`/stories/${storyId}/analytics`);
      return { ...EMPTY_STORY_ANALYTICS, ...(data.data ?? {}) };
    } catch {
      return EMPTY_STORY_ANALYTICS;
    }
  },

  /** Owner-only: who reacted, with what, plus per-type totals. */
  reactions: async (storyId: number): Promise<{
    total: number;
    breakdown: Record<string, number>;
    reactions: { id: number; username: string; display_name: string; avatar: string | null; is_verified: boolean; reaction_type: string; reacted_at: string }[];
  }> => {
    try {
      const { data } = await api.get(`/stories/${storyId}/reactions`);
      return data.data ?? { total: 0, breakdown: {}, reactions: [] };
    } catch {
      return { total: 0, breakdown: {}, reactions: [] };
    }
  },

  /** Record a share. Not deduplicated - sharing twice really is two shares. */
  share: async (storyId: number, channel: "dm" | "copy_link" | "external" | "repost" = "copy_link", targetUserId?: number): Promise<void> => {
    await api.post(`/stories/${storyId}/share`, {
      channel,
      target_user_id: targetUserId ?? null,
      platform:       detectPlatform(),
    }).catch(() => {});
  },

  reply: async (storyId: number, message: string): Promise<void> => {
    await api.post(`/stories/${storyId}/reply`, { message });
  },

  report: async (storyId: number, reason: string): Promise<void> => {
    await api.post(`/stories/${storyId}/report`, { reason });
  },

  searchUsers: async (query: string): Promise<{ id: number; username: string; name: string; avatar: string | null; is_verified: boolean }[]> => {
    if (!query.trim()) return [];
    const { data } = await api.get("/stories/search-users", { params: { q: query } });
    return data.users ?? [];
  },

  createFromSharedVideo: async (payload: {
    video_id:         number;
    visibility?:      Story["visibility"];
    allow_replies?:   boolean;
    allow_resharing?: boolean;
    save_to_archive?: boolean;
    layers?:          StoryLayer[];
  }): Promise<{ success: boolean; data: Story; message: string }> => {
    const body: Record<string, unknown> = {
      video_id:        payload.video_id,
      visibility:      payload.visibility      ?? "everyone",
      allow_replies:   payload.allow_replies   ?? true,
      allow_resharing: payload.allow_resharing ?? true,
      save_to_archive: payload.save_to_archive ?? true,
    };
    if (payload.layers?.length) {
      body.layers = JSON.stringify(payload.layers);
    }
    return (await api.post("/stories/from-video", body)).data;
  },

  delete: async (id: number): Promise<{ success: boolean; message: string }> =>
    (await api.delete(`/stories/${id}`)).data,

  /**
   * Owner-only: the viewer list, plus the same authoritative counters
   * /analytics returns. The backend merges them into this one response so the
   * sheet's numbers and its list can never disagree, and so opening the sheet
   * is one request rather than two.
   */
  viewers: async (storyId: number): Promise<StoryAnalytics & { total: number; viewers: StoryViewer[] }> => {
    try {
      const { data } = await api.get<{ success: boolean; data: StoryAnalytics & { total: number; viewers: StoryViewer[] } }>(`/stories/${storyId}/viewers`);
      const d = data.data;
      return {
        ...EMPTY_STORY_ANALYTICS,
        ...(d ?? {}),
        // `total` is the unique viewer count under its original key, kept so
        // nothing that already reads data.total has to change.
        total:   d?.total ?? d?.unique_viewers ?? 0,
        viewers: d?.viewers ?? [],
      };
    } catch {
      return { ...EMPTY_STORY_ANALYTICS, total: 0, viewers: [] };
    }
  },

  activeUserIds: async (): Promise<number[]> => {
    const { data } = await api.get<{ success: boolean; data: { id: number }[] }>("/stories/active-user-ids");
    if (data.data) return data.data.map(u => u.id);
    // Fallback: derive from feed
    const users = await storyService.feed();
    return users.map(u => u.user.id);
  },
};
