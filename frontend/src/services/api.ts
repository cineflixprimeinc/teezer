import axios from "axios";

const baseURL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export const api = axios.create({
  baseURL,
  withCredentials: process.env.NEXT_PUBLIC_API_WITH_CREDENTIALS === "true",
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
  },
});

api.interceptors.request.use((config) => {
  if (config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("reelsoo_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    let deviceId = window.localStorage.getItem("reelsoo_device_fingerprint");
    if (!deviceId) {
      deviceId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      window.localStorage.setItem("reelsoo_device_fingerprint", deviceId);
    }
    config.headers["X-Device-Fingerprint"] = deviceId;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("reelsoo:unauthorized"));
    }

    // A demo account attempting a write. Surfaced as its own event rather than
    // an ordinary error so the UI can explain it - "this is a demo, nothing
    // saves" is information, and rendering it as a red failure would read like
    // something went wrong.
    const demoCode = error.response?.data?.code;

    if (
      error.response?.status === 403 &&
      (demoCode === "DEMO_ACCOUNT_READONLY" || demoCode === "DEMO_ACCOUNT_NO_UPLOAD") &&
      typeof window !== "undefined"
    ) {
      window.dispatchEvent(
        new CustomEvent("reelsoo:demo-blocked", {
          detail: {
            message: error.response?.data?.message as string | undefined,
            // READONLY comes from the admin panel, NO_UPLOAD from the public
            // site. Passed through so each surface can word its own notice.
            code: demoCode as string,
          },
        }),
      );
    }
    return Promise.reject(error);
  },
);

export function apiMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    // Prefer the specific field error (e.g. "The email has already been taken.")
    // over the generic "Validation failed." wrapper message.
    const fieldError = Object.values(data?.errors || {})?.flat()?.[0] as string | undefined;
    if (fieldError) return fieldError;
    if (data?.message && data.message !== "Validation failed.") return data.message;
    // Global Reelsoo Control's error shape nests the message under
    // `error.message`, not the top-level `message` every other endpoint
    // uses - without this a disabled-feature response silently fell
    // through to axios's generic "Request failed with status code 403"
    // instead of the real, specific reason the backend already sent.
    if (data?.error?.message) return data.error.message;
    // No response at all = network/CORS/server-down
    if (!error.response) return "Network error - could not reach the server. Please try again.";
    return data?.message || error.message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

export function rateLimitInfo(error: unknown): { message: string; retryAfter: number } | null {
  if (!axios.isAxiosError(error)) return null;
  const data = error.response?.data;
  if (error.response?.status !== 429 && data?.error !== "RATE_LIMITED") return null;
  return {
    message: data?.message || "Too many attempts. Please try again later.",
    retryAfter: Number(data?.retry_after || 0),
  };
}

/**
 * Extracts Global Reelsoo Control's denial shape - `{ feature, message,
 * expiresAt }` - or null if this error isn't one. `expiresAt` is null when
 * the restriction has no scheduled end (off until an admin re-enables it
 * by hand); a real timestamp means it's temporary, so callers can show
 * "back by <time>" instead of leaving the duration unstated.
 */
export function globalFeatureError(
  error: unknown,
): { feature: string; message: string; expiresAt: string | null } | null {
  if (!axios.isAxiosError(error)) return null;
  const data = error.response?.data;
  if (error.response?.status !== 403 || data?.error?.code !== "GLOBAL_FEATURE_DISABLED") return null;
  return {
    feature: data.error.feature as string,
    message: data.error.message as string,
    expiresAt: (data.error.expiresAt as string | null) ?? null,
  };
}
