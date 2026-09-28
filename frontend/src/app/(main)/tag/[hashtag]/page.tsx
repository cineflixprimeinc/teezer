import type { Metadata } from "next";
import { SectionPage } from "@/components/layout/section-page";
import { KnowledgeCard } from "@/components/knowledge/knowledge-card";
import { pageMetadata } from "@/lib/metadata";

/**
 * A hashtag - the canonical URL in the shared link grammar.
 *
 * /hashtag/:x 308s here (see next.config.ts). Body is unchanged from the route
 * this replaces; only the path moved.
 */
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
    >
      {/*
        Wikipedia context above the hashtag's videos. `label` already has the
        leading '#' stripped, which matters: the backend normalises "#Everest"
        and "everest" to the same cache key, so this page and a plain search
        for the same word share one cached article instead of fetching twice.

        Renders nothing for tags that are not real-world topics (#fyp, #viral) -
        most of them - so there is deliberately no heading or wrapper around it
        that would otherwise be left stranded on those pages.
      */}
      <KnowledgeCard query={label} className="mb-6" />
    </SectionPage>
  );
}
