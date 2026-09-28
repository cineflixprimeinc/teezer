import { api } from "./client";
import type { Video } from "@/types";

/**
 * The feed lists. Rebuilt after the strip removed the old feed.api.
 *
 * Routes are the Laravel ones in server/routes/api.php:
 *   GET /feed/for-you   FeedController@forYou
 *   GET /feed/country   FeedController@country  (country resolved server-side)
 *   GET /videos/feed    VideoController@feed    (following)
 *
 * All three are public - guests get a feed too - so none of these require a
 * token and none should be gated on auth.
 */

export type FeedMeta = {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  next_page_url: string | null;
  /** Only the country tab returns these. */
  country_code?: string | null;
  country_name?: string | null;
};

export type FeedPage = { data: Video[]; meta: FeedMeta };

const EMPTY_META: FeedMeta = {
  current_page: 1,
  last_page: 1,
  per_page: 8,
  total: 0,
  next_page_url: null,
};

/** Normalise: the endpoints agree on `{data, meta}`, but an error path can omit meta. */
function toPage(payload: { data?: Video[]; meta?: Partial<FeedMeta> }): FeedPage {
  return {
    data: payload.data ?? [],
    meta: { ...EMPTY_META, ...(payload.meta ?? {}) },
  };
}

export type FeedTabKey = "for-you" | "country" | "following";

export const feedApi = {
  forYou: (page = 1, perPage = 8): Promise<FeedPage> =>
    api
      .get<{ success: boolean; data: Video[]; meta: FeedMeta }>("/feed/for-you", {
        params: { page, per_page: perPage },
      })
      .then((r) => toPage(r.data)),

  /**
   * `gpsCountry` is an optional device-GPS-derived ISO country hint (see
   * CountryDetectionService) - the server only ever consults it when the
   * viewer has no account country of their own; it can never override one.
   */
  country: (page = 1, perPage = 8, gpsCountry?: string | null): Promise<FeedPage> =>
    api
      .get<{ success: boolean; data: Video[]; meta: FeedMeta }>("/feed/country", {
        params: { page, per_page: perPage, ...(gpsCountry ? { gps_country: gpsCountry } : {}) },
      })
      .then((r) => toPage(r.data)),

  /** Videos from accounts you follow. Empty for guests, by design. */
  following: (page = 1, perPage = 8): Promise<FeedPage> =>
    api
      .get<{ success: boolean; data: Video[]; meta: FeedMeta }>("/videos/feed", {
        params: { page, per_page: perPage },
      })
      .then((r) => toPage(r.data)),

  byTab: (tab: FeedTabKey, page = 1, perPage = 8, gpsCountry?: string | null): Promise<FeedPage> =>
    tab === "country"
      ? feedApi.country(page, perPage, gpsCountry)
      : tab === "following"
        ? feedApi.following(page, perPage)
        : feedApi.forYou(page, perPage),
};
