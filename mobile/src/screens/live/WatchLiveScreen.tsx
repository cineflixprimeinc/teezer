import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Share2, Users, X } from "lucide-react-native";
import { Avatar } from "@/components/Avatar";
import { GiftSheet } from "@/components/feed/GiftSheet";
import { ReportSheet } from "@/components/report/ReportSheet";
import { useAuthStore } from "@/store/auth.store";
import { useAuthGate } from "@/store/auth-gate.store";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";
import { formatCompact } from "@/utils/format";
import { videoApi } from "@/api/video.api";
import { giftApi } from "@/api/gift.api";
import { liveStreamsApi, type LiveStreamMessage } from "@/api/live-streams.api";
import { getLiveKit } from "@/realtime/livekit";
import { useLiveWatch } from "@/realtime/liveWatch";

/**
 * Watching one live video broadcast - full-screen video (subscribe-only
 * LiveKit), live chat, gifting, follow. Mobile adaptation of the design's
 * split video+sidebar desktop layout: chat sits as a persistent overlay over
 * the bottom of the video (like the feed's own overlays) rather than a fixed
 * side panel there's no room for on a phone.
 *
 * Follow state: the API's host object carries no is_following flag (see
 * live-streams.api.ts), so this can't show accurate "already following"
 * state on open - it starts on "Follow" and optimistically flips once
 * tapped, same limitation noted to the user when this shipped.
 */

function useElapsed(startedAt: string | null): string {
  const [, force] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  if (!startedAt) return "";
  const secs = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function WatchLiveScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const id: number = route.params.id;
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const isAuthed = useAuthStore((s) => s.status === "authenticated");

  const detail = useQuery({
    queryKey: ["live-stream", id],
    queryFn: () => liveStreamsApi.show(id),
  });
  const stream = detail.data?.stream;
  const controls = detail.data?.controls;

  /* The gift button only shows once the host has actually unlocked Gifts &
   * Coins (every requirement met, admin has the programme on) - alongside
   * `controls.gifts_enabled`, the host's own per-stream toggle. Showing it
   * unconditionally used to be purely cosmetic anyway, since the send
   * endpoint now refuses an ineligible receiver regardless of what the icon
   * suggested. */
  const giftsEligibleQuery = useQuery({
    queryKey: ["gifts-eligible", stream?.host?.id],
    queryFn: () => giftApi.eligible(stream!.host!.id),
    enabled: !!stream?.host?.id,
    staleTime: 60_000,
  });
  const giftsEligible = giftsEligibleQuery.data === true;

  const watch = useLiveWatch(id);
  const lk = getLiveKit();
  const elapsed = useElapsed(stream?.started_at ?? null);

  const chat = useQuery({
    queryKey: ["live-chat", id],
    queryFn: () => liveStreamsApi.messages(id),
    enabled: !!controls?.chat_enabled,
    refetchInterval: 4000,
  });

  const [draft, setDraft] = useState("");
  const send = useMutation({
    mutationFn: (body: string) => liveStreamsApi.postMessage(id, body),
    onSuccess: (msg) => {
      qc.setQueryData<LiveStreamMessage[]>(["live-chat", id], (cur) => [...(cur ?? []), msg]);
      setDraft("");
    },
  });

  const [following, setFollowing] = useState(false);
  const toggleFollow = () => {
    const username = stream?.host?.username;
    if (!username) return;
    if (!isAuthed) { useAuthGate.getState().open(() => toggleFollow()); return; }
    const now = !following;
    setFollowing(now);
    (now ? videoApi.follow(username) : videoApi.unfollow(username)).catch(() => setFollowing(!now));
  };

  const [giftOpen, setGiftOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const leave = () => navigation.goBack();

  const viewers = watch.viewers || stream?.viewers || 0;

  return (
    <View style={styles.root}>
      {/* Video layer */}
      <View style={styles.videoLayer}>
        {watch.videoTrack && lk?.VideoView ? (
          <lk.VideoView videoTrack={watch.videoTrack} objectFit="cover" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.videoFallback]}>
            {stream?.host && <Avatar uri={stream.host.avatar} style={styles.fallbackAvatar} />}
            {(watch.connecting || detail.isLoading) && <ActivityIndicator color={colors.white} style={{ marginTop: spacing.lg }} />}
            {!watch.available && !watch.connecting && (
              <Text style={styles.fallbackText}>Live video needs the full app build - not available in this preview.</Text>
            )}
            {watch.error && <Text style={styles.fallbackText}>{watch.error}</Text>}
          </View>
        )}
      </View>

      {/* Top overlay */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable onPress={leave} hitSlop={10} style={styles.iconBtnDark} accessibilityRole="button" accessibilityLabel="Leave">
          <X size={19} color={colors.white} strokeWidth={2.3} />
        </Pressable>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveBadgeText}>LIVE</Text>
        </View>
        <View style={styles.viewersBadge}>
          <Users size={12} color={colors.white} strokeWidth={2.3} />
          <Text style={styles.viewersBadgeText}>{formatCompact(viewers)}</Text>
        </View>
        {!!elapsed && (
          <View style={styles.viewersBadge}>
            <Text style={styles.viewersBadgeText}>{elapsed}</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => (isAuthed ? setReportOpen(true) : useAuthGate.getState().open(() => setReportOpen(true)))}
          hitSlop={10}
          style={styles.iconBtnDark}
          accessibilityRole="button"
          accessibilityLabel="Report"
        >
          <Share2 size={17} color={colors.white} strokeWidth={2.2} />
        </Pressable>
      </View>

      {/* Host row */}
      {stream?.host && (
        <View style={[styles.hostRow, { bottom: insets.bottom + 190 }]}>
          <Avatar uri={stream.host.avatar} style={styles.hostAvatar} />
          <View style={styles.hostText}>
            <Text style={styles.hostName} numberOfLines={1}>{stream.host.name ?? stream.host.username}</Text>
            <Text style={styles.streamTitle} numberOfLines={1}>{stream.title}</Text>
          </View>
          <Pressable onPress={toggleFollow} style={[styles.followBtn, following && styles.followBtnOn]} accessibilityRole="button">
            <Text style={[styles.followBtnText, following && styles.followBtnTextOn]}>{following ? "Following" : "Follow"}</Text>
          </Pressable>
        </View>
      )}

      {/* Chat overlay */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[styles.chatWrap, { paddingBottom: insets.bottom + 10 }]}
        pointerEvents="box-none"
      >
        <FlatList
          data={chat.data ?? []}
          keyExtractor={(m) => String(m.id)}
          renderItem={({ item }) => <ChatLine message={item} />}
          contentContainerStyle={styles.chatList}
          inverted={false}
          showsVerticalScrollIndicator={false}
        />

        <View style={styles.chatInputRow}>
          <View style={styles.chatInputBox}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={controls?.chat_blocked_reason ?? "Say something nice…"}
              placeholderTextColor="rgba(255,255,255,0.5)"
              editable={!controls?.chat_blocked_reason}
              style={styles.chatInput}
              onSubmitEditing={() => draft.trim() && send.mutate(draft.trim())}
              returnKeyType="send"
            />
          </View>
          <Pressable
            onPress={() => (isAuthed ? draft.trim() && send.mutate(draft.trim()) : useAuthGate.getState().open())}
            style={styles.giftBtn}
            accessibilityRole="button"
            accessibilityLabel="Send"
          >
            <Text style={styles.sendGlyph}>➤</Text>
          </Pressable>
          {controls?.gifts_enabled !== false && giftsEligible && (
            <Pressable
              onPress={() => (isAuthed ? setGiftOpen(true) : useAuthGate.getState().open())}
              style={styles.giftBtn}
              accessibilityRole="button"
              accessibilityLabel="Send a gift"
            >
              <Gift size={18} color={colors.white} strokeWidth={2} />
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      {stream?.host && (
        <GiftSheet
          visible={giftOpen}
          receiver={{ id: stream.host.id, username: stream.host.username }}
          onClose={() => setGiftOpen(false)}
        />
      )}
      <ReportSheet visible={reportOpen} entityType="live_stream" entityId={id} onClose={() => setReportOpen(false)} />
    </View>
  );
}

function ChatLine({ message }: { message: LiveStreamMessage }) {
  return (
    <View style={styles.chatLine}>
      <Text style={styles.chatLineText}>
        <Text style={[styles.chatName, message.is_host && styles.chatNameHost]}>{message.user?.name ?? "Someone"}</Text>
        {"  "}
        {message.body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  videoLayer: { ...StyleSheet.absoluteFill },
  videoFallback: { backgroundColor: "#141318", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  fallbackAvatar: { width: 84, height: 84, borderRadius: 42 },
  fallbackText: { color: "rgba(255,255,255,0.7)", fontSize: 12.5, textAlign: "center", paddingHorizontal: spacing.xl, marginTop: spacing.sm },

  topBar: { position: "absolute", left: 0, right: 0, top: 0, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: spacing.lg },
  iconBtnDark: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(0,0,0,0.42)", alignItems: "center", justifyContent: "center" },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 5, height: 26, paddingHorizontal: 9, borderRadius: 7, backgroundColor: colors.brand },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.white },
  liveBadgeText: { color: colors.white, fontSize: 10, fontWeight: font.weightHeavy, letterSpacing: 0.5 },
  viewersBadge: { flexDirection: "row", alignItems: "center", gap: 5, height: 26, paddingHorizontal: 9, borderRadius: 7, backgroundColor: "rgba(0,0,0,0.42)" },
  viewersBadgeText: { color: colors.white, fontSize: 11, fontWeight: font.weightBold },

  hostRow: { position: "absolute", left: spacing.lg, right: spacing.lg, flexDirection: "row", alignItems: "center", gap: 10 },
  hostAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.7)" },
  hostText: { flex: 1, minWidth: 0 },
  hostName: { color: colors.white, fontSize: 13.5, fontWeight: font.weightHeavy },
  streamTitle: { color: "rgba(255,255,255,0.75)", fontSize: 11.5, marginTop: 2 },
  followBtn: { height: 32, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  followBtnOn: { backgroundColor: "rgba(255,255,255,0.16)" },
  followBtnText: { color: colors.white, fontSize: 12, fontWeight: font.weightHeavy },
  followBtnTextOn: { color: colors.white },

  chatWrap: { position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: 260 },
  chatList: { paddingHorizontal: spacing.lg, gap: 6, justifyContent: "flex-end" },
  chatLine: { alignSelf: "flex-start", maxWidth: "88%", backgroundColor: "rgba(0,0,0,0.32)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  chatLineText: { color: colors.white, fontSize: 12.5, lineHeight: 17 },
  chatName: { fontWeight: font.weightBold, color: "rgba(255,255,255,0.85)" },
  chatNameHost: { color: "#FFD37A" },

  chatInputRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: spacing.lg, paddingTop: 8 },
  chatInputBox: { flex: 1, minWidth: 0, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.14)", paddingHorizontal: 14, justifyContent: "center" },
  chatInput: { color: colors.white, fontSize: 13, padding: 0 },
  giftBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  sendGlyph: { color: colors.white, fontSize: 15 },
});
