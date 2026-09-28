import { api } from "./client";

/* ── The music library.
   There is no API Resource behind /music, so the JSON field names ARE the
   music_tracks columns - `artist_name`, not `artist`. (The legacy /audio
   endpoints use `artist`; the two are different tables and must not be mixed.)

   The server hard-scopes the library to source_type=library, status=published
   and show_in_studio=true, so nothing unpublished or user-original can leak in
   here. `original` tracks are user sounds lifted off a video upload. ── */
export type MusicTrack = {
  id: number;
  title: string | null;
  artist_name: string | null;
  album: string | null;
  genre: string | null;
  mood: string | null;
  language: string | null;
  /** Seconds. */
  duration: number | null;
  cover_url: string | null;
  audio_url: string | null;
  bpm: number | null;
  music_key: string | null;
  isrc: string | null;
  license_type: string | null;
  description: string | null;
  release_date: string | null;
  plays_count: number;
  uses_count: number;
  featured: boolean;
  recommended: boolean;
  allow_reels: boolean;
  allow_stories: boolean;
  explicit_content: boolean;
  /** Set when a Teezer admin uploaded it - one half of the "Teezer Original" test. */
  created_by_admin_id: number | null;
  source_type: "library" | "original";
  created_at: string;
  /** Only on GET /music/{id}. */
  videos_count?: number;
  /** Whether the CALLER saved this sound. Absent for a signed-out request -
   *  /music/library is optional-auth - so read it as `?? false`, never as a
   *  tri-state. */
  is_favorited?: boolean;
};

/** Laravel paginator, returned raw under `data`. */
export type MusicPage = {
  data: MusicTrack[];
  total: number;
  per_page: number;
  current_page: number;
  last_page: number;
};

export type MusicQuery = {
  search?: string;
  mood?: string;
  genre?: string;
  language?: string;
  /** short <60s · medium 60-180 · long 181-300 · very_long >300 */
  duration?: "short" | "medium" | "long" | "very_long";
  usage_rights?: string;
  /** Drives BOTH scope and sort server-side - see the controller's match block. */
  category?: string;
  page?: number;
};

export const musicApi = {
  /** GET /music/library - paginated 20 per page, server-side. */
  library: (params: MusicQuery = {}) =>
    api
      .get<{ success: boolean; data: MusicPage }>("/music/library", { params })
      .then((r) => r.data.data),

  /** GET /music/trending - flat top-10 by plays, not paginated. */
  trending: () =>
    api.get<{ success: boolean; data: MusicTrack[] }>("/music/trending").then((r) => r.data.data),

  /** GET /music/{id} - the only place a signed audio_url is minted for an
   *  `original` track, so play those from here rather than from a list row. */
  detail: (id: number) =>
    api.get<{ success: boolean; data: MusicTrack }>(`/music/${id}`).then((r) => r.data.data),

  /** POST /music/{id}/play - the website never calls this, so its plays_count
   *  only moves from other surfaces. We do log it. */
  logPlay: (id: number, source = "studio") =>
    api.post<{ success: boolean }>(`/music/${id}/play`, { source }).then((r) => r.data),

  /** GET /music/favorites - the caller's saved sounds, newest save first. */
  favorites: (page = 1) =>
    api
      .get<{ success: boolean; data: MusicPage }>("/music/favorites", { params: { page } })
      .then((r) => r.data.data),

  /** POST /music/{id}/favorite - one endpoint for both directions; resolves to
   *  the sound's NEW saved state, so the caller never has to guess which way
   *  the toggle went. */
  toggleFavorite: (id: number) =>
    api
      .post<{ success: boolean; data: { saved: boolean } }>(`/music/${id}/favorite`)
      .then((r) => r.data.data.saved),

  /** POST /music/{id}/use - records the track against a piece of content. */
  logUse: (id: number, opts: { content_id?: number; content_type?: "reel" | "video" | "story" | "photo" } = {}) =>
    api.post<{ success: boolean }>(`/music/${id}/use`, opts).then((r) => r.data),
};

/** True when the track is Teezer's own, by the website's exact test. */
export const isTeezerOriginal = (t: MusicTrack): boolean =>
  !!t.created_by_admin_id || (t.artist_name?.toLowerCase().includes("teezer") ?? false);

/** "3:07". Null duration reads as "--:--" rather than "0:00", which would be a lie. */
export function fmtTrackTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Posts using a sound, for the sound sheet and sound page.
 *
 * The backend route already existed (MusicLibraryController::videos, wired at
 * GET /music/{id}/videos) - it simply had no mobile client, which is why the
 * sheet's grid was empty.
 *
 * `total` comes from the paginator's meta, NOT the returned array: the grid
 * shows one page but the header has to say how many posts exist overall.
 */
export interface SoundVideosResult {
  /** Loosely typed on purpose - the caller maps only thumbnail/views/user. */
  videos: any[];
  total: number;
}

export async function fetchSoundVideos(
  musicTrackId: number,
  limit = 21,
): Promise<SoundVideosResult> {
  try {
    // sort=popular is the controller's default (by views), which is what the
    // grid wants - best-performing posts first.
    const { data } = await api.get(`/music/${musicTrackId}/videos`, {
      params: { limit, sort: "popular" },
    });
    /*
     * Two shapes, both seen in the wild.
     *
     * The controller returns `'data' => VideoResource::collection($paginator)`.
     * Unwrapped that serialises to a flat array, but when Laravel's resource
     * wrapping is on it nests again as { data: [...], links, meta } - so
     * `data.data` is an OBJECT, not an array. That is exactly the failure this
     * had: meta.total parsed fine ("1 posts" rendered) while the grid stayed
     * empty, because Array.isArray() rejected the object and fell back to [].
     */
    const payload = data?.data;
    const list = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data)
        ? payload.data
        : [];

    return {
      videos: list,
      // meta can sit at either level for the same reason.
      total: Number(data?.meta?.total ?? payload?.meta?.total ?? list.length ?? 0),
    };
  } catch {
    // An empty grid, never an error: the sheet is context, not the reason the
    // user opened the app.
    return { videos: [], total: 0 };
  }
}
