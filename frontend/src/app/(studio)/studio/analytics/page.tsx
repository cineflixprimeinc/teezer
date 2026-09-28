import { StudioAnalyticsPage } from "@/features/studio/analytics/analytics-dashboard";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("Analytics");

export default function Page() {
  return <StudioAnalyticsPage />;
}
