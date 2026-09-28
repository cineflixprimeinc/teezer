"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCompact } from "@/lib/utils";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { userService } from "@/services/user.service";
import { suggestionService, type SuggestedProfile } from "@/services/suggestion.service";
import type { ReelsooUser } from "@/types/user";

/* ══════════════════════════════════════════════════════════════════════
   SmartIcon - tries to load a user-supplied image from /public; if it
   fails (missing file / 404), it silently falls back to the supplied
   React node (an inline SVG). This lets the user drop branded PNGs into
   `frontend/public/icons/...` without breaking the page if they haven't.
   ══════════════════════════════════════════════════════════════════════ */
function SmartIcon({
  src,
  alt,
  fallback,
  className,
}: {
  src: string;
  alt: string;
  fallback: React.ReactNode;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Brand icon SVGs (inline, zero deps) - used by SocialLinksCard
   ══════════════════════════════════════════════════════════════════════ */
const BRAND_ICONS = {
  instagram: (
    <svg viewBox="0 0 24 24" fill="white" className="h-[14px] w-[14px]">
      <path d="M12 2.2c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.72 3.72 0 0 1-1.38-.9 3.72 3.72 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.21 15.58 2.2 15.2 2.2 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.21 8.8 2.2 12 2.2zm0 5.6a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4zm0 6.93a2.73 2.73 0 1 1 0-5.46 2.73 2.73 0 0 1 0 5.46zm5.34-7.13a.98.98 0 1 1-1.96 0 .98.98 0 0 1 1.96 0z"/>
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" fill="white" className="h-[14px] w-[14px]">
      <path d="M13.5 21v-7.5h2.5l.5-3h-3V8.5c0-.9.3-1.5 1.5-1.5h1.5V4.3c-.3 0-1.2-.1-2.3-.1-2.3 0-3.7 1.4-3.7 3.9v2.4H8v3h2.5V21h3z"/>
    </svg>
  ),
  youtube: (
    <svg viewBox="0 0 24 24" fill="white" className="h-[14px] w-[14px]">
      <path d="M21.6 7.2c-.2-.9-.9-1.6-1.8-1.8C18.1 5 12 5 12 5s-6.1 0-7.8.4c-.9.2-1.6.9-1.8 1.8C2 8.9 2 12 2 12s0 3.1.4 4.8c.2.9.9 1.6 1.8 1.8C5.9 19 12 19 12 19s6.1 0 7.8-.4c.9-.2 1.6-.9 1.8-1.8.4-1.7.4-4.8.4-4.8s0-3.1-.4-4.8zM10 15V9l5.2 3L10 15z"/>
    </svg>
  ),
  twitter: (
    <svg viewBox="0 0 24 24" fill="white" className="h-[12px] w-[12px]">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/>
    </svg>
  ),
  telegram: (
    <svg viewBox="0 0 24 24" fill="white" className="h-[14px] w-[14px]">
      <path d="M20.665 3.717L2.935 10.55c-1.21.486-1.203 1.16-.222 1.462l4.552 1.42 10.534-6.645c.498-.302.953-.14.579.193l-8.533 7.706h-.002l.002.001-.314 4.692c.46 0 .663-.211.921-.46l2.211-2.15 4.599 3.397c.848.467 1.457.227 1.668-.787l3.019-14.228c.309-1.241-.473-1.804-1.283-1.435z"/>
    </svg>
  ),
  whatsapp: (
    <svg viewBox="0 0 24 24" fill="white" className="h-[14px] w-[14px]">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.198-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.96-1.405A9.953 9.953 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/>
    </svg>
  ),
};

/* ══════════════════════════════════════════════════════════════════════
   Profile sidebar cards
   ══════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════
   Social Links Card
   ══════════════════════════════════════════════════════════════════════ */
const SOCIAL_PLATFORMS: {
  key: keyof typeof BRAND_ICONS;
  label: string;
  bg: string;
}[] = [
  { key: "instagram", label: "Instagram",   bg: "linear-gradient(135deg,#833ab4 0%,#fd1d1d 50%,#fcb045 100%)" },
  { key: "facebook",  label: "Facebook",    bg: "#1877f2" },
  { key: "youtube",   label: "YouTube",     bg: "#ff0000" },
  { key: "twitter",   label: "X (Twitter)", bg: "#000000" },
  { key: "telegram",  label: "Telegram",    bg: "#229ed9" },
  { key: "whatsapp",  label: "WhatsApp",    bg: "#25d366" },
];

function SocialBrandIcon({ keyName, bg }: { keyName: keyof typeof BRAND_ICONS; bg: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    // Fallback: colored tile + inline white SVG
    return (
      <div
        className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-lg"
        style={{ background: bg }}
      >
        {BRAND_ICONS[keyName]}
      </div>
    );
  }

  // Primary: user-supplied brand PNG/SVG at /icons/social/<key>.png
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/icons/social/${keyName}.png`}
      alt={keyName}
      onError={() => setFailed(true)}
      className="h-[26px] w-[26px] flex-shrink-0 object-contain"
    />
  );
}

function SocialLinksCard({ user }: { user: ReelsooUser }) {
  return (
    <div className="rounded-2xl border border-[#eeeeee] bg-white p-4 shadow-sm">
      <p className="mb-3 text-[13px] font-bold text-[#111827]">Social Links</p>
      <div className="grid grid-cols-2 gap-2">
        {SOCIAL_PLATFORMS.map((p) => {
          const userLink = user.social_links?.find(
            (l) => l.platform.toLowerCase() === p.key,
          );
          const href = userLink?.url && userLink.url !== "#" ? userLink.url : undefined;

          return (
            <a
              key={p.key}
              href={href}
              target={href ? "_blank" : undefined}
              rel="noopener noreferrer"
              className="flex h-[40px] cursor-pointer items-center gap-2 rounded-[10px] border border-[#eeeeee] bg-white px-2.5 transition hover:border-[#fd4605] hover:bg-[#fff8f9]"
            >
              <SocialBrandIcon keyName={p.key} bg={p.bg} />
              <span className="truncate text-[11.5px] font-semibold text-[#111827]">
                {p.label}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Suggested Creators Card
   ══════════════════════════════════════════════════════════════════════ */

const INITIAL_COLORS = [
  "#fd4605","#7c3aed","#2563eb","#059669","#d97706",
];

function SuggestedCreatorRow({
  creator,
  colorIndex,
}: {
  creator: SuggestedProfile;
  colorIndex: number;
}) {
  const src     = creator.avatar ?? null;
  const initial = (creator.display_name?.[0] ?? creator.username?.[0] ?? "U").toUpperCase();
  const bgColor = INITIAL_COLORS[colorIndex % INITIAL_COLORS.length];
  const [following, setFollowing] = useState(creator.is_following ?? false);

  type FollowMutResult = {
    success: boolean; following: boolean;
    follow_status: "none" | "pending" | "accepted";
    followers_count?: number;
  };
  const followMut = useMutation({
    mutationFn: (): Promise<FollowMutResult> =>
      following
        ? (userService.unfollow(creator.username) as Promise<FollowMutResult>)
        : (userService.follow(creator.username) as Promise<FollowMutResult>),
    onMutate: () => setFollowing((f) => !f),
    onSuccess: (_, __, ___) => {
      if (!following) void suggestionService.markFollowed(creator.id);
    },
    onError: () => setFollowing((f) => !f),
  });

  return (
    <div className="flex items-center gap-2.5 rounded-xl px-1 py-2 transition hover:bg-[#f8f9fb]">
      {/* Avatar */}
      <Link href={`/profile/${creator.username}`} className="flex-shrink-0">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={creator.display_name}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full text-[13px] font-bold text-white"
            style={{ background: bgColor }}
          >
            {initial}
          </div>
        )}
      </Link>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <Link href={`/profile/${creator.username}`}>
          <div className="flex items-center gap-1">
            <span className="truncate text-[13px] font-bold leading-tight text-[#111827]">
              {creator.display_name}
            </span>
            {creator.is_verified && (
              <VerifiedBadge size={14} className="flex-shrink-0" />
            )}
          </div>
          <p className="truncate text-[11px] text-[#5f6675]">@{creator.username}</p>
          <p className="text-[10px] text-[#9aa1ad]">
            {formatCompact(creator.followers_count ?? 0)} followers
          </p>
          {creator.reason && (
            <p className="mt-0.5 truncate text-[9.5px] text-[#b0b8c1]">{creator.reason}</p>
          )}
        </Link>
      </div>

      {/* Follow button */}
      <button
        onClick={() => followMut.mutate()}
        disabled={followMut.isPending}
        className={cn(
          "flex-shrink-0 rounded-[8px] border px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-60",
          following
            ? "border-[#eeeeee] text-[#9aa1ad] hover:border-[#fd4605] hover:text-[#fd4605]"
            : "border-[#fd4605]/30 bg-white text-[#fd4605] hover:bg-[#fff3ec]",
        )}
      >
        {following ? "Following" : "Follow"}
      </button>
    </div>
  );
}

function SuggestedCreatorsCard() {
  const { data = [], isLoading } = useQuery({
    queryKey:  ["suggestions-profiles-home"],
    queryFn:   () => suggestionService.profiles("home", 5),
    staleTime: 5 * 60 * 1000,
  });

  /* Loading skeleton */
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[#eeeeee] bg-white p-4 shadow-sm">
        <p className="mb-3 text-[13px] font-bold text-[#111827]">Suggested Creators</p>
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2.5 py-2">
            <div className="h-10 w-10 flex-shrink-0 animate-pulse rounded-full bg-[#f0f0f0]" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-28 animate-pulse rounded bg-[#f0f0f0]" />
              <div className="h-2.5 w-20 animate-pulse rounded bg-[#f0f0f0]" />
              <div className="h-2 w-16 animate-pulse rounded bg-[#f0f0f0]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!data.length) return null;

  return (
    <div className="rounded-2xl border border-[#eeeeee] bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[13px] font-bold text-[#111827]">Suggested Creators</p>
        <Link href="/explore" className="text-[11px] font-semibold text-[#fd4605] transition hover:underline">
          See all
        </Link>
      </div>
      <div>
        {data.map((creator, idx) => (
          <SuggestedCreatorRow key={creator.id} creator={creator} colorIndex={idx} />
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Recent Activity Card
   ══════════════════════════════════════════════════════════════════════ */
function RecentActivityCard({ user }: { user: ReelsooUser }) {
  const name    = user.name || "Ananya Rai";
  const avatar  = user.avatar ?? null;
  const initial = (name?.[0] ?? "A").toUpperCase();

  const activities = [
    { id: 1, text: `${name} posted a new video`,      time: "2h ago",      hasThumb: true  },
    { id: 2, text: `${name} reached 1.2M followers`,  time: "Yesterday",   milestone: true },
    { id: 3, text: `${name} went live for 45 mins`,   time: "3 days ago",  hasThumb: false },
  ];

  function Avatar() {
    if (avatar) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt={name} className="h-8 w-8 flex-shrink-0 rounded-full object-cover" />
      );
    }
    return (
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#fd4605] text-[11px] font-bold text-white">
        {initial}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#eeeeee] bg-white p-4 shadow-sm">
      <p className="mb-3 text-[13px] font-bold text-[#111827]">Recent Activity</p>
      <div className="space-y-3">
        {activities.map((item) => (
          <div key={item.id} className="flex items-center gap-2.5">
            <Avatar />

            <div className="min-w-0 flex-1">
              <p className="text-[11px] leading-snug text-[#111827]">{item.text}</p>
              <p className="text-[10px] text-[#9aa1ad]">{item.time}</p>
            </div>

            {item.hasThumb && (
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-[#667eea] to-[#764ba2]">
                <Play className="h-3.5 w-3.5 text-white/60" />
              </div>
            )}
            {item.milestone && (
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-[#fff3ec] to-[#fde7dc] text-[18px]">
                🎉
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Main export
   ══════════════════════════════════════════════════════════════════════ */
export function ProfileSidebar({ user }: { user: ReelsooUser }) {
  return (
    <div className="space-y-3 pb-6">
      <SocialLinksCard user={user} />
      <SuggestedCreatorsCard />
      <RecentActivityCard user={user} />
    </div>
  );
}
