import { BillingPage } from "@/features/ads-studio/pages/billing-page";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("Billing");

export default function Page() {
  return <BillingPage />;
}
