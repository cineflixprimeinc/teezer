import { api } from "./api";

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
  completion_pct?:  number; // 0-100, for view_progress
  watch_duration?:  number; // seconds
  platform?:        string; // for share
}

// Lazy-generated browser session ID (persists for the tab's lifetime)
function getSessionId(): string {
  if (typeof window === "undefined") return "";
  const key = "teezer_session_id";
  let id = window.sessionStorage.getItem(key);
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    window.sessionStorage.setItem(key, id);
  }
  return id;
}

/**
 * Fire-and-forget video event tracking.
 * Never throws - errors are silently swallowed so the UI is never affected.
 */
export function trackVideoEvent(
  videoId: number,
  eventType: VideoEventType,
  payload?: VideoEventPayload,
): void {
  // Only fire when a token is present (user is authenticated)
  const token = typeof window !== "undefined"
    ? window.localStorage.getItem("teezer_token")
    : null;

  if (!token) return; // recommendation events require auth

  void api
    .post("/video-events", {
      video_id:   videoId,
      event_type: eventType,
      payload:    payload ?? null,
      session_id: getSessionId(),
    })
    .catch(() => {
      // silent - never surface tracking failures to the user
    });
}

/**
 * Convenience: track watch progress after a video play session ends.
 * Sends view_progress if watched ≥ 3 s, or skip if watched < 2 s.
 */
export function trackWatchSession(
  videoId: number,
  watchedSeconds: number,
  durationSeconds: number,
): void {
  if (watchedSeconds < 2) {
    trackVideoEvent(videoId, "skip", { watch_duration: watchedSeconds });
    return;
  }

  const completionPct = durationSeconds > 0
    ? Math.min(100, Math.round((watchedSeconds / durationSeconds) * 100))
    : 0;

  trackVideoEvent(videoId, "view_progress", {
    completion_pct: completionPct,
    watch_duration: Math.floor(watchedSeconds),
  });
}
