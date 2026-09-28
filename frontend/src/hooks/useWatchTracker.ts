import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { api } from "@/services/api";

export interface UseWatchTrackerOpts {
  videoId: number;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** true = this video is the active/current one; false = end the session */
  isActive: boolean;
  /** video duration in seconds; 0 = unknown */
  duration: number;
}

function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  const KEY = "teezer_device_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id =
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36));
    localStorage.setItem(KEY, id);
  }
  return id;
}

function genSessionId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Tracks real watch time for a video.
 * - Creates a server-side session when isActive becomes true.
 * - Accumulates seconds every 1s tick (only when playing + tab active).
 * - Sends progress flush to /api/watch/progress every 5 accumulated seconds.
 * - Sends /api/watch/end when isActive becomes false or component unmounts.
 * - Never throws; all backend calls are fire-and-forget.
 */
export function useWatchTracker({
  videoId,
  videoRef,
  isActive,
  duration,
}: UseWatchTrackerOpts): void {
  const stateRef = useRef({
    id: "",
    started: false,
    accumulator: 0,   // seconds since last progress flush
    maxPosition: 0,   // highest currentTime reached (seconds)
    replayCount: 0,
  });
  const tabActiveRef = useRef(true);

  // Track tab visibility
  useEffect(() => {
    const fn = () => {
      tabActiveRef.current = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, []);

  // Session lifecycle - scoped to [isActive, videoId]
  useEffect(() => {
    if (!isActive || videoId <= 0) {
      flushAndEnd();
      return;
    }

    const sid = genSessionId();
    stateRef.current = {
      id: sid,
      started: false,
      accumulator: 0,
      maxPosition: 0,
      replayCount: 0,
    };

    // Register session with backend
    api
      .post("/watch/start", {
        video_id:   videoId,
        session_id: sid,
        device_id:  getDeviceId(),
      })
      .catch(() => {});
    stateRef.current.started = true;

    // 1-second tick - only counts genuinely playing time
    const tick = setInterval(() => {
      const el = videoRef.current;
      if (!el) return;

      const canCount =
        !el.paused &&
        !el.ended &&
        el.readyState >= 3 &&          // HAVE_FUTURE_DATA - buffered
        tabActiveRef.current;

      if (!canCount) return;

      stateRef.current.accumulator += 1;
      stateRef.current.maxPosition = Math.max(
        stateRef.current.maxPosition,
        Math.round(el.currentTime),
      );

      // Flush every 5 real seconds
      if (stateRef.current.accumulator >= 5) {
        const delta = stateRef.current.accumulator;
        stateRef.current.accumulator = 0;
        api
          .post("/watch/progress", {
            session_id:    sid,
            video_id:      videoId,
            watched_delta: delta,
            current_time:  Math.round(el.currentTime),
            event_type:    "progress",
          })
          .catch(() => {});
      }
    }, 1000);

    // Replay counter
    const el = videoRef.current;
    const onEnded = () => {
      stateRef.current.replayCount += 1;
    };
    el?.addEventListener("ended", onEnded);

    return () => {
      clearInterval(tick);
      el?.removeEventListener("ended", onEnded);
      flushAndEnd();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, videoId]);

  function flushAndEnd(): void {
    const s = stateRef.current;
    if (!s.started) return;
    s.started = false;

    const el         = videoRef.current;
    const finalDelta = s.accumulator;
    s.accumulator    = 0;

    const pos       = s.maxPosition;
    const completed = duration > 0 && pos >= Math.floor(duration * 0.95);

    api
      .post("/watch/end", {
        session_id:        s.id,
        video_id:          videoId,
        final_watch_delta: finalDelta,
        max_position:      pos,
        completed,
        replay_count:      s.replayCount,
      })
      .catch(() => {});
  }
}
