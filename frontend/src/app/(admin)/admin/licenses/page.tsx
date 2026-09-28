import { AdminShell } from '@/admin-panel/components/layout/admin-shell';
import LicenseManager from '@/features/admin/license-manager';

export const metadata = { title: 'Teezer Code Purchase - Teezer Admin' };

/**
 * Marketplace licence management, at teezer.live/admin/licenses.
 *
 * Wrapped in AdminShell like every other page in the panel, so it gets the
 * same sidebar and header. Its own <h1> is gone: AdminShell's header already
 * renders the title, and the heading here was styled `text-white`, which was
 * correct against the route group's old dark layout and invisible against the
 * panel's light one.
 *
 * Server-side access control is the api.admin group plus the manage_licenses
 * grant on every endpoint this page calls; the layout's RequireAdmin only
 * decides what renders.
 */
export default function AdminLicensesPage() {
  return (
    <AdminShell title="Teezer Code Purchase">
      <div className="flex flex-col gap-6">
        <p className="text-sm text-[#6b7280]">
          Marketplace licences and purchase codes. Suspend, revoke, reset an activation for a
          customer migrating servers, or move a licence to a new domain.
        </p>
        <LicenseManager />
      </div>
    </AdminShell>
  );
}
