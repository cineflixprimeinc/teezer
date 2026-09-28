"use client";

import { useEffect, useState } from "react";
import { BookOpen, ExternalLink, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  knowledgeService,
  type KnowledgeArticle,
} from "@/services/knowledge.service";

/**
 * The Wikipedia info card shown above search results and on hashtag, location
 * and video surfaces.
 *
 * Three rules shape everything here:
 *
 *  - It loads on its own, after and independently of the page's real content.
 *    Nothing on the page ever waits for it.
 *  - It renders nothing at all when there is no article. Most searches on a
 *    social app are not encyclopedia topics, so "absent" is the common case
 *    and must look deliberate rather than broken.
 *  - It never reports an error. A failed lookup is indistinguishable from "no
 *    article", because a decorative card has no business showing an error.
 */

type Variant = "default" | "compact" | "inline";

type Props = {
  /** Topic to look up. Falsy skips the request entirely. */
  query: string | null | undefined;
  variant?: Variant;
  /** Extra context line, e.g. the country on a location page. */
  subtitle?: string;
  className?: string;
};

/**
 * Fetches one topic. Kept as a hook rather than React Query so the card can be
 * dropped into any surface without assuming a QueryClient is mounted above it -
 * the server response is already cache-controlled, so the browser and CDN do
 * the real caching anyway.
 */
function useKnowledge(query: string | null | undefined) {
  const [article, setArticle] = useState<KnowledgeArticle | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query?.trim();
    // Under three characters cannot be a topic, and the backend's entity gate
    // would reject it anyway - so do not spend a request finding that out.
    if (!q || q.length < 3) {
      setArticle(null);
      setLoading(false);
      return;
    }

    // Debounce lives here, not in the caller. The search drawer updates its
    // query on every keystroke, so without this "mount everest" would fire
    // thirteen lookups. Keeping it inside the hook means no surface can
    // reintroduce that by forgetting to debounce.
    const controller = new AbortController();
    let active = true;

    setLoading(true);
    const timer = setTimeout(() => {
      knowledgeService
        .lookup(q, controller.signal)
        .then((result) => {
          if (!active) return;
          setArticle(result.found && result.article ? result.article : null);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 400);

    return () => {
      active = false;
      clearTimeout(timer);
      // Abort in flight so a slow lookup for a previous term can never
      // overwrite the current one.
      controller.abort();
    };
  }, [query]);

  return { article, loading };
}

function Skeleton({ variant }: { variant: Variant }) {
  if (variant === "inline") {
    return (
      <div className="flex items-center gap-2 py-2">
        <div className="h-4 w-4 animate-pulse rounded-full bg-neutral-200 dark:bg-neutral-800" />
        <div className="h-3 w-40 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex gap-4 rounded-xl border border-neutral-200 bg-white p-4",
        "dark:border-neutral-800 dark:bg-neutral-900",
        variant === "compact" && "p-3",
      )}
    >
      <div className="h-16 w-16 shrink-0 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
      <div className="flex-1 space-y-2 py-1">
        <div className="h-3.5 w-1/3 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="h-3 w-full animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
      </div>
    </div>
  );
}

export function KnowledgeCard({
  query,
  variant = "default",
  subtitle,
  className,
}: Props) {
  const { article, loading } = useKnowledge(query);

  if (loading) return <Skeleton variant={variant} />;
  // No article, or the lookup failed - render nothing at all.
  if (!article) return null;

  /* ── Inline "Learn more" card, used under a video caption ───────────── */
  if (variant === "inline") {
    return <InlineKnowledge article={article} className={className} />;
  }

  return (
    <article
      className={cn(
        "flex gap-4 rounded-xl border border-neutral-200 bg-white p-4 transition-colors",
        "hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700",
        variant === "compact" && "gap-3 p-3",
        className,
      )}
    >
      {article.thumbnail ? (
        <a
          href={article.article_url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0"
        >
          {/*
            A plain <img>, not next/image, on purpose. next/image would proxy
            the file through our own optimizer - our CPU, our RAM, our egress -
            for an image Wikimedia already serves pre-sized from their CDN
            (their thumbnail URLs are literally ".../330px-<name>.jpg"). The
            brief is to keep heavy processing on Wikimedia's servers, and this
            is where that is decided. It also avoids adding upload.wikimedia.org
            to images.remotePatterns, which would let any Commons upload be
            fetched through our optimizer.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.thumbnail}
            alt=""
            width={80}
            height={80}
            loading="lazy"
            decoding="async"
            // Wikimedia sets its own referrer policy; sending none keeps the
            // user's Reelsoo page out of their logs.
            referrerPolicy="no-referrer"
            className={cn(
              "h-20 w-20 rounded-lg object-cover",
              variant === "compact" && "h-14 w-14",
            )}
          />
        </a>
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
          <BookOpen className="h-3.5 w-3.5" />
          <span>Wikipedia</span>
        </div>

        <h3 className="truncate text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
          {article.title}
        </h3>

        {subtitle ? (
          <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
            {subtitle}
          </p>
        ) : null}

        <p
          className={cn(
            "mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300",
            // Clamp rather than truncate server-side: the full summary is
            // already cached, and clamping keeps the card a fixed height so it
            // cannot cause layout shift as it loads in.
            variant === "compact" ? "line-clamp-2" : "line-clamp-3",
          )}
        >
          {article.summary}
        </p>

        <a
          href={article.article_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[#fd4605] hover:underline"
        >
          Read More
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </article>
  );
}

/**
 * The video-feed variant: a single quiet line that expands on tap. Collapsed by
 * default so it never competes with the caption or pushes the video around.
 */
function InlineKnowledge({
  article,
  className,
}: {
  article: KnowledgeArticle;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("text-sm", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-neutral-500 transition-colors hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
      >
        <Info className="h-3.5 w-3.5" />
        <span>Learn about {article.title}</span>
      </button>

      {open ? (
        <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="line-clamp-4 text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-300">
            {article.summary}
          </p>
          <a
            href={article.article_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-[#fd4605] hover:underline"
          >
            Read full article
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      ) : null}
    </div>
  );
}
