import { api } from "./api";

/** One credential field. Secret fields never return their value - only a
 *  `set` flag + a masked `hint`; non-secret fields return the editable value. */
export type SocialField = {
  label: string;
  secret: boolean;
  optional?: boolean;  // not required for the provider to be "configured"
  help?: string | null;
  value?: string;      // non-secret only
  set?: boolean;       // secret only - whether a value is stored
  hint?: string | null; // secret only - masked "••••1234"
};

export type SocialProvider = {
  label: string;
  enabled: boolean;
  fields: Record<string, SocialField>;
};

export type SocialLoginConfig = Record<string, SocialProvider>;

export const socialLoginService = {
  get: () =>
    api.get<{ success: boolean; data: SocialLoginConfig }>("/admin/social-login").then((r) => r.data.data),

  setField: (provider: string, field: string, value: string) =>
    api.post("/admin/social-login", { provider, field, value }).then((r) => r.data),

  setEnabled: (provider: string, enabled: boolean) =>
    api.post("/admin/social-login", { provider, enabled }).then((r) => r.data),

  /** Tests the currently SAVED credentials against the provider itself -
   *  save any changes first, or the test checks the old values. */
  test: (provider: string) =>
    api.post<{ success: boolean; message: string }>(`/admin/social-login/${provider}/test`).then((r) => r.data),
};
