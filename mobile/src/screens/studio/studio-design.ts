/**
 * Reelsoo Studio's design tokens, taken verbatim from the Claude Design
 * prototype "ReelSoo App.dc.html" (the `studioOpen` panel).
 *
 * Studio is the one surface in the app drawn on WHITE with hairline #EFECF1
 * cards and a near-black #141318 hero - it does not share the main app's
 * `colors` palette (grey #F7F7F8 page, brand #fe2c55). Rather than bend either
 * palette to fit the other, the prototype's own hexes live here, next to the
 * screens that use them.
 *
 * Only the two Studio chrome/dashboard files import this; every other Studio
 * section is still on `colors` and is deliberately left alone.
 */
export const sd = {
  /** Page + card surface. Studio is white, not the app's muted grey. */
  page: "#FFFFFF",
  /** Hero / active-chip ink. Not quite black - the prototype's #141318. */
  ink: "#141318",
  accent: "#F42B5B",

  text: "#121014",
  /** Row subtitles, axis labels. */
  muted: "#8A8592",
  /** Dates, chart axes - one step lighter than muted. */
  faint: "#B6B1BE",
  /** Tile captions. */
  slate: "#4A4653",

  /** Card + tile borders. */
  line: "#EFECF1",
  /** List dividers and the nav row's underline. */
  divider: "#F4F2F5",
  /** Icon tiles, chips, search fields. */
  fill: "#F4F2F5",
  /** Quick-action tiles - a hair warmer than `fill`. */
  fillSoft: "#F7F6F8",

  /** Growth, on white and on the dark hero respectively. */
  up: "#1F9D6B",
  upOnDark: "#5FE0AE",
  upWash: "#EAF6F0",
  down: "#E23B4E",
  downWash: "#FDECEF",

  /** Placeholder thumbnail weave, for posts with no poster frame. */
  thumbA: "#DED9E2",
  thumbB: "#D4CFD9",
} as const;

/** Corner radii the prototype uses. Larger than the app's - Studio's cards are
 *  18-24px where the rest of the app is 12-16px. */
export const sr = {
  chip: 12,
  card: 16,
  tile: 18,
  panel: 20,
  hero: 24,
  pill: 999,
} as const;
