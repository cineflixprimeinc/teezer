"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Search, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { FollowButton } from "@/components/user/follow-button";
import { userService } from "@/services/user.service";
import { suggestionService, type SuggestedProfile } from "@/services/suggestion.service";
import { useAuthStore } from "@/store/auth.store";
import type { ReelsooUser } from "@/types/user";

export type FollowListTab = "followers" | "following" | "suggested";

type Props = {
  open:           boolean;
  onClose:        () => void;
  username:       string;
  tab:            FollowListTab;
  onTabChange:    (tab: FollowListTab) => void;
  ownerName?:     string;
  followStatus?:  "none" | "pending" | "accepted";
  profileUserId?: number;
  isOwnProfile?:  boolean;
};

const TABS: { value: FollowListTab; label: string }[] = [
  { value: "followers",  label: "Followers"  },
  { value: "following",  label: "Following"  },
  { value: "suggested",  label: "Suggested"  },
];

export function FollowersModal({
  open, onClose, username, tab, onTabChange,
  ownerName, followStatus, profileUserId, isOwnProfile = false,
}: Props) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  /* ── Followers / Following query ── */
  const listQ = useQuery({
    queryKey: ["follow-list", username, tab],
    queryFn:  () =>
      tab === "followers"
        ? userService.followers(username)
        : userService.following(username),
    enabled:   open && !!username && tab !== "suggested",
    staleTime: 30_000,
    retry: false,
  });

  const isPrivateLocked = listQ.isError &&
    (listQ.error as { response?: { data?: { private?: boolean } } })?.response?.data?.private === true;

  const items    = (listQ.data?.data ?? []) as ReelsooUser[];
  const filtered = query.trim()
    ? items.filter((u) => {
        const q = query.toLowerCase();
        return u.name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q);
      })
    : items;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-[600px] flex-col overflow-hidden rounded-2xl border border-[#eeeeee] bg-white shadow-2xl"
        style={{ maxHeight: "88vh", minHeight: "520px" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b border-[#eeeeee] px-5 pt-4 pb-0">
          <p className="text-[15px] font-bold text-[#111827]">
            {ownerName ?? `@${username}`}
          </p>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-[#5f6675] transition hover:bg-[#f8f9fb]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center border-b border-[#eeeeee] px-5">
          {TABS.map((t) => {
            const active = tab === t.value;
            return (
              <button
                key={t.value}
                onClick={() => { onTabChange(t.value); setQuery(""); }}
                className={cn(
                  "flex items-center gap-1.5 border-b-[2.5px] px-3 py-3 text-[13px] font-semibold transition-colors",
                  active
                    ? "border-[#fe2c55] text-[#fe2c55]"
                    : "border-transparent text-[#5f6675] hover:text-black",
                )}
              >
                {t.value === "suggested" && <Sparkles className="h-3.5 w-3.5" />}
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ── Search (hidden on Suggested tab) ── */}
        {tab !== "suggested" && (
          <div className="px-5 pb-2 pt-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5f6675]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${tab}`}
                className="h-9 w-full rounded-[10px] border border-[#eeeeee] bg-white pl-9 pr-3 text-[13px] outline-none transition focus:border-[#fe2c55]"
              />
            </div>
          </div>
        )}

        {/* ── List content ── */}
        <div className="hide-scrollbar min-h-[260px] flex-1 overflow-y-auto px-3 pb-4">
          {tab === "suggested" ? (
            <SuggestedList
              onClose={onClose}
              profileUserId={profileUserId}
              isOwnProfile={isOwnProfile}
            />
          ) : isPrivateLocked ? (
            <PrivateLockState tab={tab} followStatus={followStatus} />
          ) : listQ.isLoading ? (
            <SkeletonList />
          ) : filtered.length === 0 ? (
            <EmptyState tab={tab} hasQuery={!!query.trim()} />
          ) : (
            filtered.map((u) => (
              <FollowRow key={u.id} user={u} onNavigate={onClose} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ Followers / Following row ══════════════════════════════ */
function FollowRow({ user, onNavigate }: { user: ReelsooUser; onNavigate: () => void }) {
  const authUser = useAuthStore((s) => s.user);
  const isOwnRow = !!authUser && authUser.id === user.id;
  const initial  = (user.name?.[0] ?? user.username?.[0] ?? "U").toUpperCase();

  return (
    <div className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-[#f8f9fb]">
      <Link
        href={`/profile/${user.username}`}
        onClick={onNavigate}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        {user.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatar} alt={user.name} className="h-10 w-10 flex-shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#fe2c55] text-[13px] font-bold text-white">
            {initial}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="truncate text-[13.5px] font-bold leading-tight text-[#111827]">{user.name}</span>
            {user.is_verified && <VerifiedBadge size={14} className="flex-shrink-0" />}
          </div>
          <p className="truncate text-[11.5px] text-[#5f6675]">@{user.username}</p>
        </div>
      </Link>
      {!isOwnRow && (
        <FollowButton variant="outline" username={user.username} initialFollowing={!!user.is_following} />
      )}
    </div>
  );
}

/* ═══════════════ Suggested tab ══════════════════════════════════════════ */
function SuggestedList({
  onClose,
  profileUserId,
  isOwnProfile,
}: {
  onClose:        () => void;
  profileUserId?: number;
  isOwnProfile?:  boolean;
}) {
  const { isAuthenticated, openAuthModal } = useAuthStore();
  const qc = useQueryClient();

  const [followedIds,  setFollowedIds]  = useState<Set<number>>(new Set());
  const [loadingIds,   setLoadingIds]   = useState<Set<number>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());

  /* Use creator_profile context when viewing someone else's profile so the
     algorithm returns accounts similar to the one being viewed. */
  const context = !isOwnProfile && profileUserId ? "creator_profile" : "profile";

  const { data: rawSuggestions = [], isLoading } = useQuery<SuggestedProfile[]>({
    queryKey: ["suggestions-modal", context, profileUserId ?? "own"],
    queryFn:  () => suggestionService.profiles(context, 30, !isOwnProfile ? profileUserId : undefined),
    staleTime: 120_000,
    enabled:   isAuthenticated,
  });

  const suggestions = rawSuggestions.filter((s) => !dismissedIds.has(s.id));

  async function handleFollow(s: SuggestedProfile) {
    if (!isAuthenticated) { openAuthModal("login"); return; }
    if (loadingIds.has(s.id)) return;
    setLoadingIds(prev => { const n = new Set(prev); n.add(s.id); return n; });
    try {
      const { friendService } = await import("@/services/friend.service");
      await friendService.follow(s.username);
      setFollowedIds(prev => { const n = new Set(prev); n.add(s.id); return n; });
      void suggestionService.markFollowed(s.id);
      setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ["suggestions-modal", context, profileUserId ?? "own"] });
      }, 1500);
    } catch { /* silent */ } finally {
      setLoadingIds(prev => { const n = new Set(prev); n.delete(s.id); return n; });
    }
  }

  async function handleDismiss(s: SuggestedProfile) {
    setDismissedIds(prev => { const n = new Set(prev); n.add(s.id); return n; });
    try { await suggestionService.dismiss(s.id); } catch { /* silent */ }
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <Sparkles className="h-10 w-10 text-[#d1d5db]" />
        <p className="text-[14px] font-bold text-[#111827]">Sign in to see suggestions</p>
        <p className="text-[13px] text-[#5f6675]">
          Log in to discover accounts you might like based on who you follow.
        </p>
      </div>
    );
  }

  if (isLoading) return <SkeletonList />;

  if (!suggestions.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <Sparkles className="h-10 w-10 text-[#d1d5db]" />
        <p className="text-[14px] font-bold text-[#111827]">No suggestions right now</p>
        <p className="text-[13px] text-[#5f6675]">
          Follow more accounts and we&apos;ll suggest people you might like.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">
        Suggested for you
      </p>
      {suggestions.map((s) => {
        const followed = followedIds.has(s.id) || s.is_following;
        const loading  = loadingIds.has(s.id);
        const initial  = (s.display_name || s.username)[0]?.toUpperCase() ?? "?";

        return (
          <div key={s.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-[#f8f9fb]">
            {/* Avatar */}
            <Link href={`/profile/${s.username}`} onClick={onClose} className="shrink-0">
              {s.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.avatar} alt={s.display_name} className="h-11 w-11 rounded-full object-cover" />
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#fe2c55] text-[14px] font-bold text-white">
                  {initial}
                </div>
              )}
            </Link>

            {/* Info */}
            <Link href={`/profile/${s.username}`} onClick={onClose} className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="truncate text-[13.5px] font-bold text-[#111827]">{s.display_name}</span>
                {s.is_verified && <VerifiedBadge size={14} className="flex-shrink-0" />}
              </div>
              <p className="truncate text-[11.5px] text-[#5f6675]">@{s.username}</p>
              {s.reason && (
                <p className="mt-0.5 truncate text-[11px] text-[#9ca3af]">{s.reason}</p>
              )}
            </Link>

            {/* Actions */}
            <div className="flex shrink-0 items-center gap-1.5">
              {!followed && (
                <button
                  type="button"
                  title="Dismiss"
                  onClick={() => void handleDismiss(s)}
                  className="grid h-7 w-7 place-items-center rounded-full text-[#c4c9d4] transition hover:bg-[#f0f0f0] hover:text-[#5f6675]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                disabled={loading || followed}
                onClick={() => void handleFollow(s)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-[12px] font-bold transition active:scale-[0.97]",
                  followed
                    ? "bg-[#f3f4f6] text-[#5f6675] cursor-default"
                    : "bg-[#fe2c55] text-white hover:bg-[#e02449]",
                  loading && "cursor-wait opacity-60",
                )}
              >
                {loading ? "…" : followed ? "Following" : "Follow"}
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}

/* ═══════════════ Shared helpers ══════════════════════════════════════════ */
function PrivateLockState({
  tab, followStatus,
}: {
  tab: FollowListTab;
  followStatus?: "none" | "pending" | "accepted";
}) {
  const isPending = followStatus === "pending";
  const subject   = tab === "followers" ? "their followers" : "who they follow";
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f3f4f6]">
        <Lock className="h-7 w-7 text-[#5f6675]" />
      </div>
      <div className="space-y-1">
        <p className="text-[14px] font-bold text-[#111827]">This account is private</p>
        <p className="max-w-[320px] text-[13px] text-[#5f6675]">
          {isPending
            ? "Your follow request is pending approval."
            : `Follow this account and wait for approval to see ${subject}.`}
        </p>
      </div>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-2 px-2 pt-2">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <div className="h-11 w-11 flex-shrink-0 animate-pulse rounded-full bg-[#f0f0f0]" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 animate-pulse rounded bg-[#f0f0f0]" />
            <div className="h-2.5 w-20 animate-pulse rounded bg-[#f0f0f0]" />
            <div className="h-2.5 w-40 animate-pulse rounded bg-[#f0f0f0]" />
          </div>
          <div className="h-7 w-16 flex-shrink-0 animate-pulse rounded-full bg-[#f0f0f0]" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ tab, hasQuery }: { tab: FollowListTab; hasQuery: boolean }) {
  const msg = hasQuery
    ? "No matching users."
    : tab === "followers"
      ? "No followers yet"
      : "Not following anyone yet";
  return (
    <div className="grid h-[200px] place-items-center px-6 text-center">
      <p className="text-[13px] font-medium text-[#5f6675]">{msg}</p>
    </div>
  );
}
