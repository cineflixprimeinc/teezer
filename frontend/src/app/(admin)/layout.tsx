import type { ReactNode } from 'react';
import { RequireAdmin } from '@/components/layout/protected-route';
import './admin-panel.css';

export const metadata = {
  title: 'Teezer Admin',
  // Keep the panel out of search results. Not a security control - the guard
  // below and the API are - but there is no reason for these URLs to be
  // indexed and then probed.
  robots: { index: false, follow: false },
};

/**
 * Layout for the admin panel at teezer.live/admin.
 *
 * This used to render a small dark header with four links, because the route
 * group only held four pages. The full panel - 70+ pages, grouped sidebar,
 * search, profile menu - now lives here, migrated from the separate
 * teezer-admin app, and its chrome comes from AdminShell.
 *
 * AdminShell is applied PER PAGE, not here, and that is not an oversight: it
 * takes a `title` prop that names the current section in the header, which a
 * layout has no way to know. 62 pages call it directly and the Monitoring
 * pages reach it through MonPage. So this layout deliberately provides only
 * the two things that ARE global: the access guard and the style scope.
 *
 * On access control: RequireAdmin is a CLIENT-side guard. It stops the panel
 * rendering for people who should not see it - a signed-out visitor goes to
 * the auth flow, a non-admin gets an access-denied card. What actually
 * protects the data is ApiAdminMiddleware, which independently checks
 * authentication, ban status and role on every /admin/* API route and cannot
 * be bypassed from a browser. The HTML shell still ships to anyone who
 * requests the URL; the data does not.
 *
 * The `admin-panel-root` class is the scope for admin-panel.css. Everything in
 * that file is a descendant selector of this class, so the panel's light
 * theme, Inter stack, scrollbars and its 256px `--sidebar-w` stay inside this
 * subtree instead of restyling the video feed.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAdmin>
      <div className="admin-panel-root">{children}</div>
    </RequireAdmin>
  );
}
