import { api } from "./api";
import type { ApiResponse, Paginated } from "@/types/api";
import type { TeezerUser, TeezerHighlight } from "@/types/user";
import type { TeezerVideo } from "@/types/video";

export type VideoSort = "latest" | "oldest" | "most_viewed" | "most_likes";

export type FollowRequest = {
  id: number;
  created_at: string;
  user: {
    id: number;
    name: string;
    username: string;
    avatar: string | null;
    is_verified: boolean;
    bio: string | null;
    followers_count: number;
  };
};

export const userService = {
  async profile(username: string) {
    const { data } = await api.get<ApiResponse<TeezerUser>>(`/users/${username}`);
    return data.data;
  },
  async videos(username: string, sort: VideoSort = "latest") {
    const { data } = await api.get<Paginated<TeezerVideo>>(`/users/${username}/videos`, {
      params: { sort },
    });
    return data;
  },
  async suggestions() {
    const { data } = await api.get<ApiResponse<TeezerUser[]>>("/users/suggestions");
    return data.data;
  },
  async follow(username: string) {
    const { data } = await api.post<{
      success: boolean;
      following: boolean;
      follow_status: "accepted" | "pending";
      followers_count?: number;
    }>(`/users/${username}/follow`);
    return data;
  },
  async unfollow(username: string) {
    const { data } = await api.delete<{
      success: boolean;
      following: boolean;
      follow_status: "none";
      followers_count?: number;
    }>(`/users/${username}/follow`);
    return data;
  },
  async followRequests(): Promise<FollowRequest[]> {
    const { data } = await api.get<ApiResponse<FollowRequest[]>>("/users/follow-requests");
    return data.data;
  },
  async acceptFollowRequest(id: number): Promise<void> {
    await api.post(`/users/follow-requests/${id}/accept`);
  },
  async declineFollowRequest(id: number): Promise<void> {
    await api.post(`/users/follow-requests/${id}/decline`);
  },
  async liked(username: string, page = 1) {
    const { data } = await api.get<Paginated<TeezerVideo>>(`/users/${username}/liked`, { params: { page } });
    return data;
  },
  async followers(username: string, page = 1) {
    const { data } = await api.get<Paginated<TeezerUser>>(`/users/${username}/followers`, { params: { page } });
    return data;
  },
  async following(username: string, page = 1) {
    const { data } = await api.get<Paginated<TeezerUser>>(`/users/${username}/following`, { params: { page } });
    return data;
  },
  async saved(username: string, page = 1) {
    const { data } = await api.get<Paginated<TeezerVideo>>(`/users/${username}/saved`, { params: { page } });
    return data;
  },
  async savedCount(username: string): Promise<{ count: number | null; privacy: string }> {
    const { data } = await api.get(`/users/${username}/saved/count`);
    return data;
  },
  async updateSavedPrivacy(privacy: "private" | "followers" | "public"): Promise<void> {
    await api.patch("/profile/saved-privacy", { saved_privacy: privacy });
  },
  async drafts(username: string) {
    const { data } = await api.get<Paginated<TeezerVideo>>(`/users/${username}/drafts`);
    return data;
  },
  async highlights() {
    const { data } = await api.get<ApiResponse<TeezerHighlight[]>>("/profile/highlights");
    return data.data;
  },
};
