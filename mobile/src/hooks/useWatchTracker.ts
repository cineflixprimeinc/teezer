import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import type { TeezerPlayer } from "@/playback/types";
import { api } from "@/api/client";
import { getDeviceFingerprint } from "@/utils/fingerprint";
import { trackVideoEvent, trackWatchSession, SESSION_ID } from "@/services/analytics";

/**
 * Real watch-time tracking for one feed post.
 *
 * The website's equivalent (frontend/src/hooks/useWatchTracker.ts) counts a
 * second at a time off a 1s interval, guarding it with `!paused && !ended &&
 * readyState >= 3 && tabActive` - four proxies for "is this actually playing
 * right now". React Native has a better answer available: the TeezerPlayer
 * abstraction's `progress` event only advances `currentTime` while the player
 * is genuinely playing, so accumulating the DELTA between consecutive
 * readings measures watched time directly instead of inferring it.
 *
 * That difference matters on a phone, where the web proxies are all wrong:
 * there is no readyState to read, backgrounding is not a visibilitychange, and
 * the PlaybackManager can pause a player without React hearing about it.
 *
 * Two things this deliberately does NOT do:
 *
 *   - It never counts while paused, buffering, backgrounded or scrubbing,
 *     because onProgress does not fire then.
 *   - It never sends a total. Every call carries an incremental delta, so a
 *     duplicated request over-reports by one beat rather than by a whole
 *     session.
 *
 * Endpoints, mirroring the website exactly:
 *   POST /watch/start     - opens the server-side session
 *   POST /watch/progress  - every 5 accumulated seconds of real playback
 *   POST /watch/end       - on swipe-away, unmount, or backgrounding
 * plus /video-events milestones, which is what feeds the Studio retention curve.
 */

export interface UseWatchTrackerOpts {
  videoId: number;
  /** Live player, or null before FeedVideoPlayer has handed one back. */
  player: TeezerPlayer | null;
  /** This post is the current row AND the feed is on screen. */
  isActive: boolean;
  /** Post duration in seconds; 0 = unknown. */
  duration: number;
}

/** Completion points reported to the backend, matching the website's. */
const MILESTONES = [25, 50, 75, 100] as const;

/**
 * A single onProgress gap larger than this is a seek, a loop or a stall
 * recovering - not watched time. Counting it would let one scrub add minutes of
 * fictional watch time to a creator's total. onProgress fires roughly every
 * 250ms, so 2s is generous headroom for a slow frame without admitting a jump.
 */
const MAX_PROGRESS_GAP = 2;

/** Accumulated seconds before a progress beat is flushed to the server. */
const FLUSH_EVERY = 5;

export function useWatchTracker({
  videoId,
  player,
  isActive,
  duration,
}: UseWatchTrackerOpts): void {
  const state = useRef({
    sessionId: "",
    started: false,
    /** Seconds watched since the last flush. */
    accumulator: 0,
    /** Seconds watched across the whole session - the skip/view_progress input. */
    total: 0,
    /** Furthest point reached, for the completed flag. */
    maxPosition: 0,
    /** Last currentTime seen, to difference against. */
    lastTime: 0,
    replayCount: 0,
    firedMilestones: new Set<number>(),
  });

  // `duration` is read inside callbacks that outlive the render they were made
  // in, so it goes through a ref rather than a closure over a stale value.
  const durationRef = useRef(duration);
  durationRef.current = duration;

  useEffect(() => {
    if (!isActive || !player || videoId <= 0) return;

    const sessionId = `${SESSION_ID}-v${videoId}-${Date.now().toString(36)}`;
    state.current = {
      sessionId,
      started: true,
      accumulator: 0,
      total: 0,
      maxPosition: 0,
      lastTime: 0,
      replayCount: 0,
      firedMilestones: new Set<number>(),
    };

    // Opening the session is fire-and-forget: if it fails, the progress beats
    // that follow still carry the same session_id and the backend can treat the
    // first one as the start. Blocking playback on an analytics round-trip
    // would be exactly the wrong trade.
    void getDeviceFingerprint()
      .then((deviceId) =>
        api.post("/watch/start", {
          video_id: videoId,
          session_id: sessionId,
          device_id: deviceId,
        }),
      )
      .catch(() => {});

    const unsubscribeProgress = player.on("progress", ({ currentTime }) => {
      const s = state.current;

      const delta = currentTime - s.lastTime;
      s.lastTime = currentTime;

      // Backwards (a loop or a rewind) or an implausible jump (a scrub, a
      // recovered stall) contributes nothing. The position still updates above,
      // so the NEXT gap is measured from where the user actually is.
      if (delta <= 0 || delta > MAX_PROGRESS_GAP) return;

      s.accumulator += delta;
      s.total += delta;
      s.maxPosition = Math.max(s.maxPosition, currentTime);

      const dur = durationRef.current;
      if (dur > 0) {
        const pct = (currentTime / dur) * 100;
        for (const m of MILESTONES) {
          if (pct >= m && !s.firedMilestones.has(m)) {
            s.firedMilestones.add(m);
            trackVideoEvent(videoId, "view_progress", {
              completion_pct: m,
              watch_duration: Math.floor(s.total),
            });
          }
        }
      }

      if (s.accumulator >= FLUSH_EVERY) flushProgress();
    });

    const unsubscribeEnd = player.on("end", () => {
      state.current.replayCount += 1;
      // A loop restarts the clock; without this the next onProgress would
      // difference against the end of the post and discard a real second.
      state.current.lastTime = 0;
      trackVideoEvent(videoId, "rewatch");
    });

    /**
     * Backgrounding FLUSHES but does not END the session.
     *
     * Ending it here was the obvious first move and it is wrong: this effect is
     * keyed on [isActive, player, videoId], none of which change when the app
     * comes back, so a session closed on background would never reopen - the
     * post would keep playing on return and record nothing at all.
     *
     * Flushing gets the safety this was reaching for anyway. The player is
     * already paused by then (PlaybackManager refuses playback while
     * backgrounded), so nothing accumulates while away, and if the OS kills the
     * app the most that is lost is the sub-5-second tail. A session with beats
     * and no end is something the backend already handles - WatchController
     * counts a view off progress, not just off end - and it is exactly what a
     * closed browser tab leaves behind on web.
     */
    const appStateSub = AppState.addEventListener("change", (next) => {
      if (next !== "active") flushProgress();
    });

    /** Sends whatever has accumulated since the last beat, and resets it. */
    function flushProgress() {
      const s = state.current;
      const watched = Math.round(s.accumulator);
      if (watched <= 0) return;
      s.accumulator = 0;

      void api
        .post("/watch/progress", {
          session_id: sessionId,
          video_id: videoId,
          watched_delta: watched,
          current_time: Math.round(s.maxPosition),
          event_type: "progress",
        })
        .catch(() => {});
    }

    function finish() {
      const s = state.current;
      if (!s.started) return;
      s.started = false;

      const watched = s.total;
      const dur = durationRef.current;
      const completed = dur > 0 && s.maxPosition >= Math.floor(dur * 0.95);

      void api
        .post("/watch/end", {
          session_id: s.sessionId,
          video_id: videoId,
          final_watch_delta: Math.round(s.accumulator),
          max_position: Math.round(s.maxPosition),
          completed,
          replay_count: s.replayCount,
        })
        .catch(() => {});
      s.accumulator = 0;

      // The recommender's view of the same session. Separate from /watch/end on
      // purpose: that endpoint feeds watch-time aggregates, this one feeds the
      // ranking signals and the ClickHouse completion distribution.
      trackWatchSession(videoId, watched, dur);
    }

    return () => {
      unsubscribeProgress();
      unsubscribeEnd();
      appStateSub.remove();
      finish();
    };
  }, [isActive, player, videoId]);
}
