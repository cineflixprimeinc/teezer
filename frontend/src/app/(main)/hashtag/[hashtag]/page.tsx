import type { Metadata } from "next";
import { SectionPage } from "@/components/layout/section-page";
import { pageMetadata } from "@/lib/metadata";

export async function generateMetadata({ params }: { params: Promise<{ hashtag: string }> }): Promise<Metadata> {
  const { hashtag } = await params;
  const label = decodeURIComponent(hashtag).replace(/^#/, "");
  return pageMetadata(`#${label}`, `Explore the top reels tagged #${label} on Teezer.`);
}

export default async function Page({ params }: { params: Promise<{ hashtag: string }> }) {
  const { hashtag } = await params;
  const label = decodeURIComponent(hashtag).replace(/^#/, "");

  return (
    <SectionPage
      title={`#${label}`}
      description="Trending reels for this hashtag will appear here."
    />
  );
}
