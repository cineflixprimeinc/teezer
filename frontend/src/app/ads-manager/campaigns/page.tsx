import { CampaignsPage } from "@/features/ads-studio/pages/campaigns-page";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("Campaigns");

export default function Page() {
  return <CampaignsPage />;
}
