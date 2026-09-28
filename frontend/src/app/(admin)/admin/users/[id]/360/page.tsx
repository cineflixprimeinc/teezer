import { AdminShell } from '@/admin-panel/components/layout/admin-shell';
import User360Page from '@/features/admin/user-360/user-360-page';

export const metadata = { title: 'User 360 - Teezer Admin' };

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Wrapped in AdminShell like the rest of the panel. The page's own <h1> is
 * gone - AdminShell's header renders the title, and the heading was
 * `text-white`, which was right against the old dark layout and unreadable
 * against the panel's light one.
 *
 * Note this sits alongside the migrated /admin/users/[id] page, which is the
 * standalone panel's own user detail screen. They are different views of the
 * same account and both are kept: nothing in this migration was asked to
 * choose between them.
 */
export default async function AdminUser360Route({ params }: PageProps) {
  const { id } = await params;
  const userId = parseInt(id, 10);

  return (
    <AdminShell title="User 360 Profile">
      <div className="space-y-6">
        <p className="text-sm text-[#6b7280]">
          Full user profile, moderation controls, and content restrictions.
        </p>
        <User360Page userId={userId} />
      </div>
    </AdminShell>
  );
}
