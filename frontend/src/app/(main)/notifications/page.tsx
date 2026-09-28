import { pageMetadata } from "@/lib/metadata";
import { RequireAuth } from "@/components/layout/protected-route";
import { NotificationsCenter } from "@/features/notifications/notifications-center";

export const metadata = pageMetadata('Notifications');

export default function Page() {
  return <RequireAuth><NotificationsCenter /></RequireAuth>;
}
