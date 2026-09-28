/** Reelsoo brand palette - light theme first. Primary brand red/pink: #fe2c55. */
export const colors = {
  brand: "#fe2c55",
  brandDark: "#e0243d",
  brandTint: "#fff0f4",

  // Surfaces (light theme)
  bg: "#ffffff",
  bgMuted: "#f8f9fb",
  card: "#ffffff",
  border: "#f0f0f0",
  borderStrong: "#e5e7eb",

  // Text
  text: "#111827",
  textSecondary: "#374151",
  textMuted: "#6b7280",
  textFaint: "#9ca3af",

  // Status
  success: "#16a34a",
  warning: "#f97316",
  danger: "#dc2626",
  info: "#2563eb",

  white: "#ffffff",
  black: "#000000",
  // For the full-screen video feed (dark surface regardless of theme)
  feedBg: "#000000",
  feedText: "#ffffff",
} as const;

export type ColorKey = keyof typeof colors;
