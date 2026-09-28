import type { Metadata } from "next";
import { SoundDetailPage } from "@/features/sound/sound-detail-page";
import { pageMetadata, fetchMetadataResource } from "@/lib/metadata";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const sound = await fetchMetadataResource<{
    title?: string;
    name?: string;
    artist?: string;
    author?: string;
  }>(`/music/${encodeURIComponent(id)}`);
  const name = sound?.title || sound?.name;
  const artist = sound?.artist || sound?.author;
  const title = name ? (artist ? `${name} - ${artist}` : name) : "Sound";
  const description = name
    ? `Discover videos using ${name} on Teezer.`
    : "Discover videos using this sound on Teezer.";
  return pageMetadata(title, description);
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SoundDetailPage id={Number(id)} />;
}
