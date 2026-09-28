import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Linking, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { Image } from "expo-image";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import {
  Ban, CheckCheck, ChevronLeft, ChevronRight, EyeOff, Film, Funnel, Heart, Info,
  MessageSquare, MoreHorizontal, Pin, Plus, ShieldAlert, Trash2, Type, Users, X,
} from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BottomSheet } from "@/components/BottomSheet";
import { Skeleton } from "@/components/Skeleton";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { MenuRow, MenuDivider } from "@/components/sheet/MenuRow";
import { GiftSheet } from "@/components/feed/GiftSheet";
import { CommentThreadSheet, Avatar } from "./CommentThreadSheet";
import {
  studioCommentsApi,
  type BulkAction, type CommentContent, type CommentFilter, type StudioComment,
} from "@/api/studio-comments.api";
import { videoApi } from "@/api/video.api";
import { profileApi, type CommentPrivacy } from "@/api/profile.api";
import { apiErrorMessage } from "@/api/client";
import { usePlayerStore } from "@/store/player.store";
import { useSavedRepliesStore } from "@/store/saved-replies.store";
import { sd, sr } from "./studio-design";
import { font, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";
import { formatCompact, relativeTime, useRelativeTimeTick } from "@/utils/format";

/** Where the website keeps the two moderation lists the app has no screen for. */
const WEB = "https://teezer.live";

/* ── List mode: which posts to show ───────────────────────────────────────── */
type PostTab = "all" | "needs_reply" | "flagged";
const POST_TABS: { key: PostTab; label: string }[] = [
  { key: "all", label: "All videos" },
  { key: "needs_reply", label: "Needs reply" },
  { key: "flagged", label: "Flagged" },
];

/* ── Thread mode: the six server-derived statuses, which partition exactly ── */
const COMMENT_TABS: { key: CommentFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "needs_reply", label: "Needs reply" },
  { key: "replied", label: "Replied" },
  { key: "held", label: "Held" },
  { key: "spam", label: "Spam" },
];

const WHO_CAN_COMMENT: { value: CommentPrivacy; label: string }[] = [
  { value: "everyone", label: "Everyone" },
  { value: "followers", label: "Followers" },
  { value: "no_one", label: "No one" },
];
const WHO_LABEL: Record<CommentPrivacy, string> = {
  everyone: "Everyone",
  followers: "Followers",
  no_one: "No one",
};

/** "412K views · posted 2 days ago" - the card's second line. */
function postMeta(p: CommentContent): string {
  const views = `${formatCompact(p.views_count)} view${p.views_count === 1 ? "" : "s"}`;
  const when = p.created_at ? relativeTime(p.created_at).toLowerCase() : "";
  return when ? `${views} · posted ${when}` : views;
}

/** 1.4 → "1.4h", 26 → "1.1d", null → "—". */
function responseLabel(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 24) return `${Math.round(hours * 10) / 10}h`;
  return `${Math.round((hours / 24) * 10) / 10}d`;
}

/**
 * Reelsoo Studio › Comments, drawn to the Claude Design prototype
 * ("ReelSoo App.dc.html", the `studioIsComments` panel).
 *
 * Two modes, exactly as the prototype has them: `cmtListMode` groups the inbox
 * by post, and `cmtThreadMode` opens one post's comments. Grouping by post is
 * why /studio/comments/contents now returns per-post counts - a card's numbers
 * are aggregated over the same rows the thread lists, so the badge on a card
 * and the tabs inside it can never disagree.
 */
export function StudioCommentsSection() {
  const [openPost, setOpenPost] = useState<CommentContent | null>(null);

  return openPost
    ? <ThreadMode post={openPost} onBack={() => setOpenPost(null)} />
    : <ListMode onOpen={setOpenPost} />;
}

/* ══════════════════════════════════════════════════════════════════════════
   List mode - the creator's posts, grouped
   ══════════════════════════════════════════════════════════════════════════ */
function ListMode({ onOpen }: { onOpen: (p: CommentContent) => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<PostTab>("all");
  const [whoOpen, setWhoOpen] = useState(false);
  useRelativeTimeTick();

  const statsQ = useQuery({
    queryKey: ["studio-comment-stats"],
    queryFn: () => studioCommentsApi.stats(),
    staleTime: 30_000,
  });

  const postsQ = useQuery({
    queryKey: ["studio-comment-contents"],
    queryFn: () => studioCommentsApi.contents(),
    staleTime: 30_000,
  });

  const privacyQ = useQuery({
    queryKey: ["privacy-settings"],
    queryFn: profileApi.getPrivacy,
    staleTime: 60_000,
  });

  const refresh = () => { postsQ.refetch(); statsQ.refetch(); };

  const onErr = (verb: string) => (e: unknown) =>
    Alert.alert(`Couldn't ${verb}`, apiErrorMessage(e, "Please try again."));

  const readAllM = useMutation({
    mutationFn: studioCommentsApi.markAllSeen,
    onSuccess: refresh,
    onError: onErr("mark all read"),
  });

  const privacyM = useMutation({
    mutationFn: (patch: Parameters<typeof profileApi.updatePrivacy>[0]) => profileApi.updatePrivacy(patch),
    onSuccess: (data) => qc.setQueryData(["privacy-settings"], data),
    onError: onErr("save that"),
  });

  const posts = postsQ.data ?? [];
  const stats = statsQ.data;
  const privacy = privacyQ.data;

  const waiting = useMemo(() => posts.filter((p) => p.unreplied_count > 0), [posts]);
  const flaggedPosts = useMemo(() => posts.filter((p) => p.flagged_count > 0), [posts]);

  const shown = tab === "needs_reply" ? waiting : tab === "flagged" ? flaggedPosts : posts;
  const countFor = (k: PostTab) =>
    k === "all" ? posts.length : k === "needs_reply" ? waiting.length : flaggedPosts.length;

  /* The reply rate is measured against what you could actually answer: spam and
     held comments are not yours to reply to, so hiding junk can't flatter it. */
  const replyRate = useMemo(() => {
    if (!stats) return null;
    const answerable = stats.replied + stats.unread + stats.needs_reply;
    return answerable > 0 ? Math.round((stats.replied / answerable) * 100) : 0;
  }, [stats]);

  /* "Start replying" opens whichever post has been waiting longest - the list
     is newest-comment-first, so that is the last one still owing a reply. */
  const startReplying = () => {
    if (!waiting.length) {
      Alert.alert("All caught up", "No video is waiting on a reply right now.");
      return;
    }
    onOpen(waiting[waiting.length - 1]);
  };

  const modRows: {
    key: string; icon: any; label: string; sub: string;
    toggle?: boolean; on?: boolean; onPress: () => void;
  }[] = [
    {
      key: "filter",
      icon: Funnel,
      label: "Filter offensive comments",
      sub: "Hide likely spam and slurs",
      toggle: true,
      on: privacy?.comment_filter ?? false,
      onPress: () => privacy && privacyM.mutate({ comment_filter: !privacy.comment_filter }),
    },
    {
      key: "words",
      icon: Type,
      label: "Keyword filters",
      sub: "Words and phrases to hide",
      onPress: () => Linking.openURL(`${WEB}/settings/hidden-words`),
    },
    {
      key: "who",
      icon: Users,
      label: "Who can comment",
      sub: privacy ? WHO_LABEL[privacy.who_can_comment] : "…",
      onPress: () => setWhoOpen(true),
    },
    {
      key: "blocked",
      icon: Ban,
      label: "Blocked accounts",
      sub: "People who can't comment on your posts",
      onPress: () => Linking.openURL(`${WEB}/settings/blocked`),
    },
    {
      key: "read",
      icon: CheckCheck,
      label: "Mark everything read",
      sub: stats ? (stats.unread > 0 ? `${stats.unread} unread` : "Nothing unread") : "…",
      onPress: () => stats?.unread && readAllM.mutate(),
    },
  ];

  return (
    <View style={styles.root}>
      <FlatList
        data={shown}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={postsQ.isFetching && !postsQ.isLoading}
            onRefresh={refresh}
            tintColor={sd.accent}
          />
        }
        ListHeaderComponent={
          <View>
            {/* ── Hero ─────────────────────────────────────────────────── */}
            <View style={styles.hero}>
              <Svg width={230} height={230} style={styles.glow} pointerEvents="none">
                <Defs>
                  <RadialGradient id="cmtGlow" cx="50%" cy="50%" r="50%">
                    <Stop offset="0" stopColor={sd.accent} stopOpacity={0.28} />
                    <Stop offset="0.66" stopColor={sd.accent} stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Circle cx={115} cy={115} r={115} fill="url(#cmtGlow)" />
              </Svg>

              <View style={styles.heroTop}>
                <View style={styles.heroLead}>
                  <Text style={styles.heroLabel}>Videos waiting on you</Text>
                  {postsQ.isLoading
                    ? <Skeleton width={62} height={38} radius={8} />
                    : <Text style={styles.heroValue}>{waiting.length}</Text>}
                </View>
                <Pressable
                  style={({ pressed }) => [styles.heroCta, pressed && { opacity: 0.85 }]}
                  onPress={startReplying}
                >
                  <Text style={styles.heroCtaText}>Start replying</Text>
                </Pressable>
              </View>

              <View style={styles.strip}>
                <StripCell
                  value={stats ? formatCompact(stats.unread) : null}
                  label="New comments"
                />
                <StripCell value={replyRate === null ? null : `${replyRate}%`} label="Reply rate" divider />
                <StripCell
                  value={stats ? responseLabel(stats.avg_response_hours) : null}
                  label="Avg. response"
                  divider
                />
              </View>
            </View>

            {/* ── Which posts ──────────────────────────────────────────── */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tabScroll}
              contentContainerStyle={[styles.tabRow, { paddingTop: 14 }]}
            >
              {POST_TABS.map((t) => {
                const on = t.key === tab;
                return (
                  <Pressable
                    key={t.key}
                    style={[styles.tab, on && styles.tabOn]}
                    onPress={() => setTab(t.key)}
                  >
                    <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
                    {!postsQ.isLoading && (
                      <View style={[styles.tabCount, on && styles.tabCountOn]}>
                        <Text style={[styles.tabCountText, on && styles.tabCountTextOn]}>
                          {countFor(t.key)}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          postsQ.isLoading ? (
            <View style={{ gap: 9, paddingTop: 8 }}>
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={136} radius={18} />)}
            </View>
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <MessageSquare size={24} color="#C7C2CE" strokeWidth={1.9} />
              </View>
              <Text style={styles.emptyTitle}>Nothing here</Text>
              <Text style={styles.emptySub}>
                {tab === "all"
                  ? "When people comment on your videos, the posts show up here."
                  : "No videos match this filter."}
              </Text>
            </View>
          )
        }
        renderItem={({ item: p }) => <PostCard post={p} onPress={() => onOpen(p)} />}
        ListFooterComponent={
          <View>
            <Text style={styles.sectionLabel}>Moderation</Text>
            <View style={styles.modCard}>
              {modRows.map((m, i) => {
                const Icon = m.icon;
                return (
                  <Pressable
                    key={m.key}
                    style={[styles.modRow, i === modRows.length - 1 && styles.modRowLast]}
                    onPress={m.onPress}
                  >
                    <View style={styles.modIcon}>
                      <Icon size={16} color={sd.slate} strokeWidth={2.1} />
                    </View>
                    <View style={styles.modBody}>
                      <Text style={styles.modLabel} numberOfLines={1}>{m.label}</Text>
                      <Text style={styles.modSub} numberOfLines={1}>{m.sub}</Text>
                    </View>
                    {m.toggle ? (
                      <View style={[styles.track, m.on && styles.trackOn]}>
                        <View style={[styles.knob, m.on && styles.knobOn]} />
                      </View>
                    ) : (
                      <ChevronRight size={15} color="#C7C2CE" strokeWidth={2.2} />
                    )}
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.note}>
              <Info size={14} color={sd.faint} strokeWidth={1.9} />
              <Text style={styles.noteText}>
                Hidden comments stay visible to their author only. Filtered words never reach your feed.
              </Text>
            </View>
          </View>
        }
      />

      <BottomSheet visible={whoOpen} onClose={() => setWhoOpen(false)} scrollable={false}>
        <View style={styles.sheetPad}>
          <Text style={styles.sheetTitle}>Who can comment</Text>
          {WHO_CAN_COMMENT.map((o) => (
            <MenuRow
              key={o.value}
              icon="chatbubbles-outline"
              title={o.label}
              active={privacy?.who_can_comment === o.value}
              onPress={() => { privacyM.mutate({ who_can_comment: o.value }); setWhoOpen(false); }}
            />
          ))}
        </View>
      </BottomSheet>
    </View>
  );
}

/* ── One post card ─────────────────────────────────────────────────────────── */
function PostCard({ post: p, onPress }: { post: CommentContent; onPress: () => void }) {
  const preview = p.latest_comment;

  return (
    <Pressable
      style={({ pressed }) => [styles.postCard, pressed && { opacity: 0.92 }]}
      onPress={onPress}
    >
      <View style={styles.postTop}>
        <View style={styles.thumbWrap}>
          {p.thumbnail_url
            ? <Image source={p.thumbnail_url} style={styles.thumb} contentFit="cover" transition={150} />
            : <View style={[styles.thumb, styles.thumbFallback]}><Film size={18} color={sd.faint} /></View>}
          {p.unreplied_count > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>
                {p.unreplied_count > 99 ? "99+" : p.unreplied_count}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.postBody}>
          <Text style={styles.postCaption} numberOfLines={1}>{p.title}</Text>
          <Text style={styles.postMeta} numberOfLines={1}>{postMeta(p)}</Text>
          <View style={styles.chipRow}>
            <View style={styles.countChip}>
              <Text style={styles.countChipText}>
                {p.inbox_count} comment{p.inbox_count === 1 ? "" : "s"}
              </Text>
            </View>
            {p.flagged_count > 0 && (
              <View style={styles.flaggedChip}>
                <Text style={styles.flaggedChipText}>{p.flagged_count} flagged</Text>
              </View>
            )}
          </View>
        </View>

        <ChevronRight size={16} color="#C7C2CE" strokeWidth={2.2} />
      </View>

      {!!preview && (
        <View style={styles.preview}>
          <Avatar uri={preview.avatar} name={preview.name} size={26} />
          <View style={styles.previewBody}>
            <Text style={styles.previewName} numberOfLines={1}>{preview.name}</Text>
            <Text style={styles.previewText} numberOfLines={1}>{preview.body || "Sent an attachment"}</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Thread mode - one post's comments
   ══════════════════════════════════════════════════════════════════════════ */
function ThreadMode({ post, onBack }: { post: CommentContent; onBack: () => void }) {
  const navigation = useNavigation<any>();
  const [filter, setFilter] = useState<CommentFilter>("all");
  const [thread, setThread] = useState<StudioComment | null>(null);
  const [actionsFor, setActionsFor] = useState<StudioComment | null>(null);
  const [giftTo, setGiftTo] = useState<StudioComment | null>(null);
  const [replyEditor, setReplyEditor] = useState<{ id?: string; body: string } | null>(null);
  const [opening, setOpening] = useState(false);

  // Long-press enters bulk mode, so a plain tap stays "open the thread". It is
  // invisible until you long-press, which is why the design never shows it.
  const [picked, setPicked] = useState<number[]>([]);
  const selecting = picked.length > 0;

  /* Overrides the server's `current_user_reaction` for comments reacted to in
     this session, so the heart flips instantly without a refetch. */
  const [reactions, setReactions] = useState<Record<number, { loved: boolean; count: number }>>({});

  const savedReplies = useSavedRepliesStore((s) => s.replies);
  const hydrateReplies = useSavedRepliesStore((s) => s.hydrate);
  const saveReply = useSavedRepliesStore((s) => s.save);
  const removeReply = useSavedRepliesStore((s) => s.remove);
  useEffect(() => { void hydrateReplies(); }, [hydrateReplies]);
  useRelativeTimeTick();

  const statsQ = useQuery({
    queryKey: ["studio-comment-stats", post.id],
    queryFn: () => studioCommentsApi.stats(post.id),
    staleTime: 30_000,
  });

  const listQ = useQuery({
    queryKey: ["studio-comments", post.id, filter],
    queryFn: () =>
      studioCommentsApi.list({ content_id: post.id, status: filter, sort: "newest", per_page: 30 }),
    staleTime: 30_000,
  });

  const refresh = () => { listQ.refetch(); statsQ.refetch(); };

  const onErr = (verb: string) => (e: unknown) =>
    Alert.alert(`Couldn't ${verb}`, apiErrorMessage(e, "Please try again."));

  const actM = useMutation({
    mutationFn: ({ id, verb }: { id: number; verb: Parameters<typeof studioCommentsApi.act>[1] }) =>
      studioCommentsApi.act(id, verb),
    onSuccess: refresh,
    onError: onErr("do that"),
  });

  const removeM = useMutation({
    mutationFn: (id: number) => studioCommentsApi.remove(id),
    onSuccess: refresh,
    onError: onErr("delete"),
  });

  const reactM = useMutation({
    mutationFn: (id: number) => videoApi.reactComment(id, "love"),
    onSuccess: (r, id) =>
      setReactions((m) => ({ ...m, [id]: { loved: r.current_user_reaction === "love", count: r.love_count } })),
    onError: onErr("react"),
  });

  const bulkM = useMutation({
    mutationFn: ({ action, ids }: { action: BulkAction; ids: number[] }) =>
      studioCommentsApi.bulk(action, ids),
    onSuccess: () => { setPicked([]); refresh(); },
    onError: onErr("do that"),
  });

  const toggle = (id: number) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const confirmDelete = (c: StudioComment) =>
    Alert.alert("Delete comment", "This removes the comment and every reply under it. It can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => removeM.mutate(c.id) },
    ]);

  const openPost = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const video = await videoApi.get(post.id);
      usePlayerStore.getState().setPlaylist([video], 0);
      navigation.navigate("VideoPlayer");
    } catch (e) {
      Alert.alert("Couldn't open that post", apiErrorMessage(e, "Please try again."));
    } finally {
      setOpening(false);
    }
  };

  const stats = statsQ.data;
  const comments = listQ.data?.data ?? [];

  return (
    <View style={styles.root}>
      <FlatList
        data={comments}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={listQ.isFetching && !listQ.isLoading}
            onRefresh={refresh}
            tintColor={sd.accent}
          />
        }
        ListHeaderComponent={
          <View>
            <Pressable style={styles.back} onPress={onBack} hitSlop={8}>
              <ChevronLeft size={16} color={sd.text} strokeWidth={2.3} />
              <Text style={styles.backText}>All videos</Text>
            </Pressable>

            {/* ── Which post you are in ────────────────────────────────── */}
            <View style={styles.postHead}>
              {post.thumbnail_url
                ? <Image source={post.thumbnail_url} style={styles.headThumb} contentFit="cover" transition={150} />
                : <View style={[styles.headThumb, styles.thumbFallback]}><Film size={16} color={sd.faint} /></View>}
              <View style={styles.postBody}>
                <Text style={styles.headCaption} numberOfLines={1}>{post.title}</Text>
                <Text style={styles.postMeta} numberOfLines={1}>{postMeta(post)}</Text>
              </View>
              <Pressable style={styles.viewBtn} onPress={openPost} disabled={opening}>
                {opening
                  ? <ActivityIndicator size="small" color={sd.text} />
                  : <Text style={styles.viewBtnText}>View</Text>}
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tabScroll}
              contentContainerStyle={[styles.tabRow, { paddingTop: 14 }]}
            >
              {COMMENT_TABS.map((t) => {
                const on = t.key === filter;
                const n = stats?.[t.key];
                return (
                  <Pressable
                    key={t.key}
                    style={[styles.tab, on && styles.tabOn]}
                    onPress={() => setFilter(t.key)}
                  >
                    <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
                    {n !== undefined && (
                      <View style={[styles.tabCount, on && styles.tabCountOn]}>
                        <Text style={[styles.tabCountText, on && styles.tabCountTextOn]}>
                          {n > 99 ? "99+" : n}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          listQ.isLoading ? (
            <View style={{ gap: 9, paddingTop: 8 }}>
              {[0, 1, 2].map((i) => <Skeleton key={i} height={168} radius={18} />)}
            </View>
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <MessageSquare size={24} color="#C7C2CE" strokeWidth={1.9} />
              </View>
              <Text style={styles.emptyTitle}>Nothing here</Text>
              <Text style={styles.emptySub}>No comments match this filter.</Text>
            </View>
          )
        }
        renderItem={({ item: c }) => (
          <CommentCard
            c={c}
            reaction={reactions[c.id]}
            selected={picked.includes(c.id)}
            selecting={selecting}
            onPress={() => selecting && toggle(c.id)}
            onLongPress={() => toggle(c.id)}
            onReply={() => setThread(c)}
            onLike={() => reactM.mutate(c.id)}
            onPin={() => actM.mutate({ id: c.id, verb: c.is_pinned ? "unpin" : "pin" })}
            onMore={() => setActionsFor(c)}
          />
        )}
        ListFooterComponent={
          <View>
            <Text style={styles.sectionLabel}>Saved replies</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.savedScroll}
              contentContainerStyle={styles.savedRow}
            >
              {savedReplies.map((r) => (
                <Pressable
                  key={r.id}
                  style={styles.savedChip}
                  onPress={() => setReplyEditor({ id: r.id, body: r.body })}
                >
                  <Text style={styles.savedChipText}>{r.label}</Text>
                </Pressable>
              ))}
              <Pressable style={styles.savedNew} onPress={() => setReplyEditor({ body: "" })}>
                <Plus size={13} color={sd.muted} strokeWidth={2.4} />
                <Text style={styles.savedNewText}>New</Text>
              </Pressable>
            </ScrollView>
          </View>
        }
      />

      {selecting && (
        <View style={styles.bulkBar}>
          <Pressable hitSlop={10} onPress={() => setPicked([])} style={styles.bulkClose}>
            <X size={15} color={sd.text} strokeWidth={2.4} />
          </Pressable>
          <Text style={styles.bulkCount}>{picked.length} selected</Text>
          <View style={{ flex: 1 }} />
          {bulkM.isPending ? (
            <ActivityIndicator size="small" color={sd.accent} />
          ) : (
            <>
              <BulkBtn icon={CheckCheck} label="Read" onPress={() => bulkM.mutate({ action: "read", ids: picked })} />
              <BulkBtn icon={EyeOff} label="Hide" onPress={() => bulkM.mutate({ action: "hide", ids: picked })} />
              <BulkBtn icon={ShieldAlert} label="Spam" onPress={() => bulkM.mutate({ action: "spam", ids: picked })} />
              <BulkBtn
                icon={Trash2}
                label="Delete"
                danger
                onPress={() =>
                  Alert.alert("Delete comments", `Delete ${picked.length} comment(s) and their replies?`, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => bulkM.mutate({ action: "delete", ids: picked }) },
                  ])
                }
              />
            </>
          )}
        </View>
      )}

      {/* Overflow: the rarer verbs the card itself doesn't surface. */}
      <BottomSheet visible={!!actionsFor} onClose={() => setActionsFor(null)} scrollable={false}>
        {!!actionsFor && (
          <View style={styles.sheetPad}>
            <MenuRow
              icon={actionsFor.is_hidden ? "eye-outline" : "eye-off-outline"}
              title={actionsFor.is_hidden ? "Unhide comment" : "Hide comment"}
              subtitle={actionsFor.is_hidden ? undefined : "Stays visible to its author only"}
              onPress={() => {
                actM.mutate({ id: actionsFor.id, verb: actionsFor.is_hidden ? "unhide" : "hide" });
                setActionsFor(null);
              }}
            />
            <MenuRow
              icon={actionsFor.is_spam ? "shield-checkmark-outline" : "shield-outline"}
              title={actionsFor.is_spam ? "Not spam" : "Mark as spam"}
              onPress={() => {
                actM.mutate({ id: actionsFor.id, verb: actionsFor.is_spam ? "unspam" : "spam" });
                setActionsFor(null);
              }}
            />
            <MenuRow
              icon="alert-circle-outline"
              title={actionsFor.held_for_review ? "Release from review" : "Hold for review"}
              onPress={() => {
                actM.mutate({ id: actionsFor.id, verb: actionsFor.held_for_review ? "unhold" : "hold" });
                setActionsFor(null);
              }}
            />
            {!actionsFor.is_own && !!actionsFor.user && (
              <MenuRow
                icon="gift-outline"
                title="Send a gift"
                subtitle={`Thank ${actionsFor.user.name || actionsFor.user.username} with coins`}
                onPress={() => { const c = actionsFor; setActionsFor(null); setGiftTo(c); }}
              />
            )}
            <MenuRow
              icon="person-remove-outline"
              title="Restrict this person"
              subtitle="Their comments get held for your review"
              onPress={() => { actM.mutate({ id: actionsFor.id, verb: "restrict" }); setActionsFor(null); }}
            />
            <MenuDivider />
            <MenuRow
              icon="trash-outline"
              title="Delete comment"
              destructive
              onPress={() => { const c = actionsFor; setActionsFor(null); confirmDelete(c); }}
            />
          </View>
        )}
      </BottomSheet>

      <BottomSheet
        visible={!!replyEditor}
        onClose={() => setReplyEditor(null)}
        scrollable={false}
        keyboardAvoid
      >
        {!!replyEditor && (
          <View style={styles.sheetPad}>
            <Text style={styles.sheetTitle}>{replyEditor.id ? "Edit saved reply" : "New saved reply"}</Text>
            <TextInput
              value={replyEditor.body}
              onChangeText={(body) => setReplyEditor((e) => (e ? { ...e, body } : e))}
              placeholder="Thanks for watching!"
              placeholderTextColor={sd.muted}
              style={styles.replyInput}
              multiline
              maxLength={1000}
              autoFocus
            />
            <View style={styles.replyActions}>
              {!!replyEditor.id && (
                <Pressable
                  style={styles.replyDelete}
                  onPress={() => { removeReply(replyEditor.id!); setReplyEditor(null); }}
                >
                  <Trash2 size={15} color={sd.down} strokeWidth={2.3} />
                </Pressable>
              )}
              <Pressable
                style={[styles.replySave, !replyEditor.body.trim() && { opacity: 0.4 }]}
                disabled={!replyEditor.body.trim()}
                onPress={() => { saveReply(replyEditor.body, replyEditor.id); setReplyEditor(null); }}
              >
                <Text style={styles.replySaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        )}
      </BottomSheet>

      <CommentThreadSheet comment={thread} onClose={() => { setThread(null); refresh(); }} />

      <GiftSheet
        visible={!!giftTo}
        receiver={giftTo?.user ? { id: giftTo.user.id, username: giftTo.user.username } : null}
        commentId={giftTo?.id}
        onClose={() => setGiftTo(null)}
      />
    </View>
  );
}

/* ── One cell of the hero's stat strip ─────────────────────────────────────── */
function StripCell({ value, label, divider }: { value: string | null; label: string; divider?: boolean }) {
  return (
    <View style={[styles.stripCell, divider && styles.stripDivider]}>
      {value === null
        ? <Skeleton width={38} height={14} radius={4} />
        : <Text style={styles.stripValue} numberOfLines={1}>{value}</Text>}
      <Text style={styles.stripLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/* ── One comment card ──────────────────────────────────────────────────────── */
function CommentCard({
  c, reaction, selected, selecting, onPress, onLongPress, onReply, onLike, onPin, onMore,
}: {
  c: StudioComment;
  reaction?: { loved: boolean; count: number };
  selected: boolean;
  selecting: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onReply: () => void;
  onLike: () => void;
  onPin: () => void;
  onMore: () => void;
}) {
  // The server now reports the creator's own reaction, so the heart is right on
  // first paint; `reaction` only overrides it after you tap this session.
  const loved = reaction?.loved ?? c.current_user_reaction === "love";
  const likes = reaction?.count ?? c.love_count;
  const flagged = c.is_spam || c.held_for_review || c.pending_reports > 0;

  return (
    <Pressable
      style={[styles.card, selected && styles.cardSel]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={220}
    >
      <View style={styles.cardTop}>
        {selecting && (
          <View style={[styles.tick, selected && styles.tickOn]}>
            {selected && <Ionicons name="checkmark" size={11} color="#FFFFFF" />}
          </View>
        )}
        <Avatar uri={c.user?.avatar} name={c.user?.name || c.user?.username} size={38} />

        <View style={styles.cardBody}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {c.user?.name || c.user?.username || "Unknown"}
            </Text>
            {c.user?.is_verified && <VerifiedBadge size={12} />}
            {c.is_pinned && (
              <View style={styles.pinnedTag}><Text style={styles.pinnedTagText}>PINNED</Text></View>
            )}
            {flagged && (
              <View style={styles.flaggedTag}><Text style={styles.flaggedTagText}>FLAGGED</Text></View>
            )}
            <View style={{ flex: 1 }} />
            <Text style={styles.time}>{relativeTime(c.created_at)}</Text>
          </View>

          {!!c.body && <Text style={styles.text}>{c.body}</Text>}
          {!!c.gif_preview_url && (
            <Image source={c.gif_preview_url} style={styles.gif} contentFit="cover" transition={150} />
          )}

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Heart size={12} color="#B6B1BE" strokeWidth={2.1} />
              <Text style={styles.metaText}>{formatCompact(likes)}</Text>
            </View>
            {c.reply_count > 0 && (
              <Text style={styles.metaText}>
                {c.reply_count} {c.reply_count === 1 ? "reply" : "replies"}
              </Text>
            )}
          </View>
        </View>
      </View>

      {!selecting && (
        <View style={styles.actions}>
          <Pressable style={styles.replyBtn} onPress={onReply}>
            <Text style={styles.replyBtnText}>Reply</Text>
          </Pressable>
          <Pressable style={[styles.iconBtn, loved && styles.iconBtnLoved]} onPress={onLike}>
            <Heart size={15} color={loved ? sd.down : sd.muted} fill={loved ? sd.down : "transparent"} strokeWidth={2} />
          </Pressable>
          <Pressable style={[styles.iconBtn, c.is_pinned && styles.iconBtnPinned]} onPress={onPin}>
            <Pin size={15} color={c.is_pinned ? "#B0741B" : sd.muted} strokeWidth={2} />
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={onMore}>
            <MoreHorizontal size={15} color={sd.muted} strokeWidth={2.4} />
          </Pressable>
        </View>
      )}
    </Pressable>
  );
}

function BulkBtn({
  icon: Icon, label, onPress, danger,
}: {
  icon: any; label: string; onPress: () => void; danger?: boolean;
}) {
  return (
    <Pressable style={styles.bulkBtn} onPress={onPress} hitSlop={6}>
      <Icon size={17} color={danger ? sd.down : sd.slate} strokeWidth={2.3} />
      <Text style={[styles.bulkBtnText, danger && { color: sd.down }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: sd.page },
  list: { paddingHorizontal: spacing.lg, paddingBottom: TAB_BAR_HEIGHT + spacing.xxl, gap: 9 },

  /* Hero */
  hero: { borderRadius: sr.hero, backgroundColor: sd.ink, padding: 17, gap: 15, overflow: "hidden" },
  glow: { position: "absolute", top: -110, right: -70 },
  heroTop: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  heroLead: { gap: 5, minWidth: 0 },
  heroLabel: { fontSize: 11.5, fontWeight: font.weightMedium, color: "rgba(255,255,255,0.5)" },
  heroValue: { fontSize: 38, fontWeight: font.weightHeavy, color: "#FFFFFF", letterSpacing: -1.9, lineHeight: 40 },
  heroCta: {
    borderRadius: sr.pill, paddingHorizontal: 16, paddingVertical: 11, backgroundColor: sd.accent,
    alignItems: "center", justifyContent: "center",
    shadowColor: sd.accent, shadowOpacity: 0.3, shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  heroCtaText: { fontSize: 12.5, fontWeight: font.weightHeavy, color: "#FFFFFF" },

  strip: { flexDirection: "row", borderRadius: sr.card, backgroundColor: "rgba(255,255,255,0.07)", overflow: "hidden" },
  stripCell: { flex: 1, alignItems: "center", gap: 3, paddingVertical: 12, paddingHorizontal: 6 },
  stripDivider: { borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.07)" },
  stripValue: { fontSize: 14.5, fontWeight: font.weightHeavy, color: "#FFFFFF", letterSpacing: -0.29 },
  stripLabel: { fontSize: 9.5, fontWeight: font.weightMedium, color: "rgba(255,255,255,0.45)" },

  /* Tabs - bleed to the screen edge while the list keeps its padding. */
  tabScroll: { flexGrow: 0, marginHorizontal: -spacing.lg },
  tabRow: { paddingHorizontal: spacing.lg, gap: 6, alignItems: "center", paddingBottom: 4 },
  tab: {
    flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: 14,
    borderRadius: sr.pill, borderWidth: 1, borderColor: sd.line, backgroundColor: sd.page,
  },
  tabOn: { backgroundColor: sd.ink, borderColor: sd.ink },
  tabText: { fontSize: 12, fontWeight: font.weightBold, color: sd.slate },
  tabTextOn: { color: "#FFFFFF" },
  tabCount: {
    minWidth: 18, paddingHorizontal: 5, paddingVertical: 1,
    borderRadius: sr.pill, backgroundColor: sd.fill, alignItems: "center",
  },
  tabCountOn: { backgroundColor: "rgba(255,255,255,0.18)" },
  tabCountText: { fontSize: 10, fontWeight: font.weightHeavy, color: sd.muted },
  tabCountTextOn: { color: "rgba(255,255,255,0.85)" },

  /* Post card */
  postCard: {
    backgroundColor: sd.page, borderRadius: sr.tile, padding: 13, gap: 10,
    borderWidth: 1, borderColor: sd.line,
  },
  postTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  thumbWrap: { width: 48, height: 48, flex: 0 },
  thumb: { width: 48, height: 48, borderRadius: 14, backgroundColor: sd.thumbA },
  thumbFallback: { alignItems: "center", justifyContent: "center", backgroundColor: sd.fill },
  unreadBadge: {
    position: "absolute", top: -3, right: -3, minWidth: 20, height: 20, paddingHorizontal: 5,
    borderRadius: sr.pill, backgroundColor: sd.accent, borderWidth: 2, borderColor: sd.page,
    alignItems: "center", justifyContent: "center",
  },
  unreadBadgeText: { fontSize: 9.5, fontWeight: font.weightHeavy, color: "#FFFFFF" },
  postBody: { flex: 1, minWidth: 0, gap: 5 },
  postCaption: { fontSize: 13.5, fontWeight: font.weightBold, color: sd.text, letterSpacing: -0.16 },
  postMeta: { fontSize: 11.5, color: sd.muted },
  chipRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  countChip: { borderRadius: sr.pill, backgroundColor: "#FDE8EE", paddingHorizontal: 8, paddingVertical: 4 },
  countChipText: { fontSize: 9.5, fontWeight: font.weightHeavy, color: sd.accent },
  flaggedChip: { borderRadius: sr.pill, backgroundColor: "#FDECEE", paddingHorizontal: 8, paddingVertical: 4 },
  flaggedChipText: { fontSize: 9.5, fontWeight: font.weightHeavy, color: "#B02334" },

  preview: {
    flexDirection: "row", alignItems: "flex-start", gap: 9,
    borderRadius: 13, backgroundColor: sd.fillSoft, paddingVertical: 9, paddingHorizontal: 11,
  },
  previewBody: { flex: 1, minWidth: 0, gap: 1 },
  // The prototype's own mid-greys for this row.
  previewName: { fontSize: 11, fontWeight: font.weightBold, color: "#6E6979" },
  previewText: { fontSize: 12, color: sd.slate },

  /* Thread mode */
  back: { flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-start", paddingBottom: 14 },
  backText: { fontSize: 13, fontWeight: font.weightBold, color: sd.text },
  postHead: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderWidth: 1, borderColor: sd.line, borderRadius: sr.panel, padding: 13,
  },
  headThumb: { width: 44, height: 44, borderRadius: 12, backgroundColor: sd.thumbA },
  headCaption: { fontSize: 13.5, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -0.2 },
  viewBtn: {
    borderWidth: 1, borderColor: sd.line, borderRadius: sr.pill,
    paddingHorizontal: 13, paddingVertical: 8, backgroundColor: sd.page, minWidth: 54, alignItems: "center",
  },
  viewBtnText: { fontSize: 11.5, fontWeight: font.weightBold, color: sd.text },

  /* Comment card */
  card: {
    backgroundColor: sd.page, borderRadius: sr.tile, padding: 13, gap: 10,
    borderWidth: 1, borderColor: sd.line,
  },
  cardSel: { borderColor: sd.accent, backgroundColor: "#FFF6F8" },
  cardTop: { flexDirection: "row", gap: 11 },
  cardBody: { flex: 1, minWidth: 0, gap: 4 },
  tick: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: sd.thumbA,
    alignItems: "center", justifyContent: "center", alignSelf: "center",
  },
  tickOn: { backgroundColor: sd.accent, borderColor: sd.accent },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  name: { fontSize: 13, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -0.13, flexShrink: 1 },
  pinnedTag: { borderRadius: sr.pill, backgroundColor: "#FDF3E3", paddingHorizontal: 7, paddingVertical: 3 },
  pinnedTagText: { fontSize: 8.5, fontWeight: font.weightHeavy, letterSpacing: 0.68, color: "#B0741B" },
  flaggedTag: { borderRadius: sr.pill, backgroundColor: "#FDECEE", paddingHorizontal: 7, paddingVertical: 3 },
  flaggedTagText: { fontSize: 8.5, fontWeight: font.weightHeavy, letterSpacing: 0.68, color: "#B02334" },
  time: { fontSize: 11, color: sd.faint },
  text: { fontSize: 13.5, color: sd.text, lineHeight: 20 },
  gif: { width: 140, height: 105, borderRadius: 12, backgroundColor: sd.fill },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingTop: 2 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 11, fontWeight: font.weightBold, color: sd.muted },

  actions: { flexDirection: "row", alignItems: "center", gap: 7 },
  replyBtn: {
    flex: 1, height: 38, borderRadius: sr.pill, backgroundColor: sd.ink,
    alignItems: "center", justifyContent: "center",
  },
  replyBtnText: { fontSize: 12.5, fontWeight: font.weightBold, color: "#FFFFFF" },
  iconBtn: {
    width: 38, height: 38, borderRadius: sr.pill,
    borderWidth: 1, borderColor: sd.line, backgroundColor: sd.page,
    alignItems: "center", justifyContent: "center",
  },
  iconBtnLoved: { backgroundColor: sd.downWash, borderColor: sd.downWash },
  iconBtnPinned: { backgroundColor: "#FDF3E3", borderColor: "#FDF3E3" },

  /* Empty */
  empty: { alignItems: "center", gap: 9, paddingVertical: 46, paddingHorizontal: 20 },
  emptyIcon: {
    width: 52, height: 52, borderRadius: sr.pill, backgroundColor: sd.fill,
    alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontSize: 14, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -0.21 },
  emptySub: { fontSize: 12, color: sd.muted, textAlign: "center", lineHeight: 18 },

  /* Sections */
  sectionLabel: {
    fontSize: 12, fontWeight: font.weightBold, color: sd.muted,
    letterSpacing: 0.72, textTransform: "uppercase", paddingTop: 26, paddingBottom: 10,
  },
  savedScroll: { flexGrow: 0, marginHorizontal: -spacing.lg },
  savedRow: { paddingHorizontal: spacing.lg, gap: 7, alignItems: "center", paddingBottom: 2 },
  savedChip: {
    borderWidth: 1, borderColor: sd.line, borderRadius: sr.pill,
    paddingHorizontal: 15, paddingVertical: 10, backgroundColor: sd.page,
  },
  savedChipText: { fontSize: 12.5, fontWeight: font.weightMedium, color: sd.slate },
  savedNew: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderWidth: 1, borderColor: sd.thumbA, borderStyle: "dashed", borderRadius: sr.pill,
    paddingHorizontal: 14, paddingVertical: 10, backgroundColor: sd.page,
  },
  savedNewText: { fontSize: 12.5, fontWeight: font.weightBold, color: sd.muted },

  modCard: { borderWidth: 1, borderColor: sd.line, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 2 },
  modRow: {
    minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: sd.fillSoft,
  },
  modRowLast: { borderBottomWidth: 0 },
  modIcon: {
    width: 34, height: 34, borderRadius: 11, backgroundColor: sd.fillSoft,
    alignItems: "center", justifyContent: "center",
  },
  modBody: { flex: 1, minWidth: 0, gap: 2 },
  modLabel: { fontSize: 13.5, fontWeight: font.weightBold, color: sd.text },
  modSub: { fontSize: 11.5, color: sd.muted },
  track: { width: 44, height: 26, borderRadius: sr.pill, backgroundColor: sd.thumbA, padding: 3, justifyContent: "center" },
  trackOn: { backgroundColor: sd.ink },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#FFFFFF" },
  knobOn: { alignSelf: "flex-end" },

  note: { flexDirection: "row", alignItems: "flex-start", gap: 9, paddingTop: 18 },
  noteText: { flex: 1, minWidth: 0, fontSize: 11.5, color: sd.muted, lineHeight: 17 },

  /* Bulk - long-press only, so it never shows until asked for. */
  bulkBar: {
    position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.lg,
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: sd.page, borderRadius: sr.panel,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderWidth: 1, borderColor: sd.line,
    shadowColor: "#121014", shadowOpacity: 0.16, shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 }, elevation: 10,
  },
  bulkClose: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: sd.fill,
    alignItems: "center", justifyContent: "center",
  },
  bulkCount: { fontSize: 13, fontWeight: font.weightBold, color: sd.text },
  bulkBtn: { alignItems: "center", gap: 2, minWidth: 44 },
  bulkBtnText: { fontSize: 10, fontWeight: font.weightBold, color: sd.slate },

  /* Sheets */
  sheetPad: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  sheetTitle: {
    fontSize: 11, fontWeight: font.weightHeavy, color: sd.muted,
    textTransform: "uppercase", letterSpacing: 0.7,
    paddingVertical: spacing.sm, paddingHorizontal: 2,
  },
  replyInput: {
    minHeight: 92, borderRadius: sr.card, backgroundColor: sd.fill,
    padding: spacing.md, fontSize: 14, color: sd.text, lineHeight: 20, textAlignVertical: "top",
  },
  replyActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingTop: spacing.md },
  replyDelete: {
    width: 44, height: 44, borderRadius: sr.pill,
    borderWidth: 1, borderColor: sd.downWash, backgroundColor: sd.downWash,
    alignItems: "center", justifyContent: "center",
  },
  replySave: {
    flex: 1, height: 44, borderRadius: sr.pill, backgroundColor: sd.ink,
    alignItems: "center", justifyContent: "center",
  },
  replySaveText: { fontSize: 14, fontWeight: font.weightBold, color: "#FFFFFF" },
});
