import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bookmark, AudioWaveform, ChevronLeft, CircleFadingPlus, Music, Play, Share2 } from "lucide-react-native";

import { colors } from "@/constants/colors";
import type { SoundSheetVideo } from "./SoundSheet";

/**
 * The full sound page - what the sheet's ↗ promotes to.
 *
 * Same information as SoundSheet, given room: a hero instead of a row, real
 * stat columns, and a grid that pages instead of showing the first nine.
 *
 * Presentational for the same reason the sheet is: every action and the video
 * list are props, so this renders identically whether the data came from the
 * feed, a profile, or a future /sounds/{id} fetch. It deliberately does NOT
 * call an API - there is no /sounds/{id}/videos endpoint yet, and baking one
 * in here would have to be unpicked when it lands.
 */

export interface SoundPageProps {
  title: string;
  subtitle?: string | null;
  coverUrl?: string | null;
  originalBy?: string | null;
  /** Formatted for display - this screen does no number work. */
  postCount?: string | null;
  totalViews?: string | null;
  duration?: string | null;

  videos?: SoundSheetVideo[];
  saved?: boolean;
  /** Shows the grid spinner. The header renders regardless, so the page never
   *  appears blank while posts are still arriving. */
  loading?: boolean;
  /** Appends a spinner under the grid during pagination. */
  loadingMore?: boolean;

  onBack: () => void;
  onShare?: () => void;
  onPlayFullSong?: () => void;
  onToggleSave?: () => void;
  onOpenVideo?: (video: SoundSheetVideo) => void;
  onEndReached?: () => void;
  onAddToStory?: () => void;
  onUseSound?: () => void;
}

export function SoundPageScreen({
  title,
  subtitle,
  coverUrl,
  originalBy,
  postCount,
  totalViews,
  duration,
  videos = [],
  saved = false,
  loading = false,
  loadingMore = false,
  onBack,
  onShare,
  onPlayFullSong,
  onToggleSave,
  onOpenVideo,
  onEndReached,
  onAddToStory,
  onUseSound,
}: SoundPageProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={onBack} hitSlop={10} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Back">
          <ChevronLeft size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>Sound</Text>
        <Pressable onPress={onShare} hitSlop={10} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Share sound">
          <Share2 size={19} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scrollPad, { paddingBottom: 96 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        onScroll={({ nativeEvent: e }) => {
          // Simple threshold rather than a FlatList: the grid is a wrapping
          // row of fixed tiles, which FlatList's numColumns handles worse than
          // flexWrap does once tiles carry ribbons and overlays.
          const nearEnd =
            e.layoutMeasurement.height + e.contentOffset.y >= e.contentSize.height - 400;
          if (nearEnd && !loadingMore) onEndReached?.();
        }}
        scrollEventThrottle={200}
      >
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <View style={styles.hero}>
          <View style={styles.coverRing}>
            {coverUrl ? (
              <Image source={{ uri: coverUrl }} style={styles.cover} contentFit="cover" transition={160} />
            ) : (
              <View style={[styles.cover, styles.coverFallback]}>
                <Music size={30} color={colors.white} />
              </View>
            )}
          </View>

          <View style={styles.flex}>
            <Text style={styles.title} numberOfLines={2}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
            {originalBy ? (
              <Text style={styles.byline} numberOfLines={1}>
                Original sound by <Text style={styles.bylineStrong}>@{originalBy}</Text>
              </Text>
            ) : null}
          </View>
        </View>

        {/* ── Stats. Each column is omitted when its value is absent, so a
               sound with no analytics shows a shorter row, not zeroes. ─── */}
        {(postCount || totalViews || duration) ? (
          <View style={styles.stats}>
            {postCount ? <Stat label="Posts" value={postCount} /> : null}
            {totalViews ? <Stat label="Views" value={totalViews} /> : null}
            {duration ? <Stat label="Length" value={duration} /> : null}
          </View>
        ) : null}

        {/* ── Actions ──────────────────────────────────────────────────── */}
        <View style={styles.pillRow}>
          <Pressable onPress={onPlayFullSong} style={styles.pill} accessibilityRole="button">
            <Play size={14} color={colors.text} fill={colors.text} />
            <Text style={styles.pillText}>Play full song</Text>
          </Pressable>
          <Pressable onPress={onToggleSave} style={styles.pill} accessibilityRole="button">
            <Bookmark size={15} color={colors.text} fill={saved ? colors.text : "transparent"} />
            <Text style={styles.pillText}>{saved ? "Saved" : "Save"}</Text>
          </Pressable>
        </View>

        {/* ── Posts ────────────────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Videos using this sound</Text>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : videos.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>No videos are using this sound yet.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {videos.map((v) => (
              <Pressable
                key={String(v.id)}
                onPress={() => onOpenVideo?.(v)}
                style={styles.tile}
                accessibilityRole="button"
              >
                {v.thumbnailUrl ? (
                  <Image source={{ uri: v.thumbnailUrl }} style={styles.tileArt} contentFit="cover" transition={140} />
                ) : (
                  <View style={[styles.tileArt, styles.tileFallback]} />
                )}

                {v.tag ? (
                  <View style={[styles.ribbon, v.tag === "original" ? styles.ribbonOriginal : styles.ribbonTemplate]}>
                    <Text style={styles.ribbonText}>
                      {v.tag === "original" ? "Original" : "Template"}
                    </Text>
                  </View>
                ) : null}

                <Text style={styles.tileViews}>{v.views}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {loadingMore ? (
          <View style={styles.moreSpinner}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : null}
      </ScrollView>

      {/* ── Fixed action bar ───────────────────────────────────────────── */}
      <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Pressable onPress={onAddToStory} style={styles.outlineBtn} accessibilityRole="button">
          <CircleFadingPlus size={16} color={colors.text} />
          <Text style={styles.outlineBtnText}>Add to Story</Text>
        </Pressable>
        <Pressable onPress={onUseSound} style={styles.solidBtn} accessibilityRole="button">
          <AudioWaveform size={16} color={colors.white} />
          <Text style={styles.solidBtnText}>Use sound</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCol}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1, minWidth: 0 },
  center: { paddingVertical: 40, alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 13, color: colors.textMuted },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "800", color: colors.text },

  scrollPad: { paddingHorizontal: 16, paddingTop: 18 },

  hero: { flexDirection: "row", alignItems: "center", gap: 14 },
  coverRing: {
    width: 92, height: 92, borderRadius: 18,
    borderWidth: 2, borderColor: colors.brand,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#2A1F24", overflow: "hidden",
  },
  cover: { width: "100%", height: "100%" },
  coverFallback: { backgroundColor: "#7A1B33", alignItems: "center", justifyContent: "center" },

  title: { fontSize: 20, fontWeight: "800", color: colors.text, letterSpacing: -0.4 },
  subtitle: { marginTop: 3, fontSize: 13, color: colors.textMuted },
  byline: { marginTop: 6, fontSize: 12.5, color: colors.textMuted },
  bylineStrong: { color: colors.text, fontWeight: "700" },

  stats: {
    marginTop: 18, flexDirection: "row",
    backgroundColor: colors.bgMuted, borderRadius: 14, paddingVertical: 12,
  },
  statCol: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 15, fontWeight: "800", color: colors.text },
  statLabel: { marginTop: 2, fontSize: 11, color: colors.textMuted, fontWeight: "600" },

  pillRow: { marginTop: 16, flexDirection: "row", gap: 10 },
  pill: {
    flex: 1, height: 44, borderRadius: 10, backgroundColor: colors.bgMuted,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  pillText: { fontSize: 13.5, fontWeight: "700", color: colors.text },

  sectionTitle: { marginTop: 22, marginBottom: 12, fontSize: 14.5, fontWeight: "800", color: colors.text },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tile: {
    width: "31.8%", aspectRatio: 0.62, borderRadius: 10,
    overflow: "hidden", backgroundColor: colors.bgMuted,
  },
  tileArt: { ...StyleSheet.absoluteFill },
  tileFallback: { backgroundColor: "#8E8AF0" },

  ribbon: { position: "absolute", top: 6, left: 6, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  ribbonOriginal: { backgroundColor: colors.brand },
  ribbonTemplate: { backgroundColor: "rgba(0,0,0,0.82)" },
  ribbonText: { fontSize: 9.5, fontWeight: "800", color: colors.white },

  tileViews: {
    position: "absolute", left: 7, bottom: 6,
    fontSize: 11, fontWeight: "700", color: colors.white,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  moreSpinner: { paddingVertical: 18, alignItems: "center" },

  actionBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    flexDirection: "row", gap: 10,
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: colors.white,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  outlineBtn: {
    flex: 1, height: 46, borderRadius: 999,
    borderWidth: 1.5, borderColor: colors.borderStrong,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
  },
  outlineBtnText: { fontSize: 14, fontWeight: "800", color: colors.text },
  solidBtn: {
    flex: 1.25, height: 46, borderRadius: 999, backgroundColor: colors.brand,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
  },
  solidBtnText: { fontSize: 14, fontWeight: "800", color: colors.white },
});
