import { isWebRtcAvailable } from "@/realtime/webrtc";

/**
 * Guarded loader for the LiveKit client stack (Spaces / StreamHub audio).
 *
 * Two things make a plain `import { Room } from "livekit-client"` unsafe here:
 *
 * 1. livekit-client declares `class DeferrableMapAbortError extends DOMException`
 *    at MODULE SCOPE. An `extends` clause is evaluated when the module is
 *    evaluated, and Hermes has no DOMException - so merely importing the package
 *    throws "[runtime not ready]: ReferenceError: Property 'DOMException'
 *    doesn't exist" before the app can render a single frame. That is not
 *    specific to Expo Go: Hermes powers release builds too.
 *
 * 2. The fix ships with the SDK - @livekit/react-native installs a DOMException
 *    polyfill (plus URL, well-known symbols, promise/array/crypto/webstream
 *    shims) from its own index. So @livekit/react-native has to be required
 *    FIRST; only then is livekit-client safe to evaluate. registerGlobals()
 *    from that package is the superset of the plain react-native-webrtc one -
 *    it wires the native WebRTC globals, the iOS audio session and the
 *    webrtc-adapter fix that livekit-client expects.
 *
 * Both packages are native, so neither can run in Expo Go. There we never
 * require them at all and Spaces degrade to the "needs the production build"
 * notice, exactly like 1:1 calls - see webrtc.ts, whose Expo Go detection this
 * loader reuses so the two features can never disagree about availability.
 *
 * The requires are static strings so Metro still bundles the JS; they only run
 * when load() is called, which never happens in Expo Go.
 */
type LiveKitModule = {
  Room: any;
  RoomEvent: any;
  ConnectionState: any;
  Track: any;
  /** `@livekit/react-native`'s remote-track renderer - exposed here (rather
   *  than a second static import elsewhere) so anything rendering video stays
   *  behind this same guarded load and can never crash Expo Go by importing
   *  the native package at module-eval time. Used by the Live watch screen;
   *  Spaces never renders video, so it never needed this. */
  VideoView: any;
};

let mod: LiveKitModule | null = null;
let attempted = false;

function load(): LiveKitModule | null {
  if (attempted) return mod;
  attempted = true;
  if (!isWebRtcAvailable()) return (mod = null);
  try {
    // Order matters - see (2) above. This line is what makes the next one legal.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rn = require("@livekit/react-native");
    rn.registerGlobals?.();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const client = require("livekit-client");
    mod = {
      Room: client.Room,
      RoomEvent: client.RoomEvent,
      ConnectionState: client.ConnectionState,
      Track: client.Track,
      VideoView: rn.VideoView,
    };
  } catch {
    mod = null; // native side missing → treated as unavailable, never a crash
  }
  return mod;
}

/** True only when the LiveKit stack is usable (EAS dev/prod build). */
export function isLiveKitAvailable(): boolean {
  return !!load();
}

/** The loaded LiveKit client module, or null when unavailable. */
export function getLiveKit(): LiveKitModule | null {
  return load();
}
