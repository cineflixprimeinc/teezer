import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ds } from "@/theme/design";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { suggestionApi, type SuggestedProfile } from "@/api/suggestion.api";
import { videoApi } from "@/api/video.api";
import { useAuthStore } from "@/store/auth.store";
import { useAuthGate } from "@/store/auth-gate.store";

/**
 * Suggested accounts, opened by the chevron in a profile's action row.
 *
 * The ranking is entirely the server's - GET /suggestions/profiles, the same
 * endpoint and the same context rules the website uses - so the app shows the
 * identical accounts the web profile does rather than a second, divergent idea
 * of who to suggest.
 *
 * The context is what makes this useful on someone else's page: "creator_profile"
 * asks for accounts SIMILAR TO the profile being viewed, where "profile" would
 * return the same generic list on every page. Mirrors the website's own rule in
 * suggested-accounts-section.tsx.
 */

const CARD_W = 142;

/**
 * Every card is exactly this tall, so the Follow buttons line up across the
 * rail no matter how much text each account carries.
 *
 *   16 padding + 56 avatar + 5 gap + 16 name + 5 gap + 14 handle + 5 gap
 *   + 26 reason (2 lines) + 10 slack + 30 button + 12 padding
 */
const CARD_H = 195;

function CloseGlyph() {
  return (
    <Svg width={11} height={11} viewBox="0 0 24 24" fill="none">
      <Path d="m18 6-12 12M6 6l12 12" stroke={ds.textMuted} strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  );
}

/** Same three stops used everywhere else this ring already appears
 *  (Avatar.tsx, ProfileTabScreen, the Inbox story rail, the feed rail). */
const STORY_RING_COLORS = ["#F42B5B", "#FF6E90", "#8B5CF6"] as const;
const STORY_RING_SEEN_COLOR = "#E3DFE7";

function Avatar({
  uri, name, size = 56, hasStory, storySeen,
}: { uri?: string | null; name: string; size?: number; hasStory?: boolean; storySeen?: boolean }) {
  const content = uri
    ? (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: ds.surfaceSunken }}
        contentFit="cover"
        transition={120}
      />
    )
    : (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: ds.accent,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: ds.onDark, fontWeight: "800", fontSize: size * 0.4 }}>
          {(name?.[0] ?? "?").toUpperCase()}
        </Text>
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

export function SuggestedAccountsPanel({
  profileUserId,
  isOwnProfile,
  onOpenProfile,
  onViewAll,
}: {
  /** Whose profile this is showing under. Drives the "similar to them" ranking. */
  profileUserId?: number;
  isOwnProfile: boolean;
  onOpenProfile: (username: string) => void;
  onViewAll: () => void;
}) {
  const authUser = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const [followed, setFollowed] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState<Record<number, boolean>>({});
  const [dismissed, setDismissed] = useState<Record<number, boolean>>({});

  const context = !isOwnProfile && profileUserId ? "creator_profile" : "profile";
  const key = ["suggestions-profiles", context, profileUserId ?? "own"] as const;

  const { data: raw = [], isLoading } = useQuery<SuggestedProfile[]>({
    queryKey: key,
    queryFn: () => suggestionApi.profiles(context, 20, !isOwnProfile ? profileUserId : undefined),
    staleTime: 120_000,
    // The engine ranks against YOUR graph, so there is nothing to ask for
    // signed out - and the endpoint requires auth anyway.
    enabled: !!authUser,
  });

  const list = raw.filter((s) => !dismissed[s.id]);

  const follow = useCallback(
    (s: SuggestedProfile) => {
      if (!authUser) {
        useAuthGate.getState().open();
        return;
      }
      if (busy[s.id]) return;
      setBusy((b) => ({ ...b, [s.id]: true }));
      videoApi
        .follow(s.username)
        .then(() => {
          setFollowed((f) => ({ ...f, [s.id]: true }));
          // Best-effort signal so the engine stops offering them.
          void suggestionApi.markFollowed(s.id);
          // Re-rank once the follow has landed, the same delay the website uses
          // - immediately would race the write it is meant to reflect.
          setTimeout(() => void qc.invalidateQueries({ queryKey: key }), 1500);
        })
        .catch(() => {})
        .finally(() => setBusy((b) => ({ ...b, [s.id]: false })));
    },
    [authUser, busy, qc, key],
  );

  const dismiss = useCallback((s: SuggestedProfile) => {
    // Optimistic and one-way: the card goes now, the signal is best-effort.
    setDismissed((d) => ({ ...d, [s.id]: true }));
    void suggestionApi.dismiss(s.id);
  }, []);

  if (!authUser) {
    return (
      <View style={styles.panel}>
        <Text style={styles.emptyText}>Log in to see accounts we think you'll like.</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.panel}>
        <View style={styles.header}>
          <Text style={styles.title}>Suggested accounts</Text>
        </View>
        <View style={styles.loading}>
          <ActivityIndicator color={ds.accent} />
        </View>
      </View>
    );
  }

  if (!list.length) {
    return (
      <View style={styles.panel}>
        <Text style={styles.emptyText}>No suggestions right now - check back later.</Text>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>Suggested accounts</Text>
        <Pressable onPress={onViewAll} hitSlop={8} accessibilityRole="button">
          <Text style={styles.viewAll}>View all</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        // The profile's own vertical scroller owns up/down; this only takes
        // sideways movement.
        directionalLockEnabled
      >
        {list.map((s) => {
          const isFollowing = followed[s.id] || s.is_following;
          return (
            <View key={s.id} style={styles.card}>
              <Pressable
                onPress={() => dismiss(s)}
                hitSlop={8}
                style={styles.dismiss}
                accessibilityRole="button"
                accessibilityLabel={`Dismiss ${s.username}`}
              >
                <CloseGlyph />
              </Pressable>

              <Pressable
                onPress={() => onOpenProfile(s.username)}
                accessibilityRole="button"
                accessibilityLabel={`Open @${s.username}`}
                style={styles.cardTop}
              >
                <Avatar
                  uri={s.avatar}
                  name={s.display_name || s.username}
                  hasStory={!!s.has_story}
                  storySeen={!!s.has_story && !s.has_unseen}
                />
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
                    {s.display_name || s.username}
                  </Text>
                  {s.is_verified && <VerifiedBadge size={12} />}
                </View>
                <Text style={styles.handle} numberOfLines={1} ellipsizeMode="tail">
                  @{s.username}
                </Text>
                {/* Rendered even when empty. The reason is the one field that
                    varies from nothing to two lines, so reserving its slot is
                    what keeps every card - and therefore every Follow button -
                    on the same line. */}
                <Text style={styles.reason} numberOfLines={2} ellipsizeMode="tail">
                  {s.reason ?? ""}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => follow(s)}
                disabled={isFollowing || busy[s.id]}
                style={[styles.followBtn, isFollowing && styles.followBtnOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: isFollowing }}
              >
                {busy[s.id] ? (
                  <ActivityIndicator size="small" color={isFollowing ? ds.text : ds.onDark} />
                ) : (
                  <Text style={[styles.followText, isFollowing && styles.followTextOn]}>
                    {isFollowing ? "Following" : "Follow"}
                  </Text>
                )}
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: 10,
    marginHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ds.line,
    backgroundColor: ds.surface,
    paddingVertical: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  title: { fontSize: 14, fontWeight: "700", color: ds.text },
  viewAll: { fontSize: 12, fontWeight: "700", color: ds.accent },

  loading: { height: 150, alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 13, color: ds.textMuted, paddingHorizontal: 14, paddingVertical: 6 },

  rail: { paddingHorizontal: 12, gap: 10 },
  /**
   * Fixed height, not content height.
   *
   * Every text slot below is pinned to an exact number of lines, so the cards
   * come out identical and the Follow buttons land on one line across the whole
   * rail. Height is stated as well as implied: it makes the row's alignment
   * independent of anything a single account's data might do (a taller script,
   * a name that renders above its line box).
   */
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ds.lineSoft,
    backgroundColor: ds.surfaceMuted,
    paddingTop: 16,
    paddingBottom: 12,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  dismiss: { position: "absolute", right: 6, top: 6, padding: 4, zIndex: 2 },
  cardTop: { alignItems: "center", gap: 5, width: "100%" },
  // Pinned too, so a verified card's rows sit at the same heights as an
  // unverified one's - the 12pt badge fits inside the name's own line box.
  nameRow: { flexDirection: "row", alignItems: "center", gap: 3, maxWidth: "100%", height: 16 },
  // flexShrink lets a long name give up width to the badge beside it and
  // ellipsise, rather than pushing the badge off the card.
  name: { fontSize: 12.5, lineHeight: 16, fontWeight: "700", color: ds.text, flexShrink: 1 },
  handle: { fontSize: 10.5, lineHeight: 14, color: ds.textFaint },
  // Two lines' worth, always - see the note where it is rendered.
  reason: { fontSize: 10, lineHeight: 13, height: 26, color: ds.silver, textAlign: "center" },

  followBtn: {
    width: "100%",
    height: 30,
    borderRadius: 999,
    backgroundColor: ds.accent,
    alignItems: "center",
    justifyContent: "center",
    // Takes up whatever slack is left, pinning the button to the bottom edge of
    // the fixed-height card.
    marginTop: "auto",
  },
  followBtnOn: { backgroundColor: ds.surfaceAlt2 },
  followText: { fontSize: 11.5, fontWeight: "700", color: ds.onDark },
  followTextOn: { color: ds.textDim },
});
