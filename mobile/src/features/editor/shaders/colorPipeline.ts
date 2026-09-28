import type { RenderParams } from "../types";

/**
 * The colour pipeline - one SkSL runtime shader that every look in the app goes
 * through.
 *
 * There is deliberately ONE shader rather than one per filter. A filter and a
 * dragged slider are the same thing to the GPU (a set of uniforms), so "Vintage"
 * costs no more than "Original" and a filter invented in the admin panel renders
 * without an app release. See types.ts for why that matters.
 *
 * Operation order follows how a photo app is expected to behave, not how the
 * maths is tidiest: exposure works in linear-ish light before anything clips,
 * tone (highlights/shadows/brightness/contrast) next, then colour (white
 * balance, hue, saturation), then the grading extras a filter can reach for,
 * and finally the frame-level effects (vignette, grain) that should sit on top
 * of the grade rather than be graded themselves.
 *
 * ALPHA: the media this renders is opaque (photos, video frames), so the shader
 * treats rgb as straight colour and carries the source alpha through untouched.
 * It is not correct for semi-transparent sources and is not used on any.
 */
export const COLOR_PIPELINE_SKSL = `
uniform shader image;
uniform float2 resolution;

uniform float uExposure;      // stops, already scaled
uniform float uBrightness;
uniform float uContrast;
uniform float uSaturation;
uniform float uVibrance;
uniform float uHighlights;
uniform float uShadows;
uniform float uTemperature;
uniform float uTint;
uniform float uHue;           // -1..1 -> +/- PI
uniform float uGamma;         // exponent, 1 = neutral
uniform float uClarity;
uniform float uSharpness;
uniform float uBlur;
uniform float uGrain;
uniform float uVignette;
uniform float uOpacity;

uniform float uFade;
uniform float3 uTintColor;
uniform float uTintStrength;
uniform float3 uShadowTint;
uniform float3 uHighlightTint;
uniform float uSplitStrength;
uniform float uGrainSeed;
uniform float uNeedsTaps;     // 1 when blur/sharpen/clarity are in play

const float3 LUMA = float3(0.2125, 0.7154, 0.0721);

// Explicit dot products rather than float3x3: SkSL matrix constructors are
// column-major, and writing these as matrices is a silent-transpose trap.
float3 rgb2yiq(float3 c) {
  return float3(
    dot(c, float3(0.299,  0.587,  0.114)),
    dot(c, float3(0.596, -0.274, -0.322)),
    dot(c, float3(0.211, -0.523,  0.312)));
}

float3 yiq2rgb(float3 c) {
  return float3(
    dot(c, float3(1.0,  0.956,  0.621)),
    dot(c, float3(1.0, -0.272, -0.647)),
    dot(c, float3(1.0, -1.106,  1.703)));
}

float3 rotateHue(float3 color, float angle) {
  float3 yiq = rgb2yiq(color);
  float chroma = length(yiq.yz);
  float hue = atan(yiq.z, yiq.y) + angle;
  return yiq2rgb(float3(yiq.x, chroma * cos(hue), chroma * sin(hue)));
}

half4 main(float2 xy) {
  float2 res = max(resolution, float2(1.0));
  float2 px = 1.0 / res;

  half4 src = image.eval(xy);
  float3 c = float3(src.rgb);

  // Neighbourhood taps are the expensive part (8 extra texture reads), so they
  // are skipped entirely unless blur, sharpen or clarity is actually engaged.
  // Branching on a uniform is coherent across the whole draw, so this costs
  // nothing when taken.
  if (uNeedsTaps > 0.5) {
    float3 near = (
        float3(image.eval(xy + float2(px.x, 0.0)).rgb)
      + float3(image.eval(xy - float2(px.x, 0.0)).rgb)
      + float3(image.eval(xy + float2(0.0, px.y)).rgb)
      + float3(image.eval(xy - float2(0.0, px.y)).rgb)) * 0.25;

    float2 w = px * 4.0;
    float3 wide = (
        float3(image.eval(xy + float2(w.x, 0.0)).rgb)
      + float3(image.eval(xy - float2(w.x, 0.0)).rgb)
      + float3(image.eval(xy + float2(0.0, w.y)).rgb)
      + float3(image.eval(xy - float2(0.0, w.y)).rgb)) * 0.25;

    c = mix(c, near, clamp(uBlur, 0.0, 1.0));
    c = c + (c - near) * (uSharpness * 1.5);   // unsharp mask
    c = c + (c - wide) * (uClarity * 0.8);     // local contrast
  }

  // ── Tone ──
  c *= pow(2.0, uExposure);

  float l = dot(clamp(c, 0.0, 1.0), LUMA);
  c += uHighlights * smoothstep(0.5, 1.0, l) * 0.5;
  c += uShadows * (1.0 - smoothstep(0.0, 0.5, l)) * 0.5;

  c += uBrightness * 0.5;
  c = (c - 0.5) * (1.0 + uContrast) + 0.5;

  // ── Colour ──
  c.r += uTemperature * 0.12;
  c.b -= uTemperature * 0.12;
  c.g += uTint * 0.12;

  if (abs(uHue) > 0.001) {
    c = rotateHue(c, uHue * 3.14159265);
  }

  float lum = dot(clamp(c, 0.0, 1.0), LUMA);
  c = mix(float3(lum), c, 1.0 + uSaturation);

  // Vibrance leans on already-dull pixels and leaves saturated ones alone.
  float mx = max(max(c.r, c.g), c.b);
  float mn = min(min(c.r, c.g), c.b);
  c = mix(float3(lum), c, 1.0 + uVibrance * (1.0 - (mx - mn)));

  c = pow(max(c, float3(0.0)), float3(uGamma));

  // ── Filter-only grading ──
  if (uSplitStrength > 0.001) {
    float ls = dot(clamp(c, 0.0, 1.0), LUMA);
    c = mix(c, uShadowTint, (1.0 - ls) * uSplitStrength * 0.5);
    c = mix(c, uHighlightTint, ls * uSplitStrength * 0.5);
  }

  if (uTintStrength > 0.001) {
    float lw = dot(clamp(c, 0.0, 1.0), LUMA);
    c = mix(c, uTintColor * (lw * 1.4), uTintStrength);
  }

  c = c * (1.0 - uFade * 0.25) + uFade * 0.12;

  // ── Frame effects ──
  if (uVignette > 0.001) {
    float d = distance(xy / res, float2(0.5));
    c *= mix(1.0, smoothstep(0.78, 0.28, d), uVignette);
  }

  if (uGrain > 0.001) {
    float n = fract(sin(dot(xy + uGrainSeed, float2(12.9898, 78.233))) * 43758.5453);
    c += (n - 0.5) * uGrain * 0.18;
  }

  c = clamp(c, 0.0, 1.0);
  return half4(half3(c), src.a) * half(uOpacity);
}
`;

/**
 * Turns composed parameters into the uniform bag the shader expects.
 *
 * This is where slider-space becomes shader-space: exposure -1..1 means +/- 2
 * stops, hue means +/- 180 degrees, and gamma rides a 2.2 curve so 0 lands
 * exactly on 1.0 (neutral) while the ends give the familiar 0.45 / 2.2.
 *
 * Marked as a worklet (in addition to being an ordinary function - the
 * directive doesn't change how it runs from plain JS) so the camera's live
 * frame processor (features/camera/ReelsooLiveCamera.tsx) can call it
 * directly on the frame-processor thread with each frame's real dimensions,
 * same as EditorCanvas.tsx calls it on the JS thread with a photo/video's.
 */
export function buildUniforms(
  p: RenderParams,
  width: number,
  height: number,
  grainSeed = 0,
): Record<string, number | number[]> {
  "worklet";
  const needsTaps = p.blur > 0.001 || p.sharpness > 0.001 || Math.abs(p.clarity) > 0.001;

  return {
    resolution: [width, height],
    uExposure: p.exposure * 2,
    uBrightness: p.brightness,
    uContrast: p.contrast,
    uSaturation: p.saturation,
    uVibrance: p.vibrance,
    uHighlights: p.highlights,
    uShadows: p.shadows,
    uTemperature: p.temperature,
    uTint: p.tint,
    uHue: p.hue,
    uGamma: Math.pow(2.2, p.gamma),
    uClarity: p.clarity,
    uSharpness: p.sharpness,
    uBlur: p.blur,
    uGrain: p.grain,
    uVignette: p.vignette,
    uOpacity: p.opacity,
    uFade: p.fade,
    uTintColor: p.tintColor,
    uTintStrength: p.tintStrength,
    uShadowTint: p.shadowTint,
    uHighlightTint: p.highlightTint,
    uSplitStrength: p.splitStrength,
    uGrainSeed: grainSeed,
    uNeedsTaps: needsTaps ? 1 : 0,
  };
}

/**
 * Compiled once per process and shared by every consumer of this shader -
 * the post-capture editor (EditorCanvas.tsx) and the camera screen's live
 * GPU preview (features/camera/ReelsooLiveCamera.tsx) both call this rather
 * than each compiling (and caching) their own copy. One shader, reused, per
 * the "no duplicate filter engine" rule.
 *
 * Make() returns null on a compile error rather than throwing, so a mistake
 * in the SkSL degrades to an unfiltered picture instead of a blank screen.
 */
let cachedEffect: any | null | undefined;

export function getColorPipelineEffect(Skia: any): any | null {
  if (cachedEffect !== undefined) return cachedEffect;
  cachedEffect = Skia.RuntimeEffect.Make(COLOR_PIPELINE_SKSL) ?? null;
  return cachedEffect;
}

/**
 * Flattens the named uniform bag `buildUniforms()` returns into the flat
 * float array `SkRuntimeEffect.makeShaderWithChildren` expects (everything
 * except the `image` child shader, in the SkSL's declared order).
 *
 * Reads the order and each uniform's component count (float=1, float3=3)
 * back from the *compiled effect* itself (getUniformCount/getUniformName/
 * getUniform) rather than a hand-maintained list - so this can never drift
 * out of sync with the shader above.
 *
 * Runs on the camera's frame-processor thread (a worklet), which is why this
 * is a worklet itself rather than a plain function - a worklet may only call
 * other worklets (or, as here, methods on an already worklet-shareable Skia
 * host object).
 */
export function flattenColorPipelineUniforms(
  effect: any,
  uniforms: Record<string, number | number[]>,
): number[] {
  "worklet";
  const out: number[] = [];
  const count = effect.getUniformCount();
  for (let i = 0; i < count; i++) {
    const name = effect.getUniformName(i);
    const info = effect.getUniform(i);
    const size = info.columns * info.rows;
    const value = uniforms[name];
    if (Array.isArray(value)) {
      for (let j = 0; j < size; j++) out.push(value[j] ?? 0);
    } else {
      out.push((value as number) ?? 0);
    }
  }
  return out;
}
