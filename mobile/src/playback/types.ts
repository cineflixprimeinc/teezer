/**
 * The Teezer playback interface.
 *
 * One shape, several possible engines. The feed, Stories, the story/post
 * editor and Inbox all run expo-video today, wrapped to look like this, so a
 * screen never touches the engine's own API and swapping engines again is an
 * adapter change rather than a migration.
 *
 * Why this exists at all: before it, the feed reached straight into
 * `player.rate`, `player.currentTime` and `player.addEventListener` from
 * three separate files - property names react-native-video used when the
 * feed ran on it, and not the ones expo-video uses (`playbackRate`,
 * `currentTime` (settable), `addListener`, and a `timeUpdate` progress event
 * rather than `onProgress`). Every one of those differences was a reason that
 * engine change touched UI files that have nothing to do with video - this
 * interface is what makes the next one not do that again.
 *
 * ── Deliberately NOT in this interface ──────────────────────────────────────
 * Buffering strategy, decoder-surface allocation and audio-session mode.
 * Those are genuinely engine-specific - react-native-video's bufferConfig,
 * for the time it was the feed's engine, was shaped around ExoPlayer and
 * AVPlayer separately with no expo-video equivalent - and pretending
 * otherwise would produce a lowest-common-denominator API that makes the
 * feed worse. They stay with the adapter that owns them.
 *
 * A mirror of this interface exists at frontend/src/lib/playback/types.ts for
 * the web. Keep the two in step: a method added here should be added there, or
 * the abstraction stops being cross-platform and becomes two separate ones.
 */

export type Unsubscribe = () => void;

export interface PlaybackProgress {
  /** Seconds from the start of the media. */
  currentTime: number;
  /** Total seconds, or 0 when not yet known. */
  duration: number;
}

export type PlaybackEventMap = {
  /**
   * Playback position advanced. Fires only while genuinely playing, which is
   * what makes it a usable watch-time signal as well as a scrubber input.
   */
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
   * Swap the media. Passing null unloads and frees the decoder without
   * destroying the player, so the same instance can be reused.
   */
  setSource(uri: string | null): void;

  /**
   * Start buffering without playing, allocating a decoder surface, or taking
   * the audio route. This is what makes "current + next only" preloading cheap.
   * Resolves when the engine has accepted the request, NOT when buffering is
   * complete.
   */
  preload(): Promise<void>;

  /**
   * Free native resources. The player is unusable afterwards.
   *
   * Only call this if you own the player's lifetime. Where a React hook created
   * it (both `useVideoPlayer` implementations do), that hook owns it and will
   * release it on unmount - calling this as well makes every later property
   * access throw.
   */
  release(): void;

  getCurrentTime(): number;
  /** 0 when the duration is not yet known or the media is a live stream. */
  getDuration(): number;
  isPlaying(): boolean;

  /**
   * Playback speed, 1 = normal.
   *
   * Not in the original interface sketch, but the feed's press-and-hold 2x
   * gesture needs it, and without it that gesture would have to reach past this
   * interface into the engine - which is the exact coupling this file removes.
   */
  setRate(rate: number): void;
  getRate(): number;

  /** Looping is a per-post preference on the feed, so it must be settable. */
  setLoop(loop: boolean): void;

  /** Subscribe to a playback event. Call the returned function to unsubscribe. */
  on<E extends PlaybackEvent>(event: E, handler: PlaybackEventMap[E]): Unsubscribe;
}
