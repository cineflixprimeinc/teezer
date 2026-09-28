import Constants from "expo-constants";

/**
 * Guarded loader for @shopify/react-native-skia - the media editor's render
 * engine.
 *
 * Skia is a native module, so it CANNOT run in Expo Go, exactly like
 * @livekit/react-native-webrtc (src/realtime/webrtc.ts) and react-native-iap.
 * The difference is that Skia touches its native library at *import* time, so a
 * plain top-level `import { Canvas } from "@shopify/react-native-skia"` in a
 * screen would throw the moment Metro evaluated that module - taking the whole
 * story flow down in Expo Go rather than just the editor.
 *
 * Hence the lazy require: nothing loads until loadSkia() is called, and it is
 * never called in Expo Go. Callers that get null render the "needs the
 * development build" notice instead of a canvas.
 *
 * The require is a static string so Metro can still bundle the JS (verified:
 * Skia 2.2.12 bundles without react-native-reanimated, which is an optional
 * peer dependency - this app deliberately has no reanimated, see
 * src/hooks/useSheetDrag.ts for how animation is done instead).
 */

/** The slice of Skia's surface the editor uses. Widened as features land. */
export interface SkiaModule {
  Skia: any;
  Canvas: any;
  Image: any;
  ImageShader: any;
  Shader: any;
  Fill: any;
  Group: any;
  Picture: any;
  createPicture: any;
  useImage: any;
  makeImageFromView: any;
}

// "storeClient" === running inside the Expo Go app.
export const isExpoGo = Constants.executionEnvironment === "storeClient";

let mod: SkiaModule | null = null;
let attempted = false;

/**
 * Returns the Skia module, or null when it cannot work here (Expo Go, or a
 * build where the native side is missing). Cached after the first attempt so a
 * failing require is not retried on every render.
 */
export function loadSkia(): SkiaModule | null {
  if (attempted) return mod;
  attempted = true;
  if (isExpoGo) return (mod = null); // never touch the native module in Expo Go
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require("@shopify/react-native-skia") as SkiaModule;
  } catch {
    mod = null;
  }
  return mod;
}

/** True when the editor can actually render. Cheap enough to call in render. */
export function isEditorAvailable(): boolean {
  return loadSkia() !== null;
}

/**
 * Why the editor is unavailable, for the notice shown in its place. Mirrors the
 * wording Spaces and calls already use so the app says one thing about native
 * modules, not three.
 */
export function editorUnavailableReason(): string {
  return isExpoGo
    ? "The photo and video editor needs the development build - Expo Go cannot load its rendering engine."
    : "The editor's rendering engine failed to load on this device.";
}
