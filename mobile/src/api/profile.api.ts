import { api } from "./client";
import type { AuthUser, Paginated, ProfileDetails, SocialLink, Video } from "@/types";

type SortKey = "latest" | "oldest" | "most_viewed" | "most_likes";

export interface FollowUser {
  id: number;
  name: string | null;
  username: string;
  avatar: string | null;
  is_verified: boolean;
  is_following?: boolean;
  follow_status?: "none" | "pending" | "accepted";
  followers_count?: number;
  videos_count?: number;
}

export interface FollowListResponse {
  success: boolean;
  data: FollowUser[];
  meta?: { current_page: number; last_page: number; total: number };
}

/** A pending follow request (private-account requests) - GET /users/follow-requests. */
export interface FollowRequest {
  id: number;             // the request id (used to accept/decline) - NOT the user id
  created_at: string;
  user: {
    id: number;
    name: string | null;
    username: string;
    avatar: string | null;
    is_verified: boolean;
    bio?: string | null;
    followers_count?: number;
  };
}

/** A user who viewed your profile (GET /profile/views). */
export interface ProfileViewer {
  id: number;
  username: string;
  name: string | null;
  avatar: string | null;
  is_verified: boolean;
  /** Most recent view time (drives "last viewed"). */
  viewed_at: string;
  /** Distinct 30-min view sessions this week → "Viewed N times this week". */
  view_count: number;
  /** You follow this viewer. */
  is_following: boolean;
  /** You and this viewer follow each other. */
  is_mutual: boolean;
}

export interface ProfileViewsPage {
  enabled: boolean;
  count: number;
  viewers: ProfileViewer[];
  next_cursor: string | null;
}

/**
 * Profile endpoints - the same backend the website uses.
 *  - me():   GET /profile is the rich own-profile payload (creator_progress,
 *            highlights, social_links, nested stats under `profile`).
 *  - user(): GET /users/{username} is the public profile (flat *_count fields).
 *  - videos()/liked() back the profile tabs (paginated VideoResource).
 */
/** Editable fields accepted by PUT /profile (mirrors the Laravel validation). */
export interface ProfileUpdatePayload {
  name?: string;
  username?: string;
  bio?: string | null;
  location?: string | null;
  website?: string | null;
  country?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  language?: string | null;
  interests?: string[];
  categories?: string[];
  is_private?: boolean;
}

/** Privacy & Safety settings - mirrors the website's PrivacySettings (GET/PATCH /profile/privacy). */
export type InteractionPrivacy = "everyone" | "friends" | "followers" | "no_one";
export type CommentPrivacy = "everyone" | "followers" | "no_one";
export type DuetPrivacy = "everyone" | "friends" | "no_one";
export type LikedPrivacy = "everyone" | "only_me";
/** TikTok-style "who can see when you're active". */
export type ActivityStatus = "public" | "friends" | "no_one";
/** Who can see that you viewed their profile. `private` = reciprocal hide. */
export type ProfileViewPrivacy = "everyone" | "followers" | "private";

export interface PrivacySettings {
  is_private: boolean;
  active_status: boolean;
  profile_discovery: boolean;
  show_to_search_engines: boolean;
  /** Default only, seeded onto a new story's own allow_resharing toggle - the
   *  per-story column remains what the server actually enforces. */
  stories_allow_resharing: boolean;
  comment_filter: boolean;
  message_privacy: InteractionPrivacy;
  who_can_comment: CommentPrivacy;
  who_can_tag: InteractionPrivacy;
  who_can_duet: DuetPrivacy;
  who_can_download: DuetPrivacy;
  who_can_see_liked: LikedPrivacy;
  /** TikTok-style: when off, you can't see who viewed you and you browse invisibly. */
  profile_view_history: boolean;
  /** 3-way profile-view visibility (source of truth; `private` == history off). */
  profile_view_privacy: ProfileViewPrivacy;
  /** Who can see when you're active. */
  activity_status: ActivityStatus;
}

export const profileApi = {
  me: () => api.get<{ success: boolean; data: ProfileDetails }>("/profile").then((r) => r.data.data),

  // Who viewed my profile - cursor-paginated, last 7 days, newest first.
  // `enabled` is false in Private Mode. Pass `cursor` (from next_cursor) to page.
  profileViews: (cursor?: string | null) =>
    api.get<{ success: boolean; data: ProfileViewsPage }>("/profile/views", { params: cursor ? { cursor } : undefined })
      .then((r): ProfileViewsPage => ({
        enabled: r.data.data?.enabled ?? true,
        count: r.data.data?.count ?? 0,
        viewers: r.data.data?.viewers ?? [],
        next_cursor: r.data.data?.next_cursor ?? null,
      }))
      .catch((): ProfileViewsPage => ({ enabled: true, count: 0, viewers: [], next_cursor: null })),

  // GET /profile/privacy - the full privacy & safety settings for the logged-in user.
  getPrivacy: () => api.get<{ success: boolean; data: PrivacySettings }>("/profile/privacy").then((r) => r.data.data),

  // PATCH /profile/privacy - partial update; returns the refreshed settings.
  updatePrivacy: (payload: Partial<PrivacySettings>) =>
    api.patch<{ success: boolean; data: PrivacySettings }>("/profile/privacy", payload).then((r) => r.data.data),

  // PUT /profile - partial update; returns the refreshed own-profile payload.
  update: (payload: ProfileUpdatePayload) =>
    api.put<{ success: boolean; data: ProfileDetails }>("/profile", payload).then((r) => r.data.data),

  // POST /profile/avatar - multipart upload (field "avatar"; jpeg/png/webp, ≤5MB).
  // Returns the new absolute avatar URL.
  updateAvatar: (file: { uri: string; name: string; type: string }) => {
    const fd = new FormData();
    fd.append("avatar", { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
    return api
      .post<{ success: boolean; message: string; data: { avatar_url: string } }>("/profile/avatar", fd)
      .then((r) => r.data.data);
  },

  // DELETE /profile/avatar - clears the avatar back to the default.
  removeAvatar: () =>
    api.delete<{ success: boolean; message: string }>("/profile/avatar").then((r) => r.data),

  // POST /profile/check-username - authenticated availability check for the
  // logged-in user (ignores their own current username).
  checkUsername: (username: string) =>
    api
      .post<{ success: boolean; available: boolean; reason?: string }>("/profile/check-username", { username })
      .then((r) => r.data),

  /**
   * POST /profile/complete-onboarding - the social-signup profile flow.
   *
   * All three fields in one call, not three updates: they are only meaningful
   * together, and a half-applied onboarding would leave an account with a real
   * name and still no birthday, with nothing afterwards knowing it was cut
   * short. The server validates with the same rules as a normal profile edit,
   * enforces the 13+ minimum, and returns the refreshed user.
   */
  completeOnboarding: (payload: { name: string; username: string; date_of_birth: string }) =>
    api
      .post<{ success: boolean; message: string; data: AuthUser }>("/profile/complete-onboarding", payload)
      .then((r) => r.data),

  // Social links (own profile). PUT replaces the whole set (empty array clears).
  socialLinks: () =>
    api.get<{ success: boolean; data: SocialLink[] }>("/profile/social-links").then((r) => r.data.data ?? []),
  updateSocialLinks: (links: { platform: string; url: string }[]) =>
    api.put<{ success: boolean; data: SocialLink[] }>("/profile/social-links", { links }).then((r) => r.data.data ?? []),

  user: (username: string) =>
    api.get<{ success: boolean; data: ProfileDetails }>(`/users/${username}`).then((r) => r.data.data),

  videos: (username: string, page = 1, sort: SortKey = "latest") =>
    api
      .get<Paginated<Video>>(`/users/${username}/videos`, { params: { page, per_page: 18, sort } })
      .then((r) => r.data),

  liked: (username: string, page = 1) =>
    api.get<Paginated<Video>>(`/users/${username}/liked`, { params: { page, per_page: 18 } }).then((r) => r.data),

  // Saved/bookmarked videos - privacy-enforced by the backend.
  saved: (username: string, page = 1) =>
    api.get<Paginated<Video>>(`/users/${username}/saved`, { params: { page, per_page: 18 } }).then((r) => r.data),

  // Draft (unpublished) videos - owner-only; the server 403s anyone else
  // (UserController::drafts).
  drafts: (username: string, page = 1) =>
    api.get<Paginated<Video>>(`/users/${username}/drafts`, { params: { page, per_page: 18 } }).then((r) => r.data),

  // Note: the profile grid and the post viewer must call these through
  // `profileGridQuery` below rather than reaching for them directly.

  // Followers / following lists - require auth; private accounts return 403 unless
  // the viewer is the owner/admin/accepted-follower (same rule as the website).
  followers: (username: string, page = 1) =>
    api.get<FollowListResponse>(`/users/${username}/followers`, { params: { page, per_page: 20 } }).then((r) => r.data),

  following: (username: string, page = 1) =>
    api.get<FollowListResponse>(`/users/${username}/following`, { params: { page, per_page: 20 } }).then((r) => r.data),

  // Pending follow requests (when your account is private). Accept/decline by request id.
  followRequests: () =>
    api.get<{ success: boolean; data: FollowRequest[] }>("/users/follow-requests").then((r) => r.data.data ?? []),
  acceptFollowRequest: (id: number) =>
    api.post<{ success: boolean }>(`/users/follow-requests/${id}/accept`).then((r) => r.data),
  declineFollowRequest: (id: number) =>
    api.post<{ success: boolean }>(`/users/follow-requests/${id}/decline`).then((r) => r.data),

  /** The close-friends list, as full rows so a picker renders without a second
   *  request. See ProfileController::getCloseFriends. */
  closeFriends: () =>
    api.get<{ success: boolean; data: FollowUser[] }>("/profile/close-friends").then((r) => r.data.data ?? []),

  /** Replaces the WHOLE list - the picker is a set the user confirms, so the
   *  honest write is that set. The server keeps only accounts you follow. */
  setCloseFriends: (userIds: number[]) =>
    api
      .put<{ success: boolean; data: { count: number } }>("/profile/close-friends", { user_ids: userIds })
      .then((r) => r.data.data),

  // Block / unblock a user (same endpoints the website uses).
  block: (username: string) => api.post<{ success: boolean }>(`/users/${username}/block`).then((r) => r.data),
  unblock: (username: string) => api.delete<{ success: boolean }>(`/users/${username}/block`).then((r) => r.data),

  /**
   * Report an account.
   *
   * NOTE: the server route does not exist yet - videos, comments, stories and
   * message requests each have a /report, an account does not. The caller
   * surfaces a plain failure rather than claiming the report was filed, so this
   * starts working the moment POST /users/{username}/report is added.
   */
  reportUser: (username: string, reason: string) =>
    api
      .post<{ success: boolean; message?: string }>(`/users/${username}/report`, { reason })
      .then((r) => r.data),

  // Notification preferences - same GET/PATCH /profile/notifications the website uses.
  getNotificationPrefs: () =>
    api.get<{ success: boolean; data: NotificationPrefs }>("/profile/notifications").then((r) => r.data.data),
  updateNotificationPrefs: (prefs: NotificationPrefs) =>
    api.patch<{ success: boolean; data: NotificationPrefs }>("/profile/notifications", prefs).then((r) => r.data.data),

  // Content-preferences actions - reads/writes of the prefs themselves go
  // through prefsApi/usePrefsStore (single shared cache with the player).
  resetFeedPreferences: () => api.delete("/feed/reset-preferences").then(() => {}),
  clearWatchHistory: () => api.delete("/history").then(() => {}),
};

/** Content preferences (GET/PATCH /profile/content-preferences) - mirrors the website. */
export interface ContentPrefs {
  preferred_language: string;
  preferred_country: string;
  show_local_first: boolean;
  show_trending: boolean;
  sensitive_content_filter: boolean;
  autoplay_videos: boolean;
  data_saver_mode: boolean;
}

/** Notification preferences (GET/PATCH /profile/notifications) - mirrors the website. */
export interface NotificationPrefs {
  push_likes: boolean;
  push_comments: boolean;
  push_followers: boolean;
  push_mentions: boolean;
  push_messages: boolean;
  push_live: boolean;
  push_following: boolean;
  push_creator: boolean;
  email_security: boolean;
  email_account: boolean;
  email_promo: boolean;
  email_news: boolean;
  sms_otp: boolean;
  sms_security: boolean;
  sms_updates: boolean;
}

/** The profile grid tabs that have an endpoint behind them. */
export type ProfileGridTab = "Reels" | "Liked" | "Saved" | "Drafts";

/**
 * The one query the profile grid AND the post viewer use for a tab.
 *
 * Both must agree on the key and the fetcher: the viewer opens on a tile the
 * grid already rendered, and resolves it straight from that cache entry. Any
 * disagreement means a refetch and a flash of an empty pager on open, so the
 * pair is defined once here rather than written out in both screens.
 */
export const profileGridQuery = (username: string, tab: ProfileGridTab) => ({
  queryKey: ["profile-videos", username, tab] as const,
  queryFn: () =>
    tab === "Liked"
      ? profileApi.liked(username, 1)
      : tab === "Saved"
        ? profileApi.saved(username, 1)
        : tab === "Drafts"
          ? profileApi.drafts(username, 1)
          : profileApi.videos(username, 1),
});
