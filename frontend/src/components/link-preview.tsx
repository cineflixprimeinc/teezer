"use client";

import { useQuery } from "@tanstack/react-query";
import { linkPreviewService } from "@/services/link-preview.service";
import { firstUrl } from "@/lib/urls";
import { cn } from "@/lib/utils";

/**
 * Renders an Open-Graph preview card for a URL using the self-hosted
 * /link-preview endpoint. Returns null while loading-failed or when the link
 * has no usable metadata, so it never leaves an empty box.
 *
 * `compact` → small thumbnail beside the text (good for chat bubbles / comments).
 */
export function LinkPreview({ url, compact = false, className }: {
  url: string;
  compact?: boolean;
  className?: string;
}) {
  const q = useQuery({
    queryKey: ["link-preview", url],
    queryFn: () => linkPreviewService.get(url),
    staleTime: 60 * 60 * 1000, // 1h - server caches a day, client an hour
    gcTime: 60 * 60 * 1000,
    retry: 0,
  });

  if (q.isLoading) {
    return <div className={cn("h-16 animate-pulse rounded-xl border border-[#f0f0f0] bg-[#f8f9fb]", className)} />;
  }

  const d = q.data;
  if (!d || (!d.title && !d.image)) return null;

  return (
    <a href={d.url} target="_blank" rel="noopener noreferrer nofollow"
      className={cn(
        "group block max-w-[340px] overflow-hidden rounded-xl border border-[#e5e7eb] bg-white transition hover:border-[#fd4605]",
        className,
      )}>
      {d.image && !compact && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={d.image} alt="" loading="lazy" className="h-40 w-full bg-[#f3f4f6] object-cover" />
      )}
      <div className="flex items-center gap-2.5 p-2.5">
        {compact && d.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.image} alt="" loading="lazy" className="h-12 w-12 flex-shrink-0 rounded-lg bg-[#f3f4f6] object-cover" />
        )}
        <div className="min-w-0 flex-1">
          {d.site_name && (
            <p className="flex items-center gap-1 truncate text-[10px] uppercase tracking-wide text-[#9ca3af]">
              {d.favicon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.favicon} alt="" loading="lazy" className="h-3 w-3 rounded-sm" />
              )}
              {d.site_name}
            </p>
          )}
          {d.title && (
            <p className="truncate text-[13px] font-bold text-[#111827] group-hover:text-[#fd4605]">{d.title}</p>
          )}
          {d.description && (
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[#6b7280]">{d.description}</p>
          )}
        </div>
      </div>
    </a>
  );
}

/** Convenience: render a preview for the first URL found in `text`, if any. */
export function LinkPreviewFromText({ text, compact, className }: {
  text?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const url = firstUrl(text);
  if (!url) return null;
  return <LinkPreview url={url} compact={compact} className={className} />;
}
