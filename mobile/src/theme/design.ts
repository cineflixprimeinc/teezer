/**
 * Design tokens for the app rebuild, taken verbatim from the Claude Design
 * prototype "ReelSoo App.dc.html" (iPhone 393x852).
 *
 * Deliberately SEPARATE from `@/constants/colors`: that palette is on #fe2c55 and
 * the existing auth / settings / legal screens are built against it. The design
 * is on #F42B5B. Editing the old palette in place would silently restyle screens
 * this rebuild hasn't touched yet, so the two coexist until every surface has
 * been migrated - at which point `colors.ts` can be retired.
 *
 * Values are the literal hexes from the prototype, not approximations.
 */

export const ds = {
  /** Brand accent. The prototype's ACCENT constant. */
  accent: "#F42B5B",
  accentPressed: "#C81F46",
  accentWash: "#FDECF1",

  /* ── Light surfaces ─────────────────────────────────────────────── */
  /** App background behind the phone frame / light screens. */
  bg: "#F3F1F4",
  surface: "#FFFFFF",
  surfaceMuted: "#FAF9FA",
  surfaceSunken: "#F1EFF3",
  surfaceAlt: "#F0EDF1",
  surfaceAlt2: "#EDEAEF",

  /* ── Dark surfaces (feed / rooms / dark sheets) ─────────────────── */
  dark: "#0E0D11",
  darkDeep: "#0A090C",
  darkSheet: "#17161B",
  darkChrome: "#24222A",

  /* ── Text ───────────────────────────────────────────────────────── */
  text: "#121014",
  textMuted: "#8A8592",
  textDim: "#6E6979",
  textFaint: "#9C97A5",
  onDark: "#FFFFFF",

  /* ── Lines ──────────────────────────────────────────────────────── */
  line: "#E3DFE7",
  lineSoft: "#EFECF1",
  lineStrong: "#D6D1DB",
  lineFaint: "#E7E4E9",

  /* ── Accents used by chips / states ─────────────────────────────── */
  slate: "#4A4653",
  slateDeep: "#3A3742",
  silver: "#B6B1BE",
  silverSoft: "#C4BFCB",
  info: "#2FB6F0",
} as const;

/**
 * Tab bar colours.
 *
 * The prototype inverts the whole bar on Home, because Home is full-bleed video
 * and anything opaque and light would cut a slab out of the frame. Every other
 * tab sits on a light surface. `light` here means "the screen behind the bar is
 * light", i.e. NOT Home - matching `const light = s.tab !== "home"`.
 */
export function tabPalette(light: boolean) {
  return {
    // Solid black on the feed, not a translucent near-black: the video runs
    // right up to the bar, and at 0.94 the frame showed through and the bar
    // shifted tint with whatever was playing behind it.
    bg: light ? "rgba(250,249,250,0.96)" : "#000000",
    line: light ? "#EAE7EC" : "rgba(255,255,255,0.08)",
    // Off the feed the bar is white, and the icons are BLACK on it - the accent
    // pink read as decoration against a light surface and the muted grey was
    // barely there. The current tab is full black, the rest are held back just
    // enough to separate them.
    active: light ? ds.text : "#FFFFFF",
    // On the feed the whole bar reads white. The inactive tabs are only barely
    // held back (0.9 vs 1.0) so the current tab still stands out, rather than
    // the grey they used to be against the video.
    inactive: light ? "rgba(18,16,20,0.55)" : "rgba(255,255,255,0.9)",
  };
}

/** Phone-frame reference size the design was drawn against. */
export const DESIGN_VIEWPORT = { width: 393, height: 852 } as const;

export const radius = {
  sm: 8,
  md: 11,
  lg: 14,
  xl: 18,
  sheet: 18,
  pill: 999,
} as const;

export const type = {
  /** Tab label. */
  tab: { size: 11.5, weight: "600" as const },
  /** Action-rail counters under the feed icons. */
  railCount: { size: 12.5, weight: "700" as const },
  caption: { size: 13, weight: "400" as const },
  body: { size: 14, weight: "400" as const },
  title: { size: 17, weight: "700" as const },
} as const;
