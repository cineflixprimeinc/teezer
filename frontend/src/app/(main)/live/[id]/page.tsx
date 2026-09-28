import type { Metadata } from "next";
import { SectionPage } from "@/components/layout/section-page";
import { pageMetadata } from "@/lib/metadata";

/**
 * A single live stream.
 *
 * Note this sits beside the static /live and /live/create routes. Next gives
 * static segments priority, so /live/create keeps resolving to its own page -
 * but it does mean "create" can never be a valid :id.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return pageMetadata(`Live ${id}`, "Watch this live stream on Teezer.");
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <SectionPage
      title="Live"
      description={`Stream ${id} will play here once live streaming is available.`}
    />
  );
}
