import { pageMetadata } from "@/lib/metadata";
import { SectionPage } from "@/components/layout/section-page";
import { RestrictionBanner } from "@/components/restriction-banner";

export const metadata = pageMetadata('Go Live');

export default function Page() {
  return (
    <SectionPage title="Go Live" description="Live streaming setup is coming soon.">
      <RestrictionBanner types={["block_live_access"]} />
    </SectionPage>
  );
}
