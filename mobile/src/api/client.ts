import axios, { AxiosError } from "axios";
import { config } from "@/constants/config";
import { tokenStore } from "@/utils/secure-store";
import { getDeviceFingerprint } from "@/utils/fingerprint";
import { breadcrumb } from "@/services/sentry";

/**
 * Single axios instance for the whole app.
 *  - attaches the Bearer token (from SecureStore) + device fingerprint + client tag
 *  - on 401, clears the token and notifies listeners (RootNavigator routes to Auth)
 */
export const api = axios.create({
  baseURL: config.apiBaseUrl,
  timeout: 20000,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
    "X-Client": config.clientHeader, // lets backend skip web-only Turnstile (D3)
  },
});

// In-memory token cache to avoid a SecureStore read on every request.
let memToken: string | null = null;
export function setAuthToken(token: string | null) {
  memToken = token;
}

api.interceptors.request.use(async (cfg) => {
  if (cfg.data instanceof FormData) {
    delete cfg.headers["Content-Type"];
  }
  const token = memToken ?? (await tokenStore.get());
  if (token) {
    memToken = token;
    cfg.headers.Authorization = `Bearer ${token}`;
  }
  cfg.headers["X-Device-Fingerprint"] = await getDeviceFingerprint();
  return cfg;
});

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null) {
  onUnauthorized = fn;
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    /* Every failed request, as a breadcrumb.
     *
     * The single most useful trail on a crash report: it shows what the app was
     * asking the server for, and what came back, in the seconds before it died.
     *
     * Method, path and status ONLY. Never the request body, never the response
     * body, never headers - this app sends a bearer token on every call, and
     * message and profile payloads come back through here. The path is taken
     * from the axios config rather than the full URL so query strings, which
     * can carry search terms, never travel either. */
    try {
      const path = (error.config?.url ?? "(unknown)").split("?")[0];
      breadcrumb("api", `${(error.config?.method ?? "get").toUpperCase()} ${path} failed`, {
        status: error.response?.status ?? 0,
        code: error.code,
      });
    } catch {
      /* A breadcrumb must never break the error path it is describing. */
    }

    if (error.response?.status === 401) {
      memToken = null;
      await tokenStore.clear();
      onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);

/**
 * Extracts rate-limit info from a 429 (or `RATE_LIMITED`) response - mirrors the
 * website's services/api.ts rateLimitInfo. Returns null when not rate-limited.
 */
export function rateLimitInfo(error: unknown): { message: string; retryAfter: number } | null {
  const e = error as AxiosError<{ error?: string; message?: string; retry_after?: number }>;
  if (!axios.isAxiosError(e)) return null;
  const data = e.response?.data;
  if (e.response?.status !== 429 && data?.error !== "RATE_LIMITED") return null;
  return {
    message: data?.message || "Too many attempts. Please try again later.",
    retryAfter: Number(data?.retry_after || 0),
  };
}

/** Normalizes an axios error into a user-facing message. */
export function apiErrorMessage(error: unknown, fallback = "Something went wrong."): string {
  const e = error as AxiosError<{ message?: string; errors?: Record<string, string[]> }>;
  const data = e?.response?.data;
  if (data?.errors) {
    const first = Object.values(data.errors)[0]?.[0];
    if (first) return first;
  }
  return data?.message || e?.message || fallback;
}
