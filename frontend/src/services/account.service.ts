import { api } from "./api";

export interface AccountStatus {
  account_status: "active" | "suspended" | "restricted" | "pending_verification";
  profile_visibility_status: "public" | "private" | "friends_only";
  email_verified: boolean;
  phone_verified: boolean;
}

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

export const accountService = {
  async status(): Promise<AccountStatus> {
    const { data } = await api.get("/account/status");
    return data.data as AccountStatus;
  },

  async changeEmail(newEmail: string, currentPassword: string): Promise<{ email: string }> {
    const { data } = await api.post("/account/change-email", {
      new_email: newEmail,
      current_password: currentPassword,
    });
    return data.data;
  },

  /** Email OTP verification for the current (pending) email. */
  async sendEmailOtp(): Promise<{ message: string }> {
    const { data } = await api.post("/account/send-email-otp");
    return data;
  },

  async verifyEmailOtp(otp: string): Promise<{ message: string }> {
    const { data } = await api.post("/account/verify-email-otp", { otp });
    return data;
  },

  async changePhone(newPhone: string, currentPassword: string): Promise<{ phone: string }> {
    const { data } = await api.post("/account/change-phone", {
      new_phone: newPhone,
      current_password: currentPassword,
    });
    return data.data;
  },

  async restrictions(): Promise<{
    restrict_uploads: boolean;
    disable_drafts: boolean;
    upload_suspension_until: string | null;
    block_live_access: boolean;
    disable_commenting: boolean;
    active_restrictions: ActiveRestriction[];
  }> {
    const { data } = await api.get("/account/restrictions");
    return data.data;
  },

  /** Triggers a JSON file download in the browser. */
  async exportData(filenameFallback = "teezer-account.json"): Promise<void> {
    const resp = await api.get("/account/export", { responseType: "blob" });
    const blob  = resp.data as Blob;
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement("a");
    const disposition = resp.headers["content-disposition"] as string | undefined;
    const match = disposition?.match(/filename="?([^";]+)"?/i);
    a.href     = url;
    a.download = match?.[1] ?? filenameFallback;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
