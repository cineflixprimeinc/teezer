import { useMemo, useRef, useState } from "react";
import { FollowButton } from "@/components/FollowButton";
import {
  Alert, Linking, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { ChevronLeft } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { Skeleton } from "@/components/Skeleton";
import { BottomSheet } from "@/components/BottomSheet";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { profileApi, FollowRequest } from "@/api/profile.api";
import { suggestionApi, SuggestedProfile } from "@/api/suggestion.api";
import { videoApi } from "@/api/video.api";
import { useAuthStore } from "@/store/auth.store";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";
import { formatCompact } from "@/utils/format";

const WEB = "https://teezer.live";
const FB_BLUE = "#1877F2";
const PURPLE = "#8b5cf6";
const BLUE = "#3b82f6";

type Tab = "foryou" | "contacts" | "facebook" | "invite";
const TABS: { key: Tab; label: string; icon?: (active: boolean) => React.ReactNode }[] = [
  { key: "foryou", label: "For you" },
  { key: "contacts", label: "Contacts", icon: (a) => <Ionicons name="id-card-outline" size={17} color={a ? colors.text : colors.textMuted} /> },
  { key: "facebook", label: "Facebook", icon: () => <Ionicons name="logo-facebook" size={17} color={FB_BLUE} /> },
  { key: "invite", label: "Invite", icon: (a) => <Ionicons name="mail-outline" size={17} color={a ? colors.text : colors.textMuted} /> },
];

/** "Ways to connect" cards - mirrors the design's four discovery channels.
 *  Both the card surface and the icon disc use soft diagonal gradients. */
const WAYS = [
  {
    key: "nearby", title: "Nearby friends", sub: "Find people near you",
    icon: <Ionicons name="location" size={24} color={colors.white} />,
    circle: ["#ff6b9c", "#fe2c55"], bg: ["#ffe9f0", "#fdf6f7"],
  },
  {
    key: "contacts", title: "Contacts", sub: "Sync your contacts",
    icon: <MaterialCommunityIcons name="account-box" size={26} color={colors.white} />,
    circle: ["#8db8ff", "#3b82f6"], bg: ["#e7efff", "#f7faff"],
  },
  {
    key: "facebook", title: "Facebook friends", sub: "Find friends from Facebook",
    icon: <Ionicons name="logo-facebook" size={26} color={colors.white} />,
    circle: [FB_BLUE, FB_BLUE], bg: ["#e9eefa", "#f8fafd"],
  },
  {
    key: "suggestions", title: "Teezer suggestions", sub: "People you may know",
    icon: <MaterialCommunityIcons name="account-voice" size={24} color={colors.white} />,
    circle: ["#a78bfa", "#8b5cf6"], bg: ["#efe9ff", "#f9f7ff"],
  },
] as const;

/** Same three stops used everywhere else this ring already appears
 *  (Avatar.tsx, ProfileTabScreen, the Inbox story rail, the feed rail). */
const STORY_RING_COLORS = ["#F42B5B", "#FF6E90", "#8B5CF6"] as const;
const STORY_RING_SEEN_COLOR = "#E3DFE7";

function Avatar({
  uri, name, size, hasStory, storySeen,
}: { uri?: string | null; name?: string | null; size: number; hasStory?: boolean; storySeen?: boolean }) {
  const initial = (name?.[0] ?? "?").toUpperCase();
  const content = uri
    ? <Image source={uri} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.bgMuted }} contentFit="cover" />
    : (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: colors.white, fontWeight: font.weightHeavy, fontSize: size * 0.4 }}>{initial}</Text>
      </View>
    );

  if (!hasStory) return content;

  /* Same gradient-vs-seen ring the profile screen, Inbox and feed already
     draw - behind the avatar, sized via padding so it reads as a border
     rather than overlapping the photo/initial. */
  const pad = Math.max(2, Math.round(size * 0.07));
  const ringSize = size + pad * 2;
  return (
    <View style={{ width: ringSize, height: ringSize, alignItems: "center", justifyContent: "center" }}>
      {storySeen ? (
        <View
          style={{
            position: "absolute", width: ringSize, height: ringSize,
            borderRadius: ringSize / 2, backgroundColor: STORY_RING_SEEN_COLOR,
          }}
        />
      ) : (
        <LinearGradient
          colors={STORY_RING_COLORS}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={{ position: "absolute", width: ringSize, height: ringSize, borderRadius: ringSize / 2 }}
        />
      )}
      {content}
    </View>
  );
}

export function FindFriendsScreen() {
  const navigation = useNavigation<any>();
  const qc = useQueryClient();
  const isAuthed = useAuthStore((s) => s.status === "authenticated");
  const me = useAuthStore((s) => s.user);

  const [tab, setTab] = useState<Tab>("foryou");
  const [followMap, setFollowMap] = useState<Record<string, boolean>>({});
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [hiddenReq, setHiddenReq] = useState<Set<number>>(new Set());
  const [allRequests, setAllRequests] = useState(false);
  const [allSuggestions, setAllSuggestions] = useState(false);
  const [inviteBanner, setInviteBanner] = useState(true);
  const scrollRef = useRef<ScrollView>(null);
  const sugSectionY = useRef(0);

  // Three-dot actions sheet on a suggestion row. Navigation/alerts run in
  // onClosed (after the exit animation), per the BottomSheet contract.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetUser, setSheetUser] = useState<SuggestedProfile | null>(null);
  const sheetPendingRef = useRef<(() => void) | null>(null);
  const closeSheet = (then?: () => void) => { sheetPendingRef.current = then ?? null; setSheetOpen(false); };

  // Shares the Friends tab's cache keys so both screens stay in sync.
  const requestsQ = useQuery({ queryKey: ["friends-requests"], queryFn: profileApi.followRequests, enabled: isAuthed });
  const suggestionsQ = useQuery({ queryKey: ["friends-suggestions"], queryFn: () => suggestionApi.profiles("friends", 30), enabled: isAuthed });

  const requests = useMemo(() => (requestsQ.data ?? []).filter((r) => !hiddenReq.has(r.id)), [requestsQ.data, hiddenReq]);
  const suggestions = useMemo(() => (suggestionsQ.data ?? []).filter((s) => !dismissed.has(s.id)), [suggestionsQ.data, dismissed]);
  const visibleSuggestions = allSuggestions ? suggestions : suggestions.slice(0, 8);

  // ── Actions ────────────────────────────────────────────────────────────────
  const goProfile = (_username: string) => {};
  const goSearch = () => {};
  const comingSoon = (what: string) => Alert.alert(what, "Coming soon.");

  const isFollowing = (s: SuggestedProfile) => followMap[s.username] ?? s.is_following;
  const toggleFollow = (s: SuggestedProfile) => {
    const next = !isFollowing(s);
    setFollowMap((m) => ({ ...m, [s.username]: next }));
    (next ? videoApi.follow(s.username) : videoApi.unfollow(s.username)).catch(() =>
      setFollowMap((m) => ({ ...m, [s.username]: !next })),
    );
    if (next) suggestionApi.markFollowed(s.id);
  };

  const onAccept = (id: number) => {
    setHiddenReq((s) => new Set(s).add(id));
    profileApi.acceptFollowRequest(id)
      .then(() => qc.invalidateQueries({ queryKey: ["friends-followers"] }))
      .catch(() => setHiddenReq((s) => { const n = new Set(s); n.delete(id); return n; }));
  };
  const onIgnore = (id: number) => {
    setHiddenReq((s) => new Set(s).add(id));
    profileApi.declineFollowRequest(id).catch(() => setHiddenReq((s) => { const n = new Set(s); n.delete(id); return n; }));
  };
  const onDismissSug = (id: number) => { setDismissed((s) => new Set(s).add(id)); suggestionApi.dismiss(id); };

  const onBlock = (u: SuggestedProfile) => {
    Alert.alert(
      `Block @${u.username}?`,
      "They won't be able to find your profile, see your videos or message you. They won't be notified.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block", style: "destructive",
          onPress: () => {
            setDismissed((s) => new Set(s).add(u.id));
            profileApi.block(u.username).catch(() => Alert.alert("Couldn't block", "Something went wrong - please try again."));
          },
        },
      ],
    );
  };

  const inviteMessage = `Join me on Teezer${me?.username ? ` - I'm @${me.username}` : ""}! Watch and share short videos: ${WEB}`;
  const onInvite = () => Share.share({ message: inviteMessage }).catch(() => {});

  const onWay = (key: (typeof WAYS)[number]["key"]) => {
    if (key === "nearby") comingSoon("Nearby friends");
    else if (key === "contacts") setTab("contacts");
    else if (key === "facebook") setTab("facebook");
    // Reelsoo suggestions → dedicated page listing every account the
    // recommendation engine picked.
    else navigation.navigate("SuggestedAccounts");
  };

  const refreshing = requestsQ.isRefetching || suggestionsQ.isRefetching;
  const onRefresh = () => { requestsQ.refetch(); suggestionsQ.refetch(); };

  /* ───────────────────────── Render ───────────────────────── */
  return (
    <Screen edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ChevronLeft size={24} color={colors.text} strokeWidth={2} />
          </Pressable>
          <Text style={styles.headerTitle}>Find Friends</Text>
        </View>
        <View style={styles.headerActions}>
          {/* Pending follow requests (private-account approvals) with live count. */}
          <Pressable hitSlop={10} onPress={() => navigation.navigate("FollowRequests")}>
            <Ionicons name="person-add-outline" size={24} color={colors.text} />
            {requests.length > 0 && (
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>{requests.length > 99 ? "99+" : requests.length}</Text>
              </View>
            )}
          </Pressable>
          <Pressable hitSlop={10} onPress={() => comingSoon("QR code")}><MaterialCommunityIcons name="qrcode-scan" size={23} color={colors.text} /></Pressable>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={styles.tabBtn} hitSlop={8}>
            <View style={styles.tabInner}>
              {t.icon?.(tab === t.key)}
              <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
            </View>
            {tab === t.key && <View style={styles.tabUnderline} />}
          </Pressable>
        ))}
      </View>

      {tab === "foryou" && (
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        >
          {/* ── Ways to connect ── */}
          <Text style={styles.sectionTitle}>Ways to connect</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.waysRow}>
            {WAYS.map((w) => (
              <Pressable key={w.key} onPress={() => onWay(w.key)}>
                <LinearGradient colors={[...w.bg]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.wayCard}>
                  {/* The suggestions card previews real accounts picked by the
                      recommendation engine - overlapping avatars of the top 3. */}
                  {w.key === "suggestions" && suggestions.length > 0 ? (
                    <View style={styles.wayAvStack}>
                      {suggestions.slice(0, 3).map((s, i) => (
                        <View key={s.id} style={[styles.wayAvRing, i > 0 && styles.wayAvOverlap]}>
                          <Avatar uri={s.avatar} name={s.display_name || s.username} size={34} />
                        </View>
                      ))}
                      {suggestions.length > 3 && (
                        <View style={[styles.wayAvRing, styles.wayAvOverlap, styles.wayAvMore]}>
                          <Text style={styles.wayAvMoreText}>+{Math.min(suggestions.length - 3, 99)}</Text>
                        </View>
                      )}
                    </View>
                  ) : (
                    <LinearGradient colors={[...w.circle]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.wayCircle}>
                      {w.icon}
                    </LinearGradient>
                  )}
                  <Text style={styles.wayTitle} numberOfLines={2}>{w.title}</Text>
                  <View style={styles.waySubRow}>
                    <Text style={styles.waySub} numberOfLines={2}>{w.sub}</Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.textFaint} />
                  </View>
                </LinearGradient>
              </Pressable>
            ))}
          </ScrollView>

          {/* ── Friend requests ── */}
          {(requests.length > 0 || requestsQ.isLoading) && (
            <>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Text style={styles.sectionTitleInline}>Friend requests</Text>
                  {requests.length > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{requests.length}</Text></View>}
                </View>
                {requests.length > 3 && (
                  <Pressable hitSlop={8} onPress={() => setAllRequests((v) => !v)}>
                    <Text style={styles.seeAll}>{allRequests ? "Show less" : "See all"}</Text>
                  </Pressable>
                )}
              </View>
              {requestsQ.isLoading ? (
                <View style={styles.reqRow}>
                  {[0, 1, 2].map((i) => <Skeleton key={i} width={160} height={200} radius={radius.lg} />)}
                </View>
              ) : allRequests ? (
                <View>{requests.map((r) => <RequestRow key={r.id} r={r} onAccept={onAccept} onIgnore={onIgnore} onPress={goProfile} />)}</View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reqRow}>
                  {requests.map((r) => <RequestCard key={r.id} r={r} onAccept={onAccept} onIgnore={onIgnore} onPress={goProfile} />)}
                </ScrollView>
              )}
            </>
          )}

          {/* ── People you may know ── */}
          {(suggestions.length > 0 || suggestionsQ.isLoading) && (
            <>
              <View style={styles.sectionHeader} onLayout={(e) => { sugSectionY.current = e.nativeEvent.layout.y; }}>
                <Text style={styles.sectionTitleInline}>People you may know</Text>
                {suggestions.length > 8 && (
                  <Pressable hitSlop={8} onPress={() => setAllSuggestions((v) => !v)}>
                    <Text style={styles.seeAll}>{allSuggestions ? "Show less" : "See all"}</Text>
                  </Pressable>
                )}
              </View>
              <View>
                {suggestionsQ.isLoading
                  ? [0, 1, 2, 3].map((i) => (
                      <View key={i} style={styles.sugRow}>
                        <Skeleton width={48} height={48} radius={24} />
                        <View style={{ flex: 1 }}><Skeleton width="45%" height={13} /><Skeleton width="30%" height={11} style={{ marginTop: 7 }} /></View>
                        <Skeleton width={82} height={34} radius={radius.sm} />
                      </View>
                    ))
                  : visibleSuggestions.map((s) => (
                      <View key={s.id} style={styles.sugRow}>
                        <Pressable style={styles.sugLeft} onPress={() => goProfile(s.username)}>
                          <Avatar
                            uri={s.avatar}
                            name={s.display_name || s.username}
                            size={48}
                            hasStory={!!s.has_story}
                            storySeen={!!s.has_story && !s.has_unseen}
                          />
                          <View style={{ flex: 1 }}>
                            <View style={styles.nameRow}>
                              <Text style={styles.sugName} numberOfLines={1}>{s.display_name || s.username}</Text>
                              {s.is_verified && <VerifiedBadge size={14} />}
                            </View>
                            {s.mutual_followers_count > 0 && (
                              <View style={styles.mutualRow}>
                                {(s.mutual_followers ?? []).slice(0, 3).map((m, i) => (
                                  <View key={m.id} style={[styles.mutualAvRing, i > 0 && styles.mutualAvOverlap]}>
                                    <Avatar uri={m.avatar} name={m.name || m.username} size={16} />
                                  </View>
                                ))}
                                <Text style={styles.mutualText} numberOfLines={1}>
                                  {formatCompact(s.mutual_followers_count)} mutual {s.mutual_followers_count === 1 ? "friend" : "friends"}
                                </Text>
                              </View>
                            )}
                          </View>
                        </Pressable>
                        <FollowButton following={isFollowing(s)} onPress={() => toggleFollow(s)} />
                        <Pressable hitSlop={8} onPress={() => { setSheetUser(s); setSheetOpen(true); }} style={styles.moreBtn}>
                          <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
                        </Pressable>
                      </View>
                    ))}
              </View>
            </>
          )}

          {!requestsQ.isLoading && !suggestionsQ.isLoading && !requests.length && !suggestions.length && (
            <View style={styles.center}>
              <View style={styles.emptyIcon}><Ionicons name="people-outline" size={34} color={colors.brand} /></View>
              <Text style={styles.emptyTitle}>No suggestions right now</Text>
              <Text style={styles.emptySub}>Follow a few creators and we'll find people for you.</Text>
              <Pressable style={styles.primaryBtn} onPress={goSearch}><Text style={styles.primaryBtnText}>Search people</Text></Pressable>
            </View>
          )}

          {/* ── Invite banner ── */}
          {inviteBanner && (
            <View style={styles.inviteBanner}>
              <View style={styles.inviteIconWrap}>
                <Ionicons name="mail-open" size={26} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inviteTitle}>Invite your friends</Text>
                <Text style={styles.inviteSub}>Invite your friends and follow them on Teezer.</Text>
              </View>
              <Pressable style={styles.inviteBtn} onPress={onInvite}><Text style={styles.inviteBtnText}>Invite</Text></Pressable>
              <Pressable hitSlop={10} onPress={() => setInviteBanner(false)} style={styles.inviteClose}>
                <Ionicons name="close" size={15} color={colors.textMuted} />
              </Pressable>
            </View>
          )}
        </ScrollView>
      )}

      {tab === "contacts" && (
        <ConnectState
          circleColor={BLUE}
          icon={<Ionicons name="person-circle-outline" size={40} color={colors.white} />}
          title="Find your contacts"
          sub="See which of your contacts are on Teezer and follow them in one tap. Your contacts are never shared without permission."
          cta="Sync contacts"
          onPress={() => comingSoon("Contacts sync")}
        />
      )}

      {tab === "facebook" && (
        <ConnectState
          circleColor={FB_BLUE}
          icon={<Ionicons name="logo-facebook" size={40} color={colors.white} />}
          title="Find Facebook friends"
          sub="Connect your Facebook account to find friends who are already on Teezer."
          cta="Connect Facebook"
          ctaColor={FB_BLUE}
          onPress={() => comingSoon("Facebook connect")}
        />
      )}

      {tab === "invite" && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
          <View style={styles.inviteHero}>
            <View style={styles.inviteHeroCircle}><Ionicons name="mail-open" size={40} color={colors.brand} /></View>
            <Text style={styles.emptyTitle}>Invite your friends</Text>
            <Text style={styles.emptySub}>Share your invite link - when friends join, you can follow each other right away.</Text>
          </View>
          <InviteRow icon="share-social-outline" label="Share invite link" onPress={onInvite} />
          <InviteRow icon="chatbubble-ellipses-outline" label="Invite by SMS" onPress={() => Linking.openURL(`sms:?&body=${encodeURIComponent(inviteMessage)}`).catch(() => onInvite())} />
          <InviteRow icon="mail-outline" label="Invite by email" onPress={() => Linking.openURL(`mailto:?subject=${encodeURIComponent("Join me on Teezer")}&body=${encodeURIComponent(inviteMessage)}`).catch(() => onInvite())} />
        </ScrollView>
      )}

      {/* ── Suggestion "…" actions sheet ── */}
      <BottomSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onClosed={() => { sheetPendingRef.current?.(); sheetPendingRef.current = null; }}
        scrollable={false}
      >
        {sheetUser && (
          <View style={{ paddingBottom: spacing.sm }}>
            {/* Who this is about */}
            <View style={styles.sheetHead}>
              <Avatar
                uri={sheetUser.avatar}
                name={sheetUser.display_name || sheetUser.username}
                size={44}
                hasStory={!!sheetUser.has_story}
                storySeen={!!sheetUser.has_story && !sheetUser.has_unseen}
              />
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.sugName} numberOfLines={1}>{sheetUser.display_name || sheetUser.username}</Text>
                  {sheetUser.is_verified && <VerifiedBadge size={14} />}
                </View>
                <Text style={styles.sheetHandle} numberOfLines={1}>@{sheetUser.username}</Text>
              </View>
            </View>

            <SheetRow
              icon="person-circle-outline"
              label="View profile"
              onPress={() => closeSheet(() => goProfile(sheetUser.username))}
            />
            <SheetRow
              icon={isFollowing(sheetUser) ? "person-remove-outline" : "person-add-outline"}
              label={isFollowing(sheetUser) ? "Unfollow" : "Follow"}
              onPress={() => { toggleFollow(sheetUser); closeSheet(); }}
            />
            {/* Messaging was removed with the inbox in the teardown - this row
                closes the sheet and does nothing until Chat is rebuilt and
                re-registered on the root stack. */}
            <SheetRow
              icon="chatbubble-outline"
              label="Send message"
              onPress={() => closeSheet()}
            />
            <SheetRow
              icon="share-social-outline"
              label="Share this profile"
              onPress={() => closeSheet(() => {
                Share.share({ message: `Check out @${sheetUser.username} on Teezer · ${WEB}/@${sheetUser.username}` }).catch(() => {});
              })}
            />
            <SheetRow
              icon="eye-off-outline"
              label="Not interested"
              sub="See fewer suggestions like this"
              onPress={() => { onDismissSug(sheetUser.id); closeSheet(); }}
            />
            <SheetRow
              icon="ban-outline"
              label={`Block @${sheetUser.username}`}
              destructive
              onPress={() => closeSheet(() => onBlock(sheetUser))}
            />
          </View>
        )}
      </BottomSheet>
    </Screen>
  );
}

/* ── One action row inside the "…" sheet ── */
function SheetRow({ icon, label, sub, destructive, onPress }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; sub?: string; destructive?: boolean; onPress: () => void;
}) {
  const tint = destructive ? colors.danger : colors.text;
  return (
    <Pressable style={({ pressed }) => [styles.sheetRow, pressed && { backgroundColor: colors.bgMuted }]} onPress={onPress}>
      <View style={[styles.sheetRowIcon, destructive && { backgroundColor: "#fdecec" }]}>
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.sheetRowLabel, destructive && { color: colors.danger }]}>{label}</Text>
        {!!sub && <Text style={styles.sheetRowSub}>{sub}</Text>}
      </View>
    </Pressable>
  );
}

/* ── Friend request card (horizontal carousel) ── */
function RequestCard({ r, onAccept, onIgnore, onPress }: {
  r: FollowRequest; onAccept: (id: number) => void; onIgnore: (id: number) => void; onPress: (username: string) => void;
}) {
  return (
    <View style={styles.reqCard}>
      <Pressable onPress={() => onPress(r.user.username)} style={{ alignItems: "center" }}>
        <Avatar uri={r.user.avatar} name={r.user.name ?? r.user.username} size={76} />
        <View style={styles.nameRow}>
          <Text style={styles.reqName} numberOfLines={1}>{r.user.name ?? r.user.username}</Text>
          {r.user.is_verified && <VerifiedBadge size={14} />}
        </View>
        <View style={styles.mutualRow}>
          <Ionicons name="people" size={12} color={colors.textMuted} />
          <Text style={styles.reqMeta} numberOfLines={1}>
            {r.user.followers_count ? `${formatCompact(r.user.followers_count)} followers` : `@${r.user.username}`}
          </Text>
        </View>
      </Pressable>
      <View style={styles.reqBtns}>
        <Pressable style={[styles.smBtn, styles.smBtnGhost]} onPress={() => onIgnore(r.id)}>
          <Text style={styles.smBtnGhostText}>Ignore</Text>
        </Pressable>
        <Pressable style={[styles.smBtn, styles.smBtnPrimary]} onPress={() => onAccept(r.id)}>
          <Text style={styles.smBtnPrimaryText}>Accept</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ── Friend request row (expanded "See all" list) ── */
function RequestRow({ r, onAccept, onIgnore, onPress }: {
  r: FollowRequest; onAccept: (id: number) => void; onIgnore: (id: number) => void; onPress: (username: string) => void;
}) {
  return (
    <View style={styles.sugRow}>
      <Pressable style={styles.sugLeft} onPress={() => onPress(r.user.username)}>
        <Avatar uri={r.user.avatar} name={r.user.name ?? r.user.username} size={48} />
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.sugName} numberOfLines={1}>{r.user.name ?? r.user.username}</Text>
            {r.user.is_verified && <VerifiedBadge size={14} />}
          </View>
          <Text style={styles.mutualText} numberOfLines={1}>@{r.user.username}</Text>
        </View>
      </Pressable>
      <Pressable style={[styles.smBtnRow, styles.smBtnGhost]} onPress={() => onIgnore(r.id)}>
        <Text style={styles.smBtnGhostText}>Ignore</Text>
      </Pressable>
      <Pressable style={[styles.smBtnRow, styles.smBtnPrimary]} onPress={() => onAccept(r.id)}>
        <Text style={styles.smBtnPrimaryText}>Accept</Text>
      </Pressable>
    </View>
  );
}

/* ── Contacts / Facebook connect empty-state ── */
function ConnectState({ circleColor, icon, title, sub, cta, ctaColor, onPress }: {
  circleColor: string; icon: React.ReactNode; title: string; sub: string; cta: string; ctaColor?: string; onPress: () => void;
}) {
  return (
    <View style={styles.center}>
      <View style={[styles.connectCircle, { backgroundColor: circleColor }]}>{icon}</View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySub}>{sub}</Text>
      <Pressable style={[styles.primaryBtn, ctaColor ? { backgroundColor: ctaColor } : null]} onPress={onPress}>
        <Text style={styles.primaryBtnText}>{cta}</Text>
      </Pressable>
    </View>
  );
}

/* ── Invite option row ── */
function InviteRow({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.inviteRow} onPress={onPress}>
      <View style={styles.inviteRowIcon}><Ionicons name={icon} size={20} color={colors.brand} /></View>
      <Text style={styles.inviteRowLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  backBtn: { marginLeft: -spacing.xs },
  headerTitle: { fontSize: font.xxl, fontWeight: font.weightHeavy, color: colors.text },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  headerBadge: {
    position: "absolute", top: -6, right: -9, minWidth: 17, height: 17, borderRadius: 9,
    backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
    borderWidth: 1.5, borderColor: colors.bg,
  },
  headerBadgeText: { color: colors.white, fontSize: 10, fontWeight: font.weightHeavy },

  tabs: { flexDirection: "row", paddingHorizontal: spacing.lg, justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tabBtn: { paddingVertical: spacing.sm, alignItems: "center" },
  tabInner: { flexDirection: "row", alignItems: "center", gap: 5 },
  tabLabel: { fontSize: font.md, fontWeight: font.weightMedium, color: colors.textMuted },
  tabLabelActive: { color: colors.text, fontWeight: font.weightHeavy },
  tabUnderline: { marginTop: spacing.xs, height: 2.5, width: "100%", borderRadius: 2, backgroundColor: colors.brand },

  sectionTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text, paddingHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.md },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.md },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionTitleInline: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  badgeText: { color: colors.white, fontSize: 12, fontWeight: font.weightHeavy },
  seeAll: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.brand },

  waysRow: { gap: spacing.md, paddingHorizontal: spacing.lg },
  // Fixed footprint so all four cards line up; content is top-aligned with the
  // subtitle sitting directly under the title (no reserved space between them).
  wayCard: { width: 140, height: 158, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  wayCircle: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: spacing.xs },
  wayTitle: { fontSize: font.sm, fontWeight: font.weightHeavy, color: colors.text, lineHeight: 18 },
  waySubRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 2 },
  waySub: { flex: 1, fontSize: font.xs, color: colors.textMuted, lineHeight: 16 },
  // Overlapping avatar preview in the suggestions card - same 52px-tall slot
  // as the icon discs so all four cards keep identical internal layout.
  wayAvStack: { height: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: spacing.xs },
  wayAvRing: { borderWidth: 2, borderColor: colors.white, borderRadius: 20 },
  wayAvOverlap: { marginLeft: -14 },
  wayAvMore: { width: 38, height: 38, backgroundColor: PURPLE, alignItems: "center", justifyContent: "center" },
  wayAvMoreText: { color: colors.white, fontSize: 11, fontWeight: font.weightHeavy },

  reqRow: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  reqCard: { width: 160, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, alignItems: "center", gap: 4, backgroundColor: colors.card },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  reqName: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text, maxWidth: 105 },
  reqMeta: { fontSize: font.xs, color: colors.textMuted, maxWidth: 110 },
  reqBtns: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, alignSelf: "stretch" },
  smBtn: { flex: 1, height: 36, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  smBtnRow: { height: 34, paddingHorizontal: spacing.md, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  smBtnPrimary: { backgroundColor: colors.brand },
  smBtnPrimaryText: { color: colors.white, fontSize: font.sm, fontWeight: font.weightBold },
  smBtnGhost: { backgroundColor: colors.bgMuted },
  smBtnGhostText: { color: colors.text, fontSize: font.sm, fontWeight: font.weightBold },

  sugRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  sugLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  sugName: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text, flexShrink: 1 },
  mutualRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  mutualText: { fontSize: font.xs, color: colors.textFaint, marginLeft: 5 },
  // Mini avatar stack of mutual friends
  mutualAvRing: { borderWidth: 1.5, borderColor: colors.bg, borderRadius: 10 },
  mutualAvOverlap: { marginLeft: -6 },

  followBtn: { backgroundColor: colors.brand, borderRadius: radius.sm, paddingHorizontal: spacing.lg, height: 36, alignItems: "center", justifyContent: "center", minWidth: 80 },
  followBtnText: { color: colors.white, fontSize: font.sm, fontWeight: font.weightBold },
  followingBtn: { backgroundColor: colors.bgMuted },
  followingBtnText: { color: colors.text },
  moreBtn: { padding: 2 },

  // The dismiss × lives in the top-right corner while the Invite button is
  // inset from the right edge - the two never overlap (× band: top 6-21px,
  // button starts vertically centered well below it, ~24px in from the edge).
  inviteBanner: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.brandTint, borderRadius: radius.lg, marginHorizontal: spacing.lg, marginTop: spacing.xl, paddingVertical: spacing.lg, paddingLeft: spacing.lg, paddingRight: spacing.xl },
  inviteIconWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  inviteTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  inviteSub: { fontSize: font.xs, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
  inviteBtn: { backgroundColor: "#1b1c22", borderRadius: radius.pill, paddingHorizontal: spacing.lg, height: 38, alignItems: "center", justifyContent: "center" },
  inviteBtnText: { color: colors.white, fontSize: font.sm, fontWeight: font.weightBold },
  inviteClose: { position: "absolute", top: 6, right: 6 },

  center: { alignItems: "center", justifyContent: "center", paddingTop: spacing.xxl * 2, paddingHorizontal: spacing.xl, gap: spacing.sm },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  connectCircle: { width: 84, height: 84, borderRadius: 42, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  emptyTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text, textAlign: "center" },
  emptySub: { fontSize: font.sm, color: colors.textMuted, textAlign: "center", lineHeight: 20 },
  primaryBtn: { marginTop: spacing.md, backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: spacing.xxl, paddingVertical: spacing.md },
  primaryBtnText: { color: colors.white, fontWeight: font.weightHeavy, fontSize: font.md },

  inviteHero: { alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, paddingBottom: spacing.xl },
  inviteHeroCircle: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  inviteRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  inviteRowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center" },
  inviteRowLabel: { flex: 1, fontSize: font.md, fontWeight: font.weightMedium, color: colors.text },

  // "…" actions sheet
  sheetHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, marginBottom: spacing.xs },
  sheetHandle: { fontSize: font.sm, color: colors.textMuted, marginTop: 1 },
  sheetRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  sheetRowIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },
  sheetRowLabel: { fontSize: font.md, fontWeight: font.weightMedium, color: colors.text },
  sheetRowSub: { fontSize: font.xs, color: colors.textMuted, marginTop: 1 },
});
