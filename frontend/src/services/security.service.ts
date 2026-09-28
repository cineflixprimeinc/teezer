import { api } from "./api";

export interface SecurityOverview {
  email:               string;
  phone:               string | null;
  email_verified:      boolean;
  phone_verified:      boolean;
  login_alerts:        boolean;
  password_changed_at: string | null;
  session_count:       number;
}

export interface SessionItem {
  id:         number;
  label:      string;
  browser:    string | null;
  platform:   string | null;
  type:       "desktop" | "mobile" | "tablet";
  ip:         string | null;
  is_current: boolean;
  last_used:  string | null;
  created_at: string;
}

export const securityService = {
  async overview(): Promise<SecurityOverview> {
    const { data } = await api.get("/account/security");
    return data.data;
  },

  async sessions(): Promise<SessionItem[]> {
    const { data } = await api.get("/account/sessions");
    return data.data;
  },

  async revokeSession(id: number): Promise<void> {
    await api.delete(`/account/sessions/${id}`);
  },

  async revokeAllSessions(): Promise<void> {
    await api.delete("/account/sessions");
  },

  async toggleLoginAlerts(enabled: boolean): Promise<void> {
    await api.patch("/account/login-alerts", { enabled });
  },

  async changePassword(current_password: string, password: string, password_confirmation: string): Promise<void> {
    await api.post("/auth/change-password", { current_password, password, password_confirmation });
  },

  async deleteAccount(password: string): Promise<void> {
    await api.post("/account/delete", { password });
  },
};
