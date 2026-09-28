import { StudioSettingsPageFull } from "@/features/studio/studio-settings-page";
import { pageMetadata } from "@/lib/metadata";
export const metadata = pageMetadata("Settings");
export default function Page() {
  return <StudioSettingsPageFull />;
}
