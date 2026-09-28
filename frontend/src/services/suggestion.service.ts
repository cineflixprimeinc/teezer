import { api } from "./api";

export type SuggestedProfile = {
  id: number;
  username: string;
  display_name: string;
  avatar: string | null;
  bio: string | null;
  is_verified: boolean;
  is_creator: boolean;
  followers_count: number;
  mutual_followers_count: number;
  reason: string;
  score: number;
  is_following: boolean;
};

export type SuggestionContext =
  | "home"
  | "profile"
  | "friends"
  | "following_empty"
  | "search"
  | "creator_profile";

type SuggestionsResponse = {
  success: boolean;
  suggestions: SuggestedProfile[];
};

export const suggestionService = {
  async profiles(
    context: SuggestionContext = "home",
    limit = 10,
    profileUserId?: number,
  ): Promise<SuggestedProfile[]> {
    const params: Record<string, string | number> = { context, limit };
    if (profileUserId) params.profile_user_id = profileUserId;
    const { data } = await api.get<SuggestionsResponse>("/suggestions/profiles", { params });
    return data.suggestions ?? [];
  },

  async guestProfiles(limit = 6): Promise<SuggestedProfile[]> {
    const { data } = await api.get<SuggestionsResponse>("/suggestions/guest", {
      params: { limit },
    });
    return data.suggestions ?? [];
  },

  async dismiss(userId: number): Promise<void> {
    await api.post(`/suggestions/profiles/${userId}/dismiss`);
  },

  async markFollowed(userId: number): Promise<void> {
    await api.post(`/suggestions/profiles/${userId}/followed`).catch(() => {
      // best-effort - don't surface errors to UI
    });
  },

  async clearCache(): Promise<void> {
    await api.delete("/suggestions/cache").catch(() => {});
  },
};
