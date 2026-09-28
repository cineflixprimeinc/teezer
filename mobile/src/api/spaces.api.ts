import { api } from "./client";

/**
 * Spaces (live audio rooms) - GET /spaces feeds the whole Spaces tab in one
 * request: the featured room and the suggested list under it.
 *
 * The server sends facts only. Anything that is a look rather than a fact -
 * which gradient rings a speaker's avatar, which tint stands in for cover art,
 * which glyph a topic wears - is decided on this side, in sample-spaces.ts.
 */

export type SpaceRole = "speaker" | "listener";

export type SpaceUser = {
  name: string;
  username: string;
  /** Already an absolute URL (the API runs stored keys through Storage::url). */
  avatar: string | null;
  verified: boolean;
};

export type SpaceParticipant = {
  id: string;
  name: string;
  avatar: string | null;
  role: SpaceRole;
  verified: boolean;
  muted: boolean;
};

export type LiveSpace = {
  id: string;
  title: string;
  description: string;
  topic: string | null;
  listening: number;
  host: SpaceUser | null;
  participants: SpaceParticipant[];
};

export type SuggestedSpace = {
  id: string;
  title: string;
  description: string;
  topic: string | null;
  listening: number;
  host: SpaceUser | null;
  /** Up to 3 avatars for the stack on the row. */
  preview: { id: string; avatar: string | null }[];
  /** Everyone the row could not fit an avatar for - the "+N" pill. */
  others: number;
};

/** A card under "Happening now" - a live room and the faces on stage. */
export type HappeningSpace = {
  id: string;
  title: string;
  description: string;
  topic: string | null;
  listening: number;
  speakers_count: number;
  host: SpaceUser | null;
  /** Host first, then speakers - up to 3, for the overlapping stack. */
  speakers: { id: string; name: string; avatar: string | null }[];
};

/** A row under "Scheduled" - a room that has not opened yet. */
export type ScheduledSpace = {
  id: string;
  title: string;
  description: string;
  topic: string | null;
  host: SpaceUser | null;
  /** ISO8601; formatted in the device's timezone, not the server's. */
  scheduled_for: string | null;
  going: number;
  /** Whether I have already tapped Remind (always false for a guest). */
  reminded: boolean;
};

/** A row under "Replays" - an ended room with a recording left to hear. */
export type ReplaySpace = {
  id: string;
  title: string;
  topic: string | null;
  host: SpaceUser | null;
  duration_minutes: number | null;
  plays: number;
  recording_url: string | null;
  ended_at: string | null;
};

export type SpacesResponse = {
  /** The Explore tab's "Live spaces" rail still reads these two. */
  featured: LiveSpace | null;
  suggested: SuggestedSpace[];
  /** The Spaces tab's three sections. */
  live: HappeningSpace[];
  scheduled: ScheduledSpace[];
  replays: ReplaySpace[];
  /** Every live room, not just the filtered page - the header's "N LIVE". */
  live_count: number;
  /** Which page of "Happening now" this response holds. */
  live_page: number;
  /** Whether another `live_page` exists to load. */
  live_has_more: boolean;
};

/** What the filter sheet sends. Anything left at its default is simply omitted. */
export type SpacesQuery = {
  topic?: string;
  q?: string;
  sort?: "listeners" | "newest";
  language?: string;
  size?: "any" | "small" | "medium" | "large";
  following?: boolean;
  recorded?: boolean;
  open_mic?: boolean;
  /** Page of the "Happening now" list specifically - the one section that can
   *  plausibly run past one page of rooms. Scheduled/Replays stay single-page. */
  live_page?: number;
};

export const spacesApi = {
  index: async (params?: SpacesQuery): Promise<SpacesResponse> => {
    const r = (await api.get("/spaces", { params })).data.data;
    // Older builds of the endpoint sent only featured/suggested; defaulting here
    // keeps the screen rendering rather than throwing if it meets one.
    return {
      featured: r.featured ?? null,
      suggested: r.suggested ?? [],
      live: r.live ?? [],
      scheduled: r.scheduled ?? [],
      replays: r.replays ?? [],
      live_count: r.live_count ?? 0,
      live_page: r.live_page ?? 1,
      live_has_more: r.live_has_more ?? false,
    };
  },

  /** Toggle "Remind me" on a scheduled room. Returns the row's new state. */
  remind: async (id: string): Promise<{ reminded: boolean; going: number }> =>
    (await api.post(`/spaces/${id}/remind`)).data.data,

  /** Count a replay play and get the recording back. */
  playReplay: async (id: string): Promise<{ recording_url: string; plays: number }> =>
    (await api.post(`/spaces/${id}/replay`)).data.data,
};

/* ── the Spaces settings sheet ───────────────────────────────────────── */

export type SpacesInvitesFrom = "everyone" | "following" | "no_one";
export type SpacesAudioQuality = "standard" | "high" | "ultra";

export type SpacesPreferences = {
  notify_live_from_following: boolean;
  notify_scheduled_reminders: boolean;
  notify_speaker_invites: boolean;
  join_muted: boolean;
  show_listening_activity: boolean;
  allow_invites_from: SpacesInvitesFrom;
  default_audio_quality: SpacesAudioQuality;
  record_by_default: boolean;
};

export const spacesPrefsApi = {
  get: async (): Promise<SpacesPreferences> =>
    (await api.get("/profile/spaces-preferences")).data.data,

  update: async (patch: Partial<SpacesPreferences>): Promise<SpacesPreferences> =>
    (await api.patch("/profile/spaces-preferences", patch)).data.data,
};

/* ── inside a room ───────────────────────────────────────────────────── */

export type SpaceSeat = {
  id: string;
  /** The user this seat belongs to - the target for moderation actions. */
  user_id: string;
  name: string;
  username: string | null;
  avatar: string | null;
  verified: boolean;
  role: "host" | "speaker" | "listener";
  muted: boolean;
  /** A moderator (host aside) - drives the badge + which mod actions apply. */
  is_moderator: boolean;
  /** Whether there is actually a track on the SFU to subscribe to. */
  publishing: boolean;
};

export type SpaceRoom = {
  id: string;
  title: string;
  description: string;
  topic: string | null;
  status: "scheduled" | "live" | "ended";
  listening: number;
  /**
   * When the room went live (ISO), for the elapsed clock in the header and the
   * mini bar. Null until it starts - a scheduled room has no elapsed time, and
   * showing 00:00 beside LIVE would read as "just began" rather than "not yet".
   */
  started_at: string | null;
  host: SpaceSeat | null;
  speakers: SpaceSeat[];
  listeners: SpaceSeat[];
  /** Listeners beyond the strip - the "+884". */
  others: number;
  /** The seat I hold, or null if I have not joined (or am a guest). */
  me: { role: "host" | "speaker" | "listener"; muted: boolean; is_moderator: boolean } | null;
  /** What the host allowed - the room gates its controls on these. */
  settings?: SpaceRoomSettings;
};

export type SpaceRoomSettings = {
  speaking_permission: "everyone" | "request" | "host_only";
  audio_quality: "standard" | "high" | "ultra";
  allow_screen_sharing: boolean;
  allow_speaker_requests: boolean;
  enable_chat: boolean;
  allow_reactions: boolean;
  enable_polls: boolean;
  qa_enabled: boolean;
  is_recorded: boolean;
  live_captions: boolean;
  noise_cancellation: boolean;
  audience: "public" | "private" | "invite";
  audience_limit: number | null;
  content_warning: string | null;
  topics: string[];
  tags: string[];
  /** Present only for the host/moderators - the sharing secret. */
  invite_token: string | null;
};

export const spaceRoomApi = {
  show: async (id: string): Promise<SpaceRoom> =>
    (await api.get(`/spaces/${id}`)).data.data,

  join: async (id: string): Promise<SpaceRoom> =>
    (await api.post(`/spaces/${id}/join`)).data.data,

  leave: async (id: string): Promise<void> => {
    await api.post(`/spaces/${id}/leave`);
  },

  requestSpeak: async (id: string): Promise<{ message: string }> =>
    (await api.post(`/spaces/${id}/request-speak`)).data,

  /** Lower your own hand after you have raised it. */
  cancelRequest: async (id: string): Promise<void> => {
    await api.post(`/spaces/${id}/cancel-request`);
  },

  /** The React button - a heart into the room. Returns your running tally. */
  heart: async (id: string): Promise<{ hearts: number }> =>
    (await api.post(`/spaces/${id}/heart`)).data.data,

  /**
   * Mints a LiveKit participant token for this seat - StreamHub (self-hosted
   * LiveKit) replaces the old Cloudflare-SFU publish/subscribe/renegotiate
   * SDP dance from here down. LiveKit's client SDK does its own ICE/SDP
   * negotiation once handed {url, token}.
   */
  token: async (id: string): Promise<{ url: string; token: string; roomName: string; canPublish: boolean }> =>
    (await api.post(`/spaces/${id}/rtc/token`)).data.data,

  /** Self-mute sync - the caller muting their OWN mic. See SpaceRtcController::mute. */
  mute: async (id: string, muted: boolean): Promise<void> => {
    await api.post(`/spaces/${id}/rtc/mute`, { muted });
  },
};

/* ── hosting + people ────────────────────────────────────────────────── */

export type CreateSpaceInput = {
  title: string;
  description?: string;
  /** The single Category (business/music/…). */
  topic?: string;
  startNow: boolean;
  scheduledFor?: string | null;
  /** A local file uri from the image picker, not a URL. */
  coverUri?: string | null;

  /* Discovery / display */
  topics?: string[];               // up to 3
  tags?: string[];
  language?: string;
  audience?: "public" | "private" | "invite";
  /** null = Unlimited. */
  audienceLimit?: number | null;
  shareToFeed?: boolean;

  /* Speaking policy + audio */
  speakingPermission?: "everyone" | "request" | "host_only";
  audioQuality?: "standard" | "high" | "ultra";
  allowScreenSharing?: boolean;

  /* Room behaviour + capture */
  isRecorded?: boolean;
  liveCaptions?: boolean;
  noiseCancellation?: boolean;
  allowSpeakerRequests?: boolean;
  enableChat?: boolean;
  allowReactions?: boolean;
  enablePolls?: boolean;
  qaEnabled?: boolean;

  /* Moderation */
  contentWarning?: string | null;
  blockedWords?: string | null;

  /* Line-up (user ids invited on stage) */
  coHostIds?: number[];
  speakerIds?: number[];
  /** Followers-only allowlist: who a "private" room admits besides the host/moderators/invitees. Up to 100. */
  allowedFollowerIds?: number[];

  /* Room extras */
  roomRules?: string[];
  giftsEnabled?: boolean;
  waitingRoomEnabled?: boolean;
  soundClipsEnabled?: boolean;
  /** How many people can hold the mic at once - always a real, enforced cap (1-100), never unlimited. */
  speakerSlots: number;
};

export type PeopleTab = "all" | "speakers" | "listeners";

export const spaceHostApi = {
  /**
   * Multipart, always: the cover is a file, and a JSON body cannot carry one.
   * Fields go as strings because that is what multipart is - Laravel's
   * boolean/date rules read them back fine.
   */
  create: async (input: CreateSpaceInput): Promise<{ id: string; status: string }> => {
    const form = new FormData();
    // Booleans go only when set (so the server keeps the design's defaults);
    // arrays go as `key[]` repeats, which Laravel reads back as an array.
    const b = (k: string, v?: boolean) => { if (v !== undefined) form.append(k, v ? "1" : "0"); };
    const arr = (k: string, v?: (string | number)[]) => (v ?? []).forEach((x) => form.append(`${k}[]`, String(x)));

    form.append("title", input.title);
    if (input.description) form.append("description", input.description);
    // The single Category the discovery chips/admin filter key off; the create
    // flow only collects the multi-select `topics`, so the first pick doubles
    // as the category rather than asking the host to choose twice.
    const topic = input.topic ?? input.topics?.[0];
    if (topic) form.append("topic", topic);
    form.append("start_now", input.startNow ? "1" : "0");
    if (!input.startNow && input.scheduledFor) form.append("scheduled_for", input.scheduledFor);

    arr("topics", input.topics);
    arr("tags", input.tags);
    if (input.language) form.append("language", input.language);
    if (input.audience) form.append("audience", input.audience);
    // Omit audience_limit entirely for Unlimited (null).
    if (input.audienceLimit != null) form.append("audience_limit", String(input.audienceLimit));
    if (input.speakingPermission) form.append("speaking_permission", input.speakingPermission);
    if (input.audioQuality) form.append("audio_quality", input.audioQuality);
    b("allow_screen_sharing", input.allowScreenSharing);
    b("share_to_feed", input.shareToFeed);
    b("is_recorded", input.isRecorded);
    b("live_captions", input.liveCaptions);
    b("noise_cancellation", input.noiseCancellation);
    b("allow_speaker_requests", input.allowSpeakerRequests);
    b("enable_chat", input.enableChat);
    b("allow_reactions", input.allowReactions);
    b("enable_polls", input.enablePolls);
    b("qa_enabled", input.qaEnabled);
    if (input.contentWarning) form.append("content_warning", input.contentWarning);
    if (input.blockedWords) form.append("blocked_words", input.blockedWords);
    arr("co_host_ids", input.coHostIds);
    arr("speaker_ids", input.speakerIds);
    arr("allowed_follower_ids", input.allowedFollowerIds);

    arr("room_rules", input.roomRules);
    b("gifts_enabled", input.giftsEnabled);
    b("waiting_room_enabled", input.waitingRoomEnabled);
    b("sound_clips_enabled", input.soundClipsEnabled);
    form.append("speaker_slots", String(input.speakerSlots));

    if (input.coverUri) {
      form.append("cover", {
        uri: input.coverUri,
        name: "cover.jpg",
        type: "image/jpeg",
      } as any);
    }
    const res = await api.post("/spaces", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data.data;
  },

  /** The host closing their own room. */
  end: async (id: string): Promise<void> => {
    await api.post(`/spaces/${id}/end`);
  },

  people: async (id: string, tab: PeopleTab, page = 1): Promise<{
    data: SpaceSeat[];
    meta: { current_page: number; last_page: number; total: number; speakers: number; listeners: number };
  }> => (await api.get(`/spaces/${id}/people`, { params: { tab, page } })).data,
};

/* ── chat ────────────────────────────────────────────────────────────── */

export type SpaceMsgUser = {
  id: string;
  name: string;
  username: string | null;
  avatar: string | null;
  verified: boolean;
};

/** One emoji chip under a message: the glyph, the tally, and whether I am in it. */
export type SpaceMsgReaction = { emoji: string; count: number; reacted: boolean };

export type SpaceMessage = {
  id: string;
  body: string;
  is_pinned: boolean;
  created_at: string | null;
  role: "host" | "speaker" | "listener";
  user: SpaceMsgUser;
  reactions: SpaceMsgReaction[];
};

export type SpaceChat = { data: SpaceMessage[]; pinned: SpaceMessage | null };

export const spaceChatApi = {
  messages: async (id: string): Promise<SpaceChat> => {
    const r = (await api.get(`/spaces/${id}/messages`)).data;
    return { data: r.data ?? [], pinned: r.pinned ?? null };
  },

  send: async (id: string, body: string): Promise<SpaceMessage> =>
    (await api.post(`/spaces/${id}/messages`, { body })).data.data,

  react: async (id: string, messageId: string, emoji: string): Promise<SpaceMsgReaction> =>
    (await api.post(`/spaces/${id}/messages/${messageId}/react`, { emoji })).data.data,

  pin: async (id: string, messageId: string, pinned: boolean): Promise<void> => {
    await api.post(`/spaces/${id}/messages/${messageId}/pin`, { pinned });
  },
};

/* ── the host's raise-hand queue ─────────────────────────────────────── */

export type SpaceRequestRow = {
  id: string;
  user_id: string;
  name: string;
  username: string | null;
  avatar: string | null;
  verified: boolean;
  /** ISO8601 - when the hand went up, or when they were approved. */
  at: string | null;
};

export type SpaceRequests = {
  pending: SpaceRequestRow[];
  approved: SpaceRequestRow[];
  meta: { pending: number; approved: number };
};

export const spaceRequestApi = {
  list: async (id: string): Promise<SpaceRequests> => {
    const r = (await api.get(`/spaces/${id}/requests`)).data;
    return {
      pending: r.data?.pending ?? [],
      approved: r.data?.approved ?? [],
      meta: r.meta ?? { pending: 0, approved: 0 },
    };
  },

  approve: async (id: string, userId: string): Promise<void> => {
    await api.post(`/spaces/${id}/requests/${userId}/approve`);
  },

  decline: async (id: string, userId: string): Promise<void> => {
    await api.post(`/spaces/${id}/requests/${userId}/decline`);
  },
};

/* ── moderation (host & moderators) ──────────────────────────────────── */

/** The action a host/moderator can take on a user in the room. */
export type ModAction =
  | "promote" | "demote" | "mute" | "remove" | "block"
  | "promote-moderator" | "remove-moderator";

export const spaceModerationApi = {
  act: async (id: string, userId: string, action: ModAction): Promise<void> => {
    await api.post(`/spaces/${id}/moderation/${userId}/${action}`);
  },
};

/* ── the Listeners screen ────────────────────────────────────────────── */

export type SpaceListener = {
  id: string;
  user_id: string;
  name: string;
  username: string | null;
  avatar: string | null;
  verified: boolean;
  /** Reactions sent - what the podium ranks by, and the heart tally on the row. */
  hearts: number;
  /** Whole minutes in the room, for "Listening · 45m". */
  listening_minutes: number;
};

export type SpaceListeners = {
  data: SpaceListener[];
  /** The crowns - most-reacting few, already sorted. */
  top: SpaceListener[];
  meta: { current_page: number; last_page: number; total: number };
};

export const spaceListenersApi = {
  list: async (id: string, page = 1): Promise<SpaceListeners> => {
    const r = (await api.get(`/spaces/${id}/listeners`, { params: { page } })).data;
    return { data: r.data ?? [], top: r.top ?? [], meta: r.meta };
  },
};
