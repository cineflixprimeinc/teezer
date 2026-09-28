import type { Metadata } from "next";
import { VideoDetailPage } from "@/features/videos/video-detail-page";
import { pageMetadata, fetchMetadataResource, clip } from "@/lib/metadata";

/**
 * A single reel - the canonical URL in the shared link grammar.
 *
 * The site previously served this at /videos/:id; that path now 308s here (see
 * next.config.ts) so there is exactly one indexable URL per video, and the
 * mobile app's App Links only have to claim one pattern. The page component is
 * unchanged - only the route moved.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const video = await fetchMetadataResource<{
    caption?: string | null;
    user?: { username?: string; name?: string };
  }>(`/videos/${encodeURIComponent(id)}`);
  const creator = video?.user?.name || video?.user?.username;
  const caption = video?.caption?.trim();
  const title = caption ? clip(caption) : creator ? `Video by ${creator}` : "Video";
  const description = creator ? `Watch ${creator}'s video on Teezer.` : "Watch this video on Teezer.";
  return pageMetadata(title, description);
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VideoDetailPage id={id} />;
}
