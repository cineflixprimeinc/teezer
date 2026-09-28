/**
 * Auth store for the migrated admin panel.
 *
 * This was a standalone zustand store backing the separate reelsoo-admin app,
 * with its own login / two-factor / logout flow against the httpOnly
 * `reelsoo_admin_session` cookie. Inside the main site there is no second
 * session to manage: the panel runs on whoever is already signed in to
 * teezer.live, and the role on that account is what grants access.
 *
 * So this is now a re-export of the site's own store. AdminShell reads
 * `{ user, logout }` from it and renders `user.name`, `user.role` and
 * `user.email`; all three exist on the site's `ReelsooUser` with the same
 * types the admin panel's own interface declared, so nothing downstream
 * changed.
 *
 * Two consequences worth being explicit about:
 *
 *   - `logout()` in the admin sidebar now signs the person out of the WHOLE
 *     site, not just the panel. That is the honest behaviour for a single
 *     shared session, and pretending otherwise would leave a signed-in site
 *     session behind a button labelled "Log out".
 *
 *   - There is no `/admin/login`. An unauthenticated visitor is handled by
 *     RequireAdmin in the route group's layout, which opens the site's normal
 *     auth flow. The old panel's login page and 2FA challenge were left in the
 *     reelsoo-admin app and deliberately not migrated.
 */
export { useAuthStore } from "@/store/auth.store";
