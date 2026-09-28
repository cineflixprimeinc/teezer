import { attachMediaSource } from "./attach-source";
import type {
  PlaybackEvent,
  PlaybackEventMap,
  TeezerPlayer,
  Unsubscribe,
} from "./types";

/**
 * TeezerPlayer over a plain <video> element plus hls.js.
 *
 * There is no Video.js, Plyr or vidstack here on purpose. Everything a player
 * library would provide - adaptive HLS, bounded error recovery, a progressive
 * fallback, ABR capped to the rendered size - already exists in
 * attach-source.ts at a fraction of the bundle cost, and the app draws its own
 * controls on every surface anyway. A library would add weight to re-implement
 * what is already here and then need hls.js underneath it regardless.
 *
 * The element is owned by React; this wrapper never creates or destroys one.
 * `release()` detaches the source, it does not remove the node.
 */
export function createHtml5Player(video: HTMLVideoElement): TeezerPlayer {
  /** Teardown for the current source, from attachMediaSource. */
  let detachSource: (() => void) | null = null;

  return {
    play: () => {
      // A rejected play() is normal, not exceptional: browsers reject it for
      // autoplay policy and for a source that is still loading. Callers that
      // care about the autoplay case handle it themselves; swallowing here
      // stops an unhandled rejection from reaching the console on every scroll.
      void video.play().catch(() => {});
    },
    pause: () => video.pause(),

    mute: () => {
      video.muted = true;
    },
    unmute: () => {
      video.muted = false;
    },
    isMuted: () => video.muted,

    seek: (seconds) => {
      // Seeking past the end, or before metadata lands, throws in some engines.
      const d = video.duration;
      if (!Number.isFinite(d) || d <= 0) return;
      video.currentTime = Math.min(Math.max(0, seconds), d);
    },

    setSource: (uri, fallbackUri) => {
      detachSource?.();
      detachSource = attachMediaSource(() => video, uri, fallbackUri ?? null);
    },

    // The element does its own buffering off the preload attribute; there is
    // nothing further to request. Resolved rather than faked, so callers get
    // the same contract as on mobile.
    preload: () => Promise.resolve(),

    release: () => {
      detachSource?.();
      detachSource = null;
      video.removeAttribute("src");
      video.load();
    },

    getCurrentTime: () => video.currentTime,
    // NaN before metadata, Infinity for a live stream. Both break arithmetic in
    // every caller, so normalise to 0 and let callers read 0 as "not yet known".
    getDuration: () => {
      const d = video.duration;
      return Number.isFinite(d) && d > 0 ? d : 0;
    },
    // There is no `playing` property on HTMLMediaElement - this is the standard
    // composition of the four flags that actually mean it.
    isPlaying: () =>
      !video.paused && !video.ended && video.readyState > 2 && video.currentTime > 0,

    setRate: (rate) => {
      video.playbackRate = rate;
    },
    getRate: () => video.playbackRate,

    setLoop: (loop) => {
      video.loop = loop;
    },

    on<E extends PlaybackEvent>(event: E, handler: PlaybackEventMap[E]): Unsubscribe {
      switch (event) {
        case "progress": {
          const h = handler as PlaybackEventMap["progress"];
          const listener = () => {
            const d = video.duration;
            h({
              currentTime: video.currentTime,
              duration: Number.isFinite(d) && d > 0 ? d : 0,
            });
          };
          // timeupdate, not requestAnimationFrame: it fires only while actually
          // playing, which is what makes it a usable watch-time signal as well
          // as a scrubber input, and it costs nothing while paused.
          video.addEventListener("timeupdate", listener);
          return () => video.removeEventListener("timeupdate", listener);
        }
        case "end": {
          const h = handler as PlaybackEventMap["end"];
          const listener = () => h();
          video.addEventListener("ended", listener);
          return () => video.removeEventListener("ended", listener);
        }
        case "ready": {
          const h = handler as PlaybackEventMap["ready"];
          const listener = () => h();
          // canplay is the counterpart of the native readyToPlay status the
          // mobile adapters map onto this event.
          video.addEventListener("canplay", listener);
          return () => video.removeEventListener("canplay", listener);
        }
        case "error": {
          const h = handler as PlaybackEventMap["error"];
          const listener = () => h(video.error?.message ?? "playback error");
          video.addEventListener("error", listener);
          return () => video.removeEventListener("error", listener);
        }
        default:
          return () => {};
      }
    },
  };
}
