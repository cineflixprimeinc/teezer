"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { StoryViewer } from "@/components/story/story-viewer";
import { storyService, type StoryUser } from "@/services/story.service";
import { useActiveStoryUserIds } from "@/hooks/use-active-story-user-ids";

const GRAD_POOL = [
  "linear-gradient(135deg,#cc2b5e,#753a88)",
  "linear-gradient(135deg,#f77f00,#d62828)",
  "linear-gradient(135deg,#134e5e,#71b280)",
  "linear-gradient(135deg,#2193b0,#6dd5ed)",
  "linear-gradient(135deg,#ee0979,#ff6a00)",
  "linear-gradient(135deg,#6a3093,#a044ff)",
  "linear-gradient(135deg,#fe2c55,#c02040)",
  "linear-gradient(135deg,#667eea,#764ba2)",
];
function hashGrad(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return GRAD_POOL[Math.abs(h) % GRAD_POOL.length];
}

const STORY_GRADIENT = "linear-gradient(135deg,#fd5949,#d6249f,#285aeb)";

export interface StoryRingAvatarProps {
  userId: number;
  username: string;
  displayName?: string;
  avatar?: string | null;
  /** Total outer size in px (ring is contained within this box) */
  size: number;
  isOnline?: boolean;
  /** If true, don't wrap with a profile Link in the no-story case */
  noProfileLink?: boolean;
}

export function StoryRingAvatar({
  userId,
  username,
  displayName,
  avatar,
  size,
  isOnline,
  noProfileLink,
}: StoryRingAvatarProps) {
  const activeIds = useActiveStoryUserIds();
  const hasStory  = activeIds.has(userId);

  const [imgErr,     setImgErr]     = useState(false);
  const [storyOpen,  setStoryOpen]  = useState(false);
  const [storyUsers, setStoryUsers] = useState<StoryUser[]>([]);

  const initials = (displayName || username)
    .replace(/[^a-zA-Z ]/g, "")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase() || "RS";

  async function openStory(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const su = await storyService.getUserStories(username).catch(() => null);
    if (su) { setStoryUsers([su]); setStoryOpen(true); }
  }

  const avatarContent = (
    <div className="h-full w-full overflow-hidden rounded-full">
      {avatar && !imgErr ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatar}
          alt={displayName || username}
          onError={() => setImgErr(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          className="h-full w-full grid place-items-center font-bold text-white"
          style={{ background: hashGrad(username), fontSize: Math.round(size * 0.34) }}
        >
          {initials}
        </div>
      )}
    </div>
  );

  const onlineDot = isOnline && (
    <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-white bg-[#22c55e] z-10" />
  );

  if (!hasStory) {
    const inner = (
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        {avatarContent}
        {onlineDot}
      </div>
    );
    if (noProfileLink) return inner;
    return (
      <Link href={`/profile/${username}`} className="flex-shrink-0 block">
        {inner}
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={openStory}
        className="relative flex-shrink-0 cursor-pointer"
        style={{ width: size, height: size }}
        title={`View ${displayName || username}'s story`}
      >
        <div
          className="rounded-full"
          style={{
            width: "100%",
            height: "100%",
            padding: 2.5,
            background: STORY_GRADIENT,
          }}
        >
          <div
            className="rounded-full bg-white"
            style={{ width: "100%", height: "100%", padding: 2 }}
          >
            {avatarContent}
          </div>
        </div>
        {onlineDot}
      </button>

      {storyOpen && storyUsers.length > 0 && typeof document !== "undefined" && createPortal(
        <StoryViewer
          storyUsers={storyUsers}
          initialUserIdx={0}
          onClose={() => setStoryOpen(false)}
        />,
        document.body,
      )}
    </>
  );
}
