import { redirect } from 'next/navigation';

/**
 * /admin sends you to the dashboard.
 *
 * This route briefly held a hand-written index of four link cards, which was
 * the right thing when the route group contained four pages and there was no
 * real landing screen. The full panel now lives here, and /admin/dashboard is
 * its actual home - overview metrics, revenue, recent activity - reached from
 * every page through AdminShell's sidebar.
 *
 * A redirect rather than a duplicate index: two competing "start here" screens
 * is how a panel ends up with a page nobody maintains. This mirrors what the
 * standalone admin app's own root did.
 *
 * Access is handled by the route group's layout (RequireAdmin) and,
 * independently, by ApiAdminMiddleware on every /admin/* API route.
 */
export default function AdminIndexPage() {
  redirect('/admin/dashboard');
}
