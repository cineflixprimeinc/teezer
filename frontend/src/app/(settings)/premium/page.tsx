import { pageMetadata } from "@/lib/metadata";
import { StudioPremiumPage } from "@/features/studio/studio-premium-page";

/** /premium is the alias kept for constants/routes.ts and any existing links.
 *  The canonical route is /studio/premium, which the studio sidebar points at. */

export const metadata = pageMetadata('Premium');

export default function Page() {
  return <StudioPremiumPage />;
}
