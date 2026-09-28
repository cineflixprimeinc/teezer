export type UserRole = "user" | "creator" | "admin" | "super_admin";

export type UserProfileStats = {
  total_followers?: number;
  total_following?: number;
  total_likes?: number;
  total_videos?: number;
  website?: string | null;
  category?: string | null;
  creator_badge?: string | null;
};

export type SocialLink = {
  platform: string;
  url: string;
};

export type ReelsooHighlight = {
  id: number;
  title: string;
  cover_url?: string | null;
  emoji?: string | null;
  sort_order?: number;
};

export type ReelsooUser = {
  id: number;
  name: string;
  username: string;
  email?: string;
  phone?: string | null;
  two_factor_enabled?: boolean;
  role: UserRole;
  /** Read-only demo admin: the panel renders as browsable but non-editable. */
  is_demo?: boolean;
  permissions?: string[];
  avatar?: string | null;
  /** True only for a real uploaded photo - `avatar` itself is never null (falls back to the shared default image), so this is what "did they actually set one" checks must read instead. */
  has_avatar?: boolean;
  bio?: string | null;
  website?: string | null;
  location?: string | null;
  gender?: string | null;
  language?: string | null;
  interests?: string[];
  categories?: string[];
  country?: string | null;
  selected_country_code?: string | null;
  selected_country_name?: string | null;
  detected_country_code?: string | null;
  detected_country_name?: string | null;
  date_of_birth?: string | null;
  is_verified?: boolean;
  is_private?: boolean;
  is_active?: boolean;
  is_banned?: boolean;
  ban_reason?: string | null;
  creatorStatus?: string;
  profile?: UserProfileStats | null;
  social_links?: SocialLink[];
  highlights?: ReelsooHighlight[];
  creator_progress?: { xp?: number; level?: string | null } | null;
  followers_count?: number;
  following_count?: number;
  likes_count?: number;
  videos_count?: number;
  total_likes_received?: number | null;
  total_video_views?: number | null;
  is_following?: boolean;
  follow_status?: "none" | "pending" | "accepted";
  message_privacy?: "everyone" | "friends" | "followers" | "no_one";
  created_at?: string;
};
