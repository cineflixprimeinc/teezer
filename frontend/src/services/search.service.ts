import { api } from "./api";

export type SearchUser = {
  id: number;
  name: string;
  username: string;
  avatar: string | null;
  verified: boolean;
  followers_count: number;
  bio: string | null;
  category: string | null;
};

export type SearchVideo = {
  id: number;
  title: string | null;
  caption: string | null;
  thumbnail_url: string | null;
  user_id: number;
  username: string;
  views_count: number;
  likes_count: number;
  hashtags: string[];
  created_at: string;
};

export type SearchHashtag = {
  id: number;
  tag: string;
  posts_count: number;
  trending_score: number;
};

export type SearchSound = {
  id: number;
  title: string;
  artist: string | null;
  reels_count: number;
  cover_image: string | null;
};

export type SearchResults = {
  users?: SearchUser[];
  videos?: SearchVideo[];
  hashtags?: SearchHashtag[];
  sounds?: SearchSound[];
};

type SearchResponse = {
  success: boolean;
  data: SearchResults;
};

export const searchService = {
  async search(
    q: string,
    type: "all" | "users" | "videos" | "hashtags" | "sounds" = "all",
  ): Promise<SearchResults> {
    const { data } = await api.get<SearchResponse>("/search", {
      params: { q, type },
    });
    return data.data;
  },
};
