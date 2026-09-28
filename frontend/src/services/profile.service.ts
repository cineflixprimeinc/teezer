import { api } from "./api";

export type SocialPlatform =
  | "facebook"
  | "instagram"
  | "tiktok"
  | "youtube"
  | "twitter"
  | "website"
  | "other";

export interface SocialLinkPayload {
  platform: SocialPlatform;
  url: string;
}

export interface ProfileUpdatePayload {
  name?: string;
  username?: string;
  bio?: string | null;
  website?: string | null;
  location?: string | null;
  category?: string | null;
  date_of_birth?: string | null;
  country?: string | null;
  is_private?: boolean;
  gender?: string | null;
  language?: string | null;
  interests?: string[] | null;
  categories?: string[] | null;
  message_privacy?: "everyone" | "friends" | "followers" | "no_one";
}

export type InteractionPrivacy = "everyone" | "friends" | "followers" | "no_one";
export type LikedPrivacy        = "everyone" | "only_me";
export type DuetPrivacy         = "everyone" | "friends" | "no_one";

export interface PrivacySettings {
  is_private:              boolean;
  active_status:           boolean;
  profile_discovery:       boolean;
  show_to_search_engines:  boolean;
  comment_filter:          boolean;
  message_privacy:         InteractionPrivacy;
  who_can_comment:         "everyone" | "followers" | "no_one";
  who_can_tag:             InteractionPrivacy;
  who_can_duet:            DuetPrivacy;
  who_can_download:        DuetPrivacy;
  who_can_see_liked:       LikedPrivacy;
}

export interface ProfileResource {
  id: number;
  name: string;
  username: string;
  email?: string;
  phone?: string | null;
  role: string;
  permissions?: string[];
  avatar?: string | null;
  /** True only for a real uploaded photo - `avatar` is never null (falls back to the shared default image). */
  has_avatar?: boolean;
  bio?: string | null;
  website?: string | null;
  location?: string | null;
  gender?: string | null;
  language?: string | null;
  interests?: string[];
  categories?: string[];
  country?: string | null;
  date_of_birth?: string | null;
  is_verified?: boolean;
  is_private?: boolean;
  email_verified_at?: string | null;
  profile?: {
    location?: string | null;
    website?: string | null;
    category?: string | null;
    total_followers?: number;
    total_following?: number;
    total_likes?: number;
    total_videos?: number;
    profile_views?: number;
    creator_badge?: string | null;
  } | null;
  social_links?: SocialLinkPayload[];
}

export const profileService = {
  async show(): Promise<ProfileResource> {
    const { data } = await api.get("/profile");
    return data.data;
  },

  async update(payload: ProfileUpdatePayload): Promise<ProfileResource> {
    const { data } = await api.put("/profile", payload);
    return data.data;
  },

  async uploadAvatar(file: File): Promise<{ avatar_url: string }> {
    const form = new FormData();
    form.append("avatar", file);
    const { data } = await api.post("/profile/avatar", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data.data;
  },

  async removeAvatar(): Promise<void> {
    await api.delete("/profile/avatar");
  },

  async getPrivacy(): Promise<PrivacySettings> {
    const { data } = await api.get("/profile/privacy");
    return data.data;
  },

  async updatePrivacy(payload: Partial<PrivacySettings>): Promise<PrivacySettings> {
    const { data } = await api.patch("/profile/privacy", payload);
    return data.data;
  },

  async checkUsername(username: string): Promise<{ available: boolean; reason?: string }> {
    const { data } = await api.post("/profile/check-username", { username });
    return { available: !!data.available, reason: data.reason };
  },

  async getSocialLinks(): Promise<SocialLinkPayload[]> {
    const { data } = await api.get("/profile/social-links");
    return (data.data ?? []) as SocialLinkPayload[];
  },

  async updateSocialLinks(links: SocialLinkPayload[]): Promise<SocialLinkPayload[]> {
    const { data } = await api.put("/profile/social-links", { links });
    return (data.data ?? []) as SocialLinkPayload[];
  },
};
