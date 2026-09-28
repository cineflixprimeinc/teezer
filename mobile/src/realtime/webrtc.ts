import Constants from "expo-constants";

/**
 * Guarded loader for @livekit/react-native-webrtc.
 *
 * This is LiveKit's fork of react-native-webrtc, not the original package -
 * the two can't coexist in one app (conflicting native WebRTC frameworks), so
 * this one native module now backs both CallProvider's 1:1 mesh calls AND
 * Spaces (StreamHub/LiveKit) - see app.config.ts's plugin comment. The API
 * surface used here (RTCPeerConnection, mediaDevices, registerGlobals) is
 * unchanged from the original package, so CallProvider's own logic needed no
 * changes - only this import.
 *
 * It's still a native module - it CANNOT run in Expo Go. We never touch it
 * there: isWebRtcAvailable() returns false in Expo Go (detected via the
 * execution environment) so the call UI degrades to a "needs the production
 * build" notice. In an EAS dev/production build the native module is present and
 * real audio works automatically - no code change needed.
 *
 * The require is intentionally a static string so Metro can bundle the JS, but
 * it only runs when load() is called (lazily, and never in Expo Go).
 */
type WebRtcModule = {
  RTCPeerConnection: any;
  RTCSessionDescription: any;
  RTCIceCandidate: any;
  mediaDevices: any;
  MediaStream: any;
  registerGlobals?: () => void;
};

// "storeClient" === running inside the Expo Go app.
const isExpoGo = Constants.executionEnvironment === "storeClient";

let mod: WebRtcModule | null = null;
let attempted = false;

function load(): WebRtcModule | null {
  if (attempted) return mod;
  attempted = true;
  if (isExpoGo) return (mod = null); // never require the native module in Expo Go
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rn = require("@livekit/react-native-webrtc");
    rn.registerGlobals?.();
    mod = rn as WebRtcModule;
  } catch {
    mod = null; // not installed / native side missing → treated as unavailable
  }
  return mod;
}

/** True only when the native WebRTC module is usable (EAS dev/prod build). */
export function isWebRtcAvailable(): boolean {
  return !!load();
}

/** The loaded module, or null when unavailable. */
export function getWebRtc(): WebRtcModule | null {
  return load();
}

/** Why calls can't carry live audio right now (for user-facing copy). */
export const callUnavailableReason = isExpoGo
  ? "Live audio needs the Teezer app build (not Expo Go). Calls still ring and connect for testing."
  : "Calling isn't available on this device.";
