"use client";

import { create } from "zustand";

export type VideoQuality     = "auto" | "4k" | "1080" | "720" | "480" | "360";
export type AppTheme         = "light" | "dark";
export type AppLang          = string; // BCP-47 code, e.g. "en", "ne", "hi"
export type PlaybackSpeed    = 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2 | 3;

type UiState = {
  autoScroll:      boolean;
  quality:         VideoQuality;
  captionsEnabled: boolean;
  theme:           AppTheme;
  language:        AppLang;
  /** Persisted mute preference - applied to every feed video on load. */
  mutedPref:       boolean;
  /** Persisted volume level 0-1 - applied to every feed video on load. */
  volumePref:      number;
  /** Session-only playback speed - resets to 1x on reload. */
  playbackSpeed:   PlaybackSpeed;
  setAutoScroll:      (v: boolean) => void;
  setQuality:         (q: VideoQuality) => void;
  setCaptionsEnabled: (v: boolean) => void;
  setTheme:           (t: AppTheme) => void;
  setLanguage:        (l: AppLang) => void;
  setMutedPref:       (v: boolean) => void;
  setVolumePref:      (v: number)  => void;
  setPlaybackSpeed:   (v: PlaybackSpeed) => void;
};

const LS_AUTO_SCROLL = "reelsoo:autoScroll";
const LS_THEME       = "reelsoo:theme";
const LS_LANG        = "reelsoo:language";
const LS_MUTED       = "reelsoo_video_muted";
const LS_VOLUME      = "reelsoo_video_volume";

function readAutoScroll(): boolean {
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem(LS_AUTO_SCROLL);
  return raw === null ? false : raw === "1";   // default OFF site-wide
}

function readQuality(): VideoQuality {
  // Quality is session-only - always start at original quality.
  // User may change it per-session but it resets on reload.
  return "auto";
}

function readTheme(): AppTheme {
  if (typeof window === "undefined") return "light";
  return window.localStorage.getItem(LS_THEME) === "dark" ? "dark" : "light";
}

function readLang(): AppLang {
  if (typeof window === "undefined") return "en";
  return window.localStorage.getItem(LS_LANG) ?? "en";
}

function readMuted(): boolean {
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem(LS_MUTED);
  // No saved value → first visit → default UNMUTED (sound ON).
  // Saved value → user manually changed preference → respect it.
  return raw === null ? false : raw === "1";
}

function readVolume(): number {
  if (typeof window === "undefined") return 1;
  const raw = window.localStorage.getItem(LS_VOLUME);
  if (raw === null) return 1;
  const n = parseFloat(raw);
  return isFinite(n) ? Math.max(0, Math.min(1, n)) : 1;
}

function applyTheme(t: AppTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", t);
}

// Apply saved theme immediately on store init (client-side)
if (typeof window !== "undefined") {
  applyTheme(readTheme());
}

export const useUiStore = create<UiState>((set) => ({
  autoScroll:      readAutoScroll(),
  quality:         readQuality(),
  captionsEnabled: false,
  theme:           readTheme(),
  language:        readLang(),
  mutedPref:       readMuted(),
  volumePref:      readVolume(),
  playbackSpeed:   1,
  setAutoScroll(v) {
    if (typeof window !== "undefined") window.localStorage.setItem(LS_AUTO_SCROLL, v ? "1" : "0");
    set({ autoScroll: v });
  },
  setQuality(q) {
    // Session-only - not persisted so quality resets to original on reload.
    set({ quality: q });
  },
  setCaptionsEnabled(v) { set({ captionsEnabled: v }); },
  setTheme(t) {
    if (typeof window !== "undefined") window.localStorage.setItem(LS_THEME, t);
    applyTheme(t);
    set({ theme: t });
  },
  setLanguage(l) {
    if (typeof window !== "undefined") window.localStorage.setItem(LS_LANG, l);
    set({ language: l });
  },
  setMutedPref(v) {
    if (typeof window !== "undefined") window.localStorage.setItem(LS_MUTED, v ? "1" : "0");
    set({ mutedPref: v });
  },
  setVolumePref(v) {
    const clamped = Math.max(0, Math.min(1, v));
    if (typeof window !== "undefined") window.localStorage.setItem(LS_VOLUME, String(clamped));
    set({ volumePref: clamped });
  },
  setPlaybackSpeed(v) { set({ playbackSpeed: v }); },
}));
