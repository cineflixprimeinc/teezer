import { api } from "./client";

/**
 * The Friends tab's activity timeline - GET /friends/activity.
 *
 * The server merges three real tables (videos, stories, live spaces) from the
 * people you follow into one newest-first list; there is no activity log
 * behind it, so nothing here can describe an event that did not happen.
 *
 * Likes, comments and follows are deliberately absent - see the controller.
 */

export type FriendUser = {
  id: string;
  name: string;
  username: string;
  /** Already an absolute URL (the API runs stored keys through Storage::url). */
  avatar: string | null;
  verified: boolean;
};

/** What the friend did. Drives the badge on their avatar and the row's trailing slot. */
export type ActivityKind = "video" | "story" | "live";

export type FriendActivity = {
  /** Unique across the three source tables ("video-12", "story-3", "space-9"). */
  id: string;
  kind: ActivityKind;
  user: FriendUser;
  created_at: string | null;
  /** Present on `video` rows - the row shows this as a poster thumbnail. */
  video: { id: string; thumbnail: string | null } | null;
  /** Present on `live` rows - the row shows a Join button instead. */
  space: { id: string; title: string; listening: number } | null;
};

/** A friend seated in a live public room right now. */
export type FriendInSpace = {
  user_id: string;
  space_id: string;
  title: string;
  role: "host" | "speaker" | "listener";
};

export type FriendsActivityResponse = {
  activity: FriendActivity[];
  in_space: FriendInSpace[];
};

export const friendsApi = {
  activity: async (): Promise<FriendsActivityResponse> => {
    const r = (await api.get("/friends/activity")).data.data;
    return { activity: r?.activity ?? [], in_space: r?.in_space ?? [] };
  },
};
