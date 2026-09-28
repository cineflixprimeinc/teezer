"use client";

import type { CSSProperties, ComponentType, ReactNode } from "react";
import { toast as sonnerToast } from "sonner";
import { Bookmark, BookmarkMinus, Heart, MessageCircle, Trash2, UserPlus, UploadCloud } from "lucide-react";

type GlyphProps = { size?: number; color?: string; strokeWidth?: number };
type Glyph = ComponentType<GlyphProps>;

/**
 * The "Notification Bar" icon chip - a solid-fill colour circle with a
 * white glyph. Shared by Sonner's own built-in success/error/warning/info
 * icons (see query-provider.tsx's <Toaster icons>) and every action
 * category below, so the whole notification system reads as one visual
 * language rather than several toast styles bolted together.
 */
export function NotifyIconChip({ Icon, bg }: { Icon: Glyph; bg: string }) {
  return (
    <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full" style={{ background: bg }}>
      <Icon size={18} color="#ffffff" strokeWidth={2.25} />
    </div>
  );
}

/**
 * The title row: message on the left, a relative time on the right -
 * matches the reference "Notification Bar Examples" mockup exactly. Sonner
 * toasts live ~4s by default, so this reads "Just now" rather than a
 * literal ticking counter - there's no meaningful "5s ago" to show for
 * something that only exists for 4 seconds total.
 */
function TitleWithTime({ children }: { children: ReactNode }) {
  return (
    <span className="flex w-full items-center justify-between gap-3">
      <span>{children}</span>
      <span className="teezer-toast-time">Just now</span>
    </span>
  );
}

type Category = { Icon: Glyph; color: string };

const CATEGORY = {
  save:          { Icon: Bookmark,      color: "#16a34a" },
  unsave:        { Icon: BookmarkMinus, color: "#6b7280" },
  like:          { Icon: Heart,         color: "#e11d48" },
  commentDelete: { Icon: MessageCircle, color: "#4f46e5" },
  delete:        { Icon: Trash2,        color: "#d97706" },
  follow:        { Icon: UserPlus,      color: "#7c3aed" },
  upload:        { Icon: UploadCloud,   color: "#0d9488" },
} satisfies Record<string, Category>;

function show(kind: keyof typeof CATEGORY, title: string, opts?: { description?: string }) {
  const c = CATEGORY[kind];
  sonnerToast(<TitleWithTime>{title}</TitleWithTime>, {
    description: opts?.description,
    icon: <NotifyIconChip Icon={c.Icon} bg={c.color} />,
    style: { "--teezer-toast-accent": c.color } as CSSProperties,
  });
}

/**
 * The "Notification Bar" categorized toasts - colored left accent + a
 * matching icon chip + bold title + relative time + centered close button,
 * matching the reference design exactly. Wired into the real actions that
 * already showed a toast: save/unsave (feed-page.tsx), comment delete
 * (comment-section.tsx), video delete (studio-content-page.tsx).
 *
 * `follow`/`like`/`upload` categories exist and are ready to use, but are
 * NOT wired anywhere yet: liking a video and starting an upload don't
 * currently show a toast at all, and "X started following you" is a
 * notification-center list item, not a toast - wiring those up would be
 * adding new behavior, not restyling existing behavior, so left for a
 * separate, explicit request rather than invented here.
 */
export const notify = {
  saved:          (description?: string) => show("save", "Saved to your collection", { description }),
  unsaved:        () => show("unsave", "Removed from saved"),
  commentDeleted: () => show("commentDelete", "Comment deleted successfully"),
  videoDeleted:   () => show("delete", "Video deleted"),
};
