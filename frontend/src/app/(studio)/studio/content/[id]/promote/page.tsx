import { StudioPromotePage } from "@/features/studio/studio-promote-page";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("Promote Video");

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const videoId = parseInt(id, 10);
  if (isNaN(videoId)) return null;
  return <StudioPromotePage videoId={videoId} />;
}
