import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "teezer_device_id";

/**
 * Stable per-install device id, sent as X-Device-Fingerprint so the backend's
 * rate-limiter can tell devices apart on shared carrier IPs. Non-sensitive, so
 * AsyncStorage is fine (the auth token uses SecureStore instead).
 */
let cached: string | null = null;

export async function getDeviceFingerprint(): Promise<string> {
  if (cached) return cached;
  let id = await AsyncStorage.getItem(KEY);
  if (!id) {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    await AsyncStorage.setItem(KEY, id);
  }
  cached = id;
  return id;
}
