import { api } from "./api";
import type { ReelsooVideo } from "@/types/video";

export type AudioTrack = {
  id: number;
  title: string;
  artist: string | null;
  cover_url: string | null;
  audio_url: string;
  duration: number | null;
  usage_count: number;
  mood: string | null;
  genre: string | null;
  usage_rights: string | null;
  is_original: boolean;
  is_favorited?: boolean;
  uses_count?: number;
  user_id: number | null;
  created_at: string;
  updated_at: string;
  // Extended metadata
  language?: string | null;
  bpm?: number | null;
  music_key?: string | null;
  isrc?: string | null;
  copyright_owner?: string | null;
  license_type?: string | null;
  description?: string | null;
  album?: string | null;
  release_date?: string | null;
  explicit_content?: boolean;
  allow_reels?: boolean;
  allow_stories?: boolean;
  featured?: boolean;
  recommended?: boolean;
  plays_count?: number;
  created_by_admin_id?: number | null;
};

export type MusicTrackDetail = {
  id: number;
  title: string;
  artist_name: string | null;
  cover_url: string | null;
  audio_url: string | null;
  duration: number | null;
  uses_count: number;
  videos_count?: number;
  mood: string | null;
  genre: string | null;
  description: string | null;
  source_type?: "library" | "original";
  source_video_id?: number | null;
  uploader?: {
    id: number;
    username: string;
    name: string | null;
    is_verified: boolean;
    avatar: string | null;
  } | null;
};

export type MusicVideosResponse = {
  success: boolean;
  data: ReelsooVideo[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    next_page_url: string | null;
  };
};

export type AudioTracksResponse = {
  success: boolean;
  data: {
    data: AudioTrack[];
    total: number;
    per_page: number;
    current_page: number;
    last_page: number;
  };
};

export const audioService = {
  // Legacy audio_tracks endpoints (kept for backward compat)
  async getTracks(params?: {
    search?: string;
    mood?: string;
    genre?: string;
    duration?: string;
    usage_rights?: string;
    category?: string;
    page?: number;
  }): Promise<AudioTracksResponse> {
    // Try new music library first, fall back to legacy audio endpoint
    try {
      const { data } = await api.get("/music/library", { params });
      // Normalize response shape from music_tracks to AudioTrack
      if (data?.data) {
        const page = data.data;
        const items: AudioTrack[] = (page?.data ?? page ?? []).map((t: Record<string, unknown>) => ({
          id:                  t.id as number,
          title:               t.title as string,
          artist:              (t.artist_name ?? t.artist ?? null) as string | null,
          cover_url:           t.cover_url as string | null,
          audio_url:           (t.audio_url ?? "") as string,
          duration:            t.duration as number | null,
          usage_count:         (t.plays_count ?? t.usage_count ?? 0) as number,
          mood:                t.mood as string | null,
          genre:               t.genre as string | null,
          usage_rights:        (t.license_type ?? t.usage_rights ?? null) as string | null,
          is_original:         false,
          is_favorited:        (t.is_favorited ?? false) as boolean,
          uses_count:          (t.uses_count ?? 0) as number,
          user_id:             null,
          created_at:          t.created_at as string,
          updated_at:          t.updated_at as string,
          language:            (t.language ?? null) as string | null,
          bpm:                 (t.bpm ?? null) as number | null,
          music_key:           (t.music_key ?? null) as string | null,
          isrc:                (t.isrc ?? null) as string | null,
          copyright_owner:     (t.copyright_owner ?? null) as string | null,
          license_type:        (t.license_type ?? null) as string | null,
          description:         (t.description ?? null) as string | null,
          album:               (t.album ?? null) as string | null,
          release_date:        (t.release_date ?? null) as string | null,
          explicit_content:    (t.explicit_content ?? false) as boolean,
          allow_reels:         (t.allow_reels ?? true) as boolean,
          allow_stories:       (t.allow_stories ?? true) as boolean,
          featured:            (t.featured ?? false) as boolean,
          recommended:         (t.recommended ?? false) as boolean,
          plays_count:         (t.plays_count ?? 0) as number,
          created_by_admin_id: (t.created_by_admin_id ?? null) as number | null,
        }));
        return {
          success: true,
          data: { data: items, total: page?.total ?? items.length, per_page: page?.per_page ?? 20, current_page: page?.current_page ?? 1, last_page: page?.last_page ?? 1 },
        };
      }
    } catch {
      // Fall back to legacy
    }
    const { data } = await api.get("/audio", { params });
    return data;
  },

  // New music library endpoint (used by studio)
  async getMusicLibrary(params?: {
    search?: string;
    mood?: string;
    genre?: string;
    duration?: string;
    category?: string;
    page?: number;
  }): Promise<AudioTracksResponse> {
    const { data } = await api.get("/music/library", { params });
    return data;
  },

  async getTrending(): Promise<{ success: boolean; data: AudioTrack[] }> {
    try {
      const { data } = await api.get("/music/trending");
      if (data?.data) return data;
    } catch { /* fall back */ }
    const { data } = await api.get("/audio/trending");
    return data;
  },

  async getWeeklyPopular(limit = 5): Promise<{ id: number; title: string; artist_name?: string | null; cover_url?: string | null; plays_count: number; week_plays?: number }[]> {
    try {
      const { data } = await api.get("/music/weekly-popular", { params: { limit } });
      return data?.data ?? [];
    } catch {
      return [];
    }
  },

  async getMyOriginalSounds(): Promise<{ success: boolean; data: AudioTrack[] }> {
    const { data } = await api.get("/audio/my-sounds");
    return data;
  },

  async getFavorites(): Promise<{ success: boolean; data: AudioTrack[] }> {
    const { data } = await api.get("/audio/favorites");
    return data;
  },

  async toggleFavorite(id: number): Promise<{ success: boolean; favorited: boolean }> {
    const { data } = await api.post(`/audio/${id}/favorite`);
    return data;
  },

  // Log a play to new music system
  async logPlay(id: number, source = "studio"): Promise<void> {
    try { await api.post(`/music/${id}/play`, { source }); } catch { /* non-critical */ }
  },

  // Log music usage when user selects track for content
  async logUsage(id: number, contentType?: string): Promise<void> {
    try { await api.post(`/music/${id}/use`, { content_type: contentType }); } catch { /* non-critical */ }
  },

  // Music detail page
  async getMusicDetail(id: number): Promise<{ success: boolean; data: MusicTrackDetail }> {
    const { data } = await api.get(`/music/${id}`);
    return data;
  },

  async getMusicVideos(
    id: number,
    sort: "popular" | "recent" | "likes" = "popular",
    page = 1,
    limit = 20,
  ): Promise<MusicVideosResponse> {
    const { data } = await api.get(`/music/${id}/videos`, { params: { sort, page, limit } });
    return data;
  },
};
