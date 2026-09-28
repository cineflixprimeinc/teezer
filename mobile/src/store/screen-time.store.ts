import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ACTIVITIES, SCREEN_TIME_LIMIT_DEFAULTS, screenTimeApi,
  type Activity, type Breakdown, type ScreenTimeLimits, type ScreenTimeSummary,
} from "@/api/screen-time.api";

/**
 * Screen Time store - the app's live source of truth for today's usage. The
 * ActivityTracker calls addSecond() each active second; the UI subscribes for a
 * live-updating page. Everything is persisted locally (offline-first) and merged
 * with the server on load. Enforcement flags (limitReached / breakDue) are read
 * by the root ScreenTimeGate to show the limit page / break popup.
 */

const DAY_KEY = "teezer:screentime:day";
const HIST_KEY = "teezer:screentime:history";
const LIMITS_KEY = "teezer:screentime:limits";

export function localDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function emptyBreakdown(): Breakdown {
  return ACTIVITIES.reduce((acc, k) => { acc[k] = 0; return acc; }, {} as Breakdown);
}

interface ScreenTimeState {
  date: string;
  todaySeconds: number;
  breakdown: Breakdown;
  longestSessionSeconds: number;
  history: Record<string, number>;          // date -> total seconds (local rollup)
  limits: ScreenTimeLimits;
  summary: ScreenTimeSummary | null;
  loaded: boolean;

  // enforcement runtime
  limitReached: boolean;
  continueUntil: number | null;             // epoch ms; while set + future, limit is bypassed
  breakDue: boolean;

  hydrate: () => Promise<void>;
  loadServer: () => Promise<void>;
  rollIfNeeded: () => void;
  addSecond: (activity: Activity) => void;
  noteSession: (seconds: number) => void;
  triggerBreak: () => void;
  dismissBreak: () => void;
  grantContinue: (minutes: number) => void;
  setLimits: (patch: Partial<ScreenTimeLimits>) => void;
  persist: () => void;
}

export const useScreenTimeStore = create<ScreenTimeState>((set, get) => ({
  date: localDate(),
  todaySeconds: 0,
  breakdown: emptyBreakdown(),
  longestSessionSeconds: 0,
  history: {},
  limits: SCREEN_TIME_LIMIT_DEFAULTS,
  summary: null,
  loaded: false,
  limitReached: false,
  continueUntil: null,
  breakDue: false,

  hydrate: async () => {
    try {
      const [dayRaw, histRaw, limRaw] = await Promise.all([
        AsyncStorage.getItem(DAY_KEY),
        AsyncStorage.getItem(HIST_KEY),
        AsyncStorage.getItem(LIMITS_KEY),
      ]);
      const patch: Partial<ScreenTimeState> = { loaded: true };
      if (histRaw) patch.history = JSON.parse(histRaw);
      if (limRaw) patch.limits = { ...SCREEN_TIME_LIMIT_DEFAULTS, ...JSON.parse(limRaw) };
      if (dayRaw) {
        const day = JSON.parse(dayRaw) as { date: string; total: number; breakdown: Breakdown; longest: number };
        if (day.date === localDate()) {
          patch.date = day.date;
          patch.todaySeconds = day.total ?? 0;
          patch.breakdown = { ...emptyBreakdown(), ...(day.breakdown ?? {}) };
          patch.longestSessionSeconds = day.longest ?? 0;
        }
      }
      set(patch);
    } catch { set({ loaded: true }); }
  },

  loadServer: async () => {
    try {
      const [today, summary, limits] = await Promise.all([
        screenTimeApi.today(),
        screenTimeApi.summary(),
        screenTimeApi.limits(),
      ]);
      const s = get();
      // Server is authoritative for history/summary; for TODAY take the max so a
      // just-counted local second is never lost to a slightly-behind server value.
      set({
        todaySeconds: Math.max(s.todaySeconds, today.total_seconds ?? 0),
        breakdown: { ...s.breakdown, ...(today.breakdown ?? {}) },
        longestSessionSeconds: Math.max(s.longestSessionSeconds, today.longest_session_seconds ?? 0),
        summary,
        limits: { ...SCREEN_TIME_LIMIT_DEFAULTS, ...limits },
        loaded: true,
      });
    } catch { /* backend not ready / offline - local data stands */ }
  },

  rollIfNeeded: () => {
    const s = get();
    const d = localDate();
    if (s.date === d) return;
    // Archive the finished day into local history, then reset for the new day.
    const history = { ...s.history, [s.date]: s.todaySeconds };
    set({
      date: d,
      history,
      todaySeconds: 0,
      breakdown: emptyBreakdown(),
      longestSessionSeconds: 0,
      limitReached: false,
      continueUntil: null,
      breakDue: false,
    });
  },

  addSecond: (activity) => {
    const s = get();
    const total = s.todaySeconds + 1;
    const breakdown = { ...s.breakdown, [activity]: (s.breakdown[activity] ?? 0) + 1 };
    const granted = s.continueUntil != null && Date.now() < s.continueUntil;
    const limitReached = s.limits.daily_limit_enabled && !granted && total >= s.limits.daily_limit_minutes * 60;
    set({ todaySeconds: total, breakdown, limitReached });
  },

  noteSession: (seconds) => {
    if (seconds > get().longestSessionSeconds) set({ longestSessionSeconds: seconds });
  },

  triggerBreak: () => set({ breakDue: true }),
  dismissBreak: () => set({ breakDue: false }),

  grantContinue: (minutes) => set({ continueUntil: Date.now() + minutes * 60_000, limitReached: false }),

  setLimits: (patch) => {
    const limits = { ...get().limits, ...patch };
    set({ limits });
    void AsyncStorage.setItem(LIMITS_KEY, JSON.stringify(limits)).catch(() => {});
    void screenTimeApi.updateLimits(patch).catch(() => {});
  },

  persist: () => {
    const s = get();
    void AsyncStorage.setItem(DAY_KEY, JSON.stringify({
      date: s.date, total: s.todaySeconds, breakdown: s.breakdown, longest: s.longestSessionSeconds,
    })).catch(() => {});
    void AsyncStorage.setItem(HIST_KEY, JSON.stringify(s.history)).catch(() => {});
  },
}));
