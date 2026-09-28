import { api } from "./client";

/** GET /account/status - snapshot powering the Account Data cards. */
export interface AccountStatus {
  account_status: "active" | "pending_verification" | "restricted" | "suspended";
  profile_visibility_status: "public" | "private";
  email_verified: boolean;
  phone_verified: boolean;
}

/** GET /account/security - Login & Security overview. */
export interface SecurityInfo {
  email: string | null;
  phone: string | null;
  email_verified: boolean;
  phone_verified: boolean;
  login_alerts: boolean;
  password_changed_at: string | null;
  session_count: number;
}

/** GET /account/sessions - active login sessions / devices. */
export interface SessionItem {
  id: number;
  label: string;
  browser: string | null;
  platform: string | null;
  type: string;
  ip: string | null;
  is_current: boolean;
  last_used: string | null;
  created_at: string;
}

/** GET /account/social-accounts - linked third-party sign-ins. */
export interface SocialAccountItem {
  provider: string;
  label: string;
  linked: boolean;
  email: string | null;
  name: string | null;
  linked_at: string | null;
}

/** GET /account/authorized-apps - internal Teezer apps you've authorized. */
export interface AuthorizedApp {
  client: string;               // 'ads'
  display_name: string;         // 'Teezer Ads'
  scopes?: string[];            // ['profile','email','business','ads.manage']
  granted_at?: string | null;
}

/** One admin-applied restriction on the account (GET /account/restrictions) -
 *  same shape the website's My Restrictions page consumes. */
export interface ActiveRestriction {
  type: string;
  label: string;
  reason: string | null;
  is_permanent: boolean;
  expires_at: string | null;
  expires_at_label: string | null;
  time_remaining: string | null;
  applied_at: string | null;
  applied_at_label: string | null;
  category?: "account" | "messaging";
}

export interface RestrictionsInfo {
  restrict_uploads: boolean;
  disable_drafts: boolean;
  upload_suspension_until: string | null;
  block_live_access: boolean;
  disable_commenting: boolean;
  active_restrictions: ActiveRestriction[];
}

/**
 * Account-security endpoints. Email and phone changes both require the current
 * password (verified server-side); changing email also resets verification.
 */
export const accountApi = {
  status: () => api.get<{ success: boolean; data: AccountStatus }>("/account/status").then((r) => r.data.data),

  restrictions: () =>
    api.get<{ success: boolean; data: RestrictionsInfo }>("/account/restrictions").then((r) => r.data.data),

  // Raw JSON export (kept as text so the on-device copy matches the server file).
  exportData: () =>
    api.get<string>("/account/export", { responseType: "text", transformResponse: (d) => d }).then((r) => r.data),

  deleteAccount: (password: string) =>
    api.post<{ success: boolean; message: string }>("/account/delete", { password }).then((r) => r.data),

  // Email verification by OTP - verifies the current email, or (with newEmail)
  // sends the code to a new address and switches to it on verify.
  sendEmailOtp: (newEmail?: string) =>
    api
      .post<{ success: boolean; message: string }>("/account/send-email-otp", newEmail ? { new_email: newEmail } : {})
      .then((r) => r.data),
  verifyEmailOtp: (otp: string) =>
    api
      .post<{ success: boolean; message: string; data?: { email: string } }>("/account/verify-email-otp", { otp })
      .then((r) => r.data),

  changeEmail: (new_email: string, current_password: string) =>
    api
      .post<{ success: boolean; message: string; data: { email: string } }>("/account/change-email", { new_email, current_password })
      .then((r) => r.data),

  changePhone: (new_phone: string, current_password: string) =>
    api
      .post<{ success: boolean; message: string; data: { phone: string } }>("/account/change-phone", { new_phone, current_password })
      .then((r) => r.data),

  // Login & Security
  security: () => api.get<{ success: boolean; data: SecurityInfo }>("/account/security").then((r) => r.data.data),
  sessions: () => api.get<{ success: boolean; data: SessionItem[] }>("/account/sessions").then((r) => r.data.data ?? []),
  setLoginAlerts: (enabled: boolean) =>
    api.patch<{ success: boolean; login_alerts: boolean }>("/account/login-alerts", { enabled }).then((r) => r.data),
  revokeSession: (id: number) => api.delete(`/account/sessions/${id}`).then((r) => r.data),
  revokeAllSessions: () => api.delete<{ success: boolean; message: string }>("/account/sessions").then((r) => r.data),

  // Connected Accounts
  socialAccounts: () =>
    api.get<{ success: boolean; data: SocialAccountItem[] }>("/account/social-accounts").then((r) => r.data.data ?? []),
  unlinkSocialAccount: (provider: string) =>
    api.delete<{ success: boolean; message: string }>(`/account/social-accounts/${provider}`).then((r) => r.data),
  authorizedApps: () =>
    api.get<{ success: boolean; data: AuthorizedApp[] }>("/account/authorized-apps").then((r) => r.data.data ?? []),

  twoFactorStatus: () =>
    api.get<{ success: boolean; data: { enabled: boolean } }>("/auth/two-factor/status").then((r) => r.data.data),
};
