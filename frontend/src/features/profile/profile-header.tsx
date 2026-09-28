"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreateStoryModal } from "@/components/story/create-story-modal";
import { LinkPreviewFromText } from "@/components/link-preview";
import { StoryViewer } from "@/components/story/story-viewer";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { storyService, type StoryUser } from "@/services/story.service";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Edit3,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Share2,
} from "lucide-react";
import { formatCompact } from "@/lib/utils";
import { FollowButton } from "@/components/user/follow-button";
import { ProfileMoreMenu } from "./profile-more-menu";
import { FollowersModal, type FollowListTab } from "./followers-modal";
import { useAuthStore } from "@/store/auth.store";
import { suggestionService, type SuggestedProfile } from "@/services/suggestion.service";
import type { TeezerUser } from "@/types/user";

/* ── Blue verified badge - scalloped rosette style ───────────────────── */
/* ── Social icons - PNG files + SVG fallbacks ────────────────────────── */
type SocialKey = "instagram" | "facebook" | "youtube" | "twitter" | "tiktok" | "website" | "telegram" | "whatsapp";

function SocialImg({ src, alt }: { src: string; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} width={20} height={20} className="h-5 w-5 object-contain" />
  );
}

const SOCIAL_ICONS: Record<SocialKey, React.ReactNode> = {
  instagram: <SocialImg src="/icons/social/instagram.png" alt="Instagram" />,
  facebook:  <SocialImg src="/icons/social/facebook.png"  alt="Facebook"  />,
  youtube:   <SocialImg src="/icons/social/youtube.png"   alt="YouTube"   />,
  twitter:   <SocialImg src="/icons/social/twitter.png"   alt="X / Twitter" />,
  telegram:  <SocialImg src="/icons/social/telegram.png"  alt="Telegram"  />,
  whatsapp:  <SocialImg src="/icons/social/whatsapp.png"  alt="WhatsApp"  />,
  tiktok: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.32 6.32 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V9.28a8.27 8.27 0 004.83 1.54V7.38a4.85 4.85 0 01-1.06-.69z" />
    </svg>
  ),
  website: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
};

const SOCIAL_LABELS: Record<SocialKey, string> = {
  instagram: "Instagram",
  facebook:  "Facebook",
  youtube:   "YouTube",
  twitter:   "X / Twitter",
  tiktok:    "TikTok",
  website:   "Website",
  telegram:  "Telegram",
  whatsapp:  "WhatsApp",
};

/* ── Avatar ─────────────────────────────────────────────────────────── */
const DEFAULT_AVATAR_SRC = "/default-avatar.svg";

function AvatarImage({ user }: { user: TeezerUser; size: number }) {
  const src = user.avatar || DEFAULT_AVATAR_SRC;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={user.name || user.username || "Profile picture"}
      className="h-full w-full rounded-full object-cover"
      referrerPolicy="no-referrer"
      onError={(e) => {
        const img = e.currentTarget as HTMLImageElement;
        if (img.src.indexOf(DEFAULT_AVATAR_SRC) === -1) img.src = DEFAULT_AVATAR_SRC;
      }}
    />
  );
}

/* ── Suggested accounts pill button ─────────────────────────────────── */
const FALLBACK_COLORS = ["#fd4605", "#0984e3", "#6c5ce7", "#00b894", "#e17055"];
function avatarColor(username: string) {
  let h = 0;
  for (const c of username) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return FALLBACK_COLORS[Math.abs(h) % FALLBACK_COLORS.length];
}

function SuggestedAccountsButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const isAuth = useAuthStore((s) => s.isAuthenticated);

  // Same cache key as SuggestedAccountsSection - one fetch, shared by both.
  //
  // Signed out, this falls back to the public /suggestions/guest endpoint
  // (IP-based, no auth) rather than not fetching at all: the pill used to
  // render permanently empty for guests because the authed endpoint was the
  // only source and its query was disabled. Separate cache key so a guest's
  // list is never served to a signed-in viewer or vice versa.
  const { data: suggestions = [], isLoading } = useQuery<SuggestedProfile[]>({
    queryKey: isAuth ? ["suggestions-profiles-profile"] : ["suggestions-profiles-guest"],
    queryFn:  () => (isAuth ? suggestionService.profiles("profile", 20) : suggestionService.guestProfiles(20)),
    staleTime: 120_000,
  });

  const preview = suggestions.slice(0, 3);

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex h-10 items-center gap-2 rounded-[10px] border border-[#e5e7eb] bg-white px-3 text-[13px] font-semibold text-[#111827] transition hover:border-[#fd4605]"
      title="Suggested accounts"
    >
      <span className="flex items-center">
        {preview.length > 0 ? preview.map((u, i) => (
          <span
            key={u.id}
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-white"
            style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 3 - i, position: "relative" }}
          >
            {u.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={u.avatar} alt={u.display_name} className="h-full w-full object-cover" />
            ) : (
              <span
                className="flex h-full w-full items-center justify-center text-[9px] font-black text-white"
                style={{ background: avatarColor(u.username) }}
              >
                {(u.display_name || u.username)[0]?.toUpperCase()}
              </span>
            )}
          </span>
        )) : (
          /* Skeleton dots while loading */
          [0, 1, 2].map((i) => (
            <span
              key={i}
              className={`flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-white ${isLoading ? "animate-pulse bg-[#e9e9e9]" : "bg-[#f0f0f0]"}`}
              style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 3 - i, position: "relative" }}
            />
          ))
        )}
      </span>
      {open
        ? <ChevronUp   className="h-3.5 w-3.5 text-[#fd4605]" />
        : <ChevronDown className="h-3.5 w-3.5 text-[#5f6675]" />}
    </button>
  );
}

/* ── Props ──────────────────────────────────────────────────────────── */
type Props = {
  user: TeezerUser;
  isOwnProfile: boolean;
  isSuggestedOpen: boolean;
  onToggleSuggested: () => void;
  hasStory?: boolean;
};

/* ── Component ──────────────────────────────────────────────────────── */
export function ProfileHeader({ user, isOwnProfile, isSuggestedOpen, onToggleSuggested, hasStory: initialHasStory = false }: Props) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const router = useRouter();
  const openAuthModal   = useAuthStore((s) => s.openAuthModal);

  const [storyModalOpen,  setStoryModalOpen]  = useState(false);
  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [storyUsers,      setStoryUsers]      = useState<StoryUser[]>([]);

  // Re-fetch stories when viewer opens, or when `has_story` is true from the profile API
  const { data: liveStoryUser, refetch: refetchStories } = useQuery<StoryUser | null>({
    queryKey: ["user-stories", user.username],
    queryFn:  () => storyService.getUserStories(user.username),
    enabled:  false, // only fetch on demand
    staleTime: 30_000,
  });

  async function openStoryViewer() {
    const result = await refetchStories();
    const su = result.data ?? liveStoryUser;
    if (su) {
      setStoryUsers([su]);
      setStoryViewerOpen(true);
    }
  }

  // Whether the avatar should show the story ring:
  // Use the live query result after viewing/refetching, else fall back to prop from profile API.
  const ringActive = liveStoryUser !== undefined ? liveStoryUser !== null : initialHasStory;

  const [moreOpen, setMoreOpen] = useState(false);
  const [moreTriggerRect, setMoreTriggerRect] = useState<DOMRect | null>(null);

  const [followListOpen, setFollowListOpen] = useState(false);
  const [followListTab, setFollowListTab] = useState<FollowListTab>("followers");

  const openFollowList = (tab: FollowListTab) => {
    if (!isAuthenticated) { openAuthModal("login"); return; }
    setFollowListTab(tab);
    setFollowListOpen(true);
  };

  const joinedDate = user.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      })
    : "Jan 2022";

  /* Social links - SocialLink[] is [{platform, url}, ...]; match by platform name */
  const socialLinks: { key: SocialKey; url: string }[] = [];
  const socialLinksData = user.social_links ?? [];
  const socialMap: [SocialKey, string[]][] = [
    ["instagram", ["instagram"]],
    ["tiktok",    ["tiktok"]],
    ["facebook",  ["facebook"]],
    ["youtube",   ["youtube"]],
    ["twitter",   ["twitter", "x"]],
    ["website",   ["website"]],
    ["telegram",  ["telegram"]],
    ["whatsapp",  ["whatsapp"]],
  ];
  for (const [key, aliases] of socialMap) {
    const found = socialLinksData.find(
      (s) => aliases.includes(s.platform?.toLowerCase?.() ?? ""),
    );
    if (found?.url) socialLinks.push({ key, url: found.url });
  }

  type StatItem = { key: string; label: string; value: string; onClick?: () => void };
  const STATS: StatItem[] = [
    {
      key: "following",
      label: "Following",
      value: formatCompact(user.following_count ?? user.profile?.total_following ?? 0),
      onClick: () => openFollowList("following"),
    },
    {
      key: "followers",
      label: "Followers",
      value: formatCompact(user.followers_count ?? user.profile?.total_followers ?? 0),
      onClick: () => openFollowList("followers"),
    },
    {
      key: "likes",
      label: "Likes",
      value: formatCompact(user.likes_count ?? user.profile?.total_likes ?? 0),
    },
    {
      key: "videos",
      label: "Videos",
      value: formatCompact(user.videos_count ?? user.profile?.total_videos ?? 0),
    },
  ];

  return (
    <div className="pb-2">

      {/* ══ Top area: avatar + info ══════════════════════════════════ */}
      <div className="flex gap-7 py-2">

        {/* Avatar - gradient ring only when user has an active story */}
        <div className="relative flex-shrink-0" style={{ width: 160, height: 160 }}>
          <div
            onClick={ringActive ? () => void openStoryViewer() : undefined}
            style={{
              width: 160,
              height: 160,
              borderRadius: "50%",
              padding: ringActive ? 4 : 0,
              background: ringActive
                ? "linear-gradient(135deg, #fd5949 0%, #d6249f 50%, #285aeb 100%)"
                : "transparent",
              cursor: ringActive ? "pointer" : "default",
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                borderRadius: "50%",
                padding: ringActive ? 3 : 0,
                background: ringActive ? "#fff" : "transparent",
                overflow: "hidden",
              }}
            >
              <div className="overflow-hidden rounded-full" style={{ width: "100%", height: "100%" }}>
                <AvatarImage user={user} size={160} />
              </div>
            </div>
          </div>

          {/* Add Story button - own profile only, bottom-right of the circle */}
          {isOwnProfile && (
            <button
              type="button"
              onClick={() => setStoryModalOpen(true)}
              aria-label="Add story"
              title="Add story"
              className="absolute z-10 flex items-center justify-center rounded-full bg-white text-[#111827] transition-all duration-150 hover:scale-105 hover:bg-[#f9fafb] active:scale-95"
              style={{
                width: 36,
                height: 36,
                bottom: 6,
                right: 6,
                border: "2px solid #f3f4f6",
                boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
              }}
            >
              <Plus className="h-[18px] w-[18px]" strokeWidth={2.8} />
            </button>
          )}
        </div>

        {/* Info + Stats */}
        <div className="min-w-0 flex-1">

          {/* Row: Name (left) + Stats (right) */}
          <div className="flex items-start justify-between gap-6">

            {/* Name + handle + bio + meta */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[28px] font-black leading-tight text-[#111827] xl:text-[30px]">
                  {user.name || user.username}
                </h1>
                {user.is_verified && <VerifiedBadge size={22} tooltip />}
              </div>
              <p className="mt-1 text-[13px] text-[#5f6675]">
                @{user.username}
              </p>

              {/* Bio */}
              <p className="mt-2.5 text-[13.5px] leading-relaxed text-[#111827]">
                {user.bio || (isOwnProfile ? "Add a bio to tell people about you." : "")}
              </p>
              {user.bio && <LinkPreviewFromText text={user.bio} compact className="mt-2" />}

              {/* Profile categories - dot-separated single line */}
              {user.categories && user.categories.length > 0 && (
                <p className="mt-2 text-[12.5px] font-medium text-[#5f6675]">
                  {user.categories.join(" · ")}
                </p>
              )}

              {/* Location + joined */}
              <div className="mt-2 flex flex-wrap items-center gap-4 text-[12px] text-[#5f6675]">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                  {user.country || "-"}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                  Joined {joinedDate}
                </span>
              </div>
            </div>

            {/* Stats + social icons - stacked right column */}
            <div className="flex flex-shrink-0 flex-col items-end gap-3 pt-0.5">

              {/* Stats row - vertical dividers */}
              <div className="flex items-stretch divide-x divide-[#e5e7eb]">
                {STATS.map((s) => {
                  const inner = (
                    <>
                      <span className="text-[22px] font-black leading-none text-[#111827]">
                        {s.value}
                      </span>
                      <span className="text-[11px] font-medium text-[#5f6675]">{s.label}</span>
                    </>
                  );
                  if (s.onClick) {
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={s.onClick}
                        className="flex cursor-pointer flex-col items-center justify-center gap-0.5 px-5 transition first:pl-0 last:pr-0 hover:text-[#fd4605] [&_span:first-child]:hover:text-[#fd4605]"
                      >
                        {inner}
                      </button>
                    );
                  }
                  return (
                    <div
                      key={s.key}
                      className="flex flex-col items-center justify-center gap-0.5 px-5 first:pl-0 last:pr-0"
                    >
                      {inner}
                    </div>
                  );
                })}
              </div>

            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {isOwnProfile ? (
              <Link
                href="/settings/account"
                className="flex h-10 min-w-[130px] items-center justify-center gap-2 rounded-[10px] border border-[#e5e7eb] bg-white px-5 text-[13px] font-bold text-[#111827] transition hover:border-[#fd4605] hover:text-[#fd4605]"
              >
                <Edit3 className="h-[15px] w-[15px]" />
                Edit Profile
              </Link>
            ) : (
              <FollowButton
                variant="primary"
                username={user.username}
                initialFollowStatus={
                  user.follow_status as "none" | "pending" | "accepted" | undefined
                  ?? (user.is_following ? "accepted" : "none")
                }
              />
            )}

            {!isOwnProfile && (!user.is_private || user.follow_status === "accepted") && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isAuthenticated) { openAuthModal("login"); return; }
                  router.push(`/messages?userId=${user.id}&un=${user.username}`);
                }}
                className="flex h-10 items-center gap-2 rounded-[10px] border border-[#e5e7eb] bg-white px-4 text-[13px] font-semibold text-[#111827] transition hover:border-[#fd4605] hover:text-[#fd4605]"
              >
                <MessageCircle className="h-[15px] w-[15px]" />
                Message
              </button>
            )}

            <button className="flex h-10 items-center gap-2 rounded-[10px] border border-[#e5e7eb] bg-white px-4 text-[13px] font-semibold text-[#111827] transition hover:border-[#fd4605] hover:text-[#fd4605]">
              <Share2 className="h-[15px] w-[15px]" />
              Share Profile
            </button>

            {/* Suggested accounts avatar pill - visible on all profiles */}
            <SuggestedAccountsButton open={isSuggestedOpen} onToggle={onToggleSuggested} />

            {/* Three dots more menu */}
            <button
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                setMoreTriggerRect(rect);
                setMoreOpen((o) => !o);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#e5e7eb] bg-white text-[#5f6675] transition hover:border-[#fd4605] hover:text-[#fd4605]"
            >
              <MoreHorizontal className="h-[18px] w-[18px]" />
            </button>

            <ProfileMoreMenu
              triggerRect={moreTriggerRect}
              open={moreOpen}
              onClose={() => setMoreOpen(false)}
              username={user.username}
              isOwnProfile={isOwnProfile}
            />
          </div>

          {/* Social links - below action buttons */}
          {socialLinks.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              {socialLinks.map(({ key, url }) => (
                <a
                  key={key}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={SOCIAL_LABELS[key]}
                  aria-label={SOCIAL_LABELS[key]}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[#111827] transition hover:border-[#fd4605] hover:text-[#fd4605]"
                >
                  {SOCIAL_ICONS[key]}
                </a>
              ))}
            </div>
          )}

        </div>
      </div>

      <FollowersModal
        open={followListOpen}
        onClose={() => setFollowListOpen(false)}
        username={user.username}
        tab={followListTab}
        onTabChange={setFollowListTab}
        ownerName={user.name}
        followStatus={user.follow_status as "none" | "pending" | "accepted" | undefined}
        profileUserId={user.id}
        isOwnProfile={isOwnProfile}
      />

      <CreateStoryModal
        open={storyModalOpen}
        onClose={() => setStoryModalOpen(false)}
        username={user.username}
        userAvatar={user.avatar ?? null}
        onStorySaved={() => {
          // After publishing a story, refresh the story query so ring appears
          void refetchStories();
        }}
      />

      {storyViewerOpen && storyUsers.length > 0 && (
        <StoryViewer
          storyUsers={storyUsers}
          initialUserIdx={0}
          onClose={() => setStoryViewerOpen(false)}
          onDeleted={() => {
            // After deleting a story, refresh to check if ring should disappear
            void refetchStories();
          }}
        />
      )}
    </div>
  );
}
