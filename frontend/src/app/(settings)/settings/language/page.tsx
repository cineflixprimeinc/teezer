import { SettingsPage } from "@/features/settings/settings-page";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("Language & Translation");

export default function Page() {
  return <SettingsPage title="Language & Translation" fields={["App language", "Translation language", "Country"]} />;
}
