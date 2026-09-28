import { pageMetadata } from "@/lib/metadata";
import { SectionPage } from "@/components/layout/section-page";

export const metadata = pageMetadata('Create Story');

export default function Page() {
  return <SectionPage title="Create Story" description="Story creation is coming soon." />;
}
