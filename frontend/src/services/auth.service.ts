import { api } from "./api";
import type { ApiResponse } from "@/types/api";
import type { TeezerUser } from "@/types/user";

type AuthPayload = { token: string; token_type: string; expires_at?: string; user: TeezerUser };

type LoginRaw =
  | { success: boolean; two_factor_required?: false; data: AuthPayload }
  | { success: boolean; two_factor_required: true; data: { challenge: string } };

export type LoginResult =
  | { twoFactorRequired: false; auth: AuthPayload }
  | { twoFactorRequired: true; challenge: string };

export const authService = {
  async login(payload: { login: string; password: string; turnstile_token?: string }): Promise<LoginResult> {
    // withCredentials so the browser stores the shared `.teezer.live` SSO cookie.
    const { data } = await api.post<LoginRaw>("/auth/login", payload, { withCredentials: true });
    if ("two_factor_required" in data && data.two_factor_required) {
      return { twoFactorRequired: true, challenge: data.data.challenge };
    }
    return { twoFactorRequired: false, auth: (data as { data: AuthPayload }).data };
  },

  /* ── Social sign-in ("Continue with Google") ─────────────────────────────
   * idToken is the JWT Google Identity Services hands back via its
   * credential callback (see login-content.tsx's GIS init) - the SAME
   * id_token shape ApiAuthController::socialGoogle() already accepts from
   * the mobile app (useSocialAuth.ts). Response is byte-identical to
   * login()'s: completeSocial() gates on the account's own 2FA exactly like
   * password login does (a provider is only one factor), so this returns
   * the same LoginResult union - a caller must handle both branches, not
   * just the success one. */
  /** Apple's identity token, from AppleID.auth.signIn()'s
   * `authorization.id_token` (see login-content.tsx's AppleID init) - the
   * SAME identity_token shape ApiAuthController::socialApple() already
   * accepts from the mobile app (mobile/src/api/social.api.ts).
   *
   * `name` is forwarded because Apple sends it ONLY on a user's very first
   * authorization and never again; the backend applies it only when it has
   * no name yet, so passing it on later sign-ins is harmless. Returns the
   * same LoginResult union as login() - 2FA still gates the account, since
   * a provider is only one factor. */
  async socialApple(identityToken: string, name?: string): Promise<LoginResult> {
    const { data } = await api.post<LoginRaw>("/auth/social/apple", { identity_token: identityToken, name }, { withCredentials: true });
    if ("two_factor_required" in data && data.two_factor_required) {
      return { twoFactorRequired: true, challenge: data.data.challenge };
    }
    return { twoFactorRequired: false, auth: (data as { data: AuthPayload }).data };
  },

  async socialGoogle(idToken: string): Promise<LoginResult> {
    const { data } = await api.post<LoginRaw>("/auth/social/google", { id_token: idToken }, { withCredentials: true });
    if ("two_factor_required" in data && data.two_factor_required) {
      return { twoFactorRequired: true, challenge: data.data.challenge };
    }
    return { twoFactorRequired: false, auth: (data as { data: AuthPayload }).data };
  },

  async twoFactorChallenge(payload: { challenge: string; code?: string; recovery_code?: string }) {
    const { data } = await api.post<ApiResponse<AuthPayload>>("/auth/two-factor-challenge", payload, { withCredentials: true });
    return data.data;
  },

  // ── 2FA management ──────────────────────────────────────────────────
  async twoFactorStatus() {
    const { data } = await api.get<ApiResponse<{ enabled: boolean }>>("/auth/two-factor/status");
    return data.data;
  },
  async twoFactorSetup() {
    const { data } = await api.post<ApiResponse<{ secret: string; otpauth_uri: string }>>("/auth/two-factor/setup");
    return data.data;
  },
  async twoFactorConfirm(code: string) {
    const { data } = await api.post<ApiResponse<{ recovery_codes: string[] }>>("/auth/two-factor/confirm", { code });
    return data.data;
  },
  async twoFactorDisable(password: string) {
    await api.post("/auth/two-factor/disable", { password });
  },
  async twoFactorRecoveryCodes() {
    const { data } = await api.post<ApiResponse<{ recovery_codes: string[] }>>("/auth/two-factor/recovery-codes");
    return data.data;
  },
  async register(payload: Record<string, string | boolean>) {
    const { data } = await api.post<ApiResponse<AuthPayload>>("/auth/register", payload, { withCredentials: true });
    return data.data;
  },
  async me() {
    const { data } = await api.get<ApiResponse<TeezerUser>>("/auth/me");
    return data.data;
  },
  async logout() {
    // withCredentials so the SSO cookie is sent (to revoke it) and cleared.
    await api.post("/auth/logout", {}, { withCredentials: true });
  },
  async forgotPassword(email: string) {
    const { data } = await api.post<ApiResponse<unknown>>("/auth/forgot-password", { email });
    return data;
  },
  async resetPassword(payload: Record<string, string>) {
    const { data } = await api.post<ApiResponse<unknown>>("/auth/reset-password", payload);
    return data;
  },

  /* ── Signup OTP ───────────────────────────────────────────────────────── */

  async checkUsernamePublic(username: string) {
    const { data } = await api.get<{ available: boolean; message: string }>(
      "/auth/check-username",
      { params: { username } },
    );
    return data;
  },

  async sendSignupOtp(payload: {
    email: string;
    name?: string;
    username?: string;
    date_of_birth?: string;
    country?: string;
    country_code?: string;
  }) {
    const { data } = await api.post<{ success: boolean; draft_token: string; message: string }>(
      "/auth/send-otp",
      payload,
    );
    return data;
  },

  async verifySignupOtp(payload: { email: string; otp: string; draft_token?: string }) {
    const { data } = await api.post<{ success: boolean; verified: boolean; draft_token: string; message: string }>(
      "/auth/verify-otp",
      payload,
    );
    return data;
  },

  async verifyEmailLink(token: string) {
    const { data } = await api.get<{
      success: boolean;
      flow: "signup" | "login" | "already_verified";
      draft_token?: string;
      email: string;
      message: string;
    }>("/auth/verify-email-link", { params: { token } });
    return data;
  },

  /* ── QR-code login ("Use QR code" on the login screen) ──────────────────
   * create() mints a ticket to show as a QR code; qrStatus() is polled while
   * it's on screen. Once an already-logged-in phone scans + approves it,
   * qrStatus() hands back the exact same {token, expires_at, user} shape
   * authService.login()/twoFactorChallenge() already do - feed it straight
   * into useAuthStore.getState().applySsoAuth(). See
   * QrLoginController.php's own docblock for the full flow. */

  async qrCreate() {
    const { data } = await api.post<ApiResponse<{ ticket: string; expires_at: string }>>("/auth/qr/create");
    return data.data;
  },

  async qrStatus(ticket: string) {
    const { data } = await api.get<ApiResponse<{
      status: "pending" | "scanned" | "confirmed" | "denied" | "expired";
      token?: string;
      token_type?: string;
      expires_at?: string;
      user?: TeezerUser;
    }>>(`/auth/qr/status/${ticket}`);
    return data.data;
  },

  async getSignupDraft(draftToken: string) {
    const { data } = await api.get<{
      success: boolean;
      data: {
        email: string;
        name: string | null;
        username: string | null;
        date_of_birth: string | null;
        country: string | null;
        country_code: string | null;
        email_verified: boolean;
      };
    }>(`/auth/signup-draft/${draftToken}`);
    return data.data;
  },
};
