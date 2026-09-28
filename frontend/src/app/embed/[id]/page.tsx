import { EmbedPlayer } from "@/features/embed/embed-player";

export const metadata = { title: "Teezer Embed" };

export default async function EmbedPage({ params, searchParams }: {
  params:       Promise<{ id: string }>;
  searchParams: Promise<{ autoplay?: string; nocaption?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  return (
    <EmbedPlayer
      videoId={Number(id)}
      autoplay={sp.autoplay === "1"}
      showCaption={sp.nocaption !== "1"}
    />
  );
}
