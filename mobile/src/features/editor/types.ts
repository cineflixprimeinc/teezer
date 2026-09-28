/**
 * Media editor - shared vocabulary.
 *
 * The central idea, and the reason the admin panel can add filters without an
 * app release: **a filter is not code, it is a preset of the same parameters
 * the Adjust sliders write**. Both feed one SkSL shader (shaders/colorPipeline.ts).
 * "Vintage" is a row of numbers; so is a user dragging Contrast. That is what
 * makes `POST /admin/media-editor/filters` able to create a real, rendering
 * filter with no client change.
 */

/* ── Adjustments: the 17 user-facing sliders ─────────────────────────────── */

export type AdjustmentKey =
  | "brightness"
  | "contrast"
  | "saturation"
  | "exposure"
  | "highlights"
  | "shadows"
  | "temperature"
  | "tint"
  | "hue"
  | "gamma"
  | "vibrance"
  | "clarity"
  | "sharpness"
  | "blur"
  | "grain"
  | "vignette"
  | "opacity";

export type Adjustments = Record<AdjustmentKey, number>;

export interface AdjustmentDef {
  key: AdjustmentKey;
  label: string;
  min: number;
  max: number;
  /**
   * The value that means "untouched". Zero for most, but 1 for opacity and
   * gamma - Reset restores each slider to its own neutral rather than blanket
   * zeroing, which would make a photo transparent and black-gamma'd.
   */
  neutral: number;
  /** Sampled from neighbouring pixels, so it costs extra GPU taps. */
  costly?: boolean;
}

/* ── Filter-only parameters ──────────────────────────────────────────────── */

/**
 * Knobs a filter preset may set that are deliberately NOT exposed as sliders -
 * they exist to give the 27 looks enough range to be distinct (a film matte, a
 * sepia wash, a teal-and-orange split) without shipping 27 hand-written shaders.
 */
export interface FilterExtras {
  /** Lifts blacks for a matte / faded-film look. 0..1 */
  fade: number;
  /** A colour wash over the whole frame - sepia, neon, night. RGB 0..1 */
  tintColor: [number, number, number];
  /** How much of tintColor to apply. 0..1 */
  tintStrength: number;
  /** Split-toning: colour pushed into the shadows. RGB 0..1 */
  shadowTint: [number, number, number];
  /** Split-toning: colour pushed into the highlights. RGB 0..1 */
  highlightTint: [number, number, number];
  /** How strongly the two split-tone colours apply. 0..1 */
  splitStrength: number;
}

/** Everything the shader can be told, in one bag. */
export type RenderParams = Adjustments & FilterExtras;

/* ── Filters ─────────────────────────────────────────────────────────────── */

export interface FilterDef {
  /** Stable id, referenced by saved media. Never renamed once published. */
  key: string;
  name: string;
  category: string;
  /** Only the parameters this look changes; the rest stay neutral. */
  params: Partial<RenderParams>;
  /**
   * The admin-configurable ceiling for the intensity slider, 0..1. A subtle
   * look can be capped low so users cannot push it into looking broken.
   */
  maxIntensity?: number;
  /** Where the intensity slider starts when the filter is picked. 0..1 */
  defaultIntensity?: number;
  enabled?: boolean;
  sort?: number;
}

/* ── Geometry ────────────────────────────────────────────────────────────── */

/** Crop as fractions of the source, so it survives any display size. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Rotation = 0 | 90 | 180 | 270;

export interface Geometry {
  crop: CropRect | null;
  rotation: Rotation;
  flipH: boolean;
  flipV: boolean;
}

/* ── Beauty ──────────────────────────────────────────────────────────────── */

/**
 * Split by what each needs to run, because that decides when it can ship.
 * `BEAUTY_SHADER_KEYS` work on pixels alone. The face-geometry ones need
 * landmarks (MediaPipe Face Mesh) and land with the GPUPixel module.
 */
export type BeautyShaderKey = "skinSmooth" | "skinWhiten" | "faceBrightness" | "beautySharpen";

export type BeautyFaceKey =
  | "faceSlim"
  | "jawSlim"
  | "eyeEnlarge"
  | "lipEnhance"
  | "noseAdjust"
  | "teethWhiten"
  | "blemishRemoval"
  | "darkCircleRemoval";

export type BeautyKey = BeautyShaderKey | BeautyFaceKey;

export type Beauty = Partial<Record<BeautyKey, number>> & {
  /** Master multiplier over every beauty value. 0..1 */
  intensity: number;
};

/* ── The editor's whole state ────────────────────────────────────────────── */

export interface EditorState {
  filterKey: string;
  /** How much of the picked filter to blend in. 0..1 */
  filterIntensity: number;
  adjustments: Adjustments;
  geometry: Geometry;
  beauty: Beauty;
}

/**
 * What the backend is told after export. Deliberately the recipe, not the
 * pixels - the exported file carries the pixels, this carries "how", so a look
 * can be re-applied, audited, or re-rendered at a different size later.
 */
export interface EditRecipe {
  filter: string;
  filterIntensity: number;
  adjustments: Partial<Adjustments>;
  geometry: Geometry;
  beauty: Beauty;
}
