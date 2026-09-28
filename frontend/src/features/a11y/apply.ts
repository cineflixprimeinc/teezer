import type { AccessibilityPrefs } from "@/services/accessibility.service";

/**
 * Turns saved Accessibility Settings into live page effects by stamping
 * `data-a11y-*` attributes (+ a text-zoom variable) on <html>. The CSS that
 * consumes these lives in globals.css. A localStorage copy lets the applier
 * restore the user's setup instantly on load, before the API answers.
 */

const CACHE_KEY = "teezer:a11y";

/* Effective page zoom per text size; "Larger Text" adds one extra bump. */
const TEXT_ZOOM: Record<string, number> = { small: 0.95, medium: 1, large: 1.08, xlarge: 1.16 };

export function applyA11y(prefs: AccessibilityPrefs): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  const zoom = (TEXT_ZOOM[prefs.text_size] ?? 1) * (prefs.larger_text ? 1.08 : 1);
  root.style.setProperty("--a11y-zoom", String(zoom));

  root.setAttribute("data-a11y-contrast", prefs.high_contrast ? "1" : "0");
  root.setAttribute("data-a11y-transparency", prefs.reduce_transparency ? "1" : "0");
  root.setAttribute("data-a11y-motion", prefs.reduce_motion ? "1" : "0");
  root.setAttribute("data-a11y-pointer", prefs.pointer_size);
  root.setAttribute("data-a11y-kbd", prefs.keyboard_navigation ? "1" : "0");
  // Consumed by the video player + components (captions, narration, autoplay).
  root.setAttribute("data-a11y-sr", prefs.screen_reader ? "1" : "0");
  root.setAttribute("data-a11y-captions", prefs.captions_always_on ? "1" : "0");
  root.setAttribute("data-a11y-caption-style", prefs.caption_style);
  root.setAttribute("data-a11y-autoplay", prefs.autoplay_videos ? "1" : "0");

  try { localStorage.setItem(CACHE_KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
}

/** Re-apply the last saved setup instantly (before the server copy arrives). */
export function applyCachedA11y(): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) applyA11y(JSON.parse(raw));
  } catch { /* corrupted cache - server copy will overwrite */ }
}
