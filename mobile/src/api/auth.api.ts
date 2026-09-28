import { api } from "./client";
import type { AuthTokenResponse, AuthUser } from "@/types";

/**
 * Auth endpoints (Phase 2 wires the UI). Signup is the email-OTP flow:
 *   sendOtp → verifyOtp → register(draft_token).
 */
export const authApi = {
  login: (payload: { login: string; password: string; turnstile_token?: string }) =>
    api.post<AuthTokenResponse>("/auth/login", payload).then((r) => r.data),

  /**
   * Second step for an account with TOTP enabled.
   *
   * `/auth/login` does not return a token for those accounts - it answers
   * `{ two_factor_required: true, data: { challenge } }` instead. Exchange that
   * challenge here, with either the 6-digit authenticator code or one of the
   * account's recovery codes, for the real session. Same endpoint and same
   * shape the website uses (frontend/src/services/auth.service.ts).
   *
   * The challenge is single-use and expires: the server allows 5 wrong codes
   * against it and then discards it, so a caller must send the user back to
   * the login form rather than retrying forever.
   */
  twoFactorChallenge: (payload: { challenge: string; code?: string; recovery_code?: string }) =>
    api.post<AuthTokenResponse>("/auth/two-factor-challenge", payload).then((r) => r.data),

  sendOtp: (payload: { email: string; name?: string; username?: string; date_of_birth?: string; country?: string; country_code?: string }) =>
    api.post<{ success: boolean; draft_token: string; message: string }>("/auth/send-otp", payload).then((r) => r.data),

  verifyOtp: (payload: { email: string; otp: string; draft_token: string }) =>
    api.post<{ success: boolean; verified: boolean; draft_token: string }>("/auth/verify-otp", payload).then((r) => r.data),

  register: (payload: {
    name: string;
    username: string;
    email: string;
    password: string;
    password_confirmation: string;
    date_of_birth?: string;
    country?: string;
    country_code?: string;
    draft_token: string;
  }) => api.post<AuthTokenResponse>("/auth/register", payload).then((r) => r.data),

  checkUsername: (username: string) =>
    api.get<{ available: boolean; message: string }>("/auth/check-username", { params: { username } }).then((r) => r.data),

  /** Public IP-based country detection - same endpoint the website uses to
   *  pre-fill the signup country field. signupAllowed/loginAllowed are UX
   *  signals only (App\Services\CountryAvailabilityService) - the backend
   *  re-checks independently at submit time in register()/login(). */
  detectCountry: () =>
    api.get<{ success: boolean; data: {
      countryCode: string; countryName: string;
      restrictionsEnabled: boolean;
      signupAllowed: boolean; signupReason: string | null;
      loginAllowed: boolean; loginReason: string | null;
      policyVersion: number;
      /** Admin-configurable UX setting - when false, signup should present
       *  the detected country as fixed instead of an open picker. UX only -
       *  the backend always evaluates the DETECTED country regardless. */
      allowManualCountryChange: boolean;
    } }>("/detect-country").then((r) => r.data.data),

  /** Public - every country's signup availability, for the country picker
   *  (restricted entries stay visible but disabled, not hidden). */
  countryAvailabilityList: () =>
    api.get<{ success: boolean; data: {
      restrictionsEnabled: boolean; policyVersion: number;
      countries: { code: string; name: string; enabled: boolean }[];
    } }>("/countries/availability").then((r) => r.data.data),

  /** Same Laravel endpoint the website's forgot-password page uses
   *  (Password::sendResetLink) - sends a real reset email when the address
   *  matches an account. Always returns a generic success message
   *  regardless of whether the account exists, to avoid leaking which
   *  emails are registered; throttled server-side (3/hour, 5/day per
   *  account+IP+device via SecurityRateLimiter). */
  forgotPassword: (email: string) =>
    api.post<{ success: boolean; message: string }>("/auth/forgot-password", { email }).then((r) => r.data),

  me: () => api.get<{ success: boolean; data: AuthUser } | AuthUser>("/auth/me").then((r) => r.data),

  logout: () => api.post("/auth/logout").then((r) => r.data),

  resendVerification: () =>
    api.post<{ success: boolean; message?: string }>("/auth/resend-verification").then((r) => r.data),

  changePassword: (payload: { current_password: string; password: string; password_confirmation: string }) =>
    api.post<{ success: boolean; message: string }>("/auth/change-password", payload).then((r) => r.data),

  // Two-factor authentication (TOTP)
  twoFactorSetup: () =>
    api.post<{ success: boolean; data: { secret: string; otpauth_uri: string } }>("/auth/two-factor/setup").then((r) => r.data.data),
  twoFactorConfirm: (code: string) =>
    api.post<{ success: boolean; message: string; data: { recovery_codes: string[] } }>("/auth/two-factor/confirm", { code }).then((r) => r.data.data),
  twoFactorDisable: (password: string) =>
    api.post<{ success: boolean; message: string }>("/auth/two-factor/disable", { password }).then((r) => r.data),
};
