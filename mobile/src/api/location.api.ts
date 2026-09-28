import { api } from "./client";
import type { Video, Paginated } from "@/types";

/**
 * Location search/save - same backend the website uses, geocoded by OpenStreetMap
 * Nominatim server-side. Coordinates are never exposed to the client by /search.
 */
export interface LocationResult {
  formatted: string;
  city: string | null;
  region: string | null;
  country: string | null;
  country_code: string;
}

export interface SavedLocation {
  local_location: string | null;
  city_name: string | null;
  region_name: string | null;
  country_name: string | null;
  country_code: string | null;
  location_source: string;
  location_updated_at: string | null;
}

/** Same slugify the website's own locationSlug() (frontend/src/lib/utils.ts)
 *  uses, so a slug built here resolves against the same backend rows
 *  (LocationFeedController::resolveSlug compares via PHP's Str::slug,
 *  which agrees with this for the plain ASCII place names Teezer's
 *  location search actually returns). */
export function locationSlug(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface LocationHeader {
  slug: string;
  display_name: string;
  name: string;
  region: string | null;
  posts_count: number;
  views_count: number;
  creators_count: number;
}

export interface LocationAbout {
  busiest_month: { label: string; posts: number } | null;
  /** Hour of day, 0-23, when most posts from here were UPLOADED - which is not
   *  the same as when they are watched, and is labelled that way in the UI. */
  peak_hour: { hour: number; posts: number } | null;
  top_topics: string[];
}

export interface NearbyPlace {
  slug: string;
  display_name: string;
  name: string;
  posts_count: number;
}

export interface LocationVideosResponse extends Paginated<Video> {
  location: LocationHeader | null;
}

export const locationApi = {
  /** GET /locations/{slug}/videos - every published post manually tagged
   *  with this exact location string. Same endpoint and params the
   *  website's own /location/[slug] page already uses. */
  videos: (slug: string, page = 1, opts?: { type?: string; sort?: string; time?: string }) =>
    api
      .get<LocationVideosResponse>(`/locations/${encodeURIComponent(slug)}/videos`, {
        params: { page, per_page: 24, type: opts?.type ?? "all", sort: opts?.sort ?? "popular", time: opts?.time ?? "all" },
      })
      .then((r) => r.data),


  /** GET /locations/{slug}/about - figures for the About tab, all derived
   *  from posts actually tagged with this place. Fields are nullable: a place
   *  with no hashtags has no topics, and the client omits what is missing
   *  rather than showing a placeholder. */
  about: (slug: string) =>
    api
      .get<{ success: boolean; data: LocationAbout | null }>(`/locations/${encodeURIComponent(slug)}/about`)
      .then((r) => r.data.data),

  /** GET /locations/{slug}/nearby-places - other places posted from in the
   *  same country, busiest first. "Nearby" is by country, not radius: these
   *  locations are free text with no coordinates, so there is nothing to
   *  measure a distance against. */
  nearbyPlaces: (slug: string) =>
    api
      .get<{ success: boolean; data: NearbyPlace[] }>(`/locations/${encodeURIComponent(slug)}/nearby-places`)
      .then((r) => r.data.data ?? []),

  search: (q: string, country?: string) =>
    api
      .get<{ success: boolean; data: LocationResult[] }>("/location/search", {
        params: { q, ...(country ? { country } : {}) },
      })
      .then((r) => r.data.data ?? []),

  save: (r: LocationResult) =>
    api
      .post<{ success: boolean; data: SavedLocation }>("/location/save", {
        local_location: r.formatted,
        city_name: r.city,
        region_name: r.region,
        country_name: r.country,
        country_code: r.country_code,
        source: "nominatim",
      })
      .then((res) => res.data.data),

  me: () => api.get<{ success: boolean; data: SavedLocation }>("/location/me").then((r) => r.data.data),
};
