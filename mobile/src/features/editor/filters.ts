import type { FilterDef } from "./types";

/**
 * The built-in filter catalogue.
 *
 * These are the *fallback* set. At runtime the app prefers the catalogue the
 * server sends (GET /media-editor/config), which the admin panel edits - these
 * ship in the bundle so the editor still works offline, on a cold start, or if
 * the config request fails, and so a brand-new install has something to show
 * before it has talked to the API.
 *
 * Every entry is nothing but numbers fed to one shader (shaders/colorPipeline.ts).
 * Adding a look here or in the admin panel is the same act; neither needs new
 * rendering code. Keys are permanent - saved media references them, so a key is
 * never reused for a different look.
 */
export const FILTER_CATEGORIES = [
  "Essentials",
  "Vintage",
  "Cinematic",
  "Mono",
  "Scene",
  "Pro",
] as const;

export const BUILT_IN_FILTERS: FilterDef[] = [
  /* ── Essentials ───────────────────────────────────────────────────────── */
  { key: "original", name: "Original", category: "Essentials", sort: 0, params: {} },
  {
    key: "natural",
    name: "Natural",
    category: "Essentials",
    sort: 10,
    params: { contrast: 0.08, vibrance: 0.18, clarity: 0.1 },
  },
  {
    key: "bright",
    name: "Bright",
    category: "Essentials",
    sort: 20,
    params: { exposure: 0.16, brightness: 0.1, shadows: 0.22, vibrance: 0.12 },
  },
  {
    key: "warm",
    name: "Warm",
    category: "Essentials",
    sort: 30,
    params: { temperature: 0.38, vibrance: 0.14, contrast: 0.06 },
  },
  {
    key: "cool",
    name: "Cool",
    category: "Essentials",
    sort: 40,
    params: { temperature: -0.36, tint: -0.06, contrast: 0.08 },
  },
  {
    key: "soft",
    name: "Soft",
    category: "Essentials",
    sort: 50,
    params: { blur: 0.1, contrast: -0.12, fade: 0.16, brightness: 0.05 },
  },

  /* ── Vintage ──────────────────────────────────────────────────────────── */
  {
    key: "vintage",
    name: "Vintage",
    category: "Vintage",
    sort: 60,
    params: {
      temperature: 0.22,
      saturation: -0.24,
      fade: 0.4,
      grain: 0.22,
      vignette: 0.3,
      contrast: 0.06,
    },
  },
  {
    key: "retro",
    name: "Retro",
    category: "Vintage",
    sort: 70,
    params: {
      saturation: 0.16,
      contrast: 0.14,
      fade: 0.28,
      shadowTint: [0.16, 0.1, 0.32],
      highlightTint: [1.0, 0.82, 0.55],
      splitStrength: 0.5,
    },
  },
  {
    key: "film",
    name: "Film",
    category: "Vintage",
    sort: 80,
    params: {
      grain: 0.3,
      fade: 0.26,
      contrast: 0.12,
      saturation: -0.08,
      shadowTint: [0.1, 0.14, 0.22],
      splitStrength: 0.35,
    },
  },
  {
    key: "matte",
    name: "Matte",
    category: "Vintage",
    sort: 90,
    params: { fade: 0.5, contrast: -0.06, saturation: -0.1 },
  },
  {
    key: "vhs",
    name: "VHS",
    category: "Vintage",
    sort: 100,
    params: {
      grain: 0.42,
      fade: 0.32,
      contrast: 0.18,
      saturation: 0.2,
      tintColor: [0.62, 0.5, 0.85],
      tintStrength: 0.14,
      vignette: 0.26,
    },
  },

  /* ── Cinematic ────────────────────────────────────────────────────────── */
  {
    key: "cinematic",
    name: "Cinematic",
    category: "Cinematic",
    sort: 110,
    params: {
      contrast: 0.2,
      saturation: -0.06,
      clarity: 0.16,
      shadowTint: [0.06, 0.2, 0.28],
      highlightTint: [1.0, 0.76, 0.5],
      splitStrength: 0.62,
      vignette: 0.2,
    },
  },
  {
    key: "hdr",
    name: "HDR",
    category: "Cinematic",
    sort: 120,
    params: { clarity: 0.55, contrast: 0.18, vibrance: 0.34, shadows: 0.3, highlights: -0.26 },
  },
  {
    key: "glow",
    name: "Glow",
    category: "Cinematic",
    sort: 130,
    params: { blur: 0.14, brightness: 0.1, exposure: 0.08, vibrance: 0.2, fade: 0.12 },
  },
  {
    key: "dream",
    name: "Dream",
    category: "Cinematic",
    sort: 140,
    params: {
      blur: 0.22,
      fade: 0.3,
      saturation: -0.12,
      tintColor: [0.95, 0.72, 0.86],
      tintStrength: 0.16,
      brightness: 0.06,
    },
  },
  {
    key: "neon",
    name: "Neon",
    category: "Cinematic",
    sort: 150,
    params: {
      saturation: 0.5,
      contrast: 0.28,
      shadowTint: [0.2, 0.0, 0.5],
      highlightTint: [0.0, 0.85, 0.95],
      splitStrength: 0.7,
      vignette: 0.24,
    },
  },

  /* ── Mono ─────────────────────────────────────────────────────────────── */
  {
    key: "bw",
    name: "Black & White",
    category: "Mono",
    sort: 160,
    params: { saturation: -1, contrast: 0.18, clarity: 0.14 },
  },
  {
    key: "sepia",
    name: "Sepia",
    category: "Mono",
    sort: 170,
    params: {
      saturation: -1,
      tintColor: [0.78, 0.6, 0.38],
      tintStrength: 0.72,
      contrast: 0.1,
      fade: 0.14,
    },
  },

  /* ── Scene ────────────────────────────────────────────────────────────── */
  {
    key: "goldenhour",
    name: "Golden Hour",
    category: "Scene",
    sort: 180,
    params: {
      temperature: 0.42,
      exposure: 0.1,
      highlightTint: [1.0, 0.8, 0.45],
      splitStrength: 0.45,
      vibrance: 0.2,
    },
  },
  {
    key: "sunset",
    name: "Sunset",
    category: "Scene",
    sort: 190,
    params: {
      temperature: 0.5,
      saturation: 0.24,
      contrast: 0.12,
      shadowTint: [0.28, 0.08, 0.24],
      highlightTint: [1.0, 0.62, 0.3],
      splitStrength: 0.55,
    },
  },
  {
    key: "night",
    name: "Night",
    category: "Scene",
    sort: 200,
    params: {
      temperature: -0.34,
      shadows: 0.24,
      contrast: 0.2,
      grain: 0.2,
      vignette: 0.32,
      saturation: -0.12,
    },
  },
  {
    key: "landscape",
    name: "Landscape",
    category: "Scene",
    sort: 210,
    params: { vibrance: 0.45, clarity: 0.32, saturation: 0.14, contrast: 0.12, temperature: -0.08 },
  },
  {
    key: "travel",
    name: "Travel",
    category: "Scene",
    sort: 220,
    params: { temperature: 0.18, vibrance: 0.32, contrast: 0.14, clarity: 0.18 },
  },
  {
    key: "food",
    name: "Food",
    category: "Scene",
    sort: 230,
    params: { temperature: 0.2, saturation: 0.22, vibrance: 0.26, clarity: 0.28, brightness: 0.06 },
  },

  /* ── Pro ──────────────────────────────────────────────────────────────── */
  {
    key: "portrait",
    name: "Portrait",
    category: "Pro",
    sort: 240,
    params: { blur: 0.06, temperature: 0.14, brightness: 0.06, clarity: -0.1, vibrance: 0.16 },
  },
  {
    key: "studio",
    name: "Studio",
    category: "Pro",
    sort: 250,
    params: { clarity: 0.3, contrast: 0.16, sharpness: 0.2, vibrance: 0.1 },
  },
  {
    key: "premium",
    name: "Premium",
    category: "Pro",
    sort: 260,
    params: {
      contrast: 0.14,
      clarity: 0.22,
      fade: 0.14,
      shadowTint: [0.1, 0.13, 0.2],
      highlightTint: [1.0, 0.94, 0.84],
      splitStrength: 0.4,
      vibrance: 0.16,
    },
  },
];

/** The look every editor session opens on. */
export const DEFAULT_FILTER_KEY = "original";

export function findFilter(list: FilterDef[], key: string): FilterDef {
  return list.find((f) => f.key === key) ?? list[0] ?? BUILT_IN_FILTERS[0];
}

/** Enabled filters in the admin's chosen order, ready for the rail. */
export function orderedFilters(list: FilterDef[]): FilterDef[] {
  return list
    .filter((f) => f.enabled !== false)
    .slice()
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
}
