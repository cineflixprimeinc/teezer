"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight, Info, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type Thumbnail = {
  id:  string;
  url: string;
  /** The underlying image bytes - used directly on upload so the selected cover
      never depends on re-fetching a (possibly revoked) blob: URL. */
  blob?: Blob;
};

type Props = {
  thumbnails: Thumbnail[];
  selectedId: string | null;
  onSelect:   (id: string) => void;
  onAddCover: (file: File) => void;
};

export function ThumbnailSelector({ thumbnails, selectedId, onSelect, onAddCover }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollerRef  = useRef<HTMLDivElement>(null);

  function scrollBy(dx: number) {
    scrollerRef.current?.scrollBy({ left: dx, behavior: "smooth" });
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <p className="text-[12px] font-bold text-black">Select cover</p>
        <Info className="h-3 w-3 text-[#9aa1ad]" />
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => scrollBy(-140)}
          aria-label="Scroll thumbnails left"
          className="absolute left-0 top-1/2 z-10 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-full border border-[#e0e0e0] bg-white text-[#374151] shadow-md transition hover:border-[#fd4605] hover:text-[#fd4605]"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div ref={scrollerRef} className="hide-scrollbar overflow-x-auto px-7">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="grid h-[68px] w-[48px] flex-shrink-0 place-items-center rounded-md border border-dashed border-[#cccccc] bg-white text-[9px] font-semibold text-[#5f6675] hover:border-[#fd4605] hover:text-[#fd4605] transition"
            >
              <span className="flex flex-col items-center gap-0.5">
                <Plus className="h-3 w-3" />
                Add cover
              </span>
            </button>

            {thumbnails.map((t) => {
              const active = t.id === selectedId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelect(t.id)}
                  aria-pressed={active}
                  className={cn(
                    "relative h-[68px] w-[48px] flex-shrink-0 overflow-hidden rounded-md border-2 transition",
                    active ? "border-[#fd4605]" : "border-transparent hover:border-[#eeeeee]",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.url} alt="Cover option" className="h-full w-full object-cover" />
                  {active && (
                    <span className="absolute bottom-0.5 right-0.5 grid h-4 w-4 place-items-center rounded-full bg-white shadow">
                      <Pencil className="h-2.5 w-2.5 text-[#fd4605]" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => scrollBy(140)}
          aria-label="Scroll thumbnails right"
          className="absolute right-0 top-1/2 z-10 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-full border border-[#e0e0e0] bg-white text-[#374151] shadow-md transition hover:border-[#fd4605] hover:text-[#fd4605]"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onAddCover(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
