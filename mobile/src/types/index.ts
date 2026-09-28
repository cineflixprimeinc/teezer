/** Shared API types - mirror the Laravel resources. Expand per feature phase. */

export interface AuthUser {
  id: number;
  name: string | null;
  username: string;
  email?: string;
  avatar: string | null;
  /** True only for a real uploaded photo - `avatar` is never null (falls back to the shared default image). */
  has_avatar?: boolean;
  bio?: string | null;
  is_verified: boolean;
  is_private?: boolean;
  is_banned?: boolean;
  role?: string;
  two_factor_enabled?: boolean;
  /** Set by the server for an account social sign-in just created, until it
   *  finishes the profile-completion flow (birthday, name, username). Arrives
   *  on login AND on every /auth/me, so an onboarding interrupted by a crash
   *  or a reinstall resumes instead of leaving a real account stranded with the
   *  username the server invented from the provider's email. */
  needs_social_onboarding?: boolean;
  profile?: {
    total_followers: number;
    total_following: number;
    total_likes: number;
    total_videos: number;
  };
}

export interface SocialLink {
  platform: string; // instagram | twitter | youtube | tiktok | facebook | telegram | whatsapp | website | other
  url: string;
}

export interface Highlight {
  id: number;
  title: string;
  cover_url?: string | null;
  emoji?: string | null;
  sort_order?: number;
}

export interface CreatorProgress {
  xp?: number;
  level?: string | null;
}

/** Stats block returned by GET /profile (own profile) under `profile`. */
export interface ProfileStats {
  total_followers?: number;
  total_following?: number;
  total_likes?: number;
  total_videos?: number;
  profile_views?: number;
  creator_badge?: string | null;
  location?: string | null;
  website?: string | null;
  category?: string | null;
}

/**
 * Rich profile shape - mirrors the Laravel ProfileResource (GET /profile) and the
 * public UserResource (GET /users/{username}). Public responses use the flat
 * *_count fields; the own-profile response nests counts under `profile`.
 */
export interface ProfileDetails {
  id: number;
  name: string | null;
  username: string;
  avatar: string | null;
  /** True only for a real uploaded photo - `avatar` is never null (falls back to the shared default image). */
  has_avatar?: boolean;
  bio?: string | null;
  website?: string | null;
  location?: string | null;
  country?: string | null;
  categories?: string[];
  // Personal info (own-profile only - GET /profile):
  email?: string | null;
  phone?: string | null;
  gender?: string | null; // prefer_not_to_say | male | female | non_binary | other
  date_of_birth?: string | null; // YYYY-MM-DD
  interests?: string[];
  language?: string | null;
  is_verified: boolean;
  is_private?: boolean;
  role?: string; // "user" | "creator" | "admin"
  has_creator_access?: boolean;
  has_story?: boolean; // public profile returns this
  has_active_story?: boolean; // alias some endpoints may use
  // The Shop tab/button gate - server-authoritative (see
  // ShopController::approvedShop() / UserResource.php). Both GET /profile
  // and GET /users/{username} return this the same way.
  has_approved_shop?: boolean;
  created_at?: string;

  // Own-profile (GET /profile) nests counts here:
  profile?: ProfileStats | null;

  // Public (GET /users/{username}) returns flat counts:
  followers_count?: number;
  following_count?: number;
  likes_count?: number;
  videos_count?: number;
  is_following?: boolean;
  follow_status?: "none" | "pending" | "accepted";
  /** The profile page's bell icon - "notify me when this creator posts".
   *  Only meaningful once is_following/follow_status is "accepted". */
  notify_posts?: boolean;

  social_links?: SocialLink[];
  highlights?: Highlight[];
  creator_progress?: CreatorProgress | null;
}

export interface AuthTokenResponse {
  success: boolean;
  message?: string;
  data: {
    token: string;
    token_type: string;
    expires_at: string;
    user: AuthUser;
  };
}

export interface Paginated<T> {
  success: boolean;
  data: T[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    next_page_url?: string | null;
  };
}

export interface VideoUser {
  id: number;
  username: string;
  name: string | null;
  avatar: string | null;
  is_verified: boolean;
  is_following?: boolean;
  /** True when this creator currently has a live (published, unexpired,
   *  viewer-visible) story - drives the same gradient/seen ring the
   *  profile screen and Inbox already draw, now on the feed's creator
   *  avatar too. See Video::attachStoryFlags() on the backend. */
  has_story?: boolean;
  /** Only meaningful when has_story is true - true when the viewer hasn't
   *  seen (all of) that story yet. */
  has_unseen?: boolean;
}

export interface Video {
  id: number;
  caption: string | null;
  title: string | null;
  video_url: string | null;
  /**
   * HLS master playlist. Preferred over video_url whenever it is set: the
   * player starts on the smallest rendition and climbs, instead of committing
   * to one file size before it has measured the connection.
   *
   * Null until the server-side transcode finishes, which is why video_url is
   * still needed as a fallback - a freshly posted video is watchable straight
   * away and quietly upgrades to the ladder once it is built.
   */
  hls_url?: string | null;
  hls_status?: "queued" | "processing" | "ready" | "failed" | "unavailable" | null;
  /** Legacy progressive MP4 renditions keyed by height. Superseded by hls_url. */
  quality_urls?: Record<string, string> | null;
  thumbnail_url: string | null;
  media_type: "video" | "image" | "image_carousel";
  status?: "published" | "draft" | "private" | "unlisted" | "scheduled" | "removed";
  scheduled_at?: string | null;
  /** VideoResource always sends this; unused until Studio's edit-post flow
   *  needed to read a video's own category back to prefill it. */
  category?: string | null;
  media_items?: { object_key: string | null; url: string | null; order: number; mime_type: string | null }[];
  duration: number | null;
  width: number | null;
  height: number | null;
  aspect_ratio: number | null;
  is_ai_generated: boolean;
  /** Pinned to the top of the creator's profile grid (VideoResource exposes this). */
  is_pinned?: boolean;
  location: string | null;
  /** "Add link" on the upload/edit Details card - a single external URL the
   *  creator attached to this post, stored verbatim. */
  link_url?: string | null;
  /** "Add link" -> Teezer Product - up to 3 of the creator's own Shop
   *  products featured on this post. Read live from `products` server-side
   *  (VideoResource::featured_products / Video::featuredProducts()), so
   *  price/image here always reflect the current listing, not a copy taken
   *  at post time. Present only when the relation was eager-loaded. */
  featured_products?: { id: number; name: string; price: number; currency: string; image_url: string | null }[];
  views_count: number;
  likes_count: number;
  comments_count: number;
  saves_count: number;
  shares_count: number;
  is_liked: boolean;
  is_saved: boolean;
  hashtags: string[];
  /** Explicit "Tag people" selections - VideoResource::taggedUsers, only
   *  present when eager-loaded (feed + single-video endpoints). Distinct
   *  from @mentions typed into the caption text itself. */
  tagged_users?: { id: number; username: string; display_name: string | null; avatar_url: string | null; verified: boolean }[];
  /** "Paid partnership" collab tags - same shape/rules as tagged_users,
   *  present when eager-loaded. Accepted collaborators only. */
  collab_users?: { id: number; username: string; display_name: string | null; avatar_url: string | null; verified: boolean }[];
  main_sound?: {
    type: string;
    id: number;
    title: string | null;
    artist_name?: string | null;
    cover_url?: string | null;
  } | null;
  /** Legacy fallback for videos published before main_sound existed. */
  music_track?: { id: number; title: string | null; cover_url?: string | null } | null;
  user: VideoUser;
  created_at: string;

  /**
   * Creator upload/permission settings. Optional because older API responses may
   * omit them; when a flag is explicitly `false` the matching action (download,
   * duet, stitch, sharing) is disabled/hidden so a creator's choice is never
   * bypassed. Absent = not restricted (the server stays the source of truth).
   */
  allow_download?: boolean;
  allow_duet?: boolean;
  allow_stitch?: boolean;
  allow_comments?: boolean;
  allow_sharing?: boolean;

  /** Present on in-feed sponsored ads. The card still plays this (boosted)
   *  video and keeps the normal like/comment/share rail; the overlay renders
   *  the ad headline/body + CTA and beacons impression/click by ad.impression_token. */
  is_sponsored?: boolean;
  ad?: AdCreative;
  /** Stable list key for a sponsored item ("ad_<creativeId>_<hash>"). */
  ad_feed_id?: string;
}

/** The sponsored creative attached to an in-feed ad (see AdFeedInjector). */
export interface AdCreative {
  campaign_id: number;
  ad_group_id: number;
  creative_id: number;
  headline: string | null;
  body: string | null;
  /** learn_more | shop_now | sign_up | download | watch_more | book_now | contact_us | get_offer */
  cta_type: string | null;
  destination_url: string | null;
  /** Advertiser display name shown as "Sponsored · <name>". */
  display_name: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  /** Signed token that authorizes the impression/click beacons for this serve. */
  impression_token: string;
  placement: string;
}
