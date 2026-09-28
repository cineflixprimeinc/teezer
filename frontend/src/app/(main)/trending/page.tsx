import { pageMetadata } from "@/lib/metadata";
import { SectionPage } from "@/components/layout/section-page";

export const metadata = pageMetadata('Trending');

export default function Page() {
  return (
    <SectionPage
      title="Trending"
      description="Explore trending hashtags and videos across Teezer."
    />
  );
}
