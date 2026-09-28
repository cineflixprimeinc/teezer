import { api } from "./client";

/**
 * Screen Time - tracks ONLY active in-app usage (never device-wide). The client
 * counts active seconds locally (ActivityTracker) and flushes deltas here every
 * ~60s; the backend buffers in Redis and aggregates to Postgres every 5 min.
 * Reads are server-authoritative but the app renders local data first so the
 * page is always instant and works offline.
 */

export type Activity =
  | "videos" | "live" | "audio" | "messages" | "profile"
  | "upload" | "search" | "notifications" | "settings" | "other";

export const ACTIVITIES: Activity[] = [
  "videos", "live", "audio", "messages", "profile",
  "upload", "search", "notifications", "settings", "other",
];

export type Breakdown = Record<Activity, number>; // seconds per activity

export interface ScreenTimeLimits {
  goal_minutes: number;
  daily_limit_enabled: boolean;
  daily_limit_minutes: number;
  break_enabled: boolean;
  break_interval_minutes: number;
  bedtime_enabled: boolean;
  bedtime_start: string;              // "HH:MM"
  bedtime_end: string;
  bedtime_disable_feed: boolean;
  bedtime_disable_live: boolean;
  bedtime_disable_audio: boolean;
  bedtime_disable_upload: boolean;
  bedtime_mute_notifications: boolean;
  focus_hide_notifications: boolean;
  focus_disable_infinite_scroll: boolean;
  focus_disable_autoplay: boolean;
  focus_hide_recommended: boolean;
  focus_pause_messages: boolean;
}

export interface ScreenTimeDay { date: string; total_seconds: number }
export interface ScreenTimeToday {
  date: string;
  total_seconds: number;
  breakdown: Partial<Breakdown>;
  longest_session_seconds: number;
  yesterday_seconds: number;
}
export interface ScreenTimeSummary {
  today_seconds: number;
  yesterday_seconds: number;
  week_seconds: number;
  month_seconds: number;
  avg_daily_seconds: number;
  longest_session_seconds: number;
}
export interface WeeklyReport {
  avg_daily_seconds: number;
  most_active_day: string | null;
  least_active_day: string | null;
  longest_session_seconds: number;
  favorite_activity: Activity | null;
  trend_pct: number;                  // vs previous week
}
export interface MonthlyReport {
  total_seconds: number;
  avg_daily_seconds: number;
  weekly: { week_start: string; total_seconds: number }[];
  trend_pct: number;                  // vs previous month
}

export interface HeartbeatPayload {
  seconds: number;
  breakdown: Partial<Breakdown>;
  longest_session_seconds?: number;
  device?: string;
}

export const screenTimeApi = {
  heartbeat: (p: HeartbeatPayload) =>
    api.post<{ success: boolean; data?: { total_seconds: number } }>("/screen-time/heartbeat", p).then((r) => r.data),
  today: () =>
    api.get<{ success: boolean; data: ScreenTimeToday }>("/screen-time/today").then((r) => r.data.data),
  summary: () =>
    api.get<{ success: boolean; data: ScreenTimeSummary }>("/screen-time/summary").then((r) => r.data.data),
  graph: (range: 7 | 30 | 90) =>
    api.get<{ success: boolean; data: ScreenTimeDay[] }>(`/screen-time/graph?range=${range}`).then((r) => r.data.data ?? []),
  limits: () =>
    api.get<{ success: boolean; data: ScreenTimeLimits }>("/screen-time/limits").then((r) => r.data.data),
  updateLimits: (p: Partial<ScreenTimeLimits>) =>
    api.patch<{ success: boolean; data: ScreenTimeLimits }>("/screen-time/limits", p).then((r) => r.data.data),
  weekly: () =>
    api.get<{ success: boolean; data: WeeklyReport }>("/screen-time/reports/weekly").then((r) => r.data.data),
  monthly: () =>
    api.get<{ success: boolean; data: MonthlyReport }>("/screen-time/reports/monthly").then((r) => r.data.data),
};

export const SCREEN_TIME_LIMIT_DEFAULTS: ScreenTimeLimits = {
  goal_minutes: 180,
  daily_limit_enabled: false,
  daily_limit_minutes: 120,
  break_enabled: false,
  break_interval_minutes: 60,
  bedtime_enabled: false,
  bedtime_start: "22:00",
  bedtime_end: "07:00",
  bedtime_disable_feed: true,
  bedtime_disable_live: true,
  bedtime_disable_audio: true,
  bedtime_disable_upload: true,
  bedtime_mute_notifications: true,
  focus_hide_notifications: false,
  focus_disable_infinite_scroll: false,
  focus_disable_autoplay: false,
  focus_hide_recommended: false,
  focus_pause_messages: false,
};
