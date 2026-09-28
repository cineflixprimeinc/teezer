/**
 * The Teezer playback interface - web.
 *
 * A deliberate mirror of mobile/src/playback/types.ts. Same method names, same
 * semantics, different engines underneath: a <video> element plus hls.js here,
 * react-native-video or expo-video there.
 *
 * The two files are duplicated rather than shared because `frontend/` and
 * `mobile/` are separate npm packages with no workspace linking them - the same
 * reason mobile/src/api/studio-analytics.api.ts mirrors its web counterpart by
 * hand. Keep them in step: a method added to one belongs in the other, or this
 * stops being one cross-platform interface and becomes two similar ones.
 *
 * ── Deliberately NOT in this interface ──────────────────────────────────────
 * ABR ladder configuration and buffer tuning. hls.js's knobs have no
 * react-native-video equivalent and vice versa, and flattening them into a
 * shared API would produce a lowest-common-denominator player that is worse on
 * both platforms. They stay with the adapter that owns them.
 */

export type Unsubscribe = () => void;

export interface PlaybackProgress {
  /** Seconds from the start of the media. */
  currentTime: number;
  /** Total seconds, or 0 when not yet known. */
  duration: number;
}

export type PlaybackEventMap = {
  /** Playback position advanced. Fires only while genuinely playing. */
  progress: (p: PlaybackProgress) => void;
  /** Reached the end of the media. Fires per loop when looping is on. */
  end: () => void;
  /** Enough data buffered to begin or resume playback. */
  ready: () => void;
  /** Playback failed. */
  error: (message: string) => void;
};

export type PlaybackEvent = keyof PlaybackEventMap;

export interface TeezerPlayer {
  play(): void;
  pause(): void;

  mute(): void;
  unmute(): void;
  isMuted(): boolean;

  /** Jump to an absolute position, in seconds. */
  seek(seconds: number): void;

  /**
   * Swap the media. Passing null unloads the element.
   *
   * On web this is HLS-aware: an .m3u8 goes through hls.js on browsers without
   * native HLS, with a progressive fallback. Callers never need to know which.
   */
  setSource(uri: string | null, fallbackUri?: string | null): void;

  /** Hint the browser to start buffering. Resolves immediately. */
  preload(): Promise<void>;

  /** Detach the source and tear down any hls.js instance. */
  release(): void;

  getCurrentTime(): number;
  /** 0 when unknown or the media is a live stream. */
  getDuration(): number;
  isPlaying(): boolean;

  setRate(rate: number): void;
  getRate(): number;

  setLoop(loop: boolean): void;

  /** Subscribe to a playback event. Call the returned function to unsubscribe. */
  on<E extends PlaybackEvent>(event: E, handler: PlaybackEventMap[E]): Unsubscribe;
}
