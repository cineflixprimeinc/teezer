import { api } from "./api";

export type TrendingHashtag = {
  hashtag: string;
  name: string;
  posts_count: number;
  display_count: string;
  trend_label: string;
  score?: number;
  scope?: "country" | "global";
};

export type TrendingHashtagsResponse = {
  success: boolean;
  country: string;
  country_code: string | null;
  items: TrendingHashtag[];
  meta?: { days: number; limit: number };
};

export const trendingService = {
  async hashtags(params: { countryCode?: string | null; limit?: number } = {}) {
    const { data } = await api.get<TrendingHashtagsResponse>("/feed/trending-hashtags", {
      params: {
        country_code: params.countryCode || undefined,
        limit: Math.min(params.limit ?? 5, 10),
      },
    });
    return data;
  },
};
