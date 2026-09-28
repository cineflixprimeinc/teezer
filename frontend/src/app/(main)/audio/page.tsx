import { pageMetadata } from "@/lib/metadata";
import { SectionPage } from "@/components/layout/section-page";

export const metadata = pageMetadata('Audio');

export default function Page() {
  return <SectionPage title="Audio" description="Trending sounds, saved sounds, and original creator audio." />;
}
