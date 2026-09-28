import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  Keyboard,
  Linking,
  Platform,
  ScrollView,
  Animated,
  Easing,
  useWindowDimensions,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import Svg, { Path, Rect } from "react-native-svg";
import { ds, radius } from "@/theme/design";
import { videoApi, type FeedComment } from "@/api/video.api";
import { useAuthStore } from "@/store/auth.store";
import { useAuthGate } from "@/store/auth-gate.store";
import {
  GestureHandlerRootView,
  PanGestureHandler,
  FlatList as GHFlatList,
} from "react-native-gesture-handler";
import { useSheetDrag } from "./useSheetDrag";
import { GiftSheet } from "@/components/feed/GiftSheet";
import { giftApi } from "@/api/gift.api";
import { GifPicker } from "@/components/feed/GifPicker";
import { ReportSheet } from "@/components/report/ReportSheet";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { EmojiPanel } from "@/components/emoji/EmojiPicker";
import { Emoji } from "@/components/emoji/Emoji";
import { insertAtCursor, deleteBeforeCursor, sanitizeUnicode } from "@/utils/emoji";
import { toCommentGif, type Gif } from "@/api/klipy.api";
import * as ImagePicker from "expo-image-picker";
import { AnimatedGift } from "@/components/AnimatedGift";

/**
 * Comments sheet - the prototype's `commentsOpen` overlay, on real comments.
 *
 * Reads GET /videos/{id}/comments and posts to the same route. Reactions go
 * through /comments/{id}/react, which returns the authoritative counts, so the
 * optimistic state is replaced by the server's answer rather than trusted.
 */

/** The prototype's emojiRow, verbatim. */
const QUICK_EMOJI = ["🔥", "😭", "🙏", "💯", "🥟", "⚡", "😂", "❤️"];

/**
 * Chips above the list. The endpoint takes no sort or filter parameter, so all
 * of these are applied client-side over the pages already loaded.
 *
 * Every option maps to a real field on the comment - nothing here invents a
 * category the API cannot actually answer.
 */
const EMPTY_ART = require("../../assets/empty-comments.png");
/** Shown when the creator has switched commenting off - a withheld surface,
 *  not an empty one. Saying "no comments yet" there invites a reply the
 *  composer will not accept. */
const COMMENTS_OFF_ART = require("../../assets/comments-off.png");

const FILTERS = [
  { key: "top", label: "Top" },
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "creator", label: "Creator" },
  { key: "replies", label: "Replies" },
  { key: "media", label: "Photos" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

/** User-supplied "i" info-circle glyph, for the guest interaction notice. */
function InfoGlyph({ color = ds.textDim, size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 9.5C12.8284 9.5 13.5 8.82843 13.5 8C13.5 7.17157 12.8284 6.5 12 6.5C11.1716 6.5 10.5 7.17157 10.5 8C10.5 8.82843 11.1716 9.5 12 9.5ZM14 15H13V10.5H10V12.5H11V15H10V17H14V15Z" />
    </Svg>
  );
}

function CloseGlyph() {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
      <Path d="m18 6-12 12M6 6l12 12" stroke={ds.textDim} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

function HeartGlyph({ filled }: { filled: boolean }) {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24">
      <Path
        d="M12 20.9c-.55 0-1.08-.22-1.47-.6-3.5-3.38-8.13-7.6-8.13-11.9C2.4 5.05 5.1 2.5 8.45 2.5c1.42 0 2.66.5 3.55 1.35.89-.85 2.13-1.35 3.55-1.35 3.35 0 6.05 2.55 6.05 5.9 0 4.3-4.63 8.52-8.13 11.9-.39.38-.92.6-1.47.6Z"
        fill={filled ? ds.accent : "none"}
        stroke={filled ? ds.accent : ds.silverSoft}
        strokeWidth={filled ? 0 : 1.9}
      />
    </Svg>
  );
}

function DislikeGlyph({ active }: { active: boolean }) {
  const c = active ? ds.text : ds.silverSoft;
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"
        stroke={c}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M17 14V2" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Comment/reply timestamp, as "DD-MM" - e.g. 2026-05-27 -> "27-05". */
function ago(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}`;
}

function fmt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K` : String(n);
}

const RANK_LABEL: Record<number, string> = { 1: "1ST", 2: "2ND", 3: "3RD" };

/** Same bold, filled glyph the chat composer uses - matching its trailing
 *  tool cluster (emoji/GIF/photo) rather than this sheet's own thinner set. */
function SmileGlyph({ color = ds.textDim }: { color?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill={color}>
      <Path d="M21.9024 10.5976C21.4442 10.5333 20.976 10.5 20.5 10.5C17.2404 10.5 14.3455 12.0604 12.5212 14.471C12.3501 14.4887 12.1763 14.4978 12 14.4978C10.7188 14.4978 9.55217 14.0172 8.66691 13.2248L7.33309 14.7151C8.41871 15.6868 9.81141 16.3253 11.3466 16.4676C10.8023 17.7016 10.5 19.0662 10.5 20.5C10.5 20.976 10.5333 21.4442 10.5976 21.9024C5.7387 21.2205 2 17.0469 2 12C2 6.47715 6.47715 2 12 2C17.0469 2 21.2205 5.7387 21.9024 10.5976ZM21.8707 12.617C21.4254 12.5401 20.9674 12.5 20.5 12.5C17.7656 12.5 15.3512 13.8709 13.9068 15.9675C13.0194 17.2556 12.5 18.8156 12.5 20.5C12.5 20.9674 12.5401 21.4254 12.617 21.8707L21.8707 12.617ZM8.5 11.5C9.32843 11.5 10 10.8284 10 10C10 9.17157 9.32843 8.5 8.5 8.5C7.67157 8.5 7 9.17157 7 10C7 10.8284 7.67157 11.5 8.5 11.5ZM15.5 11.5C16.3284 11.5 17 10.8284 17 10C17 9.17157 16.3284 8.5 15.5 8.5C14.6716 8.5 14 9.17157 14 10C14 10.8284 14.6716 11.5 15.5 11.5Z" />
    </Svg>
  );
}

/**
 * Lucide `send` - the paper plane, replacing the word "Post".
 *
 * Stroked at 2, unlike the composer's other 1.8 tools: this one is the primary
 * action of the row, and it also has to carry the enabled/disabled state on its
 * own now that there is no label to grey out. The colour is passed rather than
 * styled so that state stays in one place.
 */
function SendGlyph({ color }: { color: string }) {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14.54 21.69a.5.5 0 0 0 .94-.03l6.5-19a.5.5 0 0 0-.64-.63l-19 6.5a.5.5 0 0 0-.02.93l7.93 3.18a2 2 0 0 1 1.11 1.11z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="m21.85 2.15-10.94 10.94"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function GifGlyph({ color = ds.textDim }: { color?: string }) {
  return (
    <Svg width={22} height={20} viewBox="0 0 26 24" fill="none">
      <Rect x={1.5} y={4.5} width={23} height={15} rx={3} stroke={color} strokeWidth={2.2} />
      <Path d="M10 10.2a2.4 2.4 0 1 0 0 3.6v-1.5H8.9" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M13.4 9.8v4.4" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M16.6 14.2V9.8h2.8M16.6 12h2.2" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function ImageGlyph({ color = ds.textDim }: { color?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill={color}>
      <Path d="M20.4668 8.69379L20.7134 8.12811C21.1529 7.11947 21.9445 6.31641 22.9323 5.87708L23.6919 5.53922C24.1027 5.35653 24.1027 4.75881 23.6919 4.57612L22.9748 4.25714C21.9616 3.80651 21.1558 2.97373 20.7238 1.93083L20.4706 1.31953C20.2942 0.893489 19.7058 0.893489 19.5293 1.31953L19.2761 1.93083C18.8442 2.97373 18.0384 3.80651 17.0252 4.25714L16.308 4.57612C15.8973 4.75881 15.8973 5.35653 16.308 5.53922L17.0677 5.87708C18.0555 6.31641 18.8471 7.11947 19.2866 8.12811L19.5331 8.69379C19.7136 9.10792 20.2864 9.10792 20.4668 8.69379ZM12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 11.5975 21.9762 11.2002 21.9298 10.8094L19.9437 11.0452C19.9809 11.3579 20 11.6765 20 12C20 12.9012 19.851 13.7676 19.5762 14.5759L15.7073 10.707C15.3168 10.3164 14.6836 10.3164 14.2931 10.707L6.86516 18.1349C5.11372 16.6674 4 14.4637 4 12C4 7.58172 7.58172 4 12 4C12.6919 4 13.3618 4.0876 14 4.25179L14.4983 2.31487C13.6987 2.10914 12.8614 2 12 2ZM9 12C10.1046 12 11 11.1046 11 10C11 8.89543 10.1046 8 9 8C7.89543 8 7 8.89543 7 10C7 11.1046 7.89543 12 9 12Z" />
    </Svg>
  );
}

/** Same bold, filled gift box the Inbox "Gifts & Coins" row uses, matching
 *  the chat composer's weight rather than this sheet's own thinner outline. */
function GiftGlyph({ color = ds.textDim }: { color?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill={color}>
      <Path d="M14.5049 2.00281C16.4379 2.00281 18.0049 3.56981 18.0049 5.50281C18.0049 6.04001 17.8839 6.54895 17.6676 7.00385L21.0049 7.00281C21.5572 7.00281 22.0049 7.45052 22.0049 8.00281V12.0028C22.0049 12.5551 21.5572 13.0028 21.0049 13.0028H20.0049V21.0028C20.0049 21.5551 19.5572 22.0028 19.0049 22.0028H5.00488C4.4526 22.0028 4.00488 21.5551 4.00488 21.0028V13.0028H3.00488C2.4526 13.0028 2.00488 12.5551 2.00488 12.0028V8.00281C2.00488 7.45052 2.4526 7.00281 3.00488 7.00281L6.34219 7.00385C6.12591 6.54895 6.00488 6.04001 6.00488 5.50281C6.00488 3.56981 7.57189 2.00281 9.50488 2.00281C10.4849 2.00281 11.3708 2.40557 12.0061 3.05459C12.639 2.40557 13.5249 2.00281 14.5049 2.00281ZM18.0049 13.0028H6.00488V20.0028H18.0049V13.0028ZM20.0049 9.00281H4.00488V11.0028H20.0049V9.00281ZM9.50488 4.00281C8.67646 4.00281 8.00488 4.67438 8.00488 5.50281C8.00488 6.2825 8.59977 6.92326 9.36042 6.99594L9.50488 7.00281H11.0049V5.50281C11.0049 4.72311 10.41 4.08236 9.64934 4.00967L9.50488 4.00281ZM14.5049 4.00281L14.3604 4.00967C13.6473 4.07782 13.0799 4.64524 13.0117 5.35835L13.0049 5.50281V7.00281H14.5049L14.6493 6.99594C15.41 6.92326 16.0049 6.2825 16.0049 5.50281C16.0049 4.72311 15.41 4.08236 14.6493 4.00967L14.5049 4.00281Z" />
    </Svg>
  );
}

function Chevron({ up }: { up: boolean }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <Path
        d={up ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"}
        stroke={ds.textDim}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function Avatar({ uri, size }: { uri?: string | null; size: number }) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: 999 }}
        contentFit="cover"
        transition={120}
      />
    );
  }
  return <View style={{ width: size, height: size, borderRadius: 999, backgroundColor: ds.line }} />;
}

/** A reply: the design indents these 46px and drops the avatar to 28px. */
function ReplyRow({ r, meId, onReact, onOpenProfile, onReport }: {
  r: FeedComment;
  /** Hides the Report link on your own reply - matches CommentRow. */
  meId: number | null;
  onReact: (c: FeedComment, t: "love" | "dislike") => void;
  onOpenProfile: (username: string) => void;
  onReport: (c: FeedComment) => void;
}) {
  const loved = r.current_user_reaction === "love";
  const disliked = r.current_user_reaction === "dislike";
  const open = () => r.user?.username && onOpenProfile(r.user.username);
  return (
    <View style={styles.replyRow}>
      <Pressable onPress={open} disabled={!r.user?.username} hitSlop={4} accessibilityRole="button">
        <Avatar uri={r.user?.avatar} size={28} />
      </Pressable>
      <View style={styles.replyBody}>
        <View style={styles.nameRow}>
          <Pressable onPress={open} disabled={!r.user?.username} hitSlop={6} accessibilityRole="button">
            <Text style={styles.replyName}>{r.user?.username ?? "user"}</Text>
          </Pressable>
          {r.user?.is_verified && <VerifiedBadge size={11} />}
          {r.is_author && (
            <View style={styles.creatorBadge}>
              <Text style={styles.creatorBadgeText} numberOfLines={1}>CREATOR</Text>
            </View>
          )}
        </View>
        {!!r.body && <Text style={styles.replyText}>{r.body}</Text>}
        <View style={styles.metaRow}>
          <Text style={styles.timeSm}>{ago(r.created_at)}</Text>
          <Text style={styles.replySm}>Reply</Text>
          {r.user?.id !== meId && (
            <Pressable onPress={() => onReport(r)} hitSlop={6} accessibilityRole="button">
              <Text style={styles.reportSm}>Report</Text>
            </Pressable>
          )}
          {/* Parallel with "Reply", pinned to the row's right edge - was a
              separate column spanning the row's full height, which put it
              level with the avatar/name instead of down here. */}
          <View style={styles.replyReactCol}>
            <Pressable
              onPress={() => onReact(r, "love")}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Like reply"
              style={styles.reactBtn}
            >
              <HeartGlyph filled={loved} />
              <Text style={styles.reactCount}>{r.love_count > 0 ? fmt(r.love_count) : ""}</Text>
            </Pressable>
            <Pressable onPress={() => onReact(r, "dislike")} hitSlop={6} accessibilityRole="button" accessibilityLabel="Dislike reply">
              <DislikeGlyph active={disliked} />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

function CommentRow({
  c,
  replies,
  loadingReplies,
  meId,
  onReact,
  onReply,
  onToggleReplies,
  onOpenProfile,
  onOpenMedia,
  onReport,
}: {
  c: FeedComment;
  replies: FeedComment[] | undefined;
  loadingReplies: boolean;
  /** Hides the Report link on your own comment - a report needs a target
   *  other than the reporter. */
  meId: number | null;
  onReact: (c: FeedComment, type: "love" | "dislike") => void;
  onReply: (c: FeedComment) => void;
  onToggleReplies: (c: FeedComment) => void;
  onOpenProfile: (username: string) => void;
  onOpenMedia: (uri: string) => void;
  onReport: (c: FeedComment) => void;
}) {
  const loved = c.current_user_reaction === "love";
  const disliked = c.current_user_reaction === "dislike";
  const media = c.image_url ?? c.gif_preview_url ?? c.gif_url ?? null;
  /* What the VIEWER should load, which is not always what the thumbnail shows:
     a GIF thumbnail is the small preview, and blowing that up full-screen gives
     a soft, half-resolution image when the full one was there all along. */
  const mediaFull = c.image_url ?? c.gif_url ?? c.gif_preview_url ?? null;
  const rank = c.comment_rank && RANK_LABEL[c.comment_rank];

  // The list endpoint returns roots only (CommentResource exposes replies_count,
  // not the replies themselves), so a thread is fetched on demand.
  const shown = replies ?? [];
  const remaining = Math.max(0, c.reply_count - shown.length);

  return (
    <View style={styles.commentBlock}>
      <View style={styles.commentRow}>
        {/* Avatar and name both open the profile - the same two targets every
            other list in the app makes tappable. */}
        <Pressable
          onPress={() => c.user?.username && onOpenProfile(c.user.username)}
          disabled={!c.user?.username}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={c.user?.username ? `Open ${c.user.username}'s profile` : undefined}
        >
          <Avatar uri={c.user?.avatar} size={36} />
        </Pressable>

        <View style={styles.commentBody}>
          <View style={styles.nameRow}>
            <Pressable
              onPress={() => c.user?.username && onOpenProfile(c.user.username)}
              disabled={!c.user?.username}
              hitSlop={6}
              accessibilityRole="button"
            >
              <Text style={styles.name}>{c.user?.username ?? "user"}</Text>
            </Pressable>
            {c.user?.is_verified && <VerifiedBadge size={12} />}
            {c.is_author && (
              <View style={styles.creatorBadge}>
                <Text style={styles.creatorBadgeText} numberOfLines={1}>CREATOR</Text>
              </View>
            )}
            {!!rank && (
              <View style={styles.rankBadge}>
                <Text style={styles.rankBadgeText}>{rank}</Text>
              </View>
            )}
          </View>

          {/* A gift comment IS the gift: its own animated artwork and what it
              cost, rather than the "sent a Rose" fallback the server stores for
              clients that do not know about gifts yet. */}
          {c.gift ? (
            <View style={styles.giftBubble}>
              {c.gift.icon_url ? (
                <AnimatedGift uri={c.gift.icon_url} slug={c.gift.slug} size={40} />
              ) : (
                <Text style={styles.giftFallback}>🎁</Text>
              )}
              <View style={{ flexShrink: 1 }}>
                <Text style={styles.giftName} numberOfLines={1}>
                  Sent {c.gift.name}
                </Text>
                <Text style={styles.giftCoins}>{c.gift.coins.toLocaleString()} coins</Text>
              </View>
            </View>
          ) : (
            <>
              {!!c.body && <Text style={styles.text}>{c.body}</Text>}
              {!!media && (
                <Pressable
                  onPress={() => mediaFull && onOpenMedia(mediaFull)}
                  accessibilityRole="imagebutton"
                  accessibilityLabel="Open photo"
                >
                  <Image source={{ uri: media }} style={styles.media} contentFit="cover" transition={120} />
                </Pressable>
              )}
            </>
          )}

          <View style={styles.metaRow}>
            <Text style={styles.time}>{ago(c.created_at)}</Text>
            <Pressable onPress={() => onReply(c)} hitSlop={6} accessibilityRole="button">
              <Text style={styles.reply}>Reply</Text>
            </Pressable>
            {c.user?.id !== meId && (
              <Pressable onPress={() => onReport(c)} hitSlop={6} accessibilityRole="button">
                <Text style={styles.report}>Report</Text>
              </Pressable>
            )}
            {c.is_pinned && <Text style={styles.pinned}>Pinned</Text>}
            {c.is_edited && <Text style={styles.time}>edited</Text>}
            {/* Parallel with "Reply", pinned to the row's right edge - was a
                separate column spanning the row's full height, which put it
                level with the avatar/name instead of down here. */}
            <View style={styles.reactCol}>
              <Pressable
                onPress={() => onReact(c, "love")}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Like comment"
                style={styles.reactBtn}
              >
                <HeartGlyph filled={loved} />
                <Text style={styles.reactCount}>{c.love_count > 0 ? fmt(c.love_count) : ""}</Text>
              </Pressable>
              <Pressable onPress={() => onReact(c, "dislike")} hitSlop={6} accessibilityRole="button" accessibilityLabel="Dislike comment">
                <DislikeGlyph active={disliked} />
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      {(shown.length > 0 || c.reply_count > 0) && (
        <View style={styles.thread}>
          {shown.map((r) => (
            <ReplyRow key={r.id} r={r} meId={meId} onReact={onReact} onOpenProfile={onOpenProfile} onReport={onReport} />
          ))}

          {loadingReplies ? (
            <ActivityIndicator size="small" color={ds.textMuted} style={{ alignSelf: "flex-start" }} />
          ) : remaining > 0 || shown.length > 0 ? (
            <Pressable
              onPress={() => onToggleReplies(c)}
              hitSlop={6}
              accessibilityRole="button"
              style={styles.moreRepliesRow}
            >
              <Text style={styles.moreReplies}>
                {shown.length > 0
                  ? "Hide replies"
                  : `View ${remaining} ${remaining === 1 ? "reply" : "replies"}`}
              </Text>
              <Chevron up={shown.length > 0} />
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

export function CommentsSheet({
  videoId,
  creator,
  open,
  onClose,
  onCountChange,
  commentsDisabled = false,
  initialTool = null,
  hideComposerForGuest = false,
}: {
  videoId: number | null;
  /** Who a gift from this sheet goes to - the post's creator. Without it the
   *  gift button has no receiver, so it simply isn't offered. */
  creator?: { id: number; username?: string | null } | null;
  open: boolean;
  onClose: () => void;
  /** The post has `allow_comments: false`. The list and composer are replaced
   *  by a standing notice rather than an empty state. */
  commentsDisabled?: boolean;
  /**
   * The feed page's own request: a guest typing into the composer here could
   * freeze the app, so on the feed the composer is replaced by a "Log in to
   * comment" prompt for a guest instead of a live TextInput - comments stay
   * viewable, only the composer is withheld. Defaults to false so every
   * other CommentsSheet caller (post viewer, etc.) is unaffected.
   */
  hideComposerForGuest?: boolean;
  /** Bubbles the server's fresh total back so the feed's rail can update. */
  onCountChange?: (total: number) => void;
  /**
   * Open straight into one of the composer's pickers.
   *
   * The post viewer draws its own photo/GIF tools on the bar above this sheet.
   * They are entry points into THIS composer - the pickers and the staging
   * state live here and nowhere else - so the only way for those tools to do
   * what their icons promise is to say which one they meant on the way in.
   * Omitted (the feed's case) the sheet opens exactly as it always has.
   */
  initialTool?: "photo" | "gif" | null;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const navigation = useNavigation<any>();
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);

  /**
   * Every guest-gated action in this sheet (react, reply, the login
   * button, emoji/gif/gift tools, posting) needs to show the "log in or
   * sign up" flow. That flow is not just one popup: AuthGateModal itself
   * is a SEPARATE native `<Modal>` (via the shared BottomSheet component,
   * which wraps its content in a Modal the same way this sheet does), and
   * tapping through it navigates to a real screen (LoginForm/EmailSignup/
   * SavedAccounts) presented as its own modal-style screen in the root
   * navigator. This sheet's own `<Modal visible={open}>` staying open
   * underneath EITHER of those is what froze the screen (no taps, no
   * scroll register) - worst on Android, where each native Modal is its
   * own Window, but not safe on iOS either once a second modal-style
   * presentation stacks on top.
   *
   * Fix: close this sheet for real (same pattern openProfile() below
   * already uses for the same reason) before ever presenting anything on
   * top of it, so nothing is ever stacked at any step of the auth flow -
   * not just while the small popup is up, but through the LoginForm/
   * EmailSignup navigation too. This sheet's own component never
   * unmounts when it closes (HomeScreen renders it unconditionally, only
   * `open` toggles its Modal's visibility - see the emoji-panel reset
   * effect elsewhere in this file, which only makes sense because closing
   * never discards state), so `pending` still runs against a live
   * component afterward; it just runs with the sheet closed rather than
   * reopening it automatically.
   */
  const gateGuest = useCallback(
    (pending: () => void) => {
      onClose();
      // Same 220ms handoff openProfile() uses further down, for the same
      // reason: this sheet's own Modal is still playing its native slide-out
      // close animation right after onClose() fires. Presenting the auth
      // popup's Modal before that finishes would stack two native Modals for
      // a moment - the exact condition that was freezing the screen, just
      // briefer - so the popup waits for the close to actually finish.
      setTimeout(() => useAuthGate.getState().open(pending), 220);
    },
    [onClose],
  );

  /** The gift picker, opened from the composer's gift tool. */
  const [giftOpen, setGiftOpen] = useState(false);
  /* The gift tool only shows once the creator has actually unlocked Gifts &
   * Coins (every requirement met, admin has the programme on) - showing it
   * unconditionally used to be purely cosmetic anyway, since send() now
   * refuses an ineligible receiver regardless of what the icon suggested. */
  const giftsEligibleQuery = useQuery({
    queryKey: ["gifts-eligible", creator?.id],
    queryFn: () => giftApi.eligible(creator!.id),
    enabled: open && !!creator?.id,
    staleTime: 60_000,
  });
  const giftsEligible = giftsEligibleQuery.data === true;
  /** The Klipy GIF picker, and the one GIF staged for the next post. */
  const [gifOpen, setGifOpen] = useState(false);
  const [gif, setGif] = useState<Gif | null>(null);
  /** One photo staged for the next post, in the shape addComment's multipart
   *  path wants. */
  const [photo, setPhoto] = useState<{ uri: string; name: string; type: string } | null>(null);

  const [draft, setDraft] = useState("");
  /**
   * The caret, mirrored out of the TextInput.
   *
   * Needed because an emoji has to land WHERE THE USER IS, not at the end. The
   * quick-emoji row used to do `draft + e`, which silently reorders a sentence
   * the moment the caret is anywhere but the last character.
   *
   * React Native does not report a selection until the field is touched, so
   * this starts null and insertAtCursor treats null as "append", which is the
   * only safe reading of "no caret we can trust".
   */
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  /** A comment's photo or GIF, opened full-screen. Null = viewer closed. */
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  /** The comment (or reply) being reported, if any. Null = report sheet closed. */
  const [reportingCommentId, setReportingCommentId] = useState<number | null>(null);

  /** Insert at the caret, keep the caret after what was inserted, and record
   *  the pick so recents and frequently-used stay accurate. */
  const insertEmoji = useCallback(
    (emoji: string) => {
      setDraft((d) => {
        const next = insertAtCursor(d, emoji, selection);
        setSelection(next.selection);
        return next.text;
      });
    },
    [selection],
  );

  /** Backspace for the emoji panel. Deletes a WHOLE emoji, not a code unit -
   *  see deleteBeforeCursor for why that distinction matters. */
  const backspace = useCallback(() => {
    setDraft((d) => {
      const next = deleteBeforeCursor(d, selection);
      setSelection(next.selection);
      return next.text;
    });
  }, [selection]);
  const [replyTo, setReplyTo] = useState<FeedComment | null>(null);
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("top");
  const [threads, setThreads] = useState<Record<number, FeedComment[]>>({});
  const [loadingThread, setLoadingThread] = useState<number | null>(null);
  const inputRef = useRef<TextInput>(null);

  const key = ["comments", videoId];

  // 70% of the screen, on every device. The 660pt design cap this replaced made
  // the sheet a SHORTER fraction the taller the phone got - 78% on a small one,
  // barely 66% on a large one - so the proportion was never actually fixed.
  const restHeight = Math.round(height * 0.7);

  /**
   * Keyboard inset, applied as PADDING inside a sheet whose size never changes.
   *
   * This is the Instagram model, and it is the only one that behaves: the sheet
   * keeps its height and its position, the composer stays pinned to the bottom
   * of the padded box - which is exactly the top of the keyboard - and the
   * list, being the only flexible child, is what gives up the space. Nothing
   * moves, nothing is re-anchored, so the scroll offset survives untouched and
   * the video behind the sheet never shifts.
   *
   * (Two earlier attempts are worth not repeating: shrinking the sheet takes
   * the space off the TOP, because it is bottom-anchored, so the comments slide
   * down while the composer stays behind the keyboard; and lifting the whole
   * sheet moves the header and the video edge with it.)
   *
   * `Keyboard.metrics()` is unreliable inside a Modal and a translucent one
   * receives no OS inset, so the events are the only honest source. iOS gets
   * the `Will` pair and the system's own duration/curve so the composer travels
   * with the keyboard rather than after it; Android only emits the `Did` pair,
   * where ~250ms matches the platform default.
   */
  const [kb, setKb] = useState(0);
  /**
   * The tallest keyboard this session, so the emoji panel can be exactly that
   * tall and stand in its place.
   *
   * Sizing the panel to a guessed constant is what makes an emoji tray feel
   * bolted on: the composer jumps as the keyboard closes and the tray opens at
   * a different height. Matching the real measurement means the composer does
   * not move at all - the panel simply occupies the hole the keyboard left.
   * 300 is only the fallback for a session where the keyboard never opened.
   */
  const kbSeen = useRef(300);

  /* Declared HERE, below `kb`, and not up beside the emoji state where it reads
     more naturally - `kb` is a const and would be in its temporal dead zone up
     there, which is a hard error rather than a stale read. */
  useEffect(() => {
    // The keyboard and the panel want the same strip of screen, so raising the
    // keyboard - tapping the input, or hitting reply - retires the panel.
    // Without this both claim it and the composer is pushed out of the sheet.
    if (kb > 0) setEmojiOpen(false);
  }, [kb]);

  /* A closed sheet must not reopen still holding a panel. */
  useEffect(() => {
    if (!open) setEmojiOpen(false);
  }, [open]);

  /**
   * The panel's slide, and the mount that outlives it.
   *
   * Height is a LAYOUT prop, so this is JS-driven - the same reason kbAnim
   * above is. That is also why the panel pushes the list rather than floating
   * over it: the composer stays exactly where it is and only the list, the one
   * flexible child, gives up the space.
   *
   * `panelMounted` lags `emojiOpen` on the way out so the emoji grid is still
   * drawn while the box collapses. Unmounting on the first frame of the close
   * would collapse an EMPTY box, which reads as a flicker rather than a slide.
   *
   * The box carries the bottom inset, because with the panel up IT is the
   * bottom-most element - see the composer's padding, which stands down while
   * this is open so the inset is not applied twice.
   */
  const emojiAnim = useRef(new Animated.Value(0)).current;
  const [panelMounted, setPanelMounted] = useState(false);

  useEffect(() => {
    let raf = 0;
    let anim: Animated.CompositeAnimation | null = null;

    const run = () => {
      anim = Animated.timing(emojiAnim, {
        toValue: emojiOpen ? kbSeen.current + insets.bottom : 0,
        duration: emojiOpen ? 220 : 160,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      });
      anim.start();
    };

    if (emojiOpen) {
      /*
       * Mount, then animate on the NEXT frame - and never unmount after.
       *
       * This is what made the panel feel laggy. It used to unmount on every
       * close, so every single opening re-mounted the whole keyboard - 1640
       * emoji, nine category lists, a search bar - in the SAME commit that
       * started the height animation. The first frames went on laying all of
       * that out instead of moving the box, so the panel hung and then jumped.
       *
       * Deferring the start by one frame lets the mount land first, so the
       * animation gets clean frames. Keeping it mounted afterwards means only
       * the FIRST open pays that cost at all; every one after is a pure height
       * animation over views that already exist. The box is height 0 with
       * overflow hidden while closed, and the library windows its own lists, so
       * an idle mounted panel costs almost nothing.
       *
       * It unmounts with the sheet - this whole tree lives inside a Modal keyed
       * on `open` - so nothing leaks past the session.
       */
      setPanelMounted(true);
      raf = requestAnimationFrame(run);
    } else {
      run();
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      anim?.stop();
    };
  }, [emojiOpen, emojiAnim, insets.bottom]);
  const kbAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!open) return;
    const ios = Platform.OS === "ios";
    const slide = (to: number, duration?: number) =>
      Animated.timing(kbAnim, {
        toValue: to,
        duration: duration && duration > 0 ? duration : 250,
        easing: Easing.out(Easing.cubic),
        // Padding is a layout prop; the native driver cannot carry it. The drag
        // hook is JS-driven too, so the two never disagree about who owns this
        // view.
        useNativeDriver: false,
      }).start();

    const onShow = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", (e) => {
      const h = e.endCoordinates?.height ?? 0;
      if (h > 0) kbSeen.current = h;
      setKb(h);
      slide(h, e.duration);
    });
    const onHide = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", (e) => {
      setKb(0);
      slide(0, e?.duration);
    });
    return () => { onShow.remove(); onHide.remove(); };
  }, [open, kbAnim]);

  // Never reopen carrying the last session's inset.
  useEffect(() => {
    if (!open) { setKb(0); kbAnim.setValue(0); }
  }, [open, kbAnim]);

  const drag = useSheetDrag({
    sheetHeight: restHeight,
    onDismiss: onClose,
    // Typing must not be able to dismiss the sheet out from under the keyboard.
    enabled: !typing,
  });

  // The list must be able to receive the same gesture as the sheet, or the
  // handoff from an at-top list into a dismissal needs a finger lift.
  const listRef = useRef<React.ComponentRef<typeof GHFlatList<FeedComment>>>(null);

  useEffect(() => {
    if (open) drag.open();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => videoApi.comments(videoId as number, pageParam as number),
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const m = last.meta;
      return m && m.current_page < m.last_page ? m.current_page + 1 : undefined;
    },
    enabled: open && videoId != null,
    staleTime: 15_000,
  });

  const comments = useMemo(
    () => (q.data?.pages ?? []).flatMap((p) => p.data ?? []),
    [q.data],
  );

  // Applied over the loaded pages: the endpoint has no sort or filter
  // parameter, so this orders and narrows what we have rather than pretending
  // to re-query the server.
  /**
   * Display order is frozen against reaction changes.
   *
   * "Top" sorts on love_count, so loving a comment used to re-sort the list
   * the instant the optimistic patch landed - the row jumped up, then
   * dropped back when the server's authoritative count arrived. Reacting to
   * a comment must never move it.
   *
   * The ranking is therefore computed once per *set* of comments and reused:
   * it is recalculated when the filter changes or when the comments
   * themselves change (a page loads, one is posted or removed), and never
   * because a count moved under it. A comment that appears after the
   * ranking was taken (a fresh post) sorts to the end until the set changes
   * again, which is where a new comment belongs anyway.
   */
  const rankRef = useRef<{ sig: string; rank: Map<number, number> }>({ sig: "", rank: new Map() });

  const ordered = useMemo(() => {
    let rows = [...comments];

    if (filter === "creator") rows = rows.filter((c) => c.is_author);
    else if (filter === "replies") rows = rows.filter((c) => c.reply_count > 0);
    else if (filter === "media") rows = rows.filter((c) => !!(c.image_url || c.gif_url));

    const byNewest = (a: FeedComment, b: FeedComment) =>
      +new Date(b.created_at) - +new Date(a.created_at);

    // Only the identity of the rows feeds this - deliberately not their
    // counts, so a reaction can't invalidate the ranking.
    const sig = `${filter}|${rows.map((r) => r.id).join(",")}`;
    if (rankRef.current.sig !== sig) {
      const sorted = [...rows];
      if (filter === "newest") sorted.sort(byNewest);
      else if (filter === "oldest") sorted.sort((a, b) => -byNewest(a, b));
      else {
        // Everything else reads "Top": pinned first, then most-loved, newest
        // breaking ties.
        sorted.sort(
          (a, b) =>
            Number(!!b.is_pinned) - Number(!!a.is_pinned) ||
            b.love_count - a.love_count ||
            byNewest(a, b),
        );
      }
      rankRef.current = { sig, rank: new Map(sorted.map((c, i) => [c.id, i])) };
    }

    const { rank } = rankRef.current;
    rows.sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
    return rows;
  }, [comments, filter]);

  const total =
    q.data?.pages?.[0]?.video_comments_count ??
    q.data?.pages?.[0]?.visible_comments_count ??
    comments.length;

  /** Patch one comment in place across every cached page. */
  const patch = useCallback(
    (id: number, next: Partial<FeedComment>) => {
      qc.setQueryData(key, (old: unknown) => {
        const d = old as { pages?: { data?: FeedComment[] }[] } | undefined;
        if (!d?.pages) return old;
        return {
          ...d,
          pages: d.pages.map((p) => ({
            ...p,
            data: (p.data ?? []).map((c) => (c.id === id ? { ...c, ...next } : c)),
          })),
        };
      });
    },
    [qc, key],
  );

  const react = useCallback(
    async (c: FeedComment, type: "love" | "dislike") => {
      // Same rule as posting/replying: reacting is an act tied to an
      // account. This was missing here - a guest could love/dislike freely
      // while every other comment action already gated on login.
      if (!me) {
        gateGuest(() => void react(c, type));
        return;
      }
      const wasSame = c.current_user_reaction === type;
      // Optimistic flip, then replaced by the server's authoritative counts -
      // the endpoint resolves add/remove/switch itself, so guessing the final
      // numbers here would drift from it.
      patch(c.id, {
        current_user_reaction: wasSame ? null : type,
        love_count: c.love_count + (type === "love" ? (wasSame ? -1 : 1) : 0),
      });
      try {
        const r = await videoApi.reactComment(c.id, type);
        patch(c.id, {
          current_user_reaction: r.current_user_reaction,
          love_count: r.love_count,
          dislike_count: r.dislike_count,
        });
      } catch {
        patch(c.id, {
          current_user_reaction: c.current_user_reaction,
          love_count: c.love_count,
          dislike_count: c.dislike_count,
        });
      }
    },
    [patch, me, gateGuest],
  );

  const toggleThread = useCallback(
    async (c: FeedComment) => {
      if (threads[c.id]) {
        setThreads((p) => {
          const n = { ...p };
          delete n[c.id];
          return n;
        });
        return;
      }
      setLoadingThread(c.id);
      try {
        const r = await videoApi.commentReplies(c.id);
        // The thread endpoint returns the whole flat thread including the root,
        // so drop the root itself before rendering the replies.
        setThreads((p) => ({ ...p, [c.id]: (r.data ?? []).filter((x) => x.id !== c.id) }));
      } catch {
        setThreads((p) => ({ ...p, [c.id]: [] }));
      } finally {
        setLoadingThread(null);
      }
    },
    [threads],
  );

  const submit = useCallback(async () => {
    const body = draft.trim();
    // An attachment is a comment on its own - the endpoint accepts a body OR a
    // gif_url OR an image, so requiring text would make both pickers unusable
    // without typing.
    if ((!body && !gif && !photo) || videoId == null || sending) return;
    // Same rule as liking, saving, sharing and gifting: posting is an act tied
    // to an account. This was the one action a guest could still attempt - the
    // request just 401'd and the comment vanished with no explanation.
    if (!me) {
      gateGuest(() => void submit());
      return;
    }
    setSending(true);
    try {
      await videoApi.addComment(
        videoId,
        body,
        replyTo?.id ?? null,
        gif ? toCommentGif(gif) : null,
        photo,
      );
      setDraft("");
      // Posting ends the composing session, so the panel goes with it.
      setEmojiOpen(false);
      setGif(null);
      setPhoto(null);
      setReplyTo(null);
      const fresh = await qc.refetchQueries({ queryKey: key });
      void fresh;
      onCountChange?.(total + 1);
    } catch (e) {
      /*
       * Keeping the draft and the attachments is right - nothing should be lost
       * on a failed post - but staying SILENT about it was not. A failure looked
       * exactly like nothing happening: the button did nothing, the GIF stayed
       * staged, and there was no way to tell a 422 from a dead connection.
       *
       * The server's own message is preferred when it sent one; it says which
       * rule was broken, which is far more use than a generic apology.
       */
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Your comment wasn't posted. Check your connection and try again.";
      Alert.alert("Not posted", msg);
    } finally {
      setSending(false);
    }
  }, [draft, gif, photo, videoId, sending, replyTo, qc, key, total, onCountChange, me, gateGuest]);

  const canPost = (draft.trim().length > 0 || !!gif || !!photo) && !sending;

  /**
   * Attach a photo from the library.
   *
   * Permission is requested explicitly rather than left to the picker, so a
   * refusal can be explained and pointed at Settings - once the OS has been
   * told "no", `launchImageLibraryAsync` just returns nothing and the button
   * would look broken. `canAskAgain` is what separates "not asked yet" from
   * "permanently denied"; only the latter gets sent to Settings.
   */
  const pickPhoto = useCallback(async () => {
    // Same rule as posting: attaching a photo is a per-account action, so a
    // guest gets the login/signup gate, replayed after login.
    if (!me) {
      gateGuest(() => void pickPhoto());
      return;
    }
    Keyboard.dismiss();
    const current = await ImagePicker.getMediaLibraryPermissionsAsync();
    let granted = current.granted;

    if (!granted && current.canAskAgain) {
      granted = (await ImagePicker.requestMediaLibraryPermissionsAsync()).granted;
    }

    if (!granted) {
      Alert.alert(
        "Photo access is off",
        "Teezer needs access to your photos to add one to a comment.",
        [
          { text: "Not now", style: "cancel" },
          { text: "Open Settings", onPress: () => void Linking.openSettings() },
        ],
      );
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsMultipleSelection: false,
    });
    if (picked.canceled || !picked.assets?.[0]) return;

    const a = picked.assets[0];
    setPhoto({
      uri: a.uri,
      name: a.fileName ?? `photo-${Date.now()}.jpg`,
      type: a.mimeType ?? "image/jpeg",
    });
  }, [me, gateGuest]);

  /**
   * Honour `initialTool` once per opening.
   *
   * Guarded by a ref rather than by the dependency list: `pickPhoto` is a
   * useCallback, so any change in its identity would otherwise re-fire the
   * system photo picker while the user was already standing in it. The flag
   * clears on close, so the next open arms it again.
   */
  const toolFired = useRef(false);
  useEffect(() => {
    if (!open) {
      toolFired.current = false;
      return;
    }
    if (!initialTool || toolFired.current) return;
    toolFired.current = true;
    if (initialTool === "gif") {
      Keyboard.dismiss();
      setGifOpen(true);
    } else {
      void pickPhoto();
    }
  }, [open, initialTool, pickPhoto]);

  /**
   * Open a commenter's profile.
   *
   * The sheet is a Modal - its own native view hierarchy - so a profile opened
   * while it is up would be drawn underneath it. Closing first is what makes
   * the profile the thing you land on, and the keyboard is dismissed with it so
   * it does not outlive the sheet that owned it.
   */
  const openProfile = useCallback(
    (username: string) => {
      Keyboard.dismiss();
      onClose();
      // Pushed as a route rather than onto the creator layer: that layer is only
      // mounted for a profile swiped in from the feed, so pushing onto it from
      // here would add a card nothing is rendering. After the dismiss animation,
      // so the push is not competing with it.
      setTimeout(() => navigation.push("UserProfile", { username }), 220);
    },
    [onClose, navigation],
  );

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      /* Android back retires the emoji panel FIRST and the sheet only once the
         panel is down - the same one-layer-at-a-time rule the OS keyboard
         follows. Dismissing the whole sheet from an open panel would throw away
         a half-written comment on a single press. */
      onRequestClose={() => {
        if (emojiOpen) setEmojiOpen(false);
        else onClose();
      }}
      statusBarTranslucent
    >
      {/* A Modal is its own native view hierarchy, so the app-level
          GestureHandlerRootView in App.tsx does not reach inside it. Without
          this wrapper the pan handler never receives touches at all. */}
      <GestureHandlerRootView style={styles.root}>
      <View style={styles.root} accessibilityViewIsModal accessibilityRole="none">
        <Animated.View style={[styles.scrim, { opacity: drag.scrimOpacity }]}>
          {/* With the keyboard up, a tap out here means "put the keyboard away",
              not "throw away what I was typing". Only a second tap, once the
              keyboard is down, closes the sheet. */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => (kb > 0 ? Keyboard.dismiss() : onClose())}
            accessibilityLabel={kb > 0 ? "Dismiss keyboard" : "Close comments"}
          />
        </Animated.View>

        {/* Fixed height, fixed position - the keyboard is absorbed by padding
            inside, never by moving or resizing this. KeyboardAvoidingView is
            deliberately absent: a Modal never receives Android's adjustResize,
            so it had nothing to work with on either platform. */}
        <View style={{ height: restHeight }}>
          <PanGestureHandler
            onGestureEvent={drag.onGestureEvent}
            onHandlerStateChange={drag.onHandlerStateChange}
            // Only vertical intent starts a drag, and a clear horizontal swipe
            // gives up entirely, so the gesture never competes with taps.
            activeOffsetY={[-14, 14]}
            failOffsetX={[-28, 28]}
            // Both the sheet and the list see the gesture; the hook decides who
            // acts on it based on the list's scroll offset.
            simultaneousHandlers={listRef}
          >
          <Animated.View
            style={[
              styles.sheet,
              {
                height: restHeight,
                transform: [{ translateY: drag.translateY }],
              },
            ]}
          >
          {/* The keyboard lives here and nowhere else. Header and composer are
              fixed children; the list is the only flexible one, so it is the
              only thing that gives up height. */}
          <Animated.View style={{ flex: 1, paddingBottom: kbAnim }}>
          <View>
          <View style={styles.grabberWrap}>
            <View style={styles.grabber} />
          </View>

          <View style={styles.header}>
            <View style={{ width: 22 }} />
            <Text style={styles.headerTitle}>
              {fmt(total)} {total === 1 ? "comment" : "comments"}
            </Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <CloseGlyph />
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sortRow}
            keyboardShouldPersistTaps="handled"
          >
            {FILTERS.map((f) => {
              const on = f.key === filter;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => setFilter(f.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.sortChip, on && styles.sortChipOn]}
                >
                  <Text style={[styles.sortChipText, on && styles.sortChipTextOn]}>{f.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          </View>

          <View style={{ flex: 1 }}>
          {q.isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={ds.accent} />
            </View>
          ) : ordered.length === 0 ? (
            // Pressable, not a View: with no comments there is no list to drag,
            // so this is the only surface a tap can land on to put the keyboard
            // away. Nothing inside it is interactive, so it cannot steal a tap.
            <Pressable
              style={styles.empty}
              onPress={() => Keyboard.dismiss()}
              accessibilityRole="button"
              accessibilityLabel="Dismiss keyboard"
            >
              {/* User-supplied illustration (1024x1024 RGBA). */}
              <Image
                source={commentsDisabled ? COMMENTS_OFF_ART : EMPTY_ART}
                style={styles.emptyArt}
                contentFit="contain"
                transition={120}
              />
              <Text style={styles.emptyTitle}>
                {commentsDisabled
                  ? "Comments are turned off"
                  : comments.length === 0
                    ? "No comments yet"
                    : "Nothing matches this filter"}
              </Text>
              <Text style={styles.emptyBody}>
                {commentsDisabled
                  ? "The creator has turned off comments for this post."
                  : comments.length === 0
                  ? "Be the first to comment"
                  : "Try another filter above."}
              </Text>
            </Pressable>
          ) : (
            <GHFlatList
              ref={listRef}
              data={ordered}
              keyExtractor={(c) => String(c.id)}
              renderItem={({ item }) => (
                <CommentRow
                  c={item}
                  replies={threads[item.id]}
                  loadingReplies={loadingThread === item.id}
                  meId={me?.id ?? null}
                  onReact={react}
                  onReply={(c) => {
                    // Same rule as reacting/posting: replying is tied to an
                    // account, so a guest gets the login/signup gate too,
                    // replayed once signed in.
                    if (!me) {
                      gateGuest(() => { setReplyTo(c); inputRef.current?.focus(); });
                      return;
                    }
                    setReplyTo(c);
                    inputRef.current?.focus();
                  }}
                  onToggleReplies={toggleThread}
                  onOpenProfile={openProfile}
                  onOpenMedia={setViewerUri}
                  onReport={(c) => {
                    // Reporting needs an account, same as reply/react/gift
                    // above - was the one action in this row left ungated.
                    if (!me) {
                      gateGuest(() => setReportingCommentId(c.id));
                      return;
                    }
                    setReportingCommentId(c.id);
                  }}
                />
              )}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              // "handled" keeps taps on a row's own buttons working while a tap
              // on dead space still drops the keyboard; dragging the list drops
              // it too, which is the gesture Instagram trains people to use.
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              // The padded box above already accounts for the keyboard. Letting
              // iOS add its own inset on top would scroll the list on focus -
              // the one thing this must never do.
              automaticallyAdjustKeyboardInsets={false}
              contentInsetAdjustmentBehavior="never"
              scrollEventThrottle={16}
              onScroll={(e) => drag.onListScroll(e.nativeEvent.contentOffset.y)}
              onEndReachedThreshold={0.5}
              onEndReached={() => {
                if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
              }}
              ListFooterComponent={
                q.isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: 16 }} color={ds.textMuted} /> : null
              }
            />
          )}

          {/* Tap-outside-to-close, mounted ONLY while the panel is up.
              Absolute-fill over the comment list and rendered after it, so it
              takes the first tap anywhere above the composer. Rendering it
              always - even transparent - would swallow every scroll and tap on
              the comments themselves, so its existence is the whole guard. */}
          {emojiOpen && (
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setEmojiOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close emoji panel"
            />
          )}

          </View>

          <View style={styles.composerWrap}>
            {hideComposerForGuest && !me ? (
            /* Feed page's request: a guest typing into the live composer here
               could freeze the app, so on the feed a guest gets a "Log in to
               comment" prompt instead of the TextInput - comments stay
               readable, only the composer (and everything that mounts with
               it: emoji row, pickers) is withheld. Tapping it opens the same
               login/signup gate every other guest-only action here uses,
               replaying focus into the input once signed in. */
            <View style={[styles.composer, styles.guestBar, { paddingBottom: 10 + insets.bottom }]}>
              <InfoGlyph />
              <Text style={styles.guestComposerText} numberOfLines={1}>
                Log in or sign up to interact
              </Text>
              <Pressable
                style={styles.guestLoginBtn}
                onPress={() => gateGuest(() => inputRef.current?.focus())}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel="Log in"
              >
                <Text style={styles.guestLoginBtnText}>Log in</Text>
              </Pressable>
            </View>
            ) : (
            <>
            {/* Stands down while something is attached or the emoji panel is up.
                It is a shortcut, and it is competing for height with the thing
                that actually matters at that moment - the input. Dropping it
                buys back a row so a staged GIF cannot push the text field out
                of a fixed-height sheet. */}
            {!gif && !photo && !emojiOpen && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.emojiRow}
              keyboardShouldPersistTaps="handled"
            >
              {QUICK_EMOJI.map((e) => (
                <Pressable key={e} onPress={() => insertEmoji(e)} hitSlop={4} accessibilityRole="button">
                  <Emoji emoji={e} size={22} style={styles.emoji} />
                </Pressable>
              ))}
            </ScrollView>
            )}

            {/* Staged attachments - shown before posting so either can be
                removed without clearing the text beside it. The endpoint takes
                a GIF and a photo on the same comment, so both can sit here. */}
            {(!!gif || !!photo) && (
              <View style={styles.stageRow}>
                {!!gif && (
                  <View>
                    <Image source={{ uri: gif.previewUrl }} style={styles.stageImg} contentFit="cover" transition={120} />
                    <Pressable
                      onPress={() => setGif(null)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Remove GIF"
                      style={styles.stageX}
                    >
                      <CloseGlyph />
                    </Pressable>
                  </View>
                )}
                {!!photo && (
                  <View>
                    <Image source={{ uri: photo.uri }} style={styles.stageImg} contentFit="cover" transition={120} />
                    <Pressable
                      onPress={() => setPhoto(null)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Remove photo"
                      style={styles.stageX}
                    >
                      <CloseGlyph />
                    </Pressable>
                  </View>
                )}
              </View>
            )}

            {!!replyTo && (
              <View style={styles.replyBanner}>
                <Text style={styles.replyBannerText} numberOfLines={1}>
                  Replying to {replyTo.user?.username ?? "comment"}
                </Text>
                <Pressable onPress={() => setReplyTo(null)} hitSlop={8} accessibilityRole="button">
                  <CloseGlyph />
                </Pressable>
              </View>
            )}

            {/* The home-indicator inset is only real when the keyboard is down;
                with it up the keyboard already owns that strip, and adding it
                pushed the composer back under the keyboard on iOS. */}
            {/* The inset belongs to whatever is bottom-most. With the keyboard
                or the emoji panel up, that is no longer this row, and applying
                it here too would open a dead gap between the composer and the
                panel. */}
            <View
              style={[
                styles.composer,
                { paddingBottom: 10 + (kb > 0 || emojiOpen ? 0 : insets.bottom) },
              ]}
            >
              {/* No fallback avatar for a guest - there's no account for the
                  blank circle to stand in for. */}
              {me && <Avatar uri={me.avatar ?? null} size={32} />}
              <View style={styles.inputWrap}>
                <TextInput
                  ref={inputRef}
                  value={draft}
                  /* Sanitised on the way IN, not on submit: a lone surrogate
                     from a bad paste cannot be encoded as UTF-8, so Postgres
                     rejects the whole insert - one broken half-emoji would
                     otherwise fail the entire comment. */
                  onChangeText={(t) => setDraft(sanitizeUnicode(t))}
                  onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
                  placeholder={replyTo ? "Add reply..." : "Add comment..."}
                  placeholderTextColor={ds.textMuted}
                  style={styles.input}
                  multiline
                  maxLength={1000}
                  onFocus={() => setTyping(true)}
                  onBlur={() => setTyping(false)}
                />

                {/* Opens the full picker - all nine categories, search, recents
                    and frequently-used - rather than pasting one hard-coded 😂,
                    which is what this button did before. The keyboard is
                    dismissed first so the sheet is not pushed off screen. */}
                <Pressable
                  onPress={() => {
                    // Same rule as posting: these are per-account actions, so a
                    // guest gets the login/signup gate, replayed after login.
                    if (!me) {
                      gateGuest(() => { Keyboard.dismiss(); setEmojiOpen(true); });
                      return;
                    }
                    // Toggles, and dismisses the keyboard on the way in: the two
                    // want the same strip of screen, so showing both would
                    // stack them and push the composer off the top.
                    if (emojiOpen) setEmojiOpen(false);
                    else { Keyboard.dismiss(); setEmojiOpen(true); }
                  }}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityLabel={emojiOpen ? "Close emoji panel" : "Emoji"}
                  style={styles.tool}
                >
                  <SmileGlyph />
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (!me) {
                      gateGuest(() => { Keyboard.dismiss(); setGifOpen(true); });
                      return;
                    }
                    Keyboard.dismiss();
                    setGifOpen(true);
                  }}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityLabel="Add a GIF"
                  style={styles.tool}
                >
                  <GifGlyph color={gif ? ds.accent : ds.textDim} />
                </Pressable>
                <Pressable
                  onPress={pickPhoto}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityLabel="Add a photo"
                  style={styles.tool}
                >
                  <ImageGlyph color={photo ? ds.accent : ds.textDim} />
                </Pressable>
                {/* Gift, where the "@" used to be. The mention button only
                    typed an "@" into the box - something the keyboard already
                    does - so the slot is better spent on the gift picker.
                    Only offered once the creator has unlocked Gifts & Coins -
                    see giftsEligibleQuery above. */}
                {!!creator && giftsEligible && (
                  <Pressable
                    onPress={() => {
                      if (!me) {
                        gateGuest(() => setGiftOpen(true));
                        return;
                      }
                      setGiftOpen(true);
                    }}
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel="Send a gift"
                    style={styles.tool}
                  >
                    <GiftGlyph />
                  </Pressable>
                )}
              </View>
              <Pressable onPress={submit} disabled={!canPost} hitSlop={8} accessibilityRole="button">
                {sending ? (
                  <ActivityIndicator size="small" color={ds.accent} />
                ) : (
                  <SendGlyph color={canPost ? ds.accent : ds.silverSoft} />
                )}
              </Pressable>
            </View>
            </>
            )}
          </View>

          {/* Sits BELOW the composer and takes real layout space, exactly where
              the keyboard was - so the input stays visible above it and nothing
              overlaps. The modal picker covered the composer, which hid the very
              box the emoji was going into.

              The list is the only flexible child in here, so it is the only
              thing that gives up height for this - the same way it gives it up
              for the keyboard. */}
          {/* The inset is applied ONLY while the panel is actually up.
              Unconditionally was a bug: the composer above keeps its own
              insets.bottom whenever the panel is closed, so the safe area was
              being reserved twice - once by the composer and again by this
              box - and the second one showed as dead space under the input. */}
          <Animated.View
            style={{
              height: emojiAnim,
              overflow: "hidden",
              // Keyed on emojiOpen, not on the mount: the panel now STAYS
              // mounted between openings, so a mount-keyed inset would be
              // applied permanently and put the gap back under the composer.
              paddingBottom: emojiOpen ? insets.bottom : 0,
            }}
          >
            {panelMounted && (
              <EmojiPanel
                onPick={insertEmoji}
                onBackspace={backspace}
                onClose={() => setEmojiOpen(false)}
                dark={false}
              />
            )}
          </Animated.View>
          </Animated.View>
          </Animated.View>
          </PanGestureHandler>
        </View>

        {/*
          Full-screen viewer for a comment's photo or GIF.

          Inside this Modal for the same reason as the sheets below it: only one
          modal presents at a time, so a sibling would never appear.

          contentFit="contain", not "cover" - the thumbnail crops to a square
          because it has to sit in a list, but the whole point of opening it is
          to see the parts the crop hid.

          Three ways out, and the backdrop is one of them: a tap anywhere that
          is not the image closes it, which is what people try first.
        */}
        {!!viewerUri && (
          <Modal
            visible
            transparent
            animationType="fade"
            onRequestClose={() => setViewerUri(null)}
            statusBarTranslucent
          >
            <Pressable style={styles.viewerBackdrop} onPress={() => setViewerUri(null)}>
              <Image
                source={{ uri: viewerUri }}
                style={styles.viewerImage}
                contentFit="contain"
                transition={140}
              />
            </Pressable>
            <Pressable
              onPress={() => setViewerUri(null)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close photo"
              style={[styles.viewerClose, { top: insets.top + 12 }]}
            >
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                <Path d="m18 6-12 12M6 6l12 12" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round"/>
              </Svg>
            </Pressable>
          </Modal>
        )}

        {/* Inside this Modal on purpose: only one modal presents at a time, so
            a sibling sheet opened from here would never appear. */}
        <GiftSheet
          visible={giftOpen}
          receiver={creator ?? null}
          videoId={videoId ?? undefined}
          onClose={() => setGiftOpen(false)}
        />

        {/* Inside this Modal for the same reason as the gift sheet: only one
            modal presents at a time, so a sibling would never appear. */}
        <GifPicker
          visible={gifOpen}
          onClose={() => setGifOpen(false)}
          onPick={(g) => { setGif(g); setGifOpen(false); }}
        />

        {/* Inside this Modal for the same reason as the gift sheet and the
            GIF picker above. */}
        <ReportSheet
          visible={reportingCommentId != null}
          entityType="comment"
          entityId={reportingCommentId}
          onClose={() => setReportingCommentId(null)}
        />

      </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  // Transparent: TikTok does not dim the video behind the sheet. The layer
  // stays for its tap-outside-to-close Pressable.
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "transparent" },
  sheet: {
    backgroundColor: ds.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    overflow: "hidden",
  },
  grabberWrap: { paddingTop: 11, paddingBottom: 8, alignItems: "center" },
  grabber: { width: 38, height: 4, borderRadius: 2, backgroundColor: "#DDD9E1" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ds.lineSoft,
  },
  headerTitle: { fontSize: 14, fontWeight: "700", color: ds.text },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  // overflow:hidden is the backstop - with the keyboard up this box gets much
  // shorter, and anything that cannot fit must be clipped here rather than
  // spilling upward over the filter chips.
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30, gap: 5, overflow: "hidden" },
  // Negative margin cancels the container's row gap so the copy sits directly
  // under the art rather than floating away from it.
  //
  // flexShrink + maxHeight are what actually fix the overlap: at 300x300 fixed
  // the art could not shrink, so once the keyboard shortened this box it
  // overflowed straight into the chip row above. contentFit="contain" keeps it
  // undistorted as the box gets smaller.
  emptyArt: { width: 300, height: 300, maxHeight: "58%", flexShrink: 1, opacity: 0.92, marginBottom: -8 },
  emptyTitle: { fontSize: 15.5, fontWeight: "700", color: ds.text },
  emptyBody: { fontSize: 13, color: ds.textFaint, textAlign: "center", lineHeight: 19 },

  sortRow: { gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 2 },
  // Rounded rectangle, not a pill - matches the reference button shape.
  sortChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: ds.surfaceSunken },
  sortChipOn: { backgroundColor: ds.text },
  sortChipText: { fontSize: 13, fontWeight: "600", color: ds.slate },
  sortChipTextOn: { color: ds.onDark },

  list: { padding: 16, paddingBottom: 8, gap: 18 },
  commentBlock: { gap: 10 },
  commentRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  commentBody: { flex: 1, gap: 5, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  name: { fontSize: 12.5, color: ds.textMuted },
  creatorBadge: { backgroundColor: "rgba(47,182,240,0.12)", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  creatorBadgeText: { fontSize: 9.5, fontWeight: "700", letterSpacing: 0.5, color: ds.info },
  rankBadge: { backgroundColor: ds.accentWash, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  rankBadgeText: { fontSize: 9.5, fontWeight: "700", letterSpacing: 0.5, color: ds.accent },
  text: { fontSize: 14, color: ds.text, lineHeight: 20 },
  media: { width: 132, height: 132, borderRadius: 12, backgroundColor: ds.line },

  /* Full-screen media viewer. Near-black rather than pure, so the image's own
     edges stay distinguishable from the backdrop on an OLED panel. */
  viewerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.94)", alignItems: "center", justifyContent: "center" },
  viewerImage: { width: "100%", height: "82%" },
  viewerClose: {
    position: "absolute",
    right: 16,
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },

  /* Gift comment - tinted so it reads as an event in the thread, not a remark. */
  giftBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: ds.accentWash,
    marginTop: 2,
  },
  giftFallback: { fontSize: 30 },
  giftName: { fontSize: 13, fontWeight: "800", color: ds.accent },
  giftCoins: { fontSize: 11.5, color: ds.textDim, marginTop: 1 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  time: { fontSize: 11.5, color: ds.textFaint },
  reply: { fontSize: 11.5, color: ds.textDim, fontWeight: "600" },
  report: { fontSize: 11.5, color: ds.textFaint, fontWeight: "600" },
  pinned: { fontSize: 11, color: ds.accent, fontWeight: "600" },
  moreRepliesRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  moreReplies: { fontSize: 11.5, color: ds.textDim, fontWeight: "600" },

  // marginLeft: "auto" pins this to the meta row's right edge - Time/Reply/
  // Report/Pinned/edited stay left-packed, this floats to the far side of
  // the same row instead of sitting inline right after them.
  reactCol: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 0, marginLeft: "auto" },
  replyReactCol: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 0, marginLeft: "auto" },

  thread: { marginLeft: 46, gap: 10 },
  replyRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  replyBody: { flex: 1, gap: 4, minWidth: 0 },
  replyName: { fontSize: 12, color: ds.textMuted },
  replyText: { fontSize: 13.5, color: ds.text, lineHeight: 19 },
  timeSm: { fontSize: 11, color: ds.textFaint },
  replySm: { fontSize: 11, color: ds.textDim, fontWeight: "600" },
  reportSm: { fontSize: 11, color: ds.textFaint, fontWeight: "600" },
  reactBtn: { alignItems: "center", gap: 4, flexDirection: "row" },
  reactCount: { fontSize: 11, color: ds.textFaint },

  composerWrap: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ds.lineSoft, backgroundColor: ds.surface },
  /** Staged attachments sit on their own line above the input, so a long
   *  caption typed beside them never squeezes the thumbnails. */
  stageRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 8 },
  /* 64, not 96. The sheet is a FIXED height and the composer does not shrink,
     so everything stacked above it competes for the same space: with a keyboard
     up, a 96pt preview plus the quick-emoji row pushed the input past the
     bottom edge and the user could not see what they were typing. 64 still
     reads clearly as the thing you attached. */
  stageImg: { width: 64, height: 64, borderRadius: 10, backgroundColor: "#E7E4EA" },
  stageX: {
    position: "absolute", top: 4, right: 4,
    width: 22, height: 22, borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center",
  },

  emojiRow: { gap: 12, paddingHorizontal: 16, paddingTop: 10 },
  emoji: { fontSize: 20 },
  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 10,
  },
  replyBannerText: { flex: 1, fontSize: 12, color: ds.textMuted },
  composer: { flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 16, paddingTop: 10 },
  guestBar: { paddingRight: 12 },
  guestComposerText: { flex: 1, fontSize: 13.5, color: ds.textMuted, fontWeight: "600" },
  // marginLeft: "auto" pins the button to the bar's right edge, same
  // reasoning as reactCol/replyReactCol above.
  guestLoginBtn: {
    marginLeft: "auto", backgroundColor: ds.accent,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999,
  },
  guestLoginBtnText: { fontSize: 13, fontWeight: "700", color: ds.onDark },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: ds.surfaceSunken,
    borderRadius: 10,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    minWidth: 0,
  },
  input: { flex: 1, fontSize: 13.5, color: ds.text, maxHeight: 96, padding: 0, minWidth: 0 },
  tool: { width: 28, height: 28, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  toolOff: { opacity: 0.55 },
});
