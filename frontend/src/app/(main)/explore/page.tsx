import { pageMetadata } from "@/lib/metadata";
import { ExplorePage } from "@/features/explore/explore-page";

export const metadata = pageMetadata('Explore');

export default function ExplorePageRoute() {
  return <ExplorePage />;
}
