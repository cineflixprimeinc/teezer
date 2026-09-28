import { pageMetadata } from "@/lib/metadata";
import { LivePage } from "@/features/live/live-page";

export const metadata = pageMetadata('Live', 'Rooms that are open right now on Teezer.');

/** Server Component shell: it owns the metadata, LivePage owns the interaction. */
export default function Page() {
  return <LivePage />;
}
