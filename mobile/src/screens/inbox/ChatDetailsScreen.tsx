import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { Avatar } from "@/components/Avatar";
import { ReportSheet } from "@/components/report/ReportSheet";
import { inboxApi, type DirectMessage } from "@/api/inbox.api";
import { profileApi } from "@/api/profile.api";
import { ds } from "@/theme/design";
import { font } from "@/constants/theme";
import type { RootStackParamList } from "@/navigation/types";

/**
 * Chat details - the ••• sheet from a DM thread.
 *
 * Everything here reads from data the app already has: the conversation list
 * for presence, and the thread's own history for the shared-media and
 * shared-link counts (no extra endpoint, and no second fetch - it is the same
 * cached query the thread uses).
 *
 * THREE ROWS ARE DELIBERATELY INERT: Mute notifications, Pin conversation and
 * Vanish mode have no endpoint anywhere in the API. They are rendered because
 * the design calls for them, but they do not flip - a Switch that moves and
 * then silently forgets is worse than one that visibly cannot move, because it
 * claims a setting was saved. They light up the moment endpoints exist.
 */

const MUTED = ds.textMuted;

function BackGlyph() {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
      <Path d="m15 18-6-6 6-6" stroke={ds.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function PhoneGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.6 3.5h3l1.5 3.7-1.9 1.1a12 12 0 0 0 5.5 5.5l1.1-1.9 3.7 1.5v3a1.8 1.8 0 0 1-2 1.8A16.2 16.2 0 0 1 4.8 5.5a1.8 1.8 0 0 1 1.8-2z"
        stroke={ds.text}
        strokeWidth={1.9}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function VideoGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={6} width={13} height={12} rx={2.5} stroke={ds.text} strokeWidth={1.9} />
      <Path d="M16 10.5l5-2.8v8.6l-5-2.8" stroke={ds.text} strokeWidth={1.9} strokeLinejoin="round" />
    </Svg>
  );
}

function SearchGlyph({ c = ds.text }: { c?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={10.5} cy={10.5} r={6.8} stroke={c} strokeWidth={1.9} />
      <Path d="M15.6 15.6L21 21" stroke={c} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

function BellOffGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M6.2 9.4a5.8 5.8 0 0 1 8.6-5M17.8 12v-2.6M6.2 9.4c0 5-2 6.4-2 6.4h13.6M10.3 19.5a2 2 0 0 0 3.4 0" stroke={MUTED} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3 3l18 18" stroke={MUTED} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

function PinGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M15 3l6 6-3 1-4 4-1 5-6-6-5 1 4-4 1-4 3-3z" stroke={MUTED} strokeWidth={1.9} strokeLinejoin="round" />
      <Path d="M8 16l-4 4" stroke={MUTED} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

function EyeOffGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c5 0 9 4.5 9.9 5.7a.6.6 0 0 1 0 .6c-.4.6-1.5 1.9-3.1 3.1M6.5 7.6C4.3 9 2.7 10.9 2.1 11.7a.6.6 0 0 0 0 .6C3 13.5 7 18 12 18c1.4 0 2.7-.35 3.9-.9" stroke={MUTED} strokeWidth={1.9} strokeLinecap="round" />
      <Path d="M3 3l18 18" stroke={MUTED} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

function PhotoStackGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={5} width={18} height={14} rx={2.5} stroke={ds.text} strokeWidth={1.9} />
      <Circle cx={8.5} cy={10} r={1.5} stroke={ds.text} strokeWidth={1.6} />
      <Path d="m4 16.5 5-4 4 3.2 3-2.4 4 3.2" stroke={ds.text} strokeWidth={1.9} strokeLinejoin="round" />
    </Svg>
  );
}

function LinkGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 1 0-5.7-5.7l-1.4 1.4" stroke={ds.text} strokeWidth={1.9} strokeLinecap="round" />
      <Path d="M14 10.5a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 1 0 5.7 5.7l1.4-1.4" stroke={ds.text} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

function BlockGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={ds.accent} strokeWidth={1.9} />
      <Path d="M5.6 5.6l12.8 12.8" stroke={ds.accent} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

function FlagGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M4 21V4h11l-1.2 3.5H20l-1.5 4.5H8" stroke={ds.accent} strokeWidth={1.9} strokeLinejoin="round" />
    </Svg>
  );
}

function ChevronGlyph() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path d="m9 6 6 6-6 6" stroke={ds.textFaint ?? MUTED} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** A message that carries an attachment rather than only text. */
const MEDIA_TYPES = ["image", "video", "shared_video", "voice", "audio", "document"];
const URL_RE = /https?:\/\/[^\s]+/i;

export function ChatDetailsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, "ChatDetails">>();
  const { userId, username, name, avatar } = route.params;

  const [blocked, setBlocked] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  // Same cached query the thread uses - opening details costs no extra fetch.
  const history = useQuery({
    queryKey: ["dm-history", userId],
    queryFn: () => inboxApi.history(userId),
    staleTime: 10_000,
  });

  const convos = useQuery({
    queryKey: ["inbox-conversations"],
    queryFn: () => inboxApi.conversations(),
    staleTime: 30_000,
  });
  const online = convos.data?.find((c) => c.user_id === userId)?.is_online;

  /** Counts derived from the thread rather than a new endpoint. */
  const { mediaCount, linkCount } = useMemo(() => {
    const msgs: DirectMessage[] = history.data ?? [];
    return {
      mediaCount: msgs.filter((m) => MEDIA_TYPES.includes(m.message_type)).length,
      linkCount: msgs.filter((m) => !!m.body && URL_RE.test(m.body)).length,
    };
  }, [history.data]);

  const onBlock = useCallback(() => {
    Alert.alert(
      blocked ? `Unblock @${username}?` : `Block @${username}?`,
      blocked
        ? "They will be able to find and message you again."
        : "They won't be able to find your profile or message you.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: blocked ? "Unblock" : "Block",
          style: blocked ? "default" : "destructive",
          onPress: () => {
            const next = !blocked;
            setBlocked(next);
            (next ? profileApi.block(username) : profileApi.unblock(username)).catch(() =>
              setBlocked(!next),
            );
          },
        },
      ],
    );
  }, [blocked, username]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" onPress={() => navigation.goBack()}>
          <BackGlyph />
        </Pressable>
        <Text style={styles.headerTitle}>Chat details</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <Pressable
          style={styles.identity}
          accessibilityRole="button"
          onPress={() => navigation.push("UserProfile", { username })}
        >
          <Avatar uri={avatar} style={styles.bigAvatar} />
          <Text style={styles.name}>{name || username}</Text>
          <Text style={styles.handle}>
            @{username}
            {online ? " · Active now" : ""}
          </Text>
        </Pressable>

        <View style={styles.tiles}>
          {[
            { key: "audio", label: "Audio call", icon: <PhoneGlyph /> },
            { key: "video", label: "Video call", icon: <VideoGlyph /> },
            { key: "search", label: "Search", icon: <SearchGlyph /> },
          ].map((t) => (
            <Pressable key={t.key} accessibilityRole="button" style={styles.tile}>
              <View style={styles.tileIcon}>{t.icon}</View>
              <Text style={styles.tileLabel}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* ── CHAT ── every row here is inert; see the note at the top. ── */}
        <Text style={styles.sectionHead}>CHAT</Text>
        <View style={styles.card}>
          {[
            { key: "mute", label: "Mute notifications", icon: <BellOffGlyph /> },
            { key: "pin", label: "Pin conversation", icon: <PinGlyph /> },
            { key: "vanish", label: "Vanish mode", icon: <EyeOffGlyph /> },
          ].map((r, i) => (
            <View key={r.key} style={[styles.row, i > 0 && styles.rowDivider]}>
              {r.icon}
              <Text style={[styles.rowLabel, styles.rowLabelDim]}>{r.label}</Text>
              {/* disabled, not just unwired - it must not appear to save. */}
              <Switch
                value={false}
                disabled
                trackColor={{ false: "#E8E5EC", true: ds.accent }}
                thumbColor="#FFFFFF"
              />
            </View>
          ))}
        </View>

        <Text style={styles.sectionHead}>SHARED</Text>
        <View style={styles.card}>
          <Pressable style={styles.row} accessibilityRole="button">
            <PhotoStackGlyph />
            <Text style={styles.rowLabel}>Shared photos &amp; videos</Text>
            {mediaCount > 0 && <Text style={styles.count}>{mediaCount}</Text>}
            <ChevronGlyph />
          </Pressable>
          <Pressable style={[styles.row, styles.rowDivider]} accessibilityRole="button">
            <LinkGlyph />
            <Text style={styles.rowLabel}>Shared links</Text>
            {linkCount > 0 && <Text style={styles.count}>{linkCount}</Text>}
            <ChevronGlyph />
          </Pressable>
        </View>

        <Text style={styles.sectionHead}>PRIVACY</Text>
        <View style={styles.card}>
          <Pressable style={styles.row} accessibilityRole="button">
            <SearchGlyph />
            <Text style={styles.rowLabel}>Search in conversation</Text>
            <ChevronGlyph />
          </Pressable>

          <Pressable style={[styles.row, styles.rowDivider]} accessibilityRole="button" onPress={onBlock}>
            <BlockGlyph />
            <Text style={[styles.rowLabel, styles.danger]}>
              {blocked ? `Unblock ${username}` : `Block ${username}`}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.row, styles.rowDivider]}
            accessibilityRole="button"
            onPress={() => setReportOpen(true)}
          >
            <FlagGlyph />
            <Text style={[styles.rowLabel, styles.danger]}>Report</Text>
          </Pressable>
        </View>
      </ScrollView>

      <ReportSheet
        visible={reportOpen}
        entityType="conversation"
        entityId={userId}
        onClose={() => setReportOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F7F6F8" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: ds.surface,
  },
  headerTitle: { fontSize: font.lg, fontWeight: font.weightBold, color: ds.text },

  identity: { alignItems: "center", gap: 6, paddingTop: 18, paddingBottom: 20, backgroundColor: ds.surface },
  bigAvatar: { width: 92, height: 92, borderRadius: 999, marginBottom: 6 },
  name: { fontSize: font.lg, fontWeight: font.weightBold, color: ds.text },
  handle: { fontSize: font.sm, color: MUTED },

  tiles: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingBottom: 22, backgroundColor: ds.surface },
  tile: {
    flex: 1,
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EDEAF0",
    backgroundColor: ds.surface,
  },
  tileIcon: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: "#F4F2F6",
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: { fontSize: font.sm, fontWeight: font.weightBold, color: ds.text },

  sectionHead: {
    fontSize: font.xs,
    fontWeight: font.weightBold,
    letterSpacing: 0.9,
    color: MUTED,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  card: { backgroundColor: ds.surface, marginHorizontal: 12, borderRadius: 14, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 15 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#F0EDF1" },
  rowLabel: { flex: 1, fontSize: font.base, color: ds.text },
  rowLabelDim: { color: MUTED },
  danger: { color: ds.accent, fontWeight: font.weightMedium },
  count: { fontSize: font.sm, color: MUTED },
});
