import { SettingsPage } from "@/features/settings/settings-page";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("Content Preferences");

export default function Page() {
  return <SettingsPage title="Content Preferences" fields={["Preferred topics", "Muted hashtags", "Sensitive content filter", "Autoplay videos", "Caption defaults", "Feed personalization"]} />;
}
