import { Platform } from "react-native";
import { api } from "@/api/client";
import { useAuthStore } from "@/store/auth.store";

/**
 * The app's hand-off point into the analytics pipeline.
 *
 * This is a deliberate mirror of frontend/src/services/videoEvent.service.ts.
 * Both surfaces post the SAME body to the SAME endpoint, because everything
 * downstream - the Redis stream, the ClickHouse rollups, the Studio dashboard -
 * assumes one event vocabulary. Until this file existed the app sent NO playback
 * telemetry at all: every view, watch-second, retention point and completion in
 * Studio came from the website, which on a mobile-first product made the
 * dashboard confidently wrong rather than merely sparse.
 *
 * Two rules govern everything here:
 *
 *   1. It must never affect playback. Every call is fire-and-forget and every
 *      rejection is swallowed. A creator's view is not worth a stutter.
 *   2. It sends EVENTS, never metrics. Nothing in this file computes a view
 *      count, a unique viewer or a watch total - the backend derives all of
 *      those. The app cannot inflate its own numbers because it never sends any.
 */

export type VideoEventType =
  | "view_progress"
  | "skip"
  | "rewatch"
  | "like"
  | "comment"
  | "share"
  | "save"
  | "follow_from_video"
  | "not_interested"
  | "report";

export interface VideoEventPayload {
  /** 0-100, for view_progress. */
  completion_pct?: number;
  /** Seconds of real playback this event accounts for. */
  watch_duration?: number;
  /** For share: where it went. */
  platform?: string;
}

/**
 * One id per app launch, same shape story.api.ts already uses.
 *
 * This groups the events of a single sitting; it is NEVER identity. Unique
 * viewers are deduped on the authenticated user id server-side, so two devices
 * remain one viewer.
 */
export const SESSION_ID = `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

/** ios | android - the backend ignores anything it does not recognise. */
export const PLATFORM = Platform.OS === "ios" ? "ios" : "android";

/**
 * Idempotency key for one logical event.
 *
 * Analytics events get retried by things nobody controls - a flaky link, a
 * gateway that replays a POST, the app being backgrounded mid-flight - and the
 * ingest path is at-least-once by design, so without this the same view can be
 * counted twice. The id is generated once, when the event is CREATED, so a
 * retry of that event carries the same key and the backend can drop the copy.
 *
 * Generating it at send time instead would defeat the entire mechanism: each
 * retry would look like a brand-new event.
 *
 * Uniqueness comes from the launch-scoped session id plus a monotonic counter,
 * so two events in the same millisecond cannot collide the way a bare timestamp
 * would.
 */
let eventSeq = 0;
function newEventId(): string {
  eventSeq += 1;
  return `${SESSION_ID}-${eventSeq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The /video-events route sits behind auth; posting as a guest just 401s. */
function isAuthenticated(): boolean {
  return useAuthStore.getState().status === "authenticated";
}

/**
 * Record one video event. Never throws, never blocks, never retries.
 *
 * No retry is deliberate: a dropped analytics event is a rounding error, while a
 * retry queue on a hot playback path is a memory leak waiting to happen. The
 * event_id is still sent because the retries that DO happen are the ones outside
 * this process.
 */
export function trackVideoEvent(
  videoId: number,
  eventType: VideoEventType,
  payload?: VideoEventPayload,
): void {
  if (videoId <= 0 || !isAuthenticated()) return;

  void api
    .post("/video-events", {
      event_id: newEventId(),
      video_id: videoId,
      event_type: eventType,
      payload: payload ? { platform: PLATFORM, ...payload } : { platform: PLATFORM },
      session_id: SESSION_ID,
    })
    .catch(() => {
      // Silent by design - see the module comment. Telemetry failures must
      // never reach the person watching the video.
    });
}

/**
 * Summarise a finished play session as a single event.
 *
 * Under two seconds is a `skip` - the recommender reads that as a negative
 * signal, which is the whole reason the threshold exists. Anything longer is a
 * `view_progress` carrying the completion percentage that feeds the Studio
 * retention curve.
 *
 * Thresholds and rounding match the website's trackWatchSession exactly. If they
 * drift, the same behaviour on two platforms starts producing different history.
 */
export function trackWatchSession(
  videoId: number,
  watchedSeconds: number,
  durationSeconds: number,
): void {
  if (watchedSeconds < 2) {
    trackVideoEvent(videoId, "skip", { watch_duration: Math.floor(watchedSeconds) });
    return;
  }

  const completionPct =
    durationSeconds > 0
      ? Math.min(100, Math.round((watchedSeconds / durationSeconds) * 100))
      : 0;

  trackVideoEvent(videoId, "view_progress", {
    completion_pct: completionPct,
    watch_duration: Math.floor(watchedSeconds),
  });
}
