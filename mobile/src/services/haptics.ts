import { Platform } from "react-native";

/**
 * Teezer's haptics.
 *
 * One place that touches the native module, so the rest of the app asks for a
 * MEANING - "this was a selection", "that failed" - and never for a waveform.
 * Before this there were 29 direct expo-haptics calls across 11 screens, and no
 * two of them agreed on what a tap should feel like.
 *
 * Backed by react-native-nitro-haptics rather than expo-haptics, for one
 * concrete reason: its methods are SYNCHRONOUS. expo-haptics returns a Promise
 * per call and builds a fresh UIImpactFeedbackGenerator each time, and iOS
 * routinely weakens or drops the first impact from a cold generator - which is
 * why haptics on the camera screen felt absent or arbitrary across several
 * rounds of testing. Nitro holds prepared generators on the native side and
 * fires over JSI with no bridge hop, so a tap lands when the finger lifts
 * rather than whenever the queue gets to it.
 *
 * Every call here is fire-and-forget and swallows its own failure. A haptic is
 * an enhancement: it must never delay an animation, never block an interaction,
 * and never surface an error. Call it BEFORE the visual, not after - the point
 * is that the two feel simultaneous.
 */

type ImpactStyle = "light" | "medium" | "heavy" | "soft" | "rigid";
type NotificationType = "success" | "warning" | "error";

/**
 * expo-haptics is the engine.
 *
 * This used to call react-native-nitro-haptics first, for its synchronous JSI
 * calls and prepared generators. That package is pinned at 0.2.3, published
 * 2024-12-26 and never updated, and its own build targets
 * react-native-nitro-modules 0.35.1 - while this app resolves 0.36.5, because
 * nitro-haptics declares its peer range as "*" and npm therefore never warns.
 *
 * Nitro's bindings are GENERATED C++ pinned to a nitro-modules ABI, so a
 * HybridObject compiled against one and dispatched by another fails inside
 * native code. That failure surfaces as a C++ exception crossing JSI, which a
 * JS try/catch cannot catch - it reaches Hermes as a pending throw and aborts
 * the process. It also never happened in Expo Go, which ships neither module
 * and so always took the expo-haptics path below: the exact split of "haptics
 * work in Expo Go, no haptics and crashes in the release build".
 *
 * expo-haptics ships with the SDK, is versioned with it, and is the path that
 * was demonstrably working. Its generators are colder than nitro's, so a first
 * impact can be marginally weaker - a real but small cost against a native
 * abort, and the reason the weights below lean one step heavier than the
 * nitro-era defaults did.
 */
let engine: typeof import("expo-haptics") | null | undefined;

function haptic() {
  if (engine !== undefined) return engine;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    engine = require("expo-haptics") as typeof import("expo-haptics");
  } catch {
    engine = null;
  }
  return engine;
}

/** expo's styles are enum members; these are the names they live under. */
const EXPO_IMPACT: Record<ImpactStyle, string> = {
  light: "Light", medium: "Medium", heavy: "Heavy", soft: "Soft", rigid: "Rigid",
};

function impact(style: ImpactStyle): void {
  if (Platform.OS === "web") return;
  try {
    const h = haptic();
    if (!h) return;
    const mapped = h.ImpactFeedbackStyle?.[EXPO_IMPACT[style] as keyof typeof h.ImpactFeedbackStyle];
    // Soft and rigid are newer; on a runtime lacking them a medium tap is
    // closer to the intent than no tap at all.
    void h.impactAsync(mapped ?? h.ImpactFeedbackStyle.Medium).catch(() => {});
  } catch {
    /* Haptics are never worth an error path. */
  }
}

function notify(type: NotificationType): void {
  if (Platform.OS === "web") return;
  try {
    const h = haptic();
    if (!h) return;
    const key = (type.charAt(0).toUpperCase() + type.slice(1)) as "Success" | "Warning" | "Error";
    void h.notificationAsync(h.NotificationFeedbackType[key]).catch(() => {});
  } catch {
    /* as above */
  }
}

export const haptics = {
  /* ── Impacts, by weight ─────────────────────────────────────────────────
   * Weight carries meaning here, so pick by what happened rather than by how
   * strong it should feel:
   *   light   a small thing was confirmed - a toggle, a tap landing
   *   medium  something real happened - a like, recording starting
   *   heavy   a deliberate, consequential action
   *   soft    a cushioned edge; a boundary reached rather than crossed
   *   rigid   a hard stop; something snapped into place                     */
  light: () => impact("light"),
  medium: () => impact("medium"),
  heavy: () => impact("heavy"),
  soft: () => impact("soft"),
  rigid: () => impact("rigid"),

  /** A value changed among several - a tab, a filter, a picker step. The
   *  quietest thing here, and correct for anything that repeats. */
  selection: () => {
    if (Platform.OS === "web") return;
    try {
      void haptic()?.selectionAsync().catch(() => {});
    } catch {
      /* as above */
    }
  },

  /* ── Outcomes ───────────────────────────────────────────────────────────
   * Patterns, not taps, and they say something. Only fire these once an
   * action has actually SUCCEEDED or FAILED - a success buzz on an optimistic
   * update that the server later rejects is a lie the hand believes. */
  success: () => notify("success"),
  warning: () => notify("warning"),
  error: () => notify("error"),
} as const;

/**
 * A haptic that refuses to fire more than once per `ms`.
 *
 * For anything driven by a continuous gesture - a scrub, a slider, a drag past
 * alignment guides. Those fire at frame rate, and a buzz per frame is not
 * feedback, it is noise that drains the Taptic Engine and blurs into a rattle.
 *
 * Threshold your VALUE first where you can (only call on crossing a snap point
 * or an interval); this is the backstop for when you cannot.
 *
 *   const tick = throttled(haptics.selection, 60);
 */
export function throttled(fn: () => void, ms = 50): () => void {
  let last = 0;
  return () => {
    const now = Date.now();
    if (now - last < ms) return;
    last = now;
    fn();
  };
}
