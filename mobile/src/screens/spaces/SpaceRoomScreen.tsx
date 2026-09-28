import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { haptics } from "@/services/haptics";
import {
  ActivityIndicator, Alert, Animated, Easing, FlatList, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, Share, StyleSheet, Text, TextInput, View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown, ChevronRight, Ellipsis, Flag, Hand, Heart, Link2, LogOut, Mic, MicOff,
  Power, SendHorizontal, Share2, UserPlus, Users, X, type LucideIcon,
} from "lucide-react-native";
import { Avatar } from "@/components/Avatar";
import { ReportSheet } from "@/components/report/ReportSheet";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useAuthStore } from "@/store/auth.store";
import {
  spaceChatApi, spaceHostApi, spaceRequestApi, spaceRoomApi,
  type SpaceMessage, type SpaceRequestRow, type SpaceSeat,
} from "@/api/spaces.api";
import { colors } from "@/constants/colors";
import { font, spacing } from "@/constants/theme";
import { formatCompact, relativeTime, useRelativeTimeTick } from "@/utils/format";
import { SPACE_DARK } from "./space-style";
import { RequestToSpeakSheet } from "./RequestToSpeakSheet";
import { useSpaceAudio } from "./useSpaceAudio";
import { useSpaceMiniStore } from "@/store/space-mini.store";
import { useElapsedClock } from "@/hooks/useElapsedClock";

/**
 * Inside a Space - the live room, built to the design's LIVE ROOM page.
 *
 * Header (minimise / LIVE / share / options), the room's title and its
 * "N listening · N speakers · host" line, then three tabs over one dark
 * column: Room (the stage grid + everyone in the room), Chat, and Requests
 * for whoever runs the room. A control bar docks at the bottom - mic, react,
 * people, leave.
 *
 * Every control here is wired to an endpoint that already exists; this rebuild
 * touched the app only. Audio is Cloudflare's SFU (useSpaceAudio) - this file
 * never handles media, it only draws who is in the room and which way their
 * mic points.
 */

const RING = {
  host: colors.brand,
  speaker: "#a855f7",
  listener: "rgba(255,255,255,0.14)",
} as const;

/**
 * Role label and its colour, per the design: Host pink, Co-host blue, Speaker
 * grey. The colour carries the meaning here - the labels are 10px and easy to
 * skim past, so someone scanning the stage reads authority from the tint before
 * they read the word.
 *
 * "Co-host" rather than the API's "moderator": a moderator in a Space is on
 * stage with the host, and "Mod" reads like a chat janitor rather than someone
 * co-running the room.
 */
function roleOf(seat: SpaceSeat): { label: string; color: string } {
  if (seat.role === "host") return { label: "Host", color: colors.brand };
  if (seat.is_moderator) return { label: "Co-host", color: "#4a9fe8" };
  return { label: "Speaker", color: "rgba(255,255,255,0.5)" };
}

/** Presets that send a real message - the design's quick-reply row. */
const QUICK_REPLIES = ["👋 Hey everyone", "💯 Great point", "🙌 Agreed", "❓ Question", "🔥 This is good"];

type Tab = "room" | "chat" | "requests";

export function SpaceRoomScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const requireAuth = useRequireAuth();
  const isAuthed = useAuthStore((s) => s.status === "authenticated");
  const meId = useAuthStore((s) => (s.user ? String(s.user.id) : null));
  useRelativeTimeTick();

  const spaceId: string = String(route.params?.id);
  const [tab, setTab] = useState<Tab>("room");
  const minimiseSpace = useSpaceMiniStore((st) => st.minimise);
  const restoreMini   = useSpaceMiniStore((st) => st.restore);
  const clearMini     = useSpaceMiniStore((st) => st.clear);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  // Minimising unmounts this screen exactly like leaving does, so every
  // teardown that cares about the difference (the DB seat below, and the
  // LiveKit connection inside useSpaceAudio) needs to be able to tell them
  // apart - without this ref, dropping to the mini bar would hand your seat
  // back and disconnect audio the bar claims is still live.
  const minimisingRef = useRef(false);

  const { data: room, isLoading } = useQuery({
    queryKey: ["space-room", spaceId],
    queryFn: () => spaceRoomApi.show(spaceId),
    refetchInterval: 10_000,
  });

  const elapsed = useElapsedClock(room?.started_at ?? null);

  const isHost = room?.me?.role === "host";
  const isMod = isHost || !!room?.me?.is_moderator;
  const canSpeak = room?.me?.role === "host" || room?.me?.role === "speaker";
  const chatOn = room?.settings?.enable_chat !== false;
  const reactionsOn = room?.settings?.allow_reactions !== false;
  const requestsOn = (room?.settings?.speaking_permission ?? "request") === "request"
    && room?.settings?.allow_speaker_requests !== false;

  const audio = useSpaceAudio(spaceId, {
    canSpeak: !!canSpeak,
    enabled: !!room?.me,
    keepAliveRef: minimisingRef,
    noiseCancellation: room?.settings?.noise_cancellation !== false,
    audioQuality: room?.settings?.audio_quality ?? "standard",
  });

  // Take a seat on entry so the listener count is real.
  const joinM = useMutation({
    mutationFn: () => spaceRoomApi.join(spaceId),
    onSuccess: (r) => qc.setQueryData(["space-room", spaceId], r),
  });
  useEffect(() => {
    if (isAuthed && room?.status === "live" && !room?.me) joinM.mutate();
  }, [isAuthed, room?.status, room?.me]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (isAuthed && !minimisingRef.current) spaceRoomApi.leave(spaceId).catch(() => {});
      qc.invalidateQueries({ queryKey: ["spaces"] });
    };
  }, [spaceId, isAuthed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reopening from the mini bar: this screen is the room now, so the bar goes.
  useEffect(() => { restoreMini(); }, [restoreMini]);

  /* ── chat ──────────────────────────────────────────────────────────── */
  const { data: chat } = useQuery({
    queryKey: ["space-chat", spaceId],
    queryFn: () => spaceChatApi.messages(spaceId),
    enabled: chatOn,
    refetchInterval: chatOn ? 5000 : false,
  });
  const messages = chat?.data ?? [];

  const [draft, setDraft] = useState("");
  const chatRef = useRef<FlatList<SpaceMessage>>(null);
  // Stable regardless of anything else on this screen re-rendering (the
  // composer's `draft` state included) - ChatRow itself takes no callback
  // props, so this never needs to change identity.
  const renderChatRow = useCallback(({ item }: { item: SpaceMessage }) => <ChatRow m={item} />, []);
  const sendM = useMutation({
    mutationFn: (body: string) => spaceChatApi.send(spaceId, body),
    onSuccess: (m) => {
      qc.setQueryData(["space-chat", spaceId], (prev: any) =>
        prev ? { ...prev, data: [...prev.data.filter((x: SpaceMessage) => x.id !== m.id), m] } : { data: [m], pinned: null });
      setDraft("");
      requestAnimationFrame(() => chatRef.current?.scrollToEnd({ animated: true }));
    },
    onError: () => Alert.alert("Message", "That didn't send. Please try again."),
  });
  const send = (body?: string) => {
    const b = (body ?? draft).trim();
    if (b && !sendM.isPending) requireAuth(() => sendM.mutate(b));
  };

  /* ── requests (host + moderators) ──────────────────────────────────── */
  const { data: requests } = useQuery({
    queryKey: ["space-requests", spaceId],
    queryFn: () => spaceRequestApi.list(spaceId),
    enabled: !!isMod,
    refetchInterval: isMod ? 6000 : false,
  });
  const pending = requests?.pending ?? [];

  const approveM = useMutation({
    mutationFn: (userId: string) => spaceRequestApi.approve(spaceId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["space-requests", spaceId] });
      qc.invalidateQueries({ queryKey: ["space-room", spaceId] });
    },
    onError: () => Alert.alert("Requests", "Could not approve that right now."),
  });
  const declineM = useMutation({
    mutationFn: (userId: string) => spaceRequestApi.decline(spaceId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["space-requests", spaceId] }),
    onError: () => Alert.alert("Requests", "Could not decline that right now."),
  });

  /* ── raise a hand ──────────────────────────────────────────────────── */
  const [askOpen, setAskOpen] = useState(false);
  const [requested, setRequested] = useState(false);
  const requestM = useMutation({
    mutationFn: () => spaceRoomApi.requestSpeak(spaceId),
    onSuccess: (r) => {
      setAskOpen(false); setRequested(true);
      haptics.success();
      Alert.alert("Request to speak", r.message);
    },
    onError: () => { setAskOpen(false); Alert.alert("Request to speak", "Could not send that right now."); },
  });
  const cancelM = useMutation({ mutationFn: () => spaceRoomApi.cancelRequest(spaceId), onSuccess: () => setRequested(false) });
  const raiseHand = () => requireAuth(() => (requested ? cancelM.mutate() : setAskOpen(true)));

  /* ── react ─────────────────────────────────────────────────────────── */
  const pop = useRef(new Animated.Value(1)).current;
  const heartM = useMutation({ mutationFn: () => spaceRoomApi.heart(spaceId) });
  const react = () => {
    if (!isAuthed) return requireAuth(() => {});
    haptics.light();
    pop.setValue(0.7);
    Animated.timing(pop, { toValue: 1, duration: 260, easing: Easing.out(Easing.back(2)), useNativeDriver: true }).start();
    heartM.mutate();
  };

  /* ── leave / end / share ───────────────────────────────────────────── */
  const endM = useMutation({
    mutationFn: () => spaceHostApi.end(spaceId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["spaces"] }); navigation.goBack(); },
    onError: () => Alert.alert("End Space", "Could not end the space right now."),
  });
  const confirmEnd = () => {
    setOptionsOpen(false);
    Alert.alert("End Space?", "This ends the space for everyone in the room.", [
      { text: "Cancel", style: "cancel" },
      { text: "End Space", style: "destructive", onPress: () => endM.mutate() },
    ]);
  };
  /** Leave for real: the unmount teardown hands the seat back. */
  const leave = () => { clearMini(); navigation.goBack(); };

  /**
   * Minimise: keep the seat and the audio, drop to the bar above the nav.
   * Only meaningful once you actually hold a seat - minimising a room you have
   * not joined would dock a bar for something you are not in.
   */
  const minimise = () => {
    if (room?.me) {
      minimisingRef.current = true;
      minimiseSpace({
        id: spaceId,
        title: room.title,
        listening: room.listening,
        startedAt: room.started_at ?? null,
        canSpeak: canSpeak,
        muted: audio.muted,
      });
    }
    navigation.goBack();
  };

  const shareUrl = useMemo(() => {
    const token = room?.settings?.invite_token;
    return `https://teezer.live/spaces/${spaceId}${token ? `?invite=${token}` : ""}`;
  }, [spaceId, room?.settings?.invite_token]);

  const shareRoom = async () => {
    setOptionsOpen(false);
    try { await Share.share({ message: `Join "${room?.title ?? "this Space"}" on Teezer: ${shareUrl}` }); }
    catch { /* dismissed - not an error */ }
  };
  const copyLink = async () => {
    setOptionsOpen(false);
    await Clipboard.setStringAsync(shareUrl);
    Alert.alert("Link copied", "The room link is on your clipboard.");
  };

  const openPeople = (t?: "chat") => { setOptionsOpen(false); navigation.navigate("SpacePeople", { id: spaceId, tab: t }); };
  const openListeners = () => { setOptionsOpen(false); navigation.navigate("SpaceListeners", { id: spaceId }); };

  if (isLoading || !room) {
    return (
      <LinearGradient colors={[SPACE_DARK.gradTop, SPACE_DARK.gradBottom]} style={styles.fill}>
        <StatusBar style="light" />
        <View style={styles.center}><ActivityIndicator color={colors.white} /></View>
      </LinearGradient>
    );
  }

  const speakers = [room.host, ...room.speakers].filter(Boolean) as SpaceSeat[];
  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: "room", label: "Room" },
    ...(chatOn ? [{ id: "chat" as Tab, label: "Chat", count: messages.length }] : []),
    ...(isMod ? [{ id: "requests" as Tab, label: "Hand", count: pending.length }] : []),
  ];
  const activeTab: Tab = TABS.some((t) => t.id === tab) ? tab : "room";

  // Neutral near-black, not the previous purple-tinted gradient. The stage
  // avatars are strongly coloured and the accent is pink; a tinted page put a
  // second hue behind both and made the pink read as brown at the top of the
  // screen.
  return (
    <LinearGradient colors={["#0b0b0d", "#0b0b0d", "#08080a"]} locations={[0, 0.45, 1]} style={styles.fill}>
      <StatusBar style="light" />

      {/* ── header ── */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={minimise} style={styles.glassBtn} accessibilityLabel="Minimise room">
          <ChevronDown size={18} color="#fff" strokeWidth={2.2} />
        </Pressable>
        <View style={styles.liveWrap}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText} numberOfLines={1}>
            {room.status === "live" ? "LIVE" : room.status.toUpperCase()}
            {/* Elapsed only while actually live: a scheduled room has no start
                time, and a zeroed clock beside the word LIVE would read as a
                room that just began rather than one that has not. */}
            {room.status === "live" && elapsed ? ` · ${elapsed}` : ""}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable onPress={shareRoom} style={styles.glassBtn} accessibilityLabel="Share room">
            <Share2 size={17} color="#fff" strokeWidth={2.1} />
          </Pressable>
          <Pressable onPress={() => setOptionsOpen(true)} style={styles.glassBtn} accessibilityLabel="Room options">
            <Ellipsis size={17} color="#fff" strokeWidth={2.4} />
          </Pressable>
        </View>
      </View>

      {/* ── title + meta ── */}
      <View style={styles.titleBlock}>
        <Text style={styles.title}>{room.title}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{formatCompact(room.listening)} listening</Text>
          <View style={styles.metaDot} />
          <Text style={styles.meta}>{speakers.length} speakers</Text>
          {!!room.host && (
            <>
              <View style={styles.metaDot} />
              {/* "Hosted by X" rather than a bare name: on its own the name
                  reads as another statistic in a row of statistics. flexShrink
                  lets this clause ellipsis first, since the counts before it are
                  short and fixed while a display name is neither. */}
              <Text style={[styles.meta, { flexShrink: 1 }]} numberOfLines={1}>
                Hosted by {room.host.name}
              </Text>
            </>
          )}
        </View>
      </View>

      {/* ── tabs ── */}
      <View style={styles.tabs}>
        {TABS.map((t) => {
          const on = t.id === activeTab;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              style={[styles.tab, on && styles.tabOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>{t.label}</Text>
              {!!t.count && (
                <View style={[styles.tabBadge, on && styles.tabBadgeOn]}>
                  <Text style={[styles.tabBadgeText, on && styles.tabBadgeTextOn]}>{formatCompact(t.count)}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* ── ROOM ── */}
      {activeTab === "room" && (
        <ScrollView style={styles.flex1} contentContainerStyle={styles.roomBody} showsVerticalScrollIndicator={false}>
          <Text style={styles.groupLabel}>ON STAGE · {speakers.length}</Text>
          <View style={styles.stageGrid}>
            {speakers.map((s) => (
              <SpeakerTile key={s.id} seat={s} onPress={() => openPeople()} />
            ))}
          </View>

          <Text style={[styles.groupLabel, { paddingTop: 26 }]}>IN THE ROOM · {formatCompact(room.listening)}</Text>
          {room.listeners.length === 0 && room.others === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Nobody has joined yet</Text>
              <Text style={styles.emptySub}>Share the room so people you follow can find it.</Text>
              <Pressable onPress={shareRoom} style={styles.emptyBtn}>
                <Share2 size={14} color="#fff" strokeWidth={2.2} />
                <Text style={styles.emptyBtnText}>Share room</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.listenerGrid}>
              {room.listeners.map((l) => (
                <Pressable key={l.id} style={styles.listenerTile} onPress={openListeners}>
                  <Avatar uri={l.avatar} style={styles.listenerAvatar} />
                  <Text style={styles.listenerName} numberOfLines={1}>{firstName(l.name)}</Text>
                </Pressable>
              ))}
              {room.others > 0 && (
                <Pressable style={styles.listenerTile} onPress={openListeners}>
                  <View style={[styles.listenerAvatar, styles.moreCircle]}>
                    <Text style={styles.moreText}>+{formatCompact(room.others)}</Text>
                  </View>
                  <Text style={styles.listenerName} numberOfLines={1}>See all</Text>
                </Pressable>
              )}
            </View>
          )}

          {!audio.available && (
            <Text style={styles.audioNote}>
              Live audio needs a development build - the room works, but you will not hear it in Expo Go.
            </Text>
          )}
        </ScrollView>
      )}

      {/* ── CHAT ── */}
      {activeTab === "chat" && (
        <KeyboardAvoidingView
          style={styles.flex1}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={insets.top + 8}
        >
          <FlatList
            ref={chatRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderChatRow}
            style={styles.flex1}
            contentContainerStyle={styles.chatBody}
            showsVerticalScrollIndicator={false}
            // Same anchor-to-bottom behaviour the ScrollView had (not inverted -
            // this just re-snaps to the end whenever the content grows, matching
            // the previous onContentSizeChange + scrollToEnd approach exactly).
            onContentSizeChange={() => chatRef.current?.scrollToEnd({ animated: false })}
            ListHeaderComponent={
              <View style={styles.noticeCard}>
                <Text style={styles.noticeText}>
                  Room chat is visible to everyone listening. Be kind - the host and moderators can remove messages.
                </Text>
              </View>
            }
            ListEmptyComponent={<Text style={styles.chatEmpty}>No messages yet. Say hello.</Text>}
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.quickWrap}
            contentContainerStyle={styles.quickRow}
            keyboardShouldPersistTaps="handled"
          >
            {QUICK_REPLIES.map((q) => (
              <Pressable key={q} onPress={() => send(q)} style={styles.quickChip}>
                <Text style={styles.quickText}>{q}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={[styles.composer, { paddingBottom: (insets.bottom || spacing.md) + 8 }]}>
            <View style={styles.composerField}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Say something to the room"
                placeholderTextColor="rgba(255,255,255,0.45)"
                style={styles.composerInput}
                onSubmitEditing={() => send()}
                returnKeyType="send"
              />
            </View>
            <Pressable onPress={() => send()} style={styles.composerSend} accessibilityLabel="Send message">
              {sendM.isPending
                ? <ActivityIndicator size="small" color="#fff" />
                : <SendHorizontal size={18} color="#fff" strokeWidth={2.1} />}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* ── REQUESTS ── */}
      {activeTab === "requests" && (
        <ScrollView style={styles.flex1} contentContainerStyle={styles.reqBody} showsVerticalScrollIndicator={false}>
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>
              {pending.length > 0
                ? "People waiting to speak. Approving moves them onto the stage."
                : "Nobody is waiting to speak right now."}
            </Text>
          </View>
          {pending.map((r) => (
            <RequestRow
              key={r.id}
              row={r}
              busy={approveM.isPending || declineM.isPending}
              onApprove={() => approveM.mutate(r.user_id)}
              onDecline={() => declineM.mutate(r.user_id)}
            />
          ))}
        </ScrollView>
      )}

      {/* ── control bar (hidden on Chat, which has its own composer) ── */}
      {activeTab !== "chat" && (
        <View style={[styles.bar, { paddingBottom: (insets.bottom || spacing.md) + 12 }]}>
          {/* One button, three honest states: your mic when you hold one, the
              raise-hand when the room takes requests, and a plain "Listening"
              when the host has kept the stage closed (nothing to tap). */}
          <Pressable
            onPress={() => (canSpeak ? audio.setMuted(!audio.muted) : requestsOn ? raiseHand() : undefined)}
            disabled={!canSpeak && !requestsOn}
            style={[styles.micBtn, canSpeak && !audio.muted && styles.micBtnLive]}
            accessibilityLabel={canSpeak ? (audio.muted ? "Unmute" : "Mute") : requestsOn ? "Request to speak" : "Listening"}
          >
            {canSpeak
              ? (audio.muted ? <MicOff size={17} color="#fff" strokeWidth={2.1} /> : <Mic size={17} color="#fff" strokeWidth={2.1} />)
              : requestsOn
                ? <Hand size={17} color="#fff" strokeWidth={2.1} />
                : <MicOff size={17} color="rgba(255,255,255,0.6)" strokeWidth={2.1} />}
            <Text style={styles.micText} numberOfLines={1}>
              {canSpeak
                ? (audio.muted ? "Mic is off" : "Mic on")
                : requestsOn
                  ? (requested ? "Hand raised" : "Request to speak")
                  : "Listening"}
            </Text>
          </Pressable>

          {reactionsOn && (
            <Pressable onPress={react} style={styles.toolBtn} accessibilityLabel="React">
              <Animated.View style={{ transform: [{ scale: pop }] }}>
                <Heart size={19} color={colors.brand} fill={colors.brand} strokeWidth={2} />
              </Animated.View>
            </Pressable>
          )}
          {/* Invite, per the design. It shares the room link, which IS the
              invite - there is no separate invite endpoint, and a user-plus
              that opened a listener list would promise something it does not
              do. People moved into the ••• sheet, which already lists it. */}
          <Pressable onPress={shareRoom} style={styles.toolBtn} accessibilityLabel="Invite someone">
            <UserPlus size={19} color="#fff" strokeWidth={2.1} />
          </Pressable>

          <Pressable onPress={leave} style={styles.leaveBtn} accessibilityLabel="Leave space">
            <LogOut size={19} color="#fff" strokeWidth={2.1} />
          </Pressable>
        </View>
      )}

      <ReportSheet
        visible={reportOpen}
        entityType="space"
        entityId={spaceId}
        onClose={() => setReportOpen(false)}
      />

      <RequestToSpeakSheet
        visible={askOpen}
        sending={requestM.isPending}
        onSend={() => requestM.mutate()}
        onClose={() => setAskOpen(false)}
      />

      <RoomOptionsSheet
        visible={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        insetBottom={insets.bottom}
        subtitle={`${formatCompact(room.listening)} listening · ${speakers.length} on stage`}
        rows={[
          {
            title: "ROOM",
            rows: [
              { Icon: Users, label: "People in this space", sub: "Speakers, listeners and moderation", act: () => openPeople() },
              { Icon: Users, label: "Listeners", sub: "Everyone tuned in right now", act: openListeners },
              { Icon: Share2, label: "Share room", sub: "Send an invite outside Teezer", act: shareRoom },
              { Icon: Link2, label: "Copy link", sub: "Put the room link on your clipboard", act: copyLink },
              { Icon: Flag, label: "Report Space", sub: "Flag this room for our safety team", act: () => { setOptionsOpen(false); setReportOpen(true); }, danger: true },
            ],
          },
          {
            title: "THIS ROOM'S SETTINGS",
            rows: [
              { Icon: Mic, label: "Who can speak", sub: "Set by the host when the room opened", value: SPEAK_LABEL[room.settings?.speaking_permission ?? "request"] },
              { Icon: Users, label: "Audio quality", sub: "Applies to everyone in the room", value: capitalise(room.settings?.audio_quality ?? "standard") },
              { Icon: Power, label: "Recording", sub: "Whether a replay is being captured", value: room.settings?.is_recorded ? "On" : "Off" },
            ],
          },
          ...(isHost
            ? [{
                title: "HOST",
                rows: [{ Icon: Power, label: "End Space", sub: "Closes the room for everyone", act: confirmEnd, danger: true }],
              }]
            : []),
        ]}
      />
    </LinearGradient>
  );
}

/* ── helpers ─────────────────────────────────────────────────────────── */

const SPEAK_LABEL: Record<string, string> = {
  everyone: "Everyone",
  request: "By request",
  host_only: "Host only",
};
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const firstName = (n: string) => (n || "").split(" ")[0] || n;

/* ── pieces ──────────────────────────────────────────────────────────── */

function SpeakerTile({ seat, onPress }: { seat: SpaceSeat; onPress: () => void }) {
  const isHost = seat.role === "host";
  const ring = isHost ? RING.host : RING.speaker;
  const role = roleOf(seat);

  return (
    <Pressable style={styles.stageTile} onPress={onPress}>
      <View style={[styles.stageRing, { borderColor: ring }]}>
        <Avatar uri={seat.avatar} style={styles.stageAvatar} />
        <View style={[styles.micBadge, { backgroundColor: seat.muted ? "rgba(255,255,255,0.22)" : ring }]}>
          {seat.muted
            ? <MicOff size={10} color="#fff" strokeWidth={2.6} />
            : <Mic size={10} color="#fff" strokeWidth={2.6} />}
        </View>
      </View>
      <View style={styles.stageNameRow}>
        <Text style={styles.stageName} numberOfLines={1}>{firstName(seat.name)}</Text>
        {seat.verified && <VerifiedBadge size={10} />}
      </View>
      <Text style={[styles.stageRole, { color: role.color }]} numberOfLines={1}>{role.label}</Text>
    </Pressable>
  );
}

const ChatRow = memo(function ChatRow({ m }: { m: SpaceMessage }) {
  const tag = m.role === "host" ? "HOST" : m.role === "speaker" ? "SPEAKER" : null;
  return (
    <View style={styles.chatRow}>
      <Avatar uri={m.user.avatar} style={styles.chatAvatar} />
      <View style={styles.chatText}>
        <View style={styles.chatHead}>
          <Text style={styles.chatName} numberOfLines={1}>{m.user.name}</Text>
          {tag && (
            <View style={[styles.chatTag, m.role === "host" && styles.chatTagHost]}>
              <Text style={[styles.chatTagText, m.role === "host" && styles.chatTagTextHost]}>{tag}</Text>
            </View>
          )}
          <Text style={styles.chatWhen}>{relativeTime(m.created_at)}</Text>
        </View>
        <Text style={styles.chatMessage}>{m.body}</Text>
      </View>
    </View>
  );
});

function RequestRow({ row, busy, onApprove, onDecline }: {
  row: SpaceRequestRow; busy: boolean; onApprove: () => void; onDecline: () => void;
}) {
  return (
    <View style={styles.reqRow}>
      <Avatar uri={row.avatar} style={styles.reqAvatar} />
      <View style={styles.reqText}>
        <Text style={styles.reqName} numberOfLines={1}>{row.name}</Text>
        <Text style={styles.reqMeta} numberOfLines={1}>
          {row.username ? `@${row.username}` : "Wants to speak"}
          {row.at ? ` · ${relativeTime(row.at)}` : ""}
        </Text>
      </View>
      <Pressable onPress={onDecline} disabled={busy} style={styles.reqDecline} accessibilityLabel={`Decline ${row.name}`}>
        <X size={14} color="rgba(255,255,255,0.6)" strokeWidth={2.6} />
      </Pressable>
      <Pressable onPress={onApprove} disabled={busy} style={styles.reqApprove} accessibilityLabel={`Approve ${row.name}`}>
        <Text style={styles.reqApproveText}>Approve</Text>
      </Pressable>
    </View>
  );
}

/** The ••• sheet. Only rows that map to something real: navigation, share,
 *  clipboard, and the host's End Space. Settings are shown as read-only values
 *  because changing them mid-room has no endpoint. */
function RoomOptionsSheet({ visible, rows, subtitle, insetBottom, onClose }: {
  visible: boolean;
  subtitle: string;
  insetBottom: number;
  onClose: () => void;
  rows: {
    title: string;
    rows: { Icon: LucideIcon; label: string; sub: string; act?: () => void; value?: string; danger?: boolean }[];
  }[];
}) {
  if (!visible) return null;
  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={[StyleSheet.absoluteFill, styles.optScrim]} onPress={onClose} />
      <ScrollView
        style={styles.optSheet}
        contentContainerStyle={{ paddingBottom: insetBottom + 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.optGrabber} />
        <View style={styles.optHead}>
          <View style={styles.optHeadText}>
            <Text style={styles.optTitle}>Room settings</Text>
            <Text style={styles.optSubtitle} numberOfLines={1}>{subtitle}</Text>
          </View>
          <Pressable onPress={onClose} style={styles.optClose} accessibilityLabel="Close">
            <X size={14} color="#fff" strokeWidth={2.8} />
          </Pressable>
        </View>

        {rows.map((g) => (
          <View key={g.title} style={styles.optGroupWrap}>
            <Text style={styles.optGroupLabel}>{g.title}</Text>
            <View style={styles.optGroup}>
              {g.rows.map((r) => (
                <Pressable
                  key={r.label}
                  onPress={r.act}
                  disabled={!r.act}
                  style={({ pressed }) => [styles.optRow, pressed && r.act && { opacity: 0.6 }]}
                >
                  <View style={styles.optIcon}>
                    <r.Icon size={16} color={r.danger ? colors.brand : "#fff"} strokeWidth={2} />
                  </View>
                  <View style={styles.optText}>
                    <Text style={[styles.optLabel, r.danger && { color: colors.brand }]} numberOfLines={1}>{r.label}</Text>
                    <Text style={styles.optSub} numberOfLines={1}>{r.sub}</Text>
                  </View>
                  {r.value
                    ? <Text style={styles.optValue} numberOfLines={1}>{r.value}</Text>
                    : r.act && <ChevronRight size={15} color="rgba(255,255,255,0.35)" strokeWidth={2.2} />}
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/* ── styles ──────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex1: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: spacing.lg, paddingBottom: 8 },
  glassBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center", justifyContent: "center",
  },
  liveWrap: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.brand },
  // tabular-nums so the seconds digit changing does not resize the label and
  // nudge the centre column a pixel every second. flexShrink lets a long status
  // ellipsis inside its own zone instead of pushing the share/options squares.
  liveText: {
    fontSize: 11.5, fontWeight: font.weightHeavy, color: colors.brand, letterSpacing: 0.6,
    flexShrink: 1, fontVariant: ["tabular-nums"],
  },
  headerRight: { flexDirection: "row", gap: 8 },

  titleBlock: { paddingHorizontal: 18, paddingTop: 4 },
  title: { fontSize: 20, fontWeight: font.weightHeavy, color: "#fff", letterSpacing: -0.5, lineHeight: 26 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 7, flexWrap: "wrap" },
  meta: { fontSize: 12, color: "rgba(255,255,255,0.55)", flexShrink: 1 },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)" },

  tabs: { flexDirection: "row", gap: 7, paddingHorizontal: spacing.lg, paddingTop: 14, paddingBottom: 4 },
  tab: {
    flex: 1, height: 34, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  tabOn: { backgroundColor: "#fff" },
  tabLabel: { fontSize: 12.5, fontWeight: font.weightHeavy, color: "rgba(255,255,255,0.7)" },
  tabLabelOn: { color: "#141018" },
  tabBadge: { minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  tabBadgeOn: { backgroundColor: colors.brand },
  tabBadgeText: { fontSize: 9.5, fontWeight: font.weightHeavy, color: "#fff" },
  tabBadgeTextOn: { color: "#fff" },

  // room tab
  roomBody: { paddingHorizontal: spacing.lg, paddingTop: 16, paddingBottom: 24 },
  groupLabel: { fontSize: 10.5, fontWeight: font.weightHeavy, color: "rgba(255,255,255,0.4)", letterSpacing: 0.85, paddingLeft: 2 },
  stageGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 14, rowGap: 18 },
  stageTile: { width: "25%", alignItems: "center", gap: 7, paddingHorizontal: 3 },
  stageRing: { width: 60, height: 60, borderRadius: 30, borderWidth: 2.5, padding: 2 },
  stageAvatar: { flex: 1, borderRadius: 26 },
  micBadge: {
    position: "absolute", right: -2, bottom: -2, width: 21, height: 21, borderRadius: 11,
    alignItems: "center", justifyContent: "center", borderWidth: 2.5, borderColor: "#16101a",
  },
  stageNameRow: { flexDirection: "row", alignItems: "center", gap: 3, maxWidth: "100%" },
  stageName: { fontSize: 11, fontWeight: font.weightBold, color: "#fff", flexShrink: 1 },
  stageRole: { fontSize: 9.5, fontWeight: font.weightBold },

  listenerGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 14, rowGap: 14 },
  listenerTile: { width: "20%", alignItems: "center", gap: 6, paddingHorizontal: 2 },
  listenerAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: RING.listener },
  moreCircle: { alignItems: "center", justifyContent: "center" },
  moreText: { fontSize: 11, fontWeight: font.weightHeavy, color: "#fff" },
  listenerName: { fontSize: 9.5, color: "rgba(255,255,255,0.5)", maxWidth: "100%" },

  emptyCard: { marginTop: 12, padding: 14, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.06)" },
  emptyTitle: { fontSize: 13, fontWeight: font.weightBold, color: "#fff" },
  emptySub: { marginTop: 4, fontSize: 11.5, color: "rgba(255,255,255,0.5)", lineHeight: 17 },
  emptyBtn: {
    marginTop: 12, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6,
    height: 34, paddingHorizontal: 13, borderRadius: 9, backgroundColor: colors.brand,
  },
  emptyBtnText: { fontSize: 12.5, fontWeight: font.weightHeavy, color: "#fff" },

  audioNote: { marginTop: 22, fontSize: 11.5, color: "rgba(255,255,255,0.4)", lineHeight: 17 },

  // chat tab
  chatBody: { paddingHorizontal: spacing.lg, paddingTop: 14, paddingBottom: 6, gap: 12 },
  noticeCard: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.05)" },
  noticeText: { fontSize: 11.5, color: "rgba(255,255,255,0.5)", lineHeight: 17 },
  chatEmpty: { fontSize: 12.5, color: "rgba(255,255,255,0.4)", textAlign: "center", paddingTop: 20 },
  chatRow: { flexDirection: "row", gap: 9, alignItems: "flex-start" },
  chatAvatar: { width: 30, height: 30, borderRadius: 15 },
  chatText: { flex: 1, minWidth: 0 },
  chatHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  chatName: { fontSize: 12, fontWeight: font.weightHeavy, color: "#fff", flexShrink: 1 },
  chatTag: { height: 15, paddingHorizontal: 5, borderRadius: 4, backgroundColor: "rgba(168,85,247,0.25)", justifyContent: "center" },
  chatTagHost: { backgroundColor: "rgba(254,44,85,0.25)" },
  chatTagText: { fontSize: 8.5, fontWeight: font.weightHeavy, color: "#c4a2f5", letterSpacing: 0.4 },
  chatTagTextHost: { color: "#ff8fa6" },
  chatWhen: { fontSize: 10.5, color: "rgba(255,255,255,0.35)" },
  chatMessage: { marginTop: 3, fontSize: 13, color: "rgba(255,255,255,0.86)", lineHeight: 19 },

  quickWrap: { flexGrow: 0 },
  quickRow: { gap: 7, paddingHorizontal: spacing.lg, paddingBottom: 8 },
  quickChip: { height: 32, paddingHorizontal: 12, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.09)", justifyContent: "center" },
  quickText: { fontSize: 12.5, fontWeight: font.weightBold, color: "#fff" },

  composer: {
    flexDirection: "row", alignItems: "center", gap: 9,
    paddingHorizontal: spacing.lg, paddingTop: 8, backgroundColor: "rgba(0,0,0,0.35)",
  },
  composerField: {
    flex: 1, height: 44, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.09)",
    paddingHorizontal: 14, justifyContent: "center",
  },
  composerInput: { color: "#fff", fontSize: 13.5, padding: 0 },
  composerSend: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
  },

  // requests tab
  reqBody: { paddingHorizontal: spacing.lg, paddingTop: 14, paddingBottom: 24 },
  reqRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 13 },
  reqAvatar: { width: 44, height: 44, borderRadius: 22 },
  reqText: { flex: 1, minWidth: 0 },
  reqName: { fontSize: 13.5, fontWeight: font.weightBold, color: "#fff" },
  reqMeta: { marginTop: 3, fontSize: 11.5, color: "rgba(255,255,255,0.5)" },
  reqDecline: {
    width: 34, height: 34, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center", justifyContent: "center",
  },
  reqApprove: { height: 34, paddingHorizontal: 14, borderRadius: 9, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  reqApproveText: { fontSize: 12.5, fontWeight: font.weightHeavy, color: "#fff" },

  // control bar
  bar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: spacing.lg, paddingTop: 10, backgroundColor: "rgba(0,0,0,0.35)",
  },
  micBtn: {
    flex: 1, minWidth: 0, height: 46, borderRadius: 12, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  micBtnLive: { backgroundColor: "rgba(168,85,247,0.35)" },
  micText: { fontSize: 12.5, fontWeight: font.weightHeavy, color: "#fff", flexShrink: 1 },
  toolBtn: {
    width: 46, height: 46, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  leaveBtn: {
    width: 46, height: 46, borderRadius: 12, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
  },

  // options sheet
  optScrim: { backgroundColor: "rgba(0,0,0,0.55)" },
  optSheet: {
    position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "82%",
    backgroundColor: "#171018", borderTopLeftRadius: 22, borderTopRightRadius: 22,
  },
  optGrabber: { width: 44, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.18)", alignSelf: "center", marginTop: 10 },
  optHead: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 18, paddingVertical: 12 },
  optHeadText: { flex: 1, minWidth: 0 },
  optTitle: { fontSize: 16.5, fontWeight: font.weightHeavy, color: "#fff", letterSpacing: -0.3 },
  optSubtitle: { marginTop: 2, fontSize: 12, color: "rgba(255,255,255,0.5)" },
  optClose: { width: 30, height: 30, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  optGroupWrap: { paddingHorizontal: 18, paddingTop: 6 },
  optGroupLabel: { fontSize: 10.5, fontWeight: font.weightHeavy, color: "rgba(255,255,255,0.35)", letterSpacing: 0.85, paddingTop: 10, paddingBottom: 8 },
  optGroup: { borderRadius: 15, backgroundColor: "rgba(255,255,255,0.05)", paddingVertical: 3 },
  optRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 13, paddingVertical: 12 },
  optIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  optText: { flex: 1, minWidth: 0 },
  optLabel: { fontSize: 13.5, fontWeight: font.weightBold, color: "#fff" },
  optSub: { marginTop: 3, fontSize: 11.5, color: "rgba(255,255,255,0.45)" },
  optValue: { fontSize: 12.5, fontWeight: font.weightBold, color: "rgba(255,255,255,0.6)", maxWidth: 130 },
});
