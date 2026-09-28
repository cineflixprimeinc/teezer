import axios from "axios";

const baseURL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

// withCredentials, not a manually-attached Authorization header from
// localStorage: the session lives in an httpOnly cookie the API sets on
// login (teezer_admin_session), which JS can never read - a fix for the
// admin token previously being readable by anything running on the page
// (any XSS bug anywhere in this app -> full admin-token theft, no barrier
// at all). The browser attaches the cookie to every request to this API
// automatically; nothing here needs to know the token's value.
export const api = axios.create({
  baseURL,
  // Identifies this app as the admin panel. The API challenges for 2FA only
  // for this client - the website and the mobile app take the password alone
  // (ApiAuthController::isAdminClient). Purely a UX switch: the actual
  // guarantee is on the token, which only a cleared challenge marks as
  // 2FA-verified, so forging this header elsewhere buys nothing.
  headers: { Accept: "application/json", "X-Client": "teezer-admin" },
  withCredentials: true,
});

// The auth-flow endpoints themselves - a 401 from any of these is a normal,
// expected response (not logged in yet, session already gone, wrong 2FA
// code), never a session that WAS valid going bad. Treating it as the
// latter here created a real infinite loop: /auth/me legitimately 401s on
// a fresh page load -> dispatches admin:unauthorized -> that calls
// logout() -> POST /auth/logout, with no session to destroy, ALSO 401s ->
// dispatches admin:unauthorized again -> logout() again -> forever, as
// fast as the network allows, silently burning the entire rate-limit
// budget before a real login/2FA submission ever got a chance to use it.
const AUTH_FLOW_PATHS = ["/auth/login", "/auth/two-factor-challenge", "/auth/me", "/auth/logout"];

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window !== "undefined") {
      const path = String(error.config?.url ?? "");
      const isAuthFlow = AUTH_FLOW_PATHS.some((p) => path.startsWith(p));
      if (error.response?.status === 401 && !isAuthFlow) {
        window.dispatchEvent(new Event("admin:unauthorized"));
      } else if (
        error.response?.status === 403 &&
        error.response?.data?.code === "TWO_FACTOR_SETUP_REQUIRED" &&
        !window.location.pathname.startsWith("/security")
      ) {
        window.location.href = "/security?setup=1";
      } else if (
        error.response?.status === 403 &&
        error.response?.data?.code === "TWO_FACTOR_REQUIRED" &&
        !window.location.pathname.startsWith("/login")
      ) {
        // The account has 2FA, but THIS session never cleared a challenge -
        // e.g. signed in on the website, where 2FA is not asked for, and the
        // shared .teezer.live cookie carried that token here. Only a fresh
        // sign-in through this panel produces a 2FA-verified token, so send
        // them to log in rather than to /security, which would wrongly offer to
        // set up 2FA they already have.
        window.location.href = "/login?error=two_factor_required";
      }
    }
    return Promise.reject(error);
  },
);

export function apiMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    // Prefer the specific field error over the generic wrapper message
    // (the backend returns message:"Validation failed." with the real
    // reason under `errors`).
    const errors = error.response?.data?.errors as Record<string, string[]> | undefined;
    const fieldError = errors ? Object.values(errors).flat()[0] : undefined;
    return fieldError || error.response?.data?.message || error.message;
  }
  return "Something went wrong.";
}
