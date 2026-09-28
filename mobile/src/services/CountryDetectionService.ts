import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";

/**
 * Device-GPS country detection - the feed country tab's priority-2 signal,
 * between the account's saved country (priority 1, resolved server-side) and
 * the server's IP/Cloudflare-edge fallback (priority 3). This is what tells
 * the country feed the truth when a VPN is masking the connecting IP.
 *
 * On-device only: a coordinate is resolved to an ISO 3166-1 alpha-2 code via
 * the OS's own reverse geocoder and discarded immediately - it is never sent
 * to the backend or written to disk, only the resulting 2-letter code is
 * cached. This module never requests permission and never prompts the user -
 * it only reads whatever permission state the app already has (e.g. granted
 * separately via the chat "share location" feature), and gives up silently
 * otherwise. Country detection is meant to be fully automatic: the server's
 * own IP-based cascade (Cloudflare's CF-IPCountry edge header, see
 * IpCountryService) already covers every account with no prompt at all, so
 * this GPS hint is purely an optional refinement, never something to ask for.
 */

const CACHE_KEY = "teezer:country-gps-hint";
/** "Actual physical country" doesn't need re-deriving more often than this -
 *  cheap enough to keep GPS off the hot path on every app open/tab swipe. */
const TTL_MS = 24 * 60 * 60 * 1000;

type Cached = { code: string; ts: number };

async function readCache(): Promise<Cached | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Cached) : null;
  } catch {
    return null;
  }
}

async function writeCache(code: string): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ code, ts: Date.now() } satisfies Cached));
  } catch {
    /* best-effort */
  }
}

let inFlight: Promise<string | null> | null = null;

/**
 * Resolve the device's current ISO country code, or null when permission
 * isn't granted, location is off, or anything fails - never throws, and
 * never prompts. Concurrent callers share one in-flight resolution so the
 * feed's country-tab label and its actual content query never trigger two
 * separate GPS reads for the same screen.
 */
export function getGpsCountryHint(): Promise<string | null> {
  if (inFlight) return inFlight;
  inFlight = resolve().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function resolve(): Promise<string | null> {
  const cached = await readCache();
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.code;

  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== Location.PermissionStatus.GRANTED) return cached?.code ?? null;

    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
    const [place] = await Location.reverseGeocodeAsync({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    });
    const code = place?.isoCountryCode ?? null;
    if (code) void writeCache(code);
    return code ?? cached?.code ?? null;
  } catch {
    // GPS off, permission revoked mid-flight, geocoder failure, etc. - the
    // feed falls back past this (server IP resolution, then its own default).
    return cached?.code ?? null;
  }
}
