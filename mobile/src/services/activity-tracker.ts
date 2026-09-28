import { AppState, type AppStateStatus } from "react-native";
import { useScreenTimeStore } from "@/store/screen-time.store";
import { screenTimeApi, type Activity, type Breakdown } from "@/api/screen-time.api";

/**
 * ActivityTracker - the single service that measures ONLY active in-app time.
 *
 * Counts a second when: app is foreground AND the user is "active" - either
 * interacting within the last 60s, or consuming media (videos/live/audio, which
 * are active even without touches). Pauses on background / device sleep / 60s
 * idle, and resumes automatically. Never counts inactive time.
 *
 * Each active second is attributed to the current activity (driven by the
 * focused route) and added to the store. A delta is flushed to the backend
 * every ~60s and on background; the backend buffers in Redis and aggregates.
 */

const IDLE_MS = 60_000;
const MEDIA: Activity[] = ["videos", "live", "audio"];

function routeToActivity(route?: string): Activity {
  if (!route) return "other";
  const r = route.toLowerCase();
  if (r.includes("audio")) return "audio";
  if (r.includes("live")) return "live";
  if (r === "home" || r.includes("feed") || r.includes("videoplayer") || r.includes("hashtag")) return "videos";
  if (r.includes("chat") || r.includes("message") || r.includes("inbox")) return "messages";
  if (r.includes("upload") || r.includes("create")) return "upload";
  if (r.includes("search") || r.includes("explore")) return "search";
  if (r.includes("notification")) return "notifications";
  if (r.includes("setting") || r.includes("screentime") || r.includes("family") ||
      r.includes("appearance") || r.includes("wellbeing") || r.includes("preferences")) return "settings";
  if (r.includes("profile")) return "profile";
  return "other";
}

class ActivityTracker {
  private started = false;
  private activity: Activity = "videos";     // app opens on the feed
  private lastInteraction = Date.now();
  private sessionSeconds = 0;                 // continuous active run → longest session
  private sinceBreak = 0;                     // continuous active run → break reminders
  private pendingSeconds = 0;
  private pendingBreakdown: Partial<Breakdown> = {};
  private tick?: ReturnType<typeof setInterval>;
  private flushTimer?: ReturnType<typeof setInterval>;
  private appSub?: { remove: () => void };

  start() {
    if (this.started) return;
    this.started = true;
    this.lastInteraction = Date.now();
    const store = useScreenTimeStore.getState();
    void store.hydrate().then(() => useScreenTimeStore.getState().loadServer());
    this.appSub = AppState.addEventListener("change", this.onAppState);
    this.tick = setInterval(this.onTick, 1000);
    this.flushTimer = setInterval(() => void this.flush(), 60_000);
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    this.appSub?.remove();
    if (this.tick) clearInterval(this.tick);
    if (this.flushTimer) clearInterval(this.flushTimer);
    void this.flush();
  }

  /** Reset the idle timer - called on any touch / scroll from the app root. */
  poke() { this.lastInteraction = Date.now(); }

  /** Set the current activity (called from the navigation state listener). */
  setActivity(a: Activity) { this.activity = a; }
  setActivityForRoute(route?: string) { this.activity = routeToActivity(route); }

  /** Called when the user acknowledges a break so the next reminder is a full interval away. */
  resetBreak() { this.sinceBreak = 0; }

  private onAppState = (st: AppStateStatus) => {
    if (st === "active") {
      this.poke();
    } else {
      // Background / inactive: end the continuous run and flush what we have.
      this.sessionSeconds = 0;
      void this.flush();
    }
  };

  private isActive(): boolean {
    if (AppState.currentState !== "active") return false;
    if (MEDIA.includes(this.activity)) return true;              // playback counts as active
    return Date.now() - this.lastInteraction < IDLE_MS;
  }

  private onTick = () => {
    const store = useScreenTimeStore.getState();
    store.rollIfNeeded();

    if (!this.isActive()) { this.sessionSeconds = 0; return; }

    store.addSecond(this.activity);
    this.pendingSeconds += 1;
    this.pendingBreakdown[this.activity] = (this.pendingBreakdown[this.activity] ?? 0) + 1;
    this.sessionSeconds += 1;
    this.sinceBreak += 1;
    store.noteSession(this.sessionSeconds);

    const { limits } = store;
    if (limits.break_enabled && this.sinceBreak >= limits.break_interval_minutes * 60) {
      store.triggerBreak();
      this.sinceBreak = 0;
    }

    if (this.pendingSeconds % 15 === 0) store.persist();
  };

  private async flush() {
    const seconds = this.pendingSeconds;
    if (seconds <= 0) return;
    const breakdown = this.pendingBreakdown;
    this.pendingSeconds = 0;
    this.pendingBreakdown = {};
    useScreenTimeStore.getState().persist();
    try {
      await screenTimeApi.heartbeat({
        seconds,
        breakdown,
        longest_session_seconds: useScreenTimeStore.getState().longestSessionSeconds,
        device: "mobile",
      });
    } catch { /* offline / backend not ready - local store is source of truth */ }
  }
}

export const activityTracker = new ActivityTracker();
