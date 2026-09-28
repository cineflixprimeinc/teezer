import { useMemo, useState } from "react";
import { FollowButton } from "@/components/FollowButton";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { ChevronLeft } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { Skeleton } from "@/components/Skeleton";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { suggestionApi, SuggestedProfile } from "@/api/suggestion.api";
import { videoApi } from "@/api/video.api";
import { useAuthStore } from "@/store/auth.store";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";
import { formatCompact } from "@/utils/format";

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

/**
 * Full-page list of accounts picked by the recommendation engine - the same
 * GET /suggestions/profiles ranking the website uses. Opened from the
 * "Teezer suggestions" card on Find Friends.
 */
export function SuggestedAccountsScreen() {
  const navigation = useNavigation<any>();
  const isAuthed = useAuthStore((s) => s.status === "authenticated");

  const [followMap, setFollowMap] = useState<Record<string, boolean>>({});
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const suggestionsQ = useQuery({
    queryKey: ["suggested-accounts"],
    queryFn: () => suggestionApi.profiles("friends", 50),
    enabled: isAuthed,
  });
  const suggestions = useMemo(
    () => (suggestionsQ.data ?? []).filter((s) => !dismissed.has(s.id)),
    [suggestionsQ.data, dismissed],
  );

  const goProfile = (_username: string) => {};

  const isFollowing = (s: SuggestedProfile) => followMap[s.username] ?? s.is_following;
  const toggleFollow = (s: SuggestedProfile) => {
    const next = !isFollowing(s);
    setFollowMap((m) => ({ ...m, [s.username]: next }));
    (next ? videoApi.follow(s.username) : videoApi.unfollow(s.username)).catch(() =>
      setFollowMap((m) => ({ ...m, [s.username]: !next })),
    );
    if (next) suggestionApi.markFollowed(s.id);
  };
  const onDismiss = (id: number) => { setDismissed((s) => new Set(s).add(id)); suggestionApi.dismiss(id); };

  return (
    <Screen edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft size={24} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headerTitle}>Suggested accounts</Text>
        <Pressable hitSlop={10} onPress={() => undefined}>
          <Ionicons name="search" size={23} color={colors.text} />
        </Pressable>
      </View>
      <Text style={styles.headerSub}>Accounts picked for you based on who you follow and interact with.</Text>

      {suggestionsQ.isLoading ? (
        <View style={{ paddingTop: spacing.sm }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <View key={i} style={styles.row}>
              <Skeleton width={52} height={52} radius={26} />
              <View style={{ flex: 1 }}><Skeleton width="45%" height={13} /><Skeleton width="30%" height={11} style={{ marginTop: 7 }} /></View>
              <Skeleton width={86} height={36} radius={radius.sm} />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={suggestions}
          keyExtractor={(s) => String(s.id)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          refreshControl={
            <RefreshControl refreshing={suggestionsQ.isRefetching} onRefresh={() => suggestionsQ.refetch()} tintColor={colors.brand} />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <View style={styles.emptyIcon}><Ionicons name="sparkles-outline" size={34} color={colors.brand} /></View>
              <Text style={styles.emptyTitle}>No suggestions right now</Text>
              <Text style={styles.emptySub}>Follow a few creators and the algorithm will find people for you.</Text>
              <Pressable style={styles.primaryBtn} onPress={() => undefined}>
                <Text style={styles.primaryBtnText}>Search people</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item: s }) => (
            <View style={styles.row}>
              <Pressable style={styles.rowLeft} onPress={() => goProfile(s.username)}>
                <Avatar
                  uri={s.avatar}
                  name={s.display_name || s.username}
                  size={52}
                  hasStory={!!s.has_story}
                  storySeen={!!s.has_story && !s.has_unseen}
                />
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>{s.display_name || s.username}</Text>
                    {s.is_verified && <VerifiedBadge size={14} />}
                  </View>
                  <Text style={styles.handle} numberOfLines={1}>@{s.username}</Text>
                  <View style={styles.metaRow}>
                    <Ionicons name="people" size={12} color={colors.textFaint} />
                    <Text style={styles.metaText} numberOfLines={1}>
                      {s.mutual_followers_count > 0
                        ? `${formatCompact(s.mutual_followers_count)} mutual friends`
                        : `${formatCompact(s.followers_count)} followers`}
                    </Text>
                  </View>
                </View>
              </Pressable>
              <FollowButton following={isFollowing(s)} onPress={() => toggleFollow(s)} />
              <Pressable hitSlop={8} onPress={() => onDismiss(s.id)} style={styles.xBtn}>
                <Ionicons name="close" size={19} color={colors.textFaint} />
              </Pressable>
            </View>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  backBtn: { marginLeft: -spacing.xs },
  headerTitle: { flex: 1, fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text },
  headerSub: { fontSize: font.sm, color: colors.textMuted, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },

  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  rowLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text, flexShrink: 1 },
  handle: { fontSize: font.sm, color: colors.textMuted, marginTop: 1 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  metaText: { fontSize: font.xs, color: colors.textFaint },

  followBtn: { backgroundColor: colors.brand, borderRadius: radius.sm, paddingHorizontal: spacing.lg, height: 36, alignItems: "center", justifyContent: "center", minWidth: 82 },
  followBtnText: { color: colors.white, fontSize: font.sm, fontWeight: font.weightBold },
  followingBtn: { backgroundColor: colors.bgMuted },
  followingBtnText: { color: colors.text },
  xBtn: { padding: 2 },

  center: { alignItems: "center", justifyContent: "center", paddingTop: spacing.xxl * 2, paddingHorizontal: spacing.xl, gap: spacing.sm },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  emptyTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text, textAlign: "center" },
  emptySub: { fontSize: font.sm, color: colors.textMuted, textAlign: "center", lineHeight: 20 },
  primaryBtn: { marginTop: spacing.md, backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: spacing.xxl, paddingVertical: spacing.md },
  primaryBtnText: { color: colors.white, fontWeight: font.weightHeavy, fontSize: font.md },
});
