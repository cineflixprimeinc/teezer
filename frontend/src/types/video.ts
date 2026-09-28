import type { TeezerUser } from "./user";

export type VideoUser = Pick<TeezerUser, "id" | "username" | "name" | "avatar" | "is_verified" | "is_following" | "followers_count" | "likes_count">;

export type MediaItem = {
  object_key: string;
  url: string;
  order: number;
  mime_type?: string | null;
};

/** A user explicitly tagged on a post via the "Tag people" field. */
export type TaggedUser = {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
  verified: boolean;
};

export type TeezerVideo = {
  id: number;
  title?: string | null;
  caption?: string | null;
  description?: string | null;
  video_url: string;
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
  thumbnail_url?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  aspect_ratio?: number | null;
  status?: string;
  category?: string | null;
  location?: string | null;
  /** "Add link" on the upload/edit Details card - a single external URL the
   *  creator attached to this post, stored verbatim. */
  link_url?: string | null;
  /** "Add link" -> Teezer Product - up to 3 of the creator's own Shop
   *  products featured on this post. Read live from `products` server-side
   *  (VideoResource::featured_products), so price/image here always reflect
   *  the current listing. Present only when the relation was eager-loaded. */
  featured_products?: { id: number; name: string; price: number; currency: string; image_url: string | null }[];
  language?: string | null;
  allow_download?: boolean;
  allow_comments?:  boolean;
  allow_duet?:      boolean;
  allow_stitch?:    boolean;
  is_ai_generated?: boolean;
  scheduled_at?: string | null;
  views_count?: number;
  likes_count?: number;
  comments_count?: number;
  saves_count?: number;
  shares_count?: number;
  engagement_rate?: number;
  watch_time_seconds?: number;
  is_liked?: boolean;
  is_saved?: boolean;
  is_pinned?: boolean;
  pinned_at?: string | null;
  media_type?: "video" | "image" | "image_carousel";
  media_items?: MediaItem[] | null;
  quality_urls?: Record<string, string> | null;
  hashtags?: string[];
  /** Present only when the creator tagged ≥1 user during upload. */
  tagged_users?: TaggedUser[] | null;
  /** "Paid partnership" collab tags - same shape/rules as tagged_users
   *  above, source_type='collab' instead of 'tag'. Accepted collaborators
   *  only (see the server's Video::collabUsers()). */
  collab_users?: TaggedUser[] | null;
  user?: VideoUser;
  audio_type?: "library_music" | "original_audio" | "original_track" | null;
  audio?: { id: number; title: string; artist?: string | null } | null;
  music_track?: {
    id: number;
    title: string;
    artist: string | null;
    cover_url: string | null;
    audio_url?: string | null;
    duration?: number | null;
    uses_count?: number;
    source_type?: "library" | "original";
  } | null;
  main_sound?: {
    type: "library_music" | "original_audio" | "original_track";
    id: number;
    title: string;
    artist_name: string | null;
    cover_url: string | null;
    route: string;
  } | null;
  created_at?: string;
};
