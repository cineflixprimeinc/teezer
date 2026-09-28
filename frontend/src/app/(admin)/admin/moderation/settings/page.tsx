import { AdminShell } from '@/admin-panel/components/layout/admin-shell';
import ModerationSettingsPanel from '@/features/moderation/moderation-settings-panel';

export const metadata = { title: 'Moderation Settings - Teezer Admin' };

/**
 * Wrapped in AdminShell like the rest of the panel. The page's own <h1> is
 * gone - AdminShell's header renders the title, and the heading was
 * `text-white`, which was right against the old dark layout and unreadable
 * against the panel's light one.
 */
export default function ModerationSettingsPage() {
  return (
    <AdminShell title="Moderation Settings">
      <div className="flex flex-col gap-6">
        <p className="text-sm text-[#6b7280]">
          Configure AI detection thresholds, scanner parameters, and global moderation behavior.
        </p>
        <ModerationSettingsPanel />
      </div>
    </AdminShell>
  );
}
