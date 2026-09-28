import type { AdjustmentDef, AdjustmentKey, Adjustments, FilterExtras, RenderParams } from "./types";

/**
 * The 17 adjustments, as data.
 *
 * Every slider is centred on 0 except Opacity, whose untouched value is 1 -
 * that is what `neutral` records, and why Reset walks this table instead of
 * zeroing the object (zeroing would hand back a transparent frame).
 *
 * Ranges are the *slider's* domain, not the shader's. Exposure, hue and gamma
 * are all -1..1 here and are mapped to stops / degrees / a gamma curve in
 * buildUniforms (shaders/colorPipeline.ts), so the UI never has to know that
 * gamma is multiplicative while brightness is additive.
 *
 * `costly` marks the three that sample neighbouring pixels. The shader skips
 * those taps entirely when all three are neutral, which is the difference
 * between 1 and 9 texture reads per pixel on a low-end Android.
 */
export const ADJUSTMENTS: AdjustmentDef[] = [
  { key: "brightness", label: "Brightness", min: -1, max: 1, neutral: 0 },
  { key: "contrast", label: "Contrast", min: -1, max: 1, neutral: 0 },
  { key: "saturation", label: "Saturation", min: -1, max: 1, neutral: 0 },
  { key: "exposure", label: "Exposure", min: -1, max: 1, neutral: 0 },
  { key: "highlights", label: "Highlights", min: -1, max: 1, neutral: 0 },
  { key: "shadows", label: "Shadows", min: -1, max: 1, neutral: 0 },
  { key: "temperature", label: "Temperature", min: -1, max: 1, neutral: 0 },
  { key: "tint", label: "Tint", min: -1, max: 1, neutral: 0 },
  { key: "hue", label: "Hue", min: -1, max: 1, neutral: 0 },
  { key: "gamma", label: "Gamma", min: -1, max: 1, neutral: 0 },
  { key: "vibrance", label: "Vibrance", min: -1, max: 1, neutral: 0 },
  { key: "clarity", label: "Clarity", min: -1, max: 1, neutral: 0, costly: true },
  { key: "sharpness", label: "Sharpness", min: 0, max: 1, neutral: 0, costly: true },
  { key: "blur", label: "Blur", min: 0, max: 1, neutral: 0, costly: true },
  { key: "grain", label: "Grain", min: 0, max: 1, neutral: 0 },
  { key: "vignette", label: "Vignette", min: 0, max: 1, neutral: 0 },
  { key: "opacity", label: "Opacity", min: 0, max: 1, neutral: 1 },
];

export const ADJUSTMENT_BY_KEY: Record<AdjustmentKey, AdjustmentDef> = ADJUSTMENTS.reduce(
  (acc, def) => {
    acc[def.key] = def;
    return acc;
  },
  {} as Record<AdjustmentKey, AdjustmentDef>,
);

/** A fresh, untouched adjustment set. Also what Reset restores. */
export function neutralAdjustments(): Adjustments {
  const out = {} as Adjustments;
  for (const def of ADJUSTMENTS) out[def.key] = def.neutral;
  return out;
}

/** The filter-only knobs at rest - no fade, no wash, no split-tone. */
export function neutralExtras(): FilterExtras {
  return {
    fade: 0,
    tintColor: [0, 0, 0],
    tintStrength: 0,
    shadowTint: [0, 0, 0],
    highlightTint: [0, 0, 0],
    splitStrength: 0,
  };
}

export function neutralParams(): RenderParams {
  return { ...neutralAdjustments(), ...neutralExtras() };
}

/** True when the user has not moved this slider off its resting value. */
export function isNeutral(key: AdjustmentKey, value: number): boolean {
  return Math.abs(value - ADJUSTMENT_BY_KEY[key].neutral) < 1e-4;
}

/** Whether anything at all has been adjusted - drives the Reset button's state. */
export function hasAnyAdjustment(adj: Adjustments): boolean {
  return ADJUSTMENTS.some((def) => !isNeutral(def.key, adj[def.key]));
}

/**
 * Blends a filter's preset toward neutral by `intensity`, then lets the user's
 * own adjustments ride on top additively.
 *
 * Order matters and is deliberate: a filter is a starting point, not a lock -
 * picking "Vintage" then dragging Contrast should move contrast relative to
 * what Vintage set, which is what adding (rather than overwriting) achieves.
 * Opacity is the exception; it multiplies, because two half-transparent
 * instructions should compound rather than cancel.
 */
export function composeParams(
  preset: Partial<RenderParams>,
  intensity: number,
  user: Adjustments,
): RenderParams {
  const out = neutralParams();
  const t = Math.max(0, Math.min(1, intensity));

  // Filter first, scaled by intensity and measured from each knob's own rest.
  for (const [k, v] of Object.entries(preset)) {
    const key = k as keyof RenderParams;
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      // Colours (tintColor / shadowTint / highlightTint) are not scaled here -
      // their *strength* uniform carries the intensity instead, so the hue
      // stays put while the amount fades.
      (out as any)[key] = v;
      continue;
    }
    const rest = (out as any)[key] as number;
    (out as any)[key] = rest + ((v as number) - rest) * t;
  }

  // Then the user's sliders, relative to their own neutral.
  for (const def of ADJUSTMENTS) {
    const delta = user[def.key] - def.neutral;
    if (delta === 0) continue;
    if (def.key === "opacity") out.opacity *= user.opacity;
    else out[def.key] = (out[def.key] as number) + delta;
  }

  return out;
}
