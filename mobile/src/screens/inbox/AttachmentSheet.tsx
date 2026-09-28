import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { BottomSheet } from "@/components/BottomSheet";
import { ds } from "@/theme/design";

/**
 * The composer's "+" menu - a single horizontal row of attachment types,
 * scrollable rather than wrapped into a 4x3 grid. The grid's 3 rows made the
 * sheet tall enough to rise above the composer and cover it (a Modal, like
 * every BottomSheet - it renders over whatever is beneath, it does not push
 * the composer up); one row keeps the sheet short enough to stay clear of it.
 *
 * Each tile either does the real thing or says plainly that it cannot yet.
 * `enabled` is not decoration - a tile is live only where there is both a way
 * to pick the thing AND a message_type on the API to send it as.
 */

export type AttachmentKind =
  | "photo" | "video" | "camera" | "gif"
  | "voice" | "reel" | "audioCall" | "videoCall"
  | "location" | "savedReel" | "space" | "file";

const S = 21;

function Glyph({ kind }: { kind: AttachmentKind }) {
  const c = ds.text;
  switch (kind) {
    case "photo":
      return (
        <Svg width={S} height={S} viewBox="0 0 24 24" fill="none">
          <Rect x={3} y={4.5} width={18} height={15} rx={2.6} stroke={c} strokeWidth={1.8} />
          <Circle cx={8.6} cy={9.6} r={1.5} stroke={c} strokeWidth={1.6} />
          <Path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5" stroke={c} strokeWidth={1.8} strokeLinejoin="round" />
        </Svg>
      );
    case "video":
      return (
        <Svg width={S} height={S} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={8.6} stroke={c} strokeWidth={1.8} />
          <Path d="M10.3 8.8 16 12l-5.7 3.2z" stroke={c} strokeWidth={1.8} strokeLinejoin="round" />
        </Svg>
      );
    case "camera":
      return (
        <Svg width={S} height={S} viewBox="0 0 24 24" fill="none">
          <Path d="M9 4.5h6L16.4 7H20a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h3.6z" stroke={c} strokeWidth={1.8} strokeLinejoin="round" />
          <Circle cx={12} cy={13} r={3.3} stroke={c} strokeWidth={1.8} />
        </Svg>
      );
    case "gif":
      return (
        <Svg width={S + 3} height={S} viewBox="0 0 26 24" fill="none">
          <Rect x={1.5} y={4.5} width={23} height={15} rx={3} stroke={c} strokeWidth={1.8} />
          <Path d="M10 10.2a2.4 2.4 0 1 0 0 3.6v-1.5H8.9" stroke={c} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M13.4 9.8v4.4" stroke={c} strokeWidth={1.6} strokeLinecap="round" />
          <Path d="M16.6 14.2V9.8h2.8M16.6 12h2.2" stroke={c} strokeWidth={1.6} strokeLinecap="round" />
        </Svg>
      );
    case "voice":
      return (
        <Svg width={S} height={S} viewBox="0 0 24 24" fill="none">
          <Rect x={9} y={3} width={6} height={11} rx={3} stroke={c} strokeWidth={1.8} />
          <Path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" stroke={c} strokeWidth={1.8} strokeLinecap="round" />
        </Svg>
      );
    case "reel":
    case "savedReel":
      return (
        <Svg width={S} height={S} viewBox="0 0 24 24" fill="none">
          <Rect x={3.5} y={4.5} width={17} height={15} rx={2.6} stroke={c} strokeWidth={1.8} />
          <Path d="M3.5 9.5h17M9 4.5 12 9.5M15 4.5 18 9.5" stroke={c} strokeWidth={1.6} />
        </Svg>
      );
    case "audioCall":
      return (
        <Svg width={S} height={S} viewBox="0 0 24 24" fill="none">
          <Path d="M6.6 3.5h3l1.5 3.7-1.9 1.1a12 12 0 0 0 5.5 5.5l1.1-1.9 3.7 1.5v3a1.8 1.8 0 0 1-2 1.8A16.2 16.2 0 0 1 4.8 5.5a1.8 1.8 0 0 1 1.8-2z" stroke={c} strokeWidth={1.8} strokeLinejoin="round" />
        </Svg>
      );
    case "videoCall":
      return (
        <Svg width={S} height={S} viewBox="0 0 24 24" fill="none">
          <Rect x={3} y={6} width={13} height={12} rx={2.5} stroke={c} strokeWidth={1.8} />
          <Path d="M16 10.5 21 7.7v8.6l-5-2.8" stroke={c} strokeWidth={1.8} strokeLinejoin="round" />
        </Svg>
      );
    case "location":
      return (
        <Svg width={S} height={S} viewBox="0 0 24 24" fill="none">
          <Path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" stroke={c} strokeWidth={1.8} strokeLinejoin="round" />
          <Circle cx={12} cy={10} r={2.4} stroke={c} strokeWidth={1.8} />
        </Svg>
      );
    case "space":
      return (
        <Svg width={S} height={S} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={2.6} stroke={c} strokeWidth={1.8} />
          <Path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2" stroke={c} strokeWidth={1.7} strokeLinecap="round" />
        </Svg>
      );
    case "file":
      return (
        <Svg width={S} height={S} viewBox="0 0 24 24" fill="none">
          <Path d="M13.5 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5z" stroke={c} strokeWidth={1.8} strokeLinejoin="round" />
          <Path d="M13.5 3.5v5h5" stroke={c} strokeWidth={1.8} strokeLinejoin="round" />
        </Svg>
      );
  }
}

/**
 * `enabled` marks the tiles that can actually complete.
 *
 * The rest are drawn because the design has them, but stay dimmed and say why
 * rather than opening something that cannot finish:
 *  - calls        no call flow exists (LiveKit is in the app, DM calling is not)
 *  - file         no document picker dependency in this app (the API takes
 *                 `document` already - only the picker is missing)
 *  - reel/space   no picker for choosing which one to send
 */
const TILES: { kind: AttachmentKind; label: string; enabled: boolean; tint?: string }[] = [
  { kind: "photo", label: "Photo", enabled: true },
  { kind: "video", label: "Video", enabled: true },
  { kind: "camera", label: "Camera", enabled: true },
  { kind: "gif", label: "GIF", enabled: true },
  { kind: "voice", label: "Voice note", enabled: true, tint: "#E4405F" },
  { kind: "reel", label: "Reel", enabled: false, tint: "#2FA0F0" },
  { kind: "audioCall", label: "Audio call", enabled: false, tint: "#2FA0F0" },
  { kind: "videoCall", label: "Video call", enabled: false, tint: "#2FA0F0" },
  { kind: "location", label: "Location", enabled: true, tint: "#1F9D6B" },
  { kind: "savedReel", label: "Saved reel", enabled: false, tint: "#2FA0F0" },
  { kind: "space", label: "Space", enabled: false, tint: "#2FA0F0" },
  { kind: "file", label: "File", enabled: false },
];

export function AttachmentSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  /** Fires after the sheet has closed - pickers and the camera must not be
   *  raised while this Modal is still up. */
  onPick: (kind: AttachmentKind, enabled: boolean) => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <BottomSheet visible={visible} onClose={onClose} scrollable={false}>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carousel}
        >
          {TILES.map((t) => (
            <Pressable
              key={t.kind}
              onPress={() => onPick(t.kind, t.enabled)}
              style={styles.cell}
              accessibilityRole="button"
              accessibilityLabel={t.label}
              accessibilityState={{ disabled: !t.enabled }}
            >
              <View style={[styles.tile, !t.enabled && styles.tileOff]}>
                <Glyph kind={t.kind} />
              </View>
              <Text
                style={[styles.label, !!t.tint && { color: t.tint }, !t.enabled && styles.labelOff]}
                numberOfLines={1}
              >
                {t.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingTop: 6 },
  carousel: { flexDirection: "row", paddingHorizontal: 10 },
  /** Fixed width, not a percentage - a horizontal row scrolls past however
   *  many tiles there are instead of wrapping them onto more rows. */
  cell: { width: 76, alignItems: "center", paddingVertical: 12, gap: 8 },
  tile: {
    width: 54,
    height: 54,
    borderRadius: 999,
    backgroundColor: ds.surfaceSunken,
    alignItems: "center",
    justifyContent: "center",
  },
  tileOff: { opacity: 0.4 },
  label: { fontSize: 11.5, fontWeight: "600", color: ds.text },
  labelOff: { opacity: 0.5 },
});
