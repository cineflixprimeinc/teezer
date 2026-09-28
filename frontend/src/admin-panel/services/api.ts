/**
 * API client for the migrated admin panel.
 *
 * This file used to be a standalone axios instance belonging to the separate
 * teezer-admin app, authenticating with the httpOnly `teezer_admin_session`
 * cookie. Now that the panel lives inside the main site at /admin, it shares
 * the site's own client and therefore the site's own session - which is the
 * entire point of the move: you sign in to teezer.live once, and if your role
 * is admin/super_admin the panel is simply available.
 *
 * All eight admin services still `import { api } from "./api"`, so none of
 * them had to change. This module is the single seam.
 *
 * Two things the old client did that are deliberately gone:
 *
 *   - `withCredentials` + the session cookie. The site's client sends
 *     `Authorization: Bearer <token>` instead. Both are accepted by the API:
 *     AdminSessionCookieAuth only copies the cookie into the Authorization
 *     header when no header is already present, so the bearer token wins and
 *     the cookie path stays intact for the old panel while it is still up.
 *
 *   - The `X-Client: teezer-admin` header. Its only effect was to make
 *     ApiAuthController issue a 2FA challenge at login (isAdminClient, used at
 *     exactly two call sites, both in the login flow). Nothing in this panel
 *     logs in any more, so the header has no remaining purpose here.
 *
 * The 401 handling is likewise the site's: a 401 dispatches
 * `teezer:unauthorized`, which the app's own providers already listen for.
 * The old `admin:unauthorized` event and its logout loop are gone with it.
 */
export { api, apiMessage } from "@/services/api";
