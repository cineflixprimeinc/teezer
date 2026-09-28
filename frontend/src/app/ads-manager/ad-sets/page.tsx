import { AdSetsPage } from "@/features/ads-studio/pages/ad-sets-page";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("Ad Sets");

export default function Page() {
  return <AdSetsPage />;
}
