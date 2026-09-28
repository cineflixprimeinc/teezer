import { SettingsPage } from "@/features/settings/settings-page";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("Social Links");

export default function Page() {
  return <SettingsPage title="Social Links" fields={["Instagram", "YouTube", "TikTok", "Facebook", "X / Twitter", "Telegram", "WhatsApp"]} />;
}
