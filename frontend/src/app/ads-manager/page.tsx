import { OverviewPage } from "@/features/ads-studio/overview-page";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("Overview");

export default function Page() {
  return <OverviewPage />;
}
