import { api } from "./api";

export type TrendingHashtag = {
  id:               number;
  hashtag:          string;   // "#love"
  name:             string;   // "love"
  count:            number;
  display_count:    string;   // "2.6M posts"
  trend_direction:  "up" | "flat" | "down";
};

type TrendingResponse = {
  success: boolean;
  data:    TrendingHashtag[];
  meta?:   { days: number; limit: number; returned: number };
};

export const hashtagService = {
  async trending(params: { days?: number; limit?: number } = {}) {
    const { data } = await api.get<TrendingResponse>("/hashtags/trending", {
      params: { days: params.days ?? 7, limit: params.limit ?? 8 },
    });
    return data.data;
  },
};
