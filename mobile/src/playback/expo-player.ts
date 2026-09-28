import type { VideoPlayer } from "expo-video";
import type {
  PlaybackEvent,
  PlaybackEventMap,
  TeezerPlayer,
  Unsubscribe,
} from "./types";

/**
 * TeezerPlayer over expo-video - the engine Stories, the story editor and the
 * Inbox media viewer use, and the one the feed can fall back to.
 *
 * Every difference from the react-native-video adapter is a real API
 * difference, not a stylistic one, which is the case for having this interface
 * at all:
 *
 *   rate            -> playbackRate
 *   isPlaying       -> playing            (readonly)
 *   seekTo(t)       -> currentTime = t    (settable; seekBy is relative)
 *   replaceSourceAsync -> replaceAsync
 *   addEventListener   -> addListener     (from expo's SharedObject)
 *   onProgress      -> timeUpdate
 *   onEnd           -> playToEnd
 *   onStatusChange  -> statusChange
 *
 * There is no preload() at all - see the note on that method below.
 */

/**
 * How often `timeUpdate` fires once anything subscribes to progress, in
 * seconds.
 *
 * This is load-bearing. expo-video ships `timeUpdateEventInterval: 0`, and the
 * type docs are explicit that zero means the event is NEVER emitted. So an
 * adapter that only subscribed would look completely correct, compile, and
 * deliver no progress events at all - a scrubber frozen at zero with nothing in
 * the logs. Subscribing has to turn the event on as well.
 *
 * 0.25s matches react-native-video's own default progress cadence, so a
 * scrubber and any watch-time accounting behave the same on both engines.
 */
const TIME_UPDATE_INTERVAL_SECONDS = 0.25;

/**
 * True when an error means "the native player is already gone".
 *
 * Matched on the MESSAGE rather than a class name, because the class name is
 * not stable across SDKs and relying on one is what let this crash through.
 * The previous guard tested only for "NativeSharedObjectNotFoundException";
 * SDK 57 raises the same condition as:
 *
 *   FunctionCallException: Calling the 'set' function has failed
 *     -> NotFoundException: Unable to find the native shared object
 *        associated with given JavaScript object
 *
 * which that string never matched, so the error was rethrown out of a passive
 * unmount effect and killed the app. Observed on TestFlight build 17, from the
 * feed with a comment sheet open.
 *
 * The prose "native shared object" is the part Expo has kept stable across
 * both spellings, so it is what this keys on; the old class name stays for
 * older runtimes.
 */
function isReleasedObjectError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return (
    msg.includes("native shared object") ||
    msg.includes("NativeSharedObjectNotFoundException") ||
    msg.includes("NotFoundException")
  );
}

/**
 * Runs a cleanup that touches the native player, swallowing ONLY the
 * "already released" case.
 *
 * Every teardown here races useVideoPlayer's own unmount effect, which owns
 * and releases the native side. They are separate effects in different
 * components, and React does not order passive unmounts between them - so any
 * of these can run after the object is gone. There is nothing left to clean up
 * at that point; anything else still surfaces.
 */
function cleanupNativePlayer(fn: () => void): void {
  try {
    fn();
  } catch (e) {
    if (!isReleasedObjectError(e)) throw e;
  }
}

export function createExpoPlayer(player: VideoPlayer): TeezerPlayer {
  return {
    play: () => player.play(),
    pause: () => player.pause(),

    mute: () => {
      player.muted = true;
    },
    unmute: () => {
      player.muted = false;
    },
    isMuted: () => player.muted,

    // expo-video has no seekTo; currentTime is settable and is the absolute
    // form. seekBy(seconds) is relative - not what this method means.
    seek: (seconds) => {
      player.currentTime = seconds;
    },

    setSource: (uri) => {
      void player.replaceAsync(uri ? { uri } : null).catch(() => {
        // Same reasoning as the react-native-video adapter: a failed swap
        // leaves the previous media playing rather than throwing into a render.
      });
    },

    /**
     * expo-video exposes no preload primitive. It begins buffering when a
     * source is set, so the honest implementation is a resolved no-op.
     *
     * Deliberately not faked by calling play() then pause(): that allocates a
     * decoder surface and grabs the audio route, which is exactly what
     * preloading is supposed to avoid, and on a feed it would make adjacent
     * rows audible for a frame.
     */
    preload: () => Promise.resolve(),

    release: () => player.release(),

    getCurrentTime: () => player.currentTime,
    getDuration: () => {
      const d = player.duration;
      return Number.isFinite(d) && d > 0 ? d : 0;
    },
    isPlaying: () => player.playing,

    setRate: (rate) => {
      player.playbackRate = rate;
    },
    getRate: () => player.playbackRate,

    setLoop: (loop) => {
      player.loop = loop;
    },

    on<E extends PlaybackEvent>(event: E, handler: PlaybackEventMap[E]): Unsubscribe {
      switch (event) {
        case "progress": {
          const h = handler as PlaybackEventMap["progress"];
          // Turn the event on - see TIME_UPDATE_INTERVAL_SECONDS.
          const previousInterval = player.timeUpdateEventInterval;
          player.timeUpdateEventInterval = TIME_UPDATE_INTERVAL_SECONDS;

          const sub = player.addListener("timeUpdate", ({ currentTime }) => {
            const d = player.duration;
            h({ currentTime, duration: Number.isFinite(d) && d > 0 ? d : 0 });
          });
          return () => {
            // This cleanup can run AFTER the native player is already gone -
            // useVideoPlayer's own unmount effect (which owns and releases
            // the native side) and this subscription's cleanup are two
            // separate effects, in two different components in the feed
            // (FeedVideoPlayer vs whatever consumes onPlayerChange), and
            // React does not guarantee which one's passive-unmount runs
            // first. When the native side is already released, both
            // sub.remove() and writing timeUpdateEventInterval throw
            // NativeSharedObjectNotFoundException - a real crash observed
            // on-device, not hypothetical. There is nothing left to clean up
            // once the object itself is gone, so that specific failure is
            // swallowed; any other error still surfaces.
            cleanupNativePlayer(() => {
              sub.remove();
              // Put the interval back, so unsubscribing actually stops the
              // native side emitting rather than leaving it running forever.
              player.timeUpdateEventInterval = previousInterval;
            });
          };
        }
        case "end": {
          const h = handler as PlaybackEventMap["end"];
          const sub = player.addListener("playToEnd", () => h());
          return () => cleanupNativePlayer(() => sub.remove());
        }
        case "ready": {
          const h = handler as PlaybackEventMap["ready"];
          const sub = player.addListener("statusChange", ({ status }) => {
            if (status === "readyToPlay") h();
          });
          return () => cleanupNativePlayer(() => sub.remove());
        }
        case "error": {
          const h = handler as PlaybackEventMap["error"];
          const sub = player.addListener("statusChange", ({ status, error }) => {
            if (status === "error") h(error?.message ?? "playback error");
          });
          return () => cleanupNativePlayer(() => sub.remove());
        }
        default:
          return () => {};
      }
    },
  };
}
