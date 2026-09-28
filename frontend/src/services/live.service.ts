import { api } from "./api";

/**
 * The Live page's data - GET /spaces.
 *
 * Teezer has no live-VIDEO backend: there is no streams table, no stream
 * routes and no playback URL anywhere. What it does have is Spaces - live
 * AUDIO rooms with a real host, a real listener count, a topic and real
 * participants - so that is what this page lists. Every number on the page is
 * a fact from this endpoint; nothing is estimated or filled in.
 *
 * The server sends facts only. Anything that is a look rather than a fact -
 * which tint stands in for cover art, which glyph a topic wears - is decided
 * on the client, next to the markup that uses it.
 */

export type SpaceUser = {
  name: string;
  username: string;
  /** Already an absolute URL - the API runs stored keys through Storage::url. */
  avatar: string | null;
  verified: boolean;
};

/** A room that is open right now. */
export type HappeningSpace = {
  id: string;
  title: string;
  description: string;
  topic: string | null;
  listening: number;
  speakers_count: number;
  host: SpaceUser | null;
  /** Host first, then speakers - up to 3, for the overlapping face stack. */
  speakers: { id: string; name: string; avatar: string | null }[];
  /** ISO8601 - when the room opened, for the elapsed clock. */
  started_at?: string | null;
};

/** A room that has not opened yet. */
export type ScheduledSpace = {
  id: string;
  title: string;
  description: string;
  topic: string | null;
  host: SpaceUser | null;
  scheduled_for: string | null;
  going: number;
  reminded: boolean;
};

export type SpacesResponse = {
  happening: HappeningSpace[];
  scheduled: ScheduledSpace[];
  has_more_live?: boolean;
};

export type SpacesQuery = {
  q?: string;
  topic?: string;
  page?: number;
};

export const liveService = {
  /** Open rooms + what is scheduled next, in one request. */
  list: async (params?: SpacesQuery): Promise<SpacesResponse> => {
    const r = (await api.get("/spaces", { params })).data?.data ?? {};
    return {
      happening: r.happening ?? [],
      scheduled: r.scheduled ?? [],
      has_more_live: r.has_more_live ?? false,
    };
  },
};
