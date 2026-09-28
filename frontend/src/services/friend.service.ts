import { api } from "./api";
import type { ApiResponse, Paginated } from "@/types/api";
import type { ReelsooUser } from "@/types/user";

export const friendService = {
  /** People who follow {username}. Each item includes `is_following` (does the auth user follow them back). */
  async followers(username: string, page = 1, perPage = 30) {
    const { data } = await api.get<Paginated<ReelsooUser>>(
      `/users/${username}/followers`,
      { params: { page, per_page: perPage } },
    );
    return data;
  },

  /** People {username} follows. */
  async following(username: string, page = 1, perPage = 30) {
    const { data } = await api.get<Paginated<ReelsooUser>>(
      `/users/${username}/following`,
      { params: { page, per_page: perPage } },
    );
    return data;
  },

  /** Suggested users to follow (auth required). */
  async suggestions() {
    const { data } = await api.get<ApiResponse<ReelsooUser[]>>("/users/suggestions");
    return data.data ?? [];
  },

  /** Blocked users list for the auth user. */
  async blocked(page = 1) {
    const { data } = await api.get<Paginated<ReelsooUser>>("/users/blocked", {
      params: { page },
    });
    return data;
  },

  /** Search users by name/username. */
  async search(q: string) {
    if (!q.trim()) return [];
    const { data } = await api.get<ApiResponse<ReelsooUser[]>>("/users/search", {
      params: { q: q.trim() },
    });
    return data.data ?? [];
  },

  async follow(username: string) {
    const { data } = await api.post<{ success: boolean; following: boolean; followers_count?: number }>(
      `/users/${username}/follow`,
    );
    return data;
  },

  async unfollow(username: string) {
    const { data } = await api.delete<{ success: boolean; following: boolean; followers_count?: number }>(
      `/users/${username}/follow`,
    );
    return data;
  },

  async block(username: string) {
    await api.post(`/users/${username}/block`);
  },

  async unblock(username: string) {
    await api.delete(`/users/${username}/block`);
  },
};
