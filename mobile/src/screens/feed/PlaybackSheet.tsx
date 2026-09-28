import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { haptics } from "@/services/haptics";
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  Animated,
  Platform,
  useWindowDimensions,
} from "react-native";
import {
  GestureHandlerRootView,
  PanGestureHandler,
  ScrollView as GHScrollView,
} from "react-native-gesture-handler";
import Svg, { Path } from "react-native-svg";
import { ds } from "@/theme/design";
import { videoApi } from "@/api/video.api";
import { usePrefsStore } from "@/store/prefs.store";
import { useAuthStore } from "@/store/auth.store";
import { useAuthGate } from "@/store/auth-gate.store";
import type { ContentPreferences, VideoQuality } from "@/api/prefs.api";
import { useSheetDrag } from "./useSheetDrag";
import type { Video } from "@/types";
import { ReportSheet } from "@/components/report/ReportSheet";

/**
 * Playback options - the sheet a long-press on a feed post opens.
 *
 * Restores the website's video options menu (Quality / Playback speed / Auto
 * scroll) as a bottom sheet, which is where the app's old build put it and
 * where the redesign's other feed popups live. Loop is here too: the app has
 * always had the pref, but never a control for it.
 *
 * Every value is read and written through `usePrefsStore`, the shared
 * GET/PATCH /profile/content-preferences cache that Content Preferences in
 * Settings already uses - so a speed picked on the feed is the same one that
 * screen shows, and it survives a restart. Quality is the exception: it is
 * per-video by nature, so the sheet only offers the renditions THIS post has.
 *
 * Guests get the same controls, applied locally: their PATCH would 401 and the
 * store would roll the change straight back, which reads as a broken switch.
 */

/* ── Glyphs (Lucide paths, drawn on the 24 viewBox the set is designed for) ── */

function Glyph({ d, size = 20, stroke, width = 1.9 }: { d: string[]; size?: number; stroke: string; width?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {d.map((p, i) => (
        <Path key={i} d={p} stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}

const ICON = {
  quality: ["M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z", "M19 17v4", "M17 19h4"],
  speed: ["M12 14l4-4", "M3.34 19a10 10 0 1 1 17.32 0"],
  loop: ["m17 2 4 4-4 4", "M3 11v-1a4 4 0 0 1 4-4h14", "m7 22-4-4 4-4", "M21 13v1a4 4 0 0 1-4 4H3"],
  autoScroll: ["m4 4 7.07 17 2.51-7.39L21 11.07z"],
  save: ["M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"],
  notInterested: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "m4.9 4.9 14.2 14.2"],
  hideCreator: [
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
    "M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
    "M22 11h-6",
  ],
  report: ["M4 21V4h9l.6 2H20v9h-7l-.6-2H4"],
  chevron: ["m9 18 6-6-6-6"],
  back: ["m15 18-6-6 6-6"],
  check: ["M20 6 9 17l-5-5"],
} as const;

/* ── Options ────────────────────────────────────────────────────────────── */

const QUALITY_LABEL: Record<VideoQuality, string> = {
  auto: "Auto",
  "1080": "1080p",
  "720": "720p",
  "480": "480p",
  "360": "360p",
};

/** Highest first, matching every player's quality menu. */
const QUALITY_ORDER: VideoQuality[] = ["1080", "720", "480", "360"];

/**
 * Deliberately stops at 2x. The website's menu offers 3x, but BOTH backends
 * validate `playback_speed` against in:0.5,0.75,1,1.25,1.5,2 (Laravel
 * ProfileController, and preferences.go for the Go rewrite), so a 3x pick 422s
 * and rolls straight back - which is what the "Couldn't save that" notice was
 * reporting. Offering it needs a server change first.
 */
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

const speedLabel = (s: number) => (s === 1 ? "Normal" : `${s}×`);

/**
 * What this post can actually be played at. Only renditions the API supplied
 * are offered - listing 1080p for a post that has no 1080p file would just be a
 * control that silently does nothing.
 */
function availableQualities(video: Video | null): VideoQuality[] {
  const urls = video?.quality_urls;
  if (!urls) return ["auto"];
  return ["auto", ...QUALITY_ORDER.filter((q) => !!urls[q])];
}

type Page = "root" | "quality" | "speed";

export function PlaybackSheet({
  video,
  open,
  saved,
  onToggleSave,
  onClose,
}: {
  video: Video | null;
  open: boolean;
  /** Owned by the feed, so this and the rail's bookmark can never disagree. */
  saved: boolean;
  onToggleSave: () => void;
  onClose: () => void;
}) {
  const { height } = useWindowDimensions();
  const prefs = usePrefsStore((s) => s.prefs);
  const isGuest = useAuthStore((s) => s.user) == null;

  const [page, setPage] = useState<Page>("root");
  const [notice, setNotice] = useState<string | null>(null);

  const restHeight = Math.min(560, height * 0.72);
  /** Measured, not assumed: the sheet is content-sized, and the dismiss
   *  threshold is a fraction of its real height (see ShareSheet). */
  const [sheetH, setSheetH] = useState(restHeight);
  const drag = useSheetDrag({ sheetHeight: sheetH, onDismiss: onClose });

  /** The scroller. The pan handler runs ALONGSIDE it - useSheetDrag only takes
   *  the gesture while the content is already at the top. */
  const scrollRef = useRef(null);

  // Always reopen on the root page - landing back inside the submenu you left
  // is disorienting when the sheet is this shallow.
  useEffect(() => {
    if (open) {
      drag.open();
      setPage("root");
      setNotice(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const buzz = useCallback(() => {
    if (Platform.OS === "web") return;
    haptics.selection();
  }, []);

  /** One write path for every control. Guests never hit the network. */
  const apply = useCallback(
    (patch: Partial<ContentPreferences>) => {
      buzz();
      // Clear first: a notice left over from an earlier failure made a
      // successful change look like it had failed too.
      setNotice(null);
      if (isGuest) {
        usePrefsStore.getState().setLocal(patch);
        return;
      }
      usePrefsStore
        .getState()
        .update(patch)
        .catch(() => setNotice("Couldn't save that - check your connection."));
    },
    [buzz, isGuest],
  );

  /**
   * The recommendation / moderation actions.
   *
   * All three need an account: the signals are stored per user and a report
   * needs a reporter, so signed out the auth gate is the honest answer rather
   * than a tap that quietly does nothing.
   */
  const requireAuth = useCallback(() => {
    if (!isGuest) return false;
    onClose();
    // Same fix as CommentsSheet's gateGuest / ShareSheet's gateGuest: this
    // sheet is its own native `<Modal>`, and so is the auth-gate popup
    // (AuthGateModal, via BottomSheet). onClose() alone flips this sheet's
    // Modal to visible=false, but RN plays that as an async exit
    // animation - opening the popup's Modal before that transition
    // actually finishes stacks two native Modals for a moment, which is
    // what froze CommentsSheet in the identical situation. The 220ms
    // handoff (same value CommentsSheet/openProfile use) waits for the
    // close to really finish first.
    setTimeout(() => useAuthGate.getState().open(), 220);
    return true;
  }, [isGuest, onClose]);

  const notInterested = useCallback(() => {
    if (!video || requireAuth()) return;
    buzz();
    setNotice("You'll see fewer reels like this.");
    videoApi.notInterested(video.id).catch(() => setNotice("Couldn't send that - check your connection."));
  }, [video, requireAuth, buzz]);

  const hideCreator = useCallback(() => {
    if (!video || requireAuth()) return;
    buzz();
    setNotice("You'll see fewer reels from this creator.");
    videoApi.dontRecommendCreator(video.id).catch(() => setNotice("Couldn't send that - check your connection."));
  }, [video, requireAuth, buzz]);

  /**
   * The report sheet, opened as its own nested Modal rather than a page of
   * this one - it needs its own reason list, a details field and evidence
   * upload, which do not fit this sheet's shallow page model. Rendered INSIDE
   * this component's own <Modal> (see GiftSheet inside CommentsSheet for the
   * same reason): RN can only present one top-level Modal at a time, so a
   * second one opened as a sibling of this one would silently never appear.
   * This sheet's own options list simply sits behind it while it is open,
   * the way CommentsSheet stays open behind GiftSheet. The id is captured on
   * tap rather than read from `video` when ReportSheet renders, since `video`
   * can go null under it (its parent nulls the prop the moment this sheet's
   * `open` flips false, which happens if the options sheet is later closed).
   */
  const [reportOpen, setReportOpen] = useState(false);
  const [reportVideoId, setReportVideoId] = useState<number | null>(null);
  const openReport = useCallback(() => {
    if (!video || requireAuth()) return;
    buzz();
    setReportVideoId(video.id);
    setReportOpen(true);
  }, [video, requireAuth, buzz]);

  const qualities = useMemo(() => availableQualities(video), [video]);
  /** A pref of 1080 on a post that only has 720 is not what is playing. Show
   *  what the player will actually use, not what the pref happens to say. */
  const effectiveQuality: VideoQuality = qualities.includes(prefs.default_quality)
    ? prefs.default_quality
    : "auto";

  const title =
    page === "quality" ? "Quality"
    : page === "speed" ? "Playback speed"
    : "Playback";

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.root} accessibilityViewIsModal accessibilityRole="none">
          {/* Transparent, matching ShareSheet/CommentsSheet: a Modal cannot fade
              a scrim independently of the sheet, so a filled one slides up as a
              black panel instead of fading in place. */}
          <Animated.View style={[styles.scrim, { opacity: drag.scrimOpacity }]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close playback options"
            />
          </Animated.View>

          <PanGestureHandler
            onGestureEvent={drag.onGestureEvent}
            onHandlerStateChange={drag.onHandlerStateChange}
            activeOffsetY={[-14, 14]}
            failOffsetX={[-28, 28]}
            // Both this and the scroller see the gesture; useSheetDrag decides
            // which one acts, from the scroller's own offset.
            simultaneousHandlers={scrollRef}
          >
            <Animated.View
              style={[styles.sheet, { maxHeight: restHeight, transform: [{ translateY: drag.translateY }] }]}
              onLayout={(e) => setSheetH(e.nativeEvent.layout.height)}
            >
              <View style={styles.grabberWrap}>
                <View style={styles.grabber} />
              </View>

              <View style={styles.header}>
                {page !== "root" && (
                  <Pressable
                    onPress={() => setPage("root")}
                    hitSlop={10}
                    style={styles.back}
                    accessibilityRole="button"
                    accessibilityLabel="Back"
                  >
                    <Glyph d={[...ICON.back]} size={18} stroke={ds.text} width={2.1} />
                  </Pressable>
                )}
                <Text style={styles.title}>{title}</Text>
              </View>

              {/* Scrollable: with the action rows the root page is taller than
                  the sheet's cap on a short screen. */}
              <GHScrollView
                ref={scrollRef}
                bounces={false}
                overScrollMode="never"
                showsVerticalScrollIndicator={false}
                onScroll={(e) => drag.onListScroll(e.nativeEvent.contentOffset.y)}
                scrollEventThrottle={16}
                contentContainerStyle={styles.body}
              >
                {page === "root" && (
                  <>
                    <Row
                      icon={[...ICON.quality]}
                      label="Quality"
                      value={QUALITY_LABEL[effectiveQuality]}
                      chevron
                      onPress={() => setPage("quality")}
                    />
                    <Row
                      icon={[...ICON.speed]}
                      label="Playback speed"
                      value={speedLabel(prefs.playback_speed)}
                      chevron
                      onPress={() => setPage("speed")}
                    />
                    <Row
                      icon={[...ICON.loop]}
                      label="Loop"
                      toggle={prefs.loop_video}
                      onPress={() => apply({ loop_video: !prefs.loop_video })}
                    />
                    <Row
                      icon={[...ICON.autoScroll]}
                      label="Auto scroll"
                      hint="Move to the next post when this one ends"
                      toggle={prefs.auto_scroll}
                      onPress={() => apply({ auto_scroll: !prefs.auto_scroll })}
                    />

                    {/* Everything above is a playback setting that outlives the
                        post; everything below acts on THIS one. The website's
                        menu splits them the same way. */}
                    <View style={styles.divider} />

                    <Row
                      icon={[...ICON.save]}
                      label={saved ? "Remove from saved" : "Save"}
                      active={saved}
                      onPress={() => {
                        // Was calling onToggleSave() directly, bypassing this
                        // file's own requireAuth() (used by every row below
                        // it) - a guest tap opened the auth-gate Modal while
                        // this sheet's own Modal stayed open, the identical
                        // stacking freeze already fixed elsewhere in this
                        // file, and also showed a false "Saved"/"Removed"
                        // notice for a save that never happened.
                        if (requireAuth()) return;
                        buzz();
                        onToggleSave();
                        setNotice(saved ? "Removed from your saved reels." : "Saved to your reels.");
                      }}
                    />
                    <Row
                      icon={[...ICON.notInterested]}
                      label="Not interested"
                      hint="Show me fewer reels like this"
                      onPress={notInterested}
                    />
                    <Row
                      icon={[...ICON.hideCreator]}
                      label="Hide creator"
                      hint={video?.user?.username ? `Fewer reels from @${video.user.username}` : undefined}
                      onPress={hideCreator}
                    />
                    <Row
                      icon={[...ICON.report]}
                      label="Report"
                      chevron
                      onPress={openReport}
                    />
                  </>
                )}

                {page === "quality" && (
                  <>
                    {qualities.map((q) => (
                      <Row
                        key={q}
                        icon={[...ICON.quality]}
                        label={QUALITY_LABEL[q]}
                        active={q === effectiveQuality}
                        onPress={() => {
                          apply({ default_quality: q });
                          setPage("root");
                        }}
                      />
                    ))}
                    {qualities.length === 1 && (
                      <Text style={styles.footnote}>
                        This post streams adaptively - it picks the best quality your connection can carry, so there are
                        no fixed renditions to choose from.
                      </Text>
                    )}
                  </>
                )}

                {page === "speed" && (
                  <>
                    {SPEEDS.map((s) => (
                      <Row
                        key={s}
                        icon={[...ICON.speed]}
                        label={speedLabel(s)}
                        active={s === prefs.playback_speed}
                        onPress={() => {
                          apply({ playback_speed: s });
                          setPage("root");
                        }}
                      />
                    ))}
                  </>
                )}

                {!!notice && <Text style={styles.notice}>{notice}</Text>}
              </GHScrollView>
            </Animated.View>
          </PanGestureHandler>
        </View>

        {/* Nested inside this Modal on purpose - see the note above openReport. */}
        <ReportSheet
          visible={reportOpen}
          entityType="video"
          entityId={reportVideoId}
          onClose={() => setReportOpen(false)}
        />
      </GestureHandlerRootView>
    </Modal>
  );
}

/* ── Row ────────────────────────────────────────────────────────────────── */

function Row({
  icon,
  label,
  hint,
  value,
  chevron,
  toggle,
  active,
  onPress,
}: {
  icon: string[];
  label: string;
  hint?: string;
  value?: string;
  chevron?: boolean;
  toggle?: boolean;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole={typeof toggle === "boolean" ? "switch" : "button"}
      accessibilityState={typeof toggle === "boolean" ? { checked: toggle } : { selected: !!active }}
      accessibilityLabel={label}
    >
      <Glyph d={icon} stroke={active ? ds.accent : ds.slate} />
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, active && styles.rowLabelActive]} numberOfLines={1}>
          {label}
        </Text>
        {!!hint && (
          <Text style={styles.rowHint} numberOfLines={1}>
            {hint}
          </Text>
        )}
      </View>
      {!!value && <Text style={styles.rowValue}>{value}</Text>}
      {chevron && <Glyph d={[...ICON.chevron]} size={16} stroke={ds.silver} width={2.1} />}
      {active && <Glyph d={[...ICON.check]} size={18} stroke={ds.accent} width={2.3} />}
      {typeof toggle === "boolean" && (
        <View style={[styles.track, toggle && styles.trackOn]}>
          <View style={[styles.knob, toggle && styles.knobOn]} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "transparent" },

  sheet: {
    backgroundColor: ds.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 26,
  },
  grabberWrap: { alignItems: "center", paddingTop: 8, paddingBottom: 4 },
  grabber: { width: 38, height: 4, borderRadius: 999, backgroundColor: ds.lineStrong },

  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 },
  back: { padding: 2 },
  title: { color: ds.text, fontSize: 17, fontWeight: "700" },

  body: { paddingHorizontal: 8, paddingTop: 4 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: ds.lineSoft, marginVertical: 6, marginHorizontal: 12 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  rowPressed: { backgroundColor: ds.surfaceSunken },
  rowText: { flex: 1, gap: 1 },
  rowLabel: { color: ds.text, fontSize: 15, fontWeight: "600" },
  rowLabelActive: { color: ds.accent },
  rowHint: { color: ds.textMuted, fontSize: 12 },
  rowValue: { color: ds.textDim, fontSize: 13, fontWeight: "600" },

  track: { width: 44, height: 26, borderRadius: 999, backgroundColor: ds.lineStrong, padding: 3, justifyContent: "center" },
  trackOn: { backgroundColor: ds.accent },
  knob: { width: 20, height: 20, borderRadius: 999, backgroundColor: ds.surface },
  knobOn: { alignSelf: "flex-end" },

  footnote: { color: ds.textMuted, fontSize: 12.5, lineHeight: 17.5, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 2 },
  notice: { color: ds.accent, fontSize: 12.5, paddingHorizontal: 12, paddingTop: 10 },
});
