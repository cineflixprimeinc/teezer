import { useEffect, useState } from "react";

const COMPACT_TIERS: [number, string][] = [
  [1_000_000_000, "B"],
  [1_000_000, "M"],
  [1_000, "K"],
];

/**
 * Compact counts: 1200 → "1.2K", 3_400_000 → "3.4M". Matches the website's
 * `Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 })`
 * exactly - rounds (not truncates) to 1 decimal, drops a trailing ".0", and
 * carries a rounding overflow into the next unit (999999 → "1M", not "1000K").
 *
 * Scaling is `(abs * 10) / threshold` rather than `(abs / threshold) * 10` so
 * exact-tie values land on a directly-representable float instead of
 * accumulating binary rounding error first: e.g. 1950/1000 is stored as
 * 1.9499999999999999..., so `(1950/1000).toFixed(1)` gives "1.9" - multiplying
 * by 10 before dividing keeps the intermediate value (19500/1000 = 19.5) exact,
 * since .5 is always exactly representable in binary floating point.
 */
export function formatCompact(value?: number | null): string {
  const n = value ?? 0;
  if (!Number.isFinite(n)) return "0";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs < 1000) return `${sign}${Math.round(abs)}`;
  for (let i = 0; i < COMPACT_TIERS.length; i++) {
    const [threshold, tierSuffix] = COMPACT_TIERS[i];
    if (abs < threshold) continue;
    let scaled = Math.round((abs * 10) / threshold) / 10;
    let suffix = tierSuffix;
    if (scaled >= 1000 && i > 0) {
      // Rounding carried into the next larger unit (e.g. 999.95M → "1B").
      const [biggerThreshold, biggerSuffix] = COMPACT_TIERS[i - 1];
      scaled = Math.round((abs * 10) / biggerThreshold) / 10;
      suffix = biggerSuffix;
    }
    return `${sign}${scaled}${suffix}`;
  }
  return `${sign}${Math.round(abs)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2022-01-08T..." → "Joined Jan 2022". */
export function joinedLabel(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `Joined ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Seconds → "0:13" / "1:04" / "12:09". */
export function formatDuration(seconds?: number | null): string {
  const s = Math.max(0, Math.floor(seconds ?? 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export interface LevelInfo {
  level: number; // 1..6
  name: string; // e.g. "Rising Star"
  xp: number;
  floor: number; // XP at the start of this level
  ceil: number; // XP needed to reach the next level
  progress: number; // 0..1 within the current level
}

// Mirrors the website's creator-level thresholds so the badge/level number match.
const LEVELS: { level: number; name: string; min: number; max: number }[] = [
  { level: 1, name: "Newcomer", min: 0, max: 100 },
  { level: 2, name: "Rising Talent", min: 100, max: 500 },
  { level: 3, name: "Influencer", min: 500, max: 1500 },
  { level: 4, name: "Trendsetter", min: 1500, max: 5000 },
  { level: 5, name: "Icon", min: 5000, max: 15000 },
  { level: 6, name: "Rising Star", min: 15000, max: 100000 },
];

/** Resolve XP (+ optional backend level name) into level number, name and progress. */
export function creatorLevel(xp = 0, backendName?: string | null): LevelInfo {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.min) cur = l;
  const span = cur.max - cur.min || 1;
  const progress = Math.max(0, Math.min(1, (xp - cur.min) / span));
  return { level: cur.level, name: backendName || cur.name, xp, floor: cur.min, ceil: cur.max, progress };
}

/** "1 min ago" / "3 hours ago" / "2 days ago" / falls back to a date past a week. */
export function relativeTime(iso?: string | null): string {
  if (!iso) return "";
  // "+00:00"-style offsets are valid ISO-8601 but not every JS engine parses
  // them as reliably as the "Z" form - normalize so this can never silently
  // fail (and always land on the same instant) regardless of engine.
  const normalized = /[+-]\d{2}:\d{2}$/.test(iso) ? iso.replace(/([+-])(\d{2}):(\d{2})$/, "$1$2$3") : iso;
  const t = new Date(normalized).getTime();
  if (Number.isNaN(t)) return "";

  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 45) return "Just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  const w = Math.round(d / 7);
  if (w < 5) return `${w} week${w === 1 ? "" : "s"} ago`;
  return new Date(normalized).toLocaleDateString();
}

/**
 * relativeTime() only recomputes when its component re-renders - with no
 * timer, a row rendered while "Just now" stays frozen on that text forever
 * (React doesn't re-render just because wall-clock time passed). Call this
 * inside any component that displays relativeTime() to force a re-render
 * every `intervalMs`, keeping the label live while the screen stays open.
 */
export function useRelativeTimeTick(intervalMs = 20_000): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
