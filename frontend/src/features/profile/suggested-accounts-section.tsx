"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Info, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";
import { suggestionService, type SuggestedProfile } from "@/services/suggestion.service";
import { StoryRingAvatar } from "@/components/story/story-ring-avatar";
import { VerifiedBadge } from "@/components/ui/verified-badge";

/* ── Avatar gradient fallback ─────────────────────────────────────── */
const GRADS = [
  "linear-gradient(135deg,#cc2b5e,#753a88)",
  "linear-gradient(135deg,#fe2c55,#c02040)",
  "linear-gradient(135deg,#667eea,#764ba2)",
  "linear-gradient(135deg,#2193b0,#6dd5ed)",
  "linear-gradient(135deg,#f77f00,#d62828)",
  "linear-gradient(135deg,#134e5e,#71b280)",
];
function hashGrad(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return GRADS[Math.abs(h) % GRADS.length];
}

/* ── Skeleton card ────────────────────────────────────────────────── */
function SkeletonCard() {
  return (
    <div className="flex w-[138px] flex-shrink-0 flex-col items-center gap-2.5 rounded-[14px] border border-[#f0f0f0] bg-[#fafafa] px-3 pb-3.5 pt-4">
      <div className="h-[54px] w-[54px] animate-pulse rounded-full bg-[#e9e9e9]" />
      <div className="w-full space-y-1.5">
        <div className="mx-auto h-3 w-20 animate-pulse rounded bg-[#e9e9e9]" />
        <div className="mx-auto h-2.5 w-14 animate-pulse rounded bg-[#e9e9e9]" />
        <div className="mx-auto h-2 w-16 animate-pulse rounded bg-[#e9e9e9]" />
      </div>
      <div className="h-7 w-full animate-pulse rounded-full bg-[#e9e9e9]" />
    </div>
  );
}

/* ── Main section ─────────────────────────────────────────────────── */
export function SuggestedAccountsSection({
  profileUserId,
  isOwnProfile = false,
}: {
  profileUserId?: number;
  isOwnProfile?: boolean;
}) {
  const { isAuthenticated, openAuthModal } = useAuthStore();
  const qc = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft,  setCanLeft]  = useState(false);
  const [canRight, setCanRight] = useState(false);
  const [followedIds,  setFollowedIds]  = useState<Set<number>>(new Set());
  const [loadingIds,   setLoadingIds]   = useState<Set<number>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());

  // Use creator_profile context when viewing someone else's profile so the
  // backend can return creators similar to the one being viewed rather than
  // generic suggestions that are the same on every profile page.
  const context = !isOwnProfile && profileUserId ? "creator_profile" : "profile";

  // Signed out, this uses the public /suggestions/guest endpoint (IP-based,
  // no auth) instead of disabling the query - the panel was empty for guests
  // purely because the authed endpoint was its only source. Following from
  // here still prompts sign-in (see the follow handler below), so the guest
  // view is read-only, not a way around auth.
  const { data: rawSuggestions = [], isLoading } = useQuery<SuggestedProfile[]>({
    queryKey: isAuthenticated
      ? ["suggestions-profiles", context, profileUserId ?? "own"]
      : ["suggestions-profiles-guest", context],
    queryFn:  () =>
      isAuthenticated
        ? suggestionService.profiles(context, 20, !isOwnProfile ? profileUserId : undefined)
        : suggestionService.guestProfiles(20),
    staleTime: 120_000,
    retry:     2,
    retryDelay: 1500,
  });

  const suggestions = rawSuggestions.filter((s) => !dismissedIds.has(s.id));

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 2);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions]);

  function scroll(dir: "left" | "right") {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -310 : 310, behavior: "smooth" });
  }

  async function handleFollow(s: SuggestedProfile) {
    if (!isAuthenticated) { openAuthModal("login"); return; }
    if (loadingIds.has(s.id)) return;
    setLoadingIds(prev => { const n = new Set(prev); n.add(s.id); return n; });
    try {
      const { friendService } = await import("@/services/friend.service");
      await friendService.follow(s.username);
      setFollowedIds(prev => { const n = new Set(prev); n.add(s.id); return n; });
      void suggestionService.markFollowed(s.id);
      // Refresh suggestions after follow
      setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ["suggestions-profiles", context, profileUserId ?? "own"] });
      }, 1500);
    } catch { /* silent */ } finally {
      setLoadingIds(prev => { const n = new Set(prev); n.delete(s.id); return n; });
    }
  }

  async function handleDismiss(s: SuggestedProfile) {
    setDismissedIds(prev => { const n = new Set(prev); n.add(s.id); return n; });
    try {
      await suggestionService.dismiss(s.id);
    } catch { /* silent */ }
  }

  /* Loading skeleton */
  if (isLoading) {
    return (
      <div className="mt-3 overflow-hidden rounded-2xl border border-[#eeeeee] bg-white px-5 py-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="h-4 w-44 animate-pulse rounded bg-[#e9e9e9]" />
          <div className="h-4 w-14 animate-pulse rounded bg-[#e9e9e9]" />
        </div>
        <div className="flex gap-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (!isLoading && !suggestions.length) return null;

  return (
    <div className="mt-3 rounded-2xl border border-[#eeeeee] bg-white px-5 py-4">

      {/* Section header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[14px] font-bold text-[#111827]">Suggested accounts</span>
          <Info className="h-3.5 w-3.5 text-[#9aa1ad]" />
        </div>
        <button className="text-[12px] font-semibold text-[#fe2c55] transition hover:underline">
          View all
        </button>
      </div>

      {/* Carousel */}
      <div className="relative">
        {canLeft && (
          <button
            type="button"
            onClick={() => scroll("left")}
            aria-label="Scroll suggestions left"
            className="absolute -left-2 top-[50%] z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-[#e5e7eb] bg-white text-[#5f6675] shadow-sm transition hover:border-[#fe2c55] hover:text-[#fe2c55]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        <div
          ref={scrollRef}
          className="hide-scrollbar flex gap-3 overflow-x-auto scroll-smooth"
        >
          {suggestions.map((s) => {
            const followed = followedIds.has(s.id) || s.is_following;
            const loading  = loadingIds.has(s.id);

            return (
              <div
                key={s.id}
                className="relative flex w-[138px] flex-shrink-0 flex-col items-center gap-2 rounded-[14px] border border-[#f0f0f0] bg-[#fafafa] px-3 pb-3.5 pt-4 transition hover:border-[#e5e7eb] hover:shadow-sm"
              >
                {/* Dismiss button */}
                <button
                  type="button"
                  aria-label="Dismiss suggestion"
                  onClick={() => void handleDismiss(s)}
                  className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full text-[#c4c9d4] transition hover:bg-[#f0f0f0] hover:text-[#5f6675]"
                >
                  <X className="h-3 w-3" />
                </button>

                {/* Avatar */}
                <StoryRingAvatar userId={s.id} username={s.username} displayName={s.display_name} avatar={s.avatar} size={54} />

                {/* Name + username */}
                <div className="w-full min-w-0 text-center">
                  <Link href={`/profile/${s.username}`}>
                    <div className="flex items-center justify-center gap-0.5">
                      <span className="truncate text-[12px] font-bold leading-tight text-[#111827]">{s.display_name}</span>
                      {s.is_verified && <VerifiedBadge size={12} />}
                    </div>
                    <p className="mt-0.5 truncate text-[10px] leading-tight text-[#9aa1ad]">@{s.username}</p>
                  </Link>
                  {/* Reason text */}
                  <p className="mt-1 line-clamp-2 text-[9.5px] leading-tight text-[#b0b8c1]">{s.reason}</p>
                </div>

                {/* Follow button */}
                <button
                  type="button"
                  onClick={() => void handleFollow(s)}
                  disabled={loading || followed}
                  className={cn(
                    "w-full rounded-full py-1.5 text-[11px] font-bold transition",
                    followed
                      ? "cursor-default bg-[#f3f4f6] text-[#5f6675]"
                      : "bg-[#fe2c55] text-white hover:bg-[#e02449]",
                    loading && "cursor-wait opacity-60",
                  )}
                >
                  {loading ? "…" : followed ? "Following" : "Follow"}
                </button>
              </div>
            );
          })}
        </div>

        {canRight && (
          <button
            type="button"
            onClick={() => scroll("right")}
            aria-label="Scroll suggestions right"
            className="absolute -right-2 top-[50%] z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-[#e5e7eb] bg-white text-[#5f6675] shadow-sm transition hover:border-[#fe2c55] hover:text-[#fe2c55]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
