import { api } from "./api";
import type { ApiResponse } from "@/admin-panel/types/api";
import type { ReelsooUser } from "@/admin-panel/types/user";

type AuthPayload = { token: string; token_type: string; user: ReelsooUser };

/** Either a normal login payload or a "2FA required" challenge. */
type LoginRaw =
  | { success: boolean; two_factor_required?: false; data: AuthPayload }
  | { success: boolean; two_factor_required: true; data: { challenge: string } };

export type LoginResult =
  | { twoFactorRequired: false; auth: AuthPayload }
  | { twoFactorRequired: true; challenge: string };

export const authService = {
  async login(payload: { login: string; password: string; turnstile_token?: string }): Promise<LoginResult> {
    const { data } = await api.post<LoginRaw>("/auth/login", payload);
    if ("two_factor_required" in data && data.two_factor_required) {
      return { twoFactorRequired: true, challenge: data.data.challenge };
    }
    return { twoFactorRequired: false, auth: (data as { data: AuthPayload }).data };
  },

  async twoFactorChallenge(payload: { challenge: string; code?: string; recovery_code?: string }) {
    const { data } = await api.post<ApiResponse<AuthPayload>>("/auth/two-factor-challenge", payload);
    return data.data;
  },

  async me() {
    const { data } = await api.get<ApiResponse<ReelsooUser>>("/auth/me");
    return data.data;
  },

  async logout() {
    await api.post("/auth/logout");
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
};
