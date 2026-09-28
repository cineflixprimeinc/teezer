import { StudioEditVideoPage } from "@/features/studio/studio-edit-video-page";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("Edit Video");

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const videoId = parseInt(id, 10);
  if (isNaN(videoId)) return null;
  return <StudioEditVideoPage videoId={videoId} />;
}
