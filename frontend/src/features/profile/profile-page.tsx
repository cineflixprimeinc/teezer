"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { userService, type VideoSort } from "@/services/user.service";
import { useAuthStore } from "@/store/auth.store";
import { ProfileHeader } from "./profile-header";
import { ProfileTabs, type ProfileTab, type MediaTypeFilter } from "./profile-tabs";
import { ProfileVideoGrid } from "./profile-video-grid";
import { SuggestedAccountsSection } from "./suggested-accounts-section";

export function ProfilePage({ username }: { username: string }) {
  const authUser   = useAuthStore((s) => s.user);
  const authReady  = useAuthStore((s) => s.authReady);
  const authLoading = useAuthStore((s) => s.isLoading);

  const resolved = username === "me" ? (authUser?.username ?? "") : username;
  const isOwnProfile = !!authUser && authUser.username === resolved;

  const [activeTab,       setActiveTab]       = useState<ProfileTab>("reels");
  const [sort,            setSort]            = useState<VideoSort>("latest");
  const [mediaType,       setMediaType]       = useState<MediaTypeFilter>("all");
  const [isSuggestedOpen, setIsSuggestedOpen] = useState(false);

  // Include viewer's auth ID in cache keys so owner-view and visitor-view
  // are stored separately - prevents stale owner-bypassed data bleeding into
  // another user's perspective after an account switch.
  const viewerId = authUser?.id ?? null;

  const profileQ = useQuery({
    queryKey:  ["profile", resolved, viewerId],
    queryFn:   () => userService.profile(resolved),
    enabled:   !!resolved && (username !== "me" || !!authUser),
    // Own profile: cache for 30s; others: refetch on every focus so follow-status stays current
    staleTime: isOwnProfile ? 30_000 : 0,
    retry:     1,
  });

  const videosQ = useQuery({
    queryKey:  ["profile-videos", resolved, sort, viewerId],
    queryFn:   () => userService.videos(resolved, sort),
    enabled:   !!resolved && activeTab === "reels",
    staleTime: 30_000,
    // Auto-generated video covers land a few seconds after upload, so always
    // refetch on mount to pick up freshly-generated thumbnails.
    refetchOnMount: "always",
  });

  const likedQ = useQuery({
    queryKey:  ["profile-liked", resolved, viewerId],
    queryFn:   () => userService.liked(resolved),
    enabled:   !!resolved && activeTab === "liked",
    staleTime: 30_000,
    retry:     false,
  });

  const likedBlocked = likedQ.isError && (likedQ.error as { response?: { status?: number } })?.response?.status === 403;
  const likedBlockedReason = (likedQ.error as { response?: { data?: { reason?: string } } })?.response?.data?.reason;

  const draftsQ = useQuery({
    queryKey:  ["profile-drafts", resolved, viewerId],
    queryFn:   () => userService.drafts(resolved),
    // Only the profile owner can fetch drafts; the API enforces 403 for non-owners.
    enabled:   !!resolved && activeTab === "drafts" && isOwnProfile,
    staleTime: 30_000,
  });

  // Fetch saved-count/privacy to decide tab visibility before the user clicks it
  const savedCountQ = useQuery({
    queryKey:  ["profile-saved-count", resolved, viewerId],
    queryFn:   () => userService.savedCount(resolved),
    enabled:   !!resolved,
    staleTime: 60_000,
    retry:     false,
  });

  // Non-owner + private → hide saved tab entirely
  const savedPrivacy = savedCountQ.data?.privacy ?? "private";
  const showSavedTab = isOwnProfile
    || savedPrivacy === "public"
    || (savedPrivacy === "followers" && !!authUser); // followers can see it (API enforces actual follow check)

  const savedQ = useQuery({
    queryKey:  ["profile-saved", resolved, viewerId],
    queryFn:   () => userService.saved(resolved),
    enabled:   !!resolved && activeTab === "saved" && showSavedTab,
    staleTime: 30_000,
    retry:     false,
  });

  // Detect 403 (private list) vs other errors
  const savedBlocked = savedQ.isError && (savedQ.error as { response?: { status?: number } })?.response?.status === 403;
  const savedErrorMsg = savedBlocked
    ? ((savedQ.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "This saved list is private.")
    : null;

  const user = profileQ.data ?? (isOwnProfile ? authUser : null);

  const waitingForMe =
    username === "me" && (!authReady || authLoading || !authUser);

  const rawVideoItems = (() => {
    if (activeTab === "liked")  return likedQ.data?.data  ?? [];
    if (activeTab === "reels")  return videosQ.data?.data ?? [];
    if (activeTab === "drafts") return draftsQ.data?.data ?? [];
    if (activeTab === "saved")  return savedQ.data?.data  ?? [];
    return [];
  })();

  const videoItems = activeTab === "reels" && mediaType !== "all"
    ? rawVideoItems.filter((v) => {
        if (mediaType === "image") return v.media_type === "image" || v.media_type === "image_carousel";
        if (mediaType === "video") return !v.media_type || v.media_type === "video";
        return true;
      })
    : rawVideoItems;

  const videoLoading = (() => {
    if (activeTab === "liked")  return likedQ.isLoading;
    if (activeTab === "reels")  return videosQ.isLoading;
    if (activeTab === "drafts") return draftsQ.isLoading;
    if (activeTab === "saved")  return savedQ.isLoading;
    return false;
  })();

  return (
    <AppShell transparentHeader>
      <div className="page-scroll more-popup-scroll bg-white">
        <div className="mx-auto w-full max-w-[1280px] px-6 py-6">
          {profileQ.isError ? (
            <div className="rounded-2xl border border-[#eeeeee] bg-white p-10 text-center">
              <h2 className="text-lg font-bold text-black">Profile not found</h2>
              <p className="mt-2 text-sm text-[#5f6675]">
                This user doesn&apos;t exist or the profile could not be loaded.
              </p>
            </div>
          ) : waitingForMe || (!user && (profileQ.isLoading || profileQ.isFetching)) ? (
            <div className="space-y-3">
              <Skeleton className="h-72 rounded-2xl" />
              <Skeleton className="h-14 rounded-2xl" />
              <div className="grid grid-cols-3 gap-3.5 sm:grid-cols-4 lg:grid-cols-6">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-[9/14] rounded-xl" />
                ))}
              </div>
            </div>
          ) : !user ? (
            <div className="rounded-2xl border border-[#eeeeee] bg-white p-10 text-center">
              <h2 className="text-lg font-bold text-black">Profile not found</h2>
              <p className="mt-2 text-sm text-[#5f6675]">@{username}</p>
            </div>
          ) : user.is_private && !isOwnProfile && user.follow_status !== "accepted" ? (
            /* Private account: show limited header + lock state */
            <>
              <ProfileHeader
                user={user}
                isOwnProfile={false}
                isSuggestedOpen={isSuggestedOpen}
                onToggleSuggested={() => setIsSuggestedOpen(o => !o)}
                hasStory={!!(user as Record<string, unknown>).has_story}
              />
              {isSuggestedOpen && <SuggestedAccountsSection profileUserId={user.id} isOwnProfile={false} />}
              <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-[#eeeeee] bg-white py-14 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f3f4f6]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-[#5f6675]">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <h3 className="text-[16px] font-black text-[#111827]">This account is private</h3>
                <p className="max-w-[280px] text-[13px] text-[#5f6675]">
                  {user.follow_status === "pending"
                    ? "Your follow request is pending approval."
                    : "Follow this account to see their photos and videos."}
                </p>
              </div>
            </>
          ) : (
            <>
              <ProfileHeader
                user={user}
                isOwnProfile={isOwnProfile}
                isSuggestedOpen={isSuggestedOpen}
                onToggleSuggested={() => setIsSuggestedOpen(o => !o)}
                hasStory={!!(user as Record<string, unknown>).has_story}
              />
              {isSuggestedOpen && <SuggestedAccountsSection profileUserId={user.id} isOwnProfile={isOwnProfile} />}
              <ProfileTabs
                active={activeTab}
                onChange={(tab) => { setActiveTab(tab); setMediaType("all"); }}
                sort={sort}
                onSortChange={setSort}
                mediaType={mediaType}
                onMediaTypeChange={setMediaType}
                isOwnProfile={isOwnProfile}
                showSavedTab={showSavedTab}
              />
              <ProfileVideoGrid
                items={videoItems}
                loading={videoLoading}
                tab={activeTab}
                isOwnProfile={isOwnProfile}
                username={resolved}
                savedBlocked={savedBlocked}
                savedBlockedMsg={savedErrorMsg ?? undefined}
                likedBlocked={likedBlocked}
                likedBlockedReason={likedBlockedReason}
              />
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
