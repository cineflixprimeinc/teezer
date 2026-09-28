import axios from "axios";
import { api } from "./api";
import type { ReelsooUser } from "@/types/user";

/**
 * Internal Reelsoo SSO client. Uses a DEDICATED axios instance with
 * `withCredentials: true` so the shared `.teezer.live` cookie rides along - and
 * WITHOUT the main client's 401 interceptor, so an "authenticated:false" (HTTP
 * 200) or a 403 never wipes the local session. No Bearer header is sent; these
 * endpoints authenticate purely via the SSO cookie.
 */
const baseURL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const ssoApi = axios.create({
  baseURL,
  withCredentials: true,
  // Never let a stalled SSO probe hang the popup on its "checking" spinner -
  // it rejects after 10s and the UI falls back to the login options.
  timeout: 10_000,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
  },
});

export type SsoScope = { key: string; label: string };

export type SsoClient = {
  name: string;
  display_name: string;
  status: "granted" | "needs_consent";
  scopes: SsoScope[];
};

export type SsoUserBasic = {
  id: number;
  name: string;
  username: string;
  email: string;
  avatar: string | null;
};

export type SsoSessionResult =
  | { authenticated: false }
  | {
      authenticated: true;
      user: SsoUserBasic;
      csrf_token: string;
      client: SsoClient;
    };

export type SsoAuthPayload = {
  token: string;
  token_type: string;
  expires_at?: string;
  user: ReelsooUser;
};

export type SsoConsentClient = { name: string; display_name: string; scopes: SsoScope[] };
export type GrantStatus = { granted: boolean; user: SsoUserBasic; client: SsoConsentClient };

export const ssoService = {
  /** Read-only: is there a shared Reelsoo session, and is this client granted? */
  session: (client = "ads"): Promise<SsoSessionResult> =>
    ssoApi
      .get("/auth/sso/session", { params: { client } })
      .then((r) => r.data as SsoSessionResult),

  /** Record consent (idempotent) + mint this origin's Bearer token. */
  authorize: (client: string, csrf: string, scopes?: string[]): Promise<SsoAuthPayload> =>
    ssoApi
      .post("/auth/sso/authorize", { client, scopes }, { headers: { "X-Reelsoo-SSO-CSRF": csrf } })
      .then((r) => r.data.data as SsoAuthPayload),

  /** Mint this origin's Bearer token WITHOUT recording consent (login only). */
  login: (csrf: string): Promise<SsoAuthPayload> =>
    ssoApi
      .post("/auth/sso/login", { client: "ads" }, { headers: { "X-Reelsoo-SSO-CSRF": csrf } })
      .then((r) => r.data.data as SsoAuthPayload),

  /** Bearer-authed: has the current user authorized the client yet? */
  grantStatus: (): Promise<GrantStatus> =>
    api.get("/auth/sso/grant-status", { params: { client: "ads" } }).then((r) => r.data as GrantStatus),

  /** Bearer-authed: record the consent grant (selected scopes). */
  grant: (scopes: string[]): Promise<void> =>
    api.post("/auth/sso/grant", { client: "ads", scopes }).then(() => undefined),

  /**
   * Establish the shared `.teezer.live` cookie for an already-logged-in Bearer
   * session (used by teezer.live /connect). Sends the local Bearer token; the
   * credentialed instance stores the returned Set-Cookie.
   */
  promote: (token: string): Promise<void> =>
    ssoApi
      .post("/auth/sso/promote", {}, { headers: { Authorization: `Bearer ${token}` } })
      .then(() => undefined),
};
