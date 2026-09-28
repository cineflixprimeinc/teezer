import { api } from "./client";

/**
 * QR-code login, phone side - AuthorizeLoginScreen.tsx. The website's own
 * half (create/status/polling) lives entirely server-side + in
 * frontend/src/features/auth/login-content.tsx; this app only ever scans,
 * confirms or denies. See server/app/Http/Controllers/Api/Auth/
 * QrLoginController.php's own docblock for the full flow.
 */

export interface QrScanResult {
  ticket: string;
  /** "Chrome on Windows" style label - see AuthTokenService::describeSession(). */
  label: string;
  ip: string | null;
  /** Friendly country name (IsoCountries), or null if undetected. */
  country: string | null;
}

type Envelope<T> = { success: boolean; data: T };

export const qrLoginApi = {
  scan: (ticket: string) =>
    api.post<Envelope<QrScanResult>>(`/auth/qr/scan/${ticket}`).then((r) => r.data.data),

  confirm: (ticket: string) => api.post(`/auth/qr/confirm/${ticket}`),

  deny: (ticket: string) => api.post(`/auth/qr/deny/${ticket}`),
};
