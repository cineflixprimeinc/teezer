import { AppState, type AppStateStatus } from "react-native";

/**
 * The single authority on which video is allowed to play.
 *
 * Every player registers here and asks permission instead of deciding for
 * itself. That inversion is the whole point: the feed used to run
 * `if (active && focused && !paused) player.play()` inside each item, so
 * "exactly one video plays" was an emergent property of several independent
 * booleans agreeing. They did not always agree - a stale item whose `active`
 * had not yet flipped, or a player that finished buffering after the user
 * navigated away, would start on its own. Duplicate audio and background
 * playback both come from that.
 *
 * Here, granting a play REVOKES every other player first, so the invariant is
 * enforced in one place rather than hoped for in many.
 *
 * Deliberately framework-free - no React, no navigation imports - so it can be
 * called from an effect, a gesture handler, a navigation listener or a modal
 * without creating a cycle. It owns exactly one piece of global state (the app
 * being foregrounded) because that is genuinely global.
 */

type PauseFn = () => void;

class PlaybackManagerImpl {
  /** id -> how to pause that player. */
  private players = new Map<string, PauseFn>();

  /** The one player currently permitted to play, if any. */
  private currentId: string | null = null;

  /** False while the app is backgrounded or mid-transition. */
  private appActive = true;

  /**
   * Set while the user is somewhere that must be silent - a pushed screen, a
   * modal, a sheet. Separate from appActive because they are lifted by
   * different events and both must be clear before anything may play.
   */
  private suspended = false;

  private listeners = new Set<() => void>();

  constructor() {
    // iOS reports "inactive" during the app-switcher swipe and for the
    // control-centre pull; treating it as background means audio stops the
    // instant the app starts leaving, not after it has left.
    AppState.addEventListener("change", (next: AppStateStatus) => {
      const active = next === "active";
      if (active === this.appActive) return;
      this.appActive = active;
      if (!active) this.pauseAll();
      this.emit();
    });
  }

  /* ── registration ─────────────────────────────────────────────────────── */

  /**
   * Register a player. Returns its unregister function, which callers should
   * run on unmount - a Map entry pointing at a released player is a leak and,
   * worse, a pause() call into a torn-down native view.
   */
  register(id: string, pause: PauseFn): () => void {
    this.players.set(id, pause);
    return () => {
      this.players.delete(id);
      if (this.currentId === id) this.currentId = null;
    };
  }

  /* ── the invariant ────────────────────────────────────────────────────── */

  /**
   * Ask to play. Returns false when playback is not permitted, and the caller
   * must then stay paused.
   *
   * Refused while the app is backgrounded or playback is suspended, which is
   * what stops a video that finished buffering after the user navigated away
   * from starting anyway - the classic "audio from nowhere" bug.
   */
  requestPlay(id: string): boolean {
    if (!this.appActive || this.suspended) return false;

    if (this.currentId !== id) {
      // Revoke first, grant second. Doing it in this order means there is no
      // instant where two players believe they hold the floor.
      this.pauseOthers(id);
      this.currentId = id;
    }
    return true;
  }

  /** Give up the floor without pausing anyone else. */
  release(id: string): void {
    if (this.currentId === id) this.currentId = null;
  }

  /** True if this player currently holds the floor. */
  isCurrent(id: string): boolean {
    return this.currentId === id;
  }

  private pauseOthers(exceptId: string): void {
    for (const [id, pause] of this.players) {
      if (id === exceptId) continue;
      try {
        pause();
      } catch {
        // A player torn down between registration and this call must not stop
        // the rest from being paused.
      }
    }
  }

  /** Pause every registered player and clear the floor. */
  pauseAll(): void {
    this.currentId = null;
    for (const pause of this.players.values()) {
      try {
        pause();
      } catch {
        /* see pauseOthers */
      }
    }
  }

  /* ── suspension (navigation, modals, sheets) ──────────────────────────── */

  /**
   * Silence playback until resume() is called. Use when pushing a screen or
   * opening a modal.
   *
   * Counted rather than boolean: a comments sheet opened over an already
   * -suspended screen must not un-suspend the feed when only IT closes. Nested
   * overlays are common enough that a plain flag gets this wrong.
   */
  private suspendCount = 0;

  suspend(): void {
    this.suspendCount += 1;
    this.suspended = true;
    this.pauseAll();
    this.emit();
  }

  resume(): void {
    this.suspendCount = Math.max(0, this.suspendCount - 1);
    if (this.suspendCount === 0 && this.suspended) {
      this.suspended = false;
      // Deliberately does NOT resume anything. Whichever item is visible will
      // ask for the floor again on its next render; deciding here would mean
      // guessing, and guessing wrong plays the wrong video.
      this.emit();
    }
  }

  /** Whether anything is allowed to play right now. */
  canPlay(): boolean {
    return this.appActive && !this.suspended;
  }

  /* ── change notification ──────────────────────────────────────────────── */

  /** Subscribe to permission changes (app background, suspend/resume). */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch {
        /* a bad subscriber must not break the rest */
      }
    }
  }
}

/** One instance per app. */
export const PlaybackManager = new PlaybackManagerImpl();
