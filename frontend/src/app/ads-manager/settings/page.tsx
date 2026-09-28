import { SettingsPage } from "@/features/ads-studio/pages/settings-page";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("Settings");

export default function Page() {
  return <SettingsPage />;
}
