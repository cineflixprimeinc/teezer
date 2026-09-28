import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { ArrowUpRight, Bookmark, AudioWaveform, CircleFadingPlus, Music, Play } from "lucide-react-native";

import { colors } from "@/constants/colors";

/**
 * The sound sheet - opened by the disc at the foot of the feed's action rail.
 *
 * ⚠️ TODO: migrate onto components/BottomSheet.
 *
 * This was written with its own Modal + PanResponder before noticing that
 * mobile/src/components/BottomSheet.tsx already exists and is what eight other
 * sheets use (GiftSheet, AccountSwitcherSheet, DatePickerModal, SettingsKit,
 * and others). Every popup is meant to open, close and swipe-dismiss the same
 * way, and this one currently does not - its drag threshold and spring are
 * hand-tuned rather than shared.
 *
 * BottomSheet's API already covers what is hand-rolled below: visible,
 * onClose, maxHeightRatio, scrollable, dragArea, onDrag/onDragRelease.
 *
 * The one thing to solve when porting: the fixed action bar at the foot of
 * this sheet must NOT scroll with the grid. Check how GiftSheet pins a footer
 * before assuming the bar can just become the last child.
 *
 * (CommentsSheet is a third pattern again - a raw Modal with no drag dismiss -
 * but it has real keyboard-handling reasons to be special, so it should be
 * migrated deliberately rather than mechanically.)
 *
 * A bottom sheet rather than a route on purpose: it sits over the paused post
 * it came from, so dismissing it returns you to the same frame rather than
 * popping a navigation stack.
 *
 * Deliberately presentational. Every action is a prop, and the video list is
 * passed in - the sheet neither fetches nor knows where a sound's posts come
 * from, so it can be mounted from the feed, a profile or the sound page later
 * without carrying a data layer with it.
 */

export interface SoundSheetVideo {
  id: number | string;
  thumbnailUrl?: string | null;
  /** Pre-formatted for display ("346.7K") - the sheet does no number work. */
  views: string;
  /** Ribbon in the tile's top-left. Undefined renders no ribbon. */
  tag?: "original" | "template";
}

export interface SoundSheetProps {
  visible: boolean;
  onClose: () => void;

  title: string;
  /** Second line, e.g. "lofi bina · Original audio". */
  subtitle?: string | null;
  coverUrl?: string | null;
  /** Formatted duration, e.g. "15s". */
  duration?: string | null;
  /** Handle without the @ - the sheet adds it. */
  originalBy?: string | null;
  /** Formatted, e.g. "1,100 posts". */
  postCount?: string | null;
  videos?: SoundSheetVideo[];
  saved?: boolean;

  /** The ↗ in the corner: promote this sheet to the full sound page. */
  onExpand?: () => void;
  onPlayFullSong?: () => void;
  onToggleSave?: () => void;
  onOpenVideo?: (video: SoundSheetVideo) => void;
  onAddToStory?: () => void;
  onUseSound?: () => void;
}

/** Half the screen. The sheet is a peek at the sound, not a page - leaving the
 *  post visible above it is what makes it read as an overlay you can dismiss
 *  rather than somewhere you navigated to. The grid scrolls inside. */
const SHEET_MAX_RATIO = 0.7;

export function SoundSheet({
  visible,
  onClose,
  title,
  subtitle,
  coverUrl,
  duration,
  originalBy,
  postCount,
  videos = [],
  saved = false,
  onExpand,
  onPlayFullSong,
  onToggleSave,
  onOpenVideo,
  onAddToStory,
  onUseSound,
}: SoundSheetProps) {
  const screenH = Dimensions.get("window").height;
  const sheetH = Math.round(screenH * SHEET_MAX_RATIO);

  // Driven manually rather than with LayoutAnimation so the slide can run on
  // the native thread and stay smooth while the list behind it is still
  // settling.
  const slide = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 0 : 1,
      duration: 300,
      // Matches the rise used elsewhere in the app's sheets.
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    }).start();
  }, [visible, slide]);

  /*
   * Drag-to-dismiss.
   *
   * `drag` is a second offset added to the slide, so a finger can move the
   * sheet without fighting the open/close animation. Released past a third of
   * the sheet - or on a quick downward flick - it closes; otherwise it springs
   * back.
   *
   * The responder is on the WHOLE sheet, not just the handle - a 28pt grab
   * strip is too small to find, which is why dragging felt broken. It stays
   * out of the ScrollView's way by only claiming the gesture when the list is
   * already scrolled to the top: past that, a downward drag is a scroll, and
   * below it there is nothing left to scroll so it can only mean dismiss.
   */
  const drag = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(0);
  // Latched for the whole dismissal, mirroring useSheetDrag.ts's own `closing`
  // ref. Without it, a second onMoveShouldSetPanResponder grant during the
  // 160ms exit animation could start a fresh drag on `drag` while the first
  // animation is still racing toward its own onClose() callback - two writers
  // fighting over one Animated.Value, which is exactly the class of bug that
  // left CommentsSheet's own drag stuck mid-close before useSheetDrag.ts was
  // fixed. This sheet has no live media resource, so the risk here is only a
  // stuck/stranded gesture, not a crash - but the same guard applies.
  const closing = useRef(false);

  useEffect(() => {
    if (visible) closing.current = false;
  }, [visible]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Three conditions, all required: the list is at its top, the finger
        // has clearly moved down (not a tap), and the movement is vertical
        // rather than a horizontal swipe. A dismissal already in flight owns
        // the sheet - a stray touch during the exit animation must not start
        // a second drag.
        onMoveShouldSetPanResponder: (_e, g) =>
          !closing.current && scrollY.current <= 0 && g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_e, g) => {
          if (closing.current) return;
          // Downward only - dragging up must not lift the sheet off its edge.
          drag.setValue(Math.max(0, g.dy));
        },
        onPanResponderRelease: (_e, g) => {
          if (closing.current) return;
          if (g.dy > sheetH / 3 || g.vy > 0.6) {
            closing.current = true;
            // Carry the sheet the rest of the way out, then unmount it, so the
            // close reads as one continuous motion rather than a jump.
            Animated.timing(drag, {
              toValue: sheetH,
              duration: 160,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }).start(() => {
              drag.setValue(0);
              onClose();
            });
            return;
          }
          Animated.spring(drag, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
        },
      }),
    [drag, onClose, sheetH],
  );

  const translateY = Animated.add(
    slide.interpolate({ inputRange: [0, 1], outputRange: [0, sheetH] }),
    drag,
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Scrim. Pressing it dismisses, which is the gesture users try first. */}
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />

      <Animated.View
        style={[styles.sheet, { height: sheetH, transform: [{ translateY }] }]}
        {...pan.panHandlers}
      >
        <View style={styles.handleWrap}>
          <View style={styles.handle} />
        </View>

        <ScrollView
          style={styles.flex}
          // Feeds the responder above: it only claims a drag while this is at
          // the top, so scrolling the grid and dismissing never compete.
          onScroll={({ nativeEvent }) => {
            scrollY.current = nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          // The action bar is fixed over the list, so the content has to clear
          // it or the last row of tiles is unreachable.
          contentContainerStyle={styles.scrollPad}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Sound identity ─────────────────────────────────────────── */}
          <View style={styles.headRow}>
            <View style={styles.discRing}>
              {coverUrl ? (
                <Image source={{ uri: coverUrl }} style={styles.discArt} contentFit="cover" transition={140} />
              ) : (
                <View style={[styles.discArt, styles.discFallback]}>
                  <Music size={20} color={colors.white} />
                </View>
              )}
              <View style={styles.discHole} />
            </View>

            <View style={styles.flex}>
              <Text style={styles.title} numberOfLines={1}>{title}</Text>
              {subtitle ? (
                <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
              ) : null}
            </View>

            {/* ↗ promotes the sheet to the full sound page. */}
            <Pressable
              onPress={onExpand}
              hitSlop={10}
              style={styles.shareBtn}
              accessibilityRole="button"
              accessibilityLabel="Open sound page"
            >
              <ArrowUpRight size={20} color={colors.text} />
            </Pressable>
          </View>

          {/* ── Meta ───────────────────────────────────────────────────── */}
          <View style={styles.metaRow}>
            <Play size={11} color={colors.text} fill={colors.text} />
            {duration ? <Text style={styles.metaStrong}>{duration}</Text> : null}
            <View style={styles.metaDivider} />
            <Text style={styles.metaMuted} numberOfLines={1}>
              Original sound by:{" "}
              <Text style={styles.metaLink}>@{originalBy ?? "unknown"}</Text>
            </Text>
            {postCount ? <Text style={styles.metaCount}>{postCount}</Text> : null}
          </View>

          {/* ── Actions ────────────────────────────────────────────────── */}
          <View style={styles.pillRow}>
            <Pressable onPress={onPlayFullSong} style={styles.pill} accessibilityRole="button">
              <View style={styles.pillIcon} />
              <Text style={styles.pillText}>Play full song</Text>
            </Pressable>
            <Pressable onPress={onToggleSave} style={styles.pill} accessibilityRole="button">
              <Bookmark
                size={15}
                color={colors.text}
                fill={saved ? colors.text : "transparent"}
              />
              <Text style={styles.pillText}>{saved ? "Saved" : "Save"}</Text>
            </Pressable>
          </View>

          {/* ── Posts using this sound ─────────────────────────────────── */}
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
        </ScrollView>

        {/* ── Fixed action bar ─────────────────────────────────────────── */}
        <View style={styles.actionBar}>
          <Pressable onPress={onAddToStory} style={styles.outlineBtn} accessibilityRole="button">
            <CircleFadingPlus size={16} color={colors.text} />
            <Text style={styles.outlineBtnText}>Add to Story</Text>
          </Pressable>
          <Pressable onPress={onUseSound} style={styles.solidBtn} accessibilityRole="button">
            <AudioWaveform size={16} color={colors.white} />
            <Text style={styles.solidBtnText}>Use sound</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.45)" },

  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    // Nothing may bleed past the rounded top corners.
    overflow: "hidden",
  },

  // Padded well beyond the 4pt bar itself: this whole strip is the drag target,
  // and a 14pt-tall grab area is missed as often as it is hit.
  handleWrap: { alignItems: "center", paddingTop: 10, paddingBottom: 14 },
  handle: { width: 38, height: 4, borderRadius: 999, backgroundColor: "#D8D4DC" },

  // Generous top padding so the disc never crowds the corner radius.
  scrollPad: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 104 },

  headRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  discRing: {
    width: 54, height: 54, borderRadius: 999,
    borderWidth: 2, borderColor: colors.brand,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#2A1F24",
  },
  discArt: { width: 46, height: 46, borderRadius: 999 },
  discFallback: { backgroundColor: "#7A1B33", alignItems: "center", justifyContent: "center" },
  discHole: {
    position: "absolute", width: 12, height: 12, borderRadius: 999,
    backgroundColor: colors.white,
  },

  title: { fontSize: 17, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  subtitle: { marginTop: 2, fontSize: 12.5, color: colors.textMuted },

  shareBtn: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },

  metaRow: { marginTop: 14, flexDirection: "row", alignItems: "center", gap: 6 },
  metaStrong: { fontSize: 12, fontWeight: "700", color: colors.text },
  metaDivider: { width: 1, height: 11, backgroundColor: colors.borderStrong, marginHorizontal: 2 },
  metaMuted: { flex: 1, minWidth: 0, fontSize: 12, color: colors.textMuted },
  metaLink: { color: colors.text, fontWeight: "700" },
  metaCount: { fontSize: 11.5, color: colors.textFaint, fontWeight: "600" },

  pillRow: { marginTop: 14, flexDirection: "row", gap: 10 },
  pill: {
    flex: 1, height: 42, borderRadius: 10,
    backgroundColor: colors.bgMuted,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  pillIcon: { width: 13, height: 13, borderRadius: 3, backgroundColor: colors.brand },
  pillText: { fontSize: 13.5, fontWeight: "700", color: colors.text },

  grid: { marginTop: 16, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tile: {
    // Three columns with two 6pt gaps between them.
    width: "31.8%",
    aspectRatio: 0.62,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: colors.bgMuted,
  },
  tileArt: { ...StyleSheet.absoluteFill },
  tileFallback: { backgroundColor: "#8E8AF0" },

  ribbon: {
    position: "absolute", top: 6, left: 6,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
  },
  ribbonOriginal: { backgroundColor: colors.brand },
  ribbonTemplate: { backgroundColor: "rgba(0,0,0,0.82)" },
  ribbonText: { fontSize: 9.5, fontWeight: "800", color: colors.white },

  tileViews: {
    position: "absolute", left: 7, bottom: 6,
    fontSize: 11, fontWeight: "700", color: colors.white,
    // No scrim behind the number, so it needs its own contrast.
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  actionBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    flexDirection: "row", gap: 10,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20,
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
    flex: 1.25, height: 46, borderRadius: 999,
    backgroundColor: colors.brand,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
  },
  solidBtnText: { fontSize: 14, fontWeight: "800", color: colors.white },
});
