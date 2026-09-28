import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Edge-level gate for the admin panel - runs before ANY page code is served,
 * closing the gap the security audit found: with no middleware.ts at all,
 * every admin route's full page bundle shipped to a logged-out visitor's
 * browser regardless of auth state, with the actual check only happening
 * client-side after hydration (RequireAdmin). A scanner/bot hitting these
 * routes got real application code back, even though the data underneath
 * was always correctly protected by the API's own 401s.
 *
 * This only checks whether the session cookie is PRESENT, not whether it's
 * still valid (Edge middleware can't call the API on every request without
 * meaningfully slowing every page load) - so it catches the "definitely not
 * logged in" case immediately, while RequireAdmin's existing fetchMe() call
 * still does the real validity check (expired/revoked token, role, 2FA
 * enrollment) exactly as it already did. Two layers, not a replacement.
 */
const SESSION_COOKIE = "reelsoo_admin_session";

export function middleware(request: NextRequest) {
  if (!request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!login|health|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
