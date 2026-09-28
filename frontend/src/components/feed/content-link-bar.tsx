"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ExternalLink, ShoppingBag } from "lucide-react";
import { linkPreviewService } from "@/services/link-preview.service";
import { cn } from "@/lib/utils";
import type { ReelsooVideo } from "@/types/video";

/**
 * Universal content-attached link/product bar - shown above the creator's
 * username wherever a video's own overlay is rendered (the Feed/Following
 * player and the shared /videos/[id] detail page). Driven ENTIRELY by the
 * content's own persisted data (`video.featured_products` / `video.link_url`
 * - see VideoResource::featured_products/link_url on the server) - never
 * guessed, never a second source of truth. Renders nothing when the post
 * has neither, so no space is reserved.
 *
 * Both fields can be set on the same post (the Studio "Add link" popup
 * doesn't clear one when the other is picked), so rather than an arbitrary
 * priority between them, the external link is appended as one more slide
 * after the product slides - one compact swipeable strip, never two
 * stacked blocks. Mirrors mobile's ContentLinkBar (mobile/src/components/
 * feed/ContentLinkBar.tsx) slide-for-slide.
 */

type ProductSlide = { type: "product"; id: number; name: string; price: number; currency: string; image_url: string | null };
type LinkSlide = { type: "link"; url: string };
type Slide = ProductSlide | LinkSlide;

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function fmtPrice(currency: string, price: number): string {
  return `${currency} ${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/** Reuses the site's existing OG-scrape preview service (the same one
 *  <LinkPreviewFromText> already calls on captions) for a real title where
 *  one is available - falls back to the bare hostname while loading or on
 *  a miss, never blocking the bar's render. */
function LinkSlideContent({ url }: { url: string }) {
  const q = useQuery({
    queryKey: ["link-preview", url],
    queryFn: () => linkPreviewService.get(url),
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 0,
  });
  const title = q.data?.title || q.data?.site_name || hostnameOf(url);
  return (
    <>
      <p className="truncate text-[12px] font-bold text-white">{title}</p>
      <p className="truncate text-[10.5px] text-white/60">{hostnameOf(url)}</p>
    </>
  );
}

export function ContentLinkBar({ video, variant }: { video: ReelsooVideo; variant: "overlay" | "panel" }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef({ x: 0, y: 0 });
  const drag = useRef({ active: false, startX: 0, startScroll: 0, moved: 0 });

  const slides = useMemo<Slide[]>(() => {
    const products: ProductSlide[] = (video.featured_products ?? []).map((p) => ({
      type: "product", id: p.id, name: p.name, price: p.price, currency: p.currency, image_url: p.image_url,
    }));
    const linkSlide: LinkSlide[] = video.link_url ? [{ type: "link", url: video.link_url }] : [];
    return [...products, ...linkSlide];
  }, [video.featured_products, video.link_url]);

  if (slides.length === 0) return null;

  const dark = variant === "overlay";

  /** Scroll the carousel to a given slide - what the pagination dots drive. */
  function goToSlide(i: number) {
    const el = scrollerRef.current;
    if (!el) return;
    const first = el.firstElementChild;
    const cardW = first instanceof HTMLElement ? first.offsetWidth + 8 : 0;
    el.scrollTo({ left: i * cardW, behavior: "smooth" });
    setActiveIndex(i);
  }

  function onScroll() {
    const el = scrollerRef.current;
    if (!el || slides.length < 2) return;
    const cardW = el.firstElementChild instanceof HTMLElement ? el.firstElementChild.offsetWidth + 8 : 1;
    setActiveIndex(Math.max(0, Math.min(slides.length - 1, Math.round(el.scrollLeft / cardW))));
  }

  // Own touch handlers, stopping propagation - mirrors VideoSlide's progress
  // bar (the one existing element inside it that already does this) so the
  // container's own carousel-swipe / double-tap-to-like arbitration in
  // handleTouchEnd never sees a drag that started inside this bar.
  function onTouchStart(e: React.TouchEvent) {
    e.stopPropagation();
    const t = e.touches[0];
    if (t) touchStart.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchMove(e: React.TouchEvent) { e.stopPropagation(); }
  function onTouchEnd(e: React.TouchEvent) { e.stopPropagation(); }

  /**
   * Mouse drag-to-swipe.
   *
   * Touch devices scroll this natively, but on a desktop an overflow-x
   * container cannot be dragged - the carousel looked swipeable and wasn't.
   * Pointer events give it the same drag as touch, and `dragged` suppresses
   * the click that would otherwise fire on the product link at the end of a
   * drag (a drag is not a tap).
   */
  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType !== "mouse" || slides.length < 2) return;
    const el = scrollerRef.current;
    if (!el) return;
    drag.current = { active: true, startX: e.clientX, startScroll: el.scrollLeft, moved: 0 };
  }
  function onPointerMove(e: React.PointerEvent) {
    const el = scrollerRef.current;
    if (!drag.current.active || !el) return;
    const dx = e.clientX - drag.current.startX;
    drag.current.moved = Math.max(drag.current.moved, Math.abs(dx));
    el.scrollLeft = drag.current.startScroll - dx;
  }
  function endDrag() { drag.current.active = false; }
  function onClickCapture(e: React.MouseEvent) {
    if (drag.current.moved > 4) { e.preventDefault(); e.stopPropagation(); }
    drag.current.moved = 0;
  }

  const cardBase = cn(
    "flex items-center gap-[9px] rounded-[13px] py-[7px] pr-[11px] pl-[7px] border transition-colors",
    dark
      ? "bg-black/[0.42] border-white/[0.22] hover:border-white/40"
      : "bg-[#f8f9fb] border-[#eceef1] hover:border-[#dfe2e7]",
  );

  function renderSlide(slide: Slide, i: number) {
    const inner = (
      <>
        <span className={cn(
          "flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center overflow-hidden rounded-[9px]",
          dark ? "bg-white/[0.14]" : "bg-[#eceef1]",
        )}>
          {slide.type === "product" && slide.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={slide.image_url} alt="" className="h-full w-full object-cover" />
          ) : slide.type === "product" ? (
            <ShoppingBag className={cn("h-4 w-4", dark ? "text-white" : "text-[#4a4653]")} strokeWidth={2} />
          ) : (
            <ExternalLink className={cn("h-4 w-4", dark ? "text-white" : "text-[#4a4653]")} strokeWidth={2} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          {slide.type === "product" ? (
            <>
              <p className={cn("truncate text-[12px] font-bold", dark ? "text-white" : "text-[#171417]")}>{slide.name}</p>
              <p className="truncate text-[11px] font-extrabold text-[#ff8aa6]">{fmtPrice(slide.currency, slide.price)}</p>
            </>
          ) : (
            <LinkSlideContent url={slide.url} />
          )}
        </span>
        <ChevronRight className={cn("h-3.5 w-3.5 flex-shrink-0", dark ? "text-white/70" : "text-[#8a8592]")} strokeWidth={2.2} />
      </>
    );

    const className = cn(cardBase, slides.length > 1 ? "w-[232px] flex-shrink-0 snap-start" : "max-w-[260px]");

    return slide.type === "product" ? (
      <Link key={`p${slide.id}`} href={`/shop/checkout/${slide.id}`} className={className}>{inner}</Link>
    ) : (
      <a key={`l${i}`} href={slide.url} target="_blank" rel="noopener noreferrer" className={className}>{inner}</a>
    );
  }

  return (
    <div className="mb-2 inline-flex max-w-full flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={onClickCapture}
        // Explicit viewport width = exactly one card when there's more than
        // one - without it this scroller has nothing bounding it to "one
        // slide wide" and the cards would just lay out as a row, not a
        // clipped single-slot carousel.
        className={cn(
          "hide-scrollbar flex overflow-x-auto scroll-smooth [overscroll-behavior-x:contain]",
          slides.length > 1 && "w-[232px] cursor-grab snap-x snap-mandatory select-none active:cursor-grabbing",
        )}
      >
        {slides.map(renderSlide)}
      </div>
      {slides.length > 1 && (
        <div className="flex items-center gap-[7px] pl-0.5">
          {/* Real controls, not decoration: on desktop a drag is awkward, so
              each dot jumps straight to its product. The button carries
              padding for a usable hit target while the dot itself keeps its
              5px look, and stops propagation so the click never reaches the
              feed's own tap handling underneath. */}
          <span className="flex">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Show product ${i + 1} of ${slides.length}`}
                aria-current={i === activeIndex}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); goToSlide(i); }}
                className="group flex cursor-pointer items-center px-[2px] py-[6px]"
              >
                <span
                  className={cn(
                    "h-[5px] rounded-full transition-all",
                    i === activeIndex ? "w-[14px] bg-white" : "w-[5px] group-hover:w-[9px]",
                    i === activeIndex ? "" : dark ? "bg-white/40 group-hover:bg-white/70" : "bg-black/25 group-hover:bg-black/50",
                  )}
                />
              </button>
            ))}
          </span>
          <span className={cn("text-[10.5px] font-semibold", dark ? "text-white/60" : "text-[#8a8592]")}>
            {activeIndex + 1} of {slides.length}
          </span>
        </div>
      )}
    </div>
  );
}
