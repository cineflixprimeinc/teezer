"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bookmark,
  Calendar,
  ChevronDown,
  Clock,
  Eye,
  Film,
  Heart,
  Image as ImageIcon,
  LayoutGrid,
  ListVideo,
  SquarePen,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { VideoSort } from "@/services/user.service";

export type MediaTypeFilter = "all" | "video" | "image";

export type ProfileTab =
  | "reels"
  | "drafts"
  | "liked"
  | "playlists"
  | "tagged"
  | "saved";

const TABS: { id: ProfileTab; label: string; icon: React.ElementType }[] = [
  { id: "reels",     label: "Reels",     icon: Film },
  { id: "drafts",    label: "Drafts",    icon: SquarePen },
  { id: "liked",     label: "Liked",     icon: Heart },
  { id: "playlists", label: "Playlists", icon: ListVideo },
  { id: "tagged",    label: "Tagged",    icon: Tag },
  { id: "saved",     label: "Saved",     icon: Bookmark },
];

const SORT_OPTIONS: { id: VideoSort; label: string; icon: React.ElementType }[] = [
  { id: "latest",      label: "Latest",      icon: Clock },
  { id: "most_viewed", label: "Most viewed", icon: Eye },
  { id: "most_likes",  label: "Most liked",  icon: Heart },
  { id: "oldest",      label: "Oldest",      icon: Calendar },
];

const TYPE_OPTIONS: { id: MediaTypeFilter; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "all",   label: "All types", icon: LayoutGrid, desc: "Show everything"   },
  { id: "video", label: "Videos",    icon: Film,       desc: "Reels & video clips" },
  { id: "image", label: "Images",    icon: ImageIcon,  desc: "Photos & carousels"  },
];

type Props = {
  active: ProfileTab;
  onChange: (tab: ProfileTab) => void;
  sort: VideoSort;
  onSortChange: (sort: VideoSort) => void;
  mediaType?: MediaTypeFilter;
  onMediaTypeChange?: (type: MediaTypeFilter) => void;
  isOwnProfile?: boolean;
  showSavedTab?: boolean;
};

export function ProfileTabs({ active, onChange, sort, onSortChange, mediaType = "all", onMediaTypeChange, isOwnProfile = false, showSavedTab = true }: Props) {
  const [sortOpen, setSortOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const typeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sortOpen) return;
    const handler = (e: MouseEvent) => {
      if (!sortRef.current?.contains(e.target as Node)) setSortOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [sortOpen]);

  useEffect(() => {
    if (!typeOpen) return;
    const handler = (e: MouseEvent) => {
      if (!typeRef.current?.contains(e.target as Node)) setTypeOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [typeOpen]);

  const showFilters = active === "reels";
  const currentSort = SORT_OPTIONS.find((o) => o.id === sort) ?? SORT_OPTIONS[0];
  const currentType = TYPE_OPTIONS.find((o) => o.id === mediaType) ?? TYPE_OPTIONS[0];
  const TypeIcon = currentType.icon;
  // Drafts: only own profile. Saved: controlled by privacy setting.
  const visibleTabs = TABS.filter((t) => {
    if (t.id === "drafts") return isOwnProfile;
    if (t.id === "saved")  return showSavedTab;
    return true;
  });

  return (
    <div className="mt-5 flex items-center border-b border-[#e5e7eb]">
      {/* Tab list - underline style only */}
      <div className="hide-scrollbar flex min-w-0 flex-1 items-center overflow-x-auto">
        {visibleTabs.map(({ id, label, icon: Icon }) => {
          const isActive = id === active;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={cn(
                "flex flex-shrink-0 items-center gap-1.5 border-b-[2.5px] px-4 py-3.5 text-[13px] font-semibold transition-colors",
                isActive
                  ? "-mb-px border-[#fd4605] text-[#fd4605]"
                  : "border-transparent text-[#5f6675] hover:text-[#111827]",
              )}
            >
              <Icon className={cn("h-[15px] w-[15px]", isActive && "text-[#fd4605]")} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Filter controls - only shown on reels tab */}
      {showFilters && (
        <div className="flex items-center gap-2 flex-shrink-0 pb-1 pl-3">

          {/* Type filter dropdown */}
          <div ref={typeRef} className="relative">
            <button
              onClick={() => setTypeOpen((o) => !o)}
              className={cn(
                "flex items-center gap-1.5 rounded-[10px] border px-3.5 py-[7px] text-[12px] font-semibold transition",
                mediaType !== "all"
                  ? "border-[#fd4605] bg-[#fff3ec] text-[#fd4605]"
                  : "border-[#e5e7eb] bg-white text-[#111827] hover:border-[#fd4605]",
              )}
            >
              <TypeIcon className="h-[13px] w-[13px] flex-shrink-0" />
              {mediaType === "all" ? "Type" : currentType.label}
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 flex-shrink-0 transition-transform",
                  typeOpen && "rotate-180",
                  mediaType !== "all" ? "text-[#fd4605]" : "text-[#5f6675]",
                )}
              />
            </button>

            {typeOpen && (
              <div className="absolute right-0 top-full z-50 mt-1.5 w-52 rounded-xl border border-[#e5e7eb] bg-white p-1.5 shadow-[0_8px_30px_rgba(15,23,42,0.10)]">
                {TYPE_OPTIONS.map(({ id, label, icon: Icon, desc }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      onMediaTypeChange?.(id);
                      setTypeOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[8px] px-3 py-2.5 text-left transition hover:bg-[#f8f9fb]",
                      id === mediaType ? "bg-[#fff3ec]" : "",
                    )}
                  >
                    <div className={cn(
                      "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg",
                      id === mediaType ? "bg-[#fd4605]" : "bg-[#f3f4f6]",
                    )}>
                      <Icon className={cn("h-[14px] w-[14px]", id === mediaType ? "text-white" : "text-[#5f6675]")} />
                    </div>
                    <div className="min-w-0">
                      <p className={cn("text-[12px] font-semibold leading-none", id === mediaType ? "text-[#fd4605]" : "text-[#111827]")}>
                        {label}
                      </p>
                      <p className="mt-0.5 text-[10px] text-[#9ca3af]">{desc}</p>
                    </div>
                    {id === mediaType && (
                      <div className="ml-auto h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#fd4605]" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sort dropdown */}
          <div ref={sortRef} className="relative">
            <button
              onClick={() => setSortOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-[10px] border border-[#e5e7eb] bg-white px-3.5 py-[7px] text-[12px] font-semibold text-[#111827] transition hover:border-[#fd4605]"
            >
              {currentSort.label}
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 flex-shrink-0 text-[#5f6675] transition-transform",
                  sortOpen && "rotate-180",
                )}
              />
            </button>

            {sortOpen && (
              <div className="absolute right-0 top-full z-50 mt-1.5 w-44 rounded-xl border border-[#e5e7eb] bg-white p-1.5 shadow-[0_8px_30px_rgba(15,23,42,0.10)]">
                {SORT_OPTIONS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      onSortChange(id);
                      setSortOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-left text-[12px] font-medium transition hover:bg-[#f8f9fb]",
                      id === sort ? "font-semibold text-[#fd4605]" : "text-[#111827]",
                    )}
                  >
                    <Icon className={cn("h-[14px] w-[14px]", id === sort ? "text-[#fd4605]" : "text-[#5f6675]")} />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
