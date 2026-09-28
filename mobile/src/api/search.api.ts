import { api } from "./client";
import type { Video } from "@/types";

/**
 * Live search - a Meilisearch proxy on the backend (GET /search). Public, so it
 * works signed-out; the admin key never leaves the server.
 *
 * The endpoint answers with buckets keyed by kind. Every bucket is optional and
 * read defensively: the service can add a kind (or return none for a scope)
 * without this file or the screen changing.
 */

export type SearchType = "all" | "users" | "videos" | "hashtags" | "sounds";

export interface SearchUser {
  id: number;
  username: string;
  name?: string | null;
  avatar?: string | null;
  is_verified?: boolean;
  followers_count?: number;
  is_following?: boolean;
  /** True when this user currently has a live story - draws the same
   *  gradient/seen ring the profile screen, Inbox and feed already draw. */
  has_story?: boolean;
  /** Only meaningful when has_story is true. */
  has_unseen?: boolean;
}

export interface SearchHashtag {
  id?: number;
  name: string;
  videos_count?: number;
}

export interface SearchSound {
  id: number;
  title?: string | null;
  artist_name?: string | null;
  cover_url?: string | null;
  videos_count?: number;
}

export interface SearchResults {
  users: SearchUser[];
  videos: Video[];
  hashtags: SearchHashtag[];
  sounds: SearchSound[];
}

/**
 * The service answers from its index when it is up and from a DB fallback when
 * it is not, and the two paths spell several fields differently from the names
 * this app has always read:
 *
 *   users     verified     -> is_verified
 *   hashtags  tag          -> name          posts_count -> videos_count
 *   sounds    artist       -> artist_name   reels_count -> videos_count
 *             cover_image  -> cover_url
 *
 * Reading only one spelling is why sounds rendered as "Original sound · 0 reels"
 * with no cover art. Both spellings are accepted below so a result renders the
 * same whichever path answered, and so correcting the server later is not a
 * breaking change here.
 */
interface RawUser {
  id: number;
  username: string;
  name?: string | null;
  avatar?: string | null;
  verified?: boolean;
  is_verified?: boolean;
  followers_count?: number;
  is_following?: boolean;
  has_story?: boolean;
  has_unseen?: boolean;
}

interface RawHashtag {
  id?: number;
  name?: string | null;
  tag?: string | null;
  videos_count?: number;
  posts_count?: number;
}

interface RawSound {
  id: number;
  title?: string | null;
  artist?: string | null;
  artist_name?: string | null;
  cover_image?: string | null;
  cover_url?: string | null;
  reels_count?: number;
  videos_count?: number;
}

const toUser = (d: RawUser): SearchUser => ({
  id: Number(d.id),
  username: d.username,
  name: d.name ?? null,
  avatar: d.avatar ?? null,
  is_verified: d.is_verified ?? d.verified ?? false,
  followers_count: d.followers_count ?? 0,
  is_following: d.is_following,
  has_story: d.has_story,
  has_unseen: d.has_unseen,
});

/** Tags are stored bare, so a leading "#" is stripped here rather than at each
 *  call site - searching for "#food" matches nothing, "food" matches the tag. */
const toHashtag = (d: RawHashtag): SearchHashtag => ({
  id: d.id,
  name: String(d.name ?? d.tag ?? "").replace(/^#/, ""),
  videos_count: d.videos_count ?? d.posts_count ?? 0,
});

const toSound = (d: RawSound): SearchSound => ({
  id: Number(d.id),
  title: d.title ?? null,
  artist_name: d.artist_name ?? d.artist ?? null,
  cover_url: d.cover_url ?? d.cover_image ?? null,
  videos_count: d.videos_count ?? d.reels_count ?? 0,
});

/** Shortest query the endpoint accepts. Anything less is a 422, which must not
 *  be shown as an outage - the caller simply should not ask yet. */
export const MIN_QUERY_LENGTH = 2;

/** Meilisearch is proxied, so a 503 here means the index is down - not that the
 *  query had no matches. Callers should say so rather than showing "no results". */
export const searchApi = {
  /** Top hashtags by video count - GET /explore/hashtags. Server-cached for an
   *  hour, so this is cheap to show on every empty search. */
  trendingHashtags: () =>
    api
      .get<{ success: boolean; data: RawHashtag[] }>("/explore/hashtags")
      .then((r) => (r.data.data ?? []).map(toHashtag)),

  /**
   * Every video tagged with one hashtag - GET /explore/hashtags/{name}.
   *
   * This is a real tag lookup (it joins video_hashtags) rather than the text
   * match /search does, so it finds posts whose caption never spells the tag
   * out. Callers should treat an empty result as "fall back to the text
   * search": the pivot table is not currently populated for every video, so
   * this can legitimately return nothing for a tag that clearly has posts.
   */
  hashtagVideos: (name: string, page = 1) =>
    api
      .get<{ success: boolean; data: Video[] }>(
        `/explore/hashtags/${encodeURIComponent(name.replace(/^#/, ""))}`,
        { params: { page } },
      )
      .then((r) => r.data.data ?? [])
      .catch(() => [] as Video[]),

  query: (q: string, type: SearchType = "all", limit = 20) =>
    api
      .get<{ success: boolean; data: Partial<Record<keyof SearchResults, unknown[]>> }>("/search", {
        params: { q, type, limit },
      })
      .then((r): SearchResults => {
        const d = r.data.data ?? {};
        return {
          users: ((d.users ?? []) as RawUser[]).map(toUser),
          videos: (d.videos ?? []) as Video[],
          hashtags: ((d.hashtags ?? []) as RawHashtag[]).map(toHashtag),
          sounds: ((d.sounds ?? []) as RawSound[]).map(toSound),
        };
      }),
};
