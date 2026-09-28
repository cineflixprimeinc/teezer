import { StudioInsightsPage } from "@/features/studio/studio-insights-page";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("Video Insights");

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const videoId = parseInt(id, 10);
  if (isNaN(videoId)) return null;
  return <StudioInsightsPage videoId={videoId} />;
}
