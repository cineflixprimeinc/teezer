import { pageMetadata } from "@/lib/metadata";
import { MorePage } from "@/features/settings/more-page";

export const metadata = pageMetadata('More');

export default function Page() {
  return <MorePage />;
}
