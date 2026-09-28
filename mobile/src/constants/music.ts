/**
 * Music-library taxonomy and rules, mirrored from the website's
 * studio-music-library-page.tsx so both surfaces filter by the same keys.
 *
 * The category ids are not cosmetic: the server matches on them directly. Most
 * fall through to a mood ILIKE, a handful map to a genre, and four change the
 * SCOPE rather than the filter (trending / featured / recommended / originals).
 */

export type MusicTab = "all" | "reelsoo_originals" | "artist_originals";

/** The website calls the third tab "My Original Sound" but sends
 *  `artist_originals`, which server-side means ANY non-Reelsoo upload, not the
 *  current user's sounds. We use the honest label for what the API returns. */
export const MUSIC_TABS: { key: MusicTab; label: string }[] = [
  { key: "all", label: "All tracks" },
  { key: "reelsoo_originals", label: "Teezer Originals" },
  { key: "artist_originals", label: "Artist uploads" },
];

/** Category → server `category` param. Order matches the website's carousel. */
export const MUSIC_CATEGORIES: { key: string; label: string; color: string }[] = [
  { key: "all",        label: "All",        color: "#fe2c55" },
  { key: "trending",   label: "Trending",   color: "#f97316" },
  { key: "happy",      label: "Happy",      color: "#f59e0b" },
  { key: "chill",      label: "Chill",      color: "#0ea5e9" },
  { key: "energetic",  label: "Energetic",  color: "#dc2626" },
  { key: "cinematic",  label: "Cinematic",  color: "#7c3aed" },
  { key: "vlog",       label: "Vlog",       color: "#16a34a" },
  { key: "calm",       label: "Calm",       color: "#06b6d4" },
  { key: "romantic",   label: "Romantic",   color: "#ec4899" },
  { key: "acoustic",   label: "Acoustic",   color: "#a16207" },
  { key: "lo_fi",      label: "Lo-fi",      color: "#8b5cf6" },
  { key: "gaming",     label: "Gaming",     color: "#22c55e" },
  { key: "workout",    label: "Workout",    color: "#ef4444" },
  { key: "party",      label: "Party",      color: "#d946ef" },
  { key: "study",      label: "Study",      color: "#3b82f6" },
  { key: "morning",    label: "Morning",    color: "#fbbf24" },
  { key: "pop",        label: "Pop",        color: "#f43f5e" },
  { key: "hip_hop",    label: "Hip-hop",    color: "#6366f1" },
  { key: "electronic", label: "Electronic", color: "#14b8a6" },
  { key: "rock",       label: "Rock",       color: "#78716c" },
  { key: "jazz",       label: "Jazz",       color: "#b45309" },
  { key: "rnb",        label: "R&B",        color: "#9333ea" },
  { key: "classical",  label: "Classical",  color: "#64748b" },
  { key: "indie",      label: "Indie",      color: "#0891b2" },
  { key: "nepali",     label: "Nepali",     color: "#dc2626" },
];

export const MUSIC_DURATIONS: { key: "short" | "medium" | "long" | "very_long"; label: string }[] = [
  { key: "short", label: "Under 1 min" },
  { key: "medium", label: "1 - 3 min" },
  { key: "long", label: "3 - 5 min" },
  { key: "very_long", label: "Over 5 min" },
];

export const MUSIC_GENRES: string[] = [
  "Pop", "Hip-hop", "R&B / Soul", "Electronic / EDM", "Dance", "Rock",
  "Indie / Alternative", "Jazz", "Classical", "Folk / Acoustic", "Country",
  "Reggae", "Lo-fi", "Cinematic / Film Score", "Ambient", "Instrumental",
  "Nepali", "Hindi / Bollywood", "Latin", "Afrobeats", "K-Pop", "J-Pop",
  "Gospel / Worship", "Blues", "Trap", "House", "Techno", "Drum & Bass",
];

export const MUSIC_MOODS: string[] = [
  "Happy", "Chill", "Romantic", "Motivational", "Sad / Melancholy", "Energetic",
  "Peaceful", "Dark / Mysterious", "Epic / Dramatic", "Workout / Pump-up",
  "Vlog / Casual", "Travel / Adventure", "Calm / Relaxing", "Party / Festive",
  "Study / Focus", "Morning Vibes", "Nostalgic", "Dreamy", "Angry / Intense",
  "Uplifting", "Spiritual", "Suspenseful", "Playful / Fun", "Cinematic",
];

/** Mood pill colours - the website tints each mood, so the same mood reads the
 *  same colour on both surfaces. Anything unlisted falls back to grey. */
export const MOOD_COLOR: Record<string, string> = {
  Happy: "#f59e0b", Chill: "#0ea5e9", Romantic: "#ec4899", Motivational: "#16a34a",
  "Sad / Melancholy": "#64748b", Energetic: "#dc2626", Peaceful: "#06b6d4",
  "Dark / Mysterious": "#4c1d95", "Epic / Dramatic": "#7c3aed",
  "Workout / Pump-up": "#ef4444", "Vlog / Casual": "#22c55e",
  "Travel / Adventure": "#0891b2", "Calm / Relaxing": "#14b8a6",
  "Party / Festive": "#d946ef", "Study / Focus": "#3b82f6",
  "Morning Vibes": "#fbbf24", Nostalgic: "#a16207", Dreamy: "#8b5cf6",
  "Angry / Intense": "#b91c1c", Uplifting: "#f97316", Spiritual: "#0d9488",
  Suspenseful: "#334155", "Playful / Fun": "#f43f5e", Cinematic: "#6366f1",
};

/** The Audio Copyright Guide, verbatim from the website's right rail. These are
 *  the rules a creator is held to, so they are shown, not buried. */
export const COPYRIGHT_RULES: { text: string; tone: "ok" | "warn" | "bad" }[] = [
  { text: "Use licensed music to avoid copyright claims.", tone: "ok" },
  { text: 'Look for "Free for social" for worry-free use.', tone: "ok" },
  { text: "Attribution required? Give credit in your post.", tone: "warn" },
  { text: "Don't remix or repost full tracks.", tone: "bad" },
];

/** license_type is free text; the website treats anything that isn't
 *  free_for_social as needing attribution. */
export function licenseLabel(license: string | null): { text: string; ok: boolean } {
  const ok = !license || license === "free_for_social";
  return { text: ok ? "Free for social" : "Attribution required", ok };
}
