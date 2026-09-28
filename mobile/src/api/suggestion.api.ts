import { api } from "./client";

/**
 * Account suggestions - same recommendation engine the website uses
 * (GET /suggestions/profiles). The scoring/ranking lives server-side, so the app
 * just calls the same endpoint with the same context rules to get identical results.
 */
export interface SuggestedProfile {
  id: number;
  username: string;
  display_name: string;
  avatar: string | null;
  bio: string | null;
  is_verified: boolean;
  is_creator: boolean;
  followers_count: number;
  mutual_followers_count: number;
  /** Up to 3 mutual friends (people you follow who follow them) - avatar stack. */
  mutual_followers?: { id: number; username: string; name?: string | null; avatar: string | null }[];
  reason: string;
  score: number;
  is_following: boolean;
  /** True when this user currently has a live story - draws the same
   *  gradient/seen ring the profile screen, Inbox, feed and Search already
   *  draw. */
  has_story?: boolean;
  /** Only meaningful when has_story is true. */
  has_unseen?: boolean;
}

/** Context tells the engine why it's suggesting - "creator_profile" returns
 *  accounts similar to the profile being viewed; "profile" uses your own graph. */
export type SuggestionContext =
  | "home"
  | "profile"
  | "friends"
  | "following_empty"
  | "search"
  | "creator_profile";

export const suggestionApi = {
  profiles: (context: SuggestionContext = "profile", limit = 30, profileUserId?: number) => {
    const params: Record<string, string | number> = { context, limit };
    if (profileUserId) params.profile_user_id = profileUserId;
    return api
      .get<{ success: boolean; suggestions: SuggestedProfile[] }>("/suggestions/profiles", { params })
      .then((r) => r.data.suggestions ?? []);
  },

  // Best-effort signals back to the engine - never surface errors to the UI.
  dismiss: (userId: number) => api.post(`/suggestions/profiles/${userId}/dismiss`).then(() => {}).catch(() => {}),
  markFollowed: (userId: number) => api.post(`/suggestions/profiles/${userId}/followed`).then(() => {}).catch(() => {}),
};
