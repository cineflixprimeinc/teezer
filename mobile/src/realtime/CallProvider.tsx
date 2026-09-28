import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Avatar } from "@/components/Avatar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { usePresenceStore } from "@/store/presence.store";
import { useRealtimeStore } from "@/store/realtime.store";
import { acquireSocket, releaseSocket } from "@/realtime/socket";
import { ackDelivered, applyDmDelivered, applyDmNew, applyDmRead, applyDmSent, applyDmTyping } from "@/realtime/dm-events";
import { hasPendingLike } from "@/utils/like-sync";
import { getWebRtc, isWebRtcAvailable, callUnavailableReason } from "@/realtime/webrtc";
import { colors } from "@/constants/colors";
import { font, spacing } from "@/constants/theme";

/* ── Types ─────────────────────────────────────────────────────── */
export type CallType = "audio" | "video";
type CallStatus = "idle" | "outgoing" | "incoming" | "connecting" | "connected" | "ended";

interface CallPeer {
  id: number;
  name: string;
  username?: string | null;
  avatar?: string | null;
}

interface CallState {
  status: CallStatus;
  type: CallType;
  peer: CallPeer | null;
  callId: number | null;
  muted: boolean;
  /** seconds since connect (drives the in-call timer) */
  seconds: number;
  /** true while running in Expo Go / without the native WebRTC module */
  audioUnavailable: boolean;
}

interface CallContextValue extends CallState {
  startCall: (peer: CallPeer, type?: CallType) => void;
  accept: () => void;
  decline: () => void;
  hangup: () => void;
  toggleMute: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);
export const useCall = () => {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within <CallProvider>");
  return ctx;
};

/* STUN keeps most calls connecting; symmetric-NAT networks would also need a
   TURN server with credentials (COTURN_SECRET) - add here when available. */
const ICE_SERVERS = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:teezer.live:3478" }],
};

const IDLE: CallState = { status: "idle", type: "audio", peer: null, callId: null, muted: false, seconds: 0, audioUnavailable: !isWebRtcAvailable() };

export function CallProvider({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [state, setState] = useState<CallState>(IDLE);

  const socketRef = useRef<any>(null);
  const pcRef = useRef<any>(null);
  const localStreamRef = useRef<any>(null);
  const remoteStreamRef = useRef<any>(null);
  const pendingIceRef = useRef<any[]>([]);
  const peerIdRef = useRef<number | null>(null);
  const callIdRef = useRef<number | null>(null);
  /** Coalescing timer for notification cache invalidation - see refreshNotifs. */
  const notifRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCallerRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const patch = useCallback((p: Partial<CallState>) => setState((s) => ({ ...s, ...p })), []);

  /* ── Teardown everything and return to idle ─────────────────── */
  const cleanup = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try { pcRef.current?.getSenders?.().forEach((sn: any) => sn.track?.stop?.()); } catch {}
    try { pcRef.current?.close?.(); } catch {}
    try { localStreamRef.current?.getTracks?.().forEach((t: any) => t.stop()); } catch {}
    pcRef.current = null;
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    pendingIceRef.current = [];
    peerIdRef.current = null;
    callIdRef.current = null;
    isCallerRef.current = false;
    setState({ ...IDLE });
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => setState((s) => ({ ...s, seconds: s.seconds + 1 })), 1000);
  }, []);

  /* ── WebRTC peer-connection wiring (no-op when unavailable) ──── */
  const ensureLocalStream = useCallback(async () => {
    const rtc = getWebRtc();
    if (!rtc || localStreamRef.current) return localStreamRef.current;
    const stream = await rtc.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = stream;
    return stream;
  }, []);

  const buildPeer = useCallback(() => {
    const rtc = getWebRtc();
    if (!rtc) return null;
    const pc = new rtc.RTCPeerConnection(ICE_SERVERS);
    pc.addEventListener?.("icecandidate", (e: any) => {
      if (e.candidate && peerIdRef.current && callIdRef.current) {
        socketRef.current?.emit("call:webrtc", {
          call_id: callIdRef.current, to_user_id: peerIdRef.current,
          type: "ice-candidate", payload: e.candidate,
        });
      }
    });
    pc.addEventListener?.("track", (e: any) => { remoteStreamRef.current = e.streams?.[0] ?? null; });
    pc.addEventListener?.("connectionstatechange", () => {
      const st = pc.connectionState;
      if (st === "connected") { patch({ status: "connected" }); startTimer(); }
      else if (st === "failed" || st === "closed") hangupRef.current();
    });
    const local = localStreamRef.current;
    if (local) local.getTracks().forEach((t: any) => pc.addTrack(t, local));
    pcRef.current = pc;
    return pc;
  }, [patch, startTimer]);

  const flushIce = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    for (const c of pendingIceRef.current.splice(0)) {
      try { await pc.addIceCandidate(new (getWebRtc()!.RTCIceCandidate)(c)); } catch {}
    }
  }, []);

  /* ── Public actions ─────────────────────────────────────────── */
  const startCall = useCallback(async (peer: CallPeer, type: CallType = "audio") => {
    if (callIdRef.current || state.status !== "idle") return;
    isCallerRef.current = true;
    peerIdRef.current = peer.id;
    patch({ status: "outgoing", type, peer, muted: false, seconds: 0, audioUnavailable: !isWebRtcAvailable() });
    try {
      // The provider already holds the shared socket while signed in.
      const socket = socketRef.current;
      if (!socket) { cleanup(); return; }
      if (isWebRtcAvailable()) await ensureLocalStream().catch(() => {});
      socket.emit("call:initiate", { to_user_id: peer.id, type }, (ack: any) => {
        if (!ack?.ok) { cleanup(); return; }
        callIdRef.current = ack.call_id;
        patch({ callId: ack.call_id });
      });
    } catch { cleanup(); }
  }, [state.status, patch, ensureLocalStream, cleanup]);

  const accept = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket || !callIdRef.current) return;
    patch({ status: "connecting" });
    if (isWebRtcAvailable()) {
      await ensureLocalStream().catch(() => {});
      buildPeer(); // offer arrives next via call:webrtc
    } else {
      patch({ status: "connected" }); startTimer(); // signalling-only (Expo Go)
    }
    socket.emit("call:accept", { call_id: callIdRef.current });
  }, [patch, ensureLocalStream, buildPeer, startTimer]);

  const decline = useCallback(() => {
    socketRef.current?.emit("call:reject", { call_id: callIdRef.current });
    cleanup();
  }, [cleanup]);

  const hangup = useCallback(() => {
    socketRef.current?.emit("call:end", { call_id: callIdRef.current });
    cleanup();
  }, [cleanup]);
  const hangupRef = useRef(hangup);
  useEffect(() => { hangupRef.current = hangup; }, [hangup]);

  const toggleMute = useCallback(() => {
    setState((s) => {
      const next = !s.muted;
      try { localStreamRef.current?.getAudioTracks?.().forEach((t: any) => { t.enabled = !next; }); } catch {}
      return { ...s, muted: next };
    });
  }, []);

  /* ── Connect the socket + attach call listeners while signed in ── */
  useEffect(() => {
    if (!user?.id) return;
    let live = true;
    let socket: any = null;

    (async () => {
      socket = await acquireSocket();
      if (!live) { releaseSocket(); return; }
      socketRef.current = socket;

      // Incoming call (deduped by call_id; ignore our own echo from the conv room).
      socket.on("call:incoming", (d: any) => {
        if (d.initiated_by === user.id) return;
        if (callIdRef.current) return; // already in a call
        callIdRef.current = d.call_id;
        peerIdRef.current = d.initiated_by;
        isCallerRef.current = false;
        patch({
          status: "incoming", type: d.type ?? "audio", callId: d.call_id,
          peer: { id: d.initiated_by, name: d.initiator_name || "Unknown", avatar: d.initiator_avatar },
          muted: false, seconds: 0, audioUnavailable: !isWebRtcAvailable(),
        });
      });

      // Callee accepted → caller builds the offer.
      socket.on("call:accepted", async (d: any) => {
        if (d.call_id !== callIdRef.current || !isCallerRef.current) return;
        patch({ status: "connecting" });
        if (!isWebRtcAvailable()) { patch({ status: "connected" }); startTimer(); return; }
        const pc = buildPeer();
        if (!pc) return;
        try {
          const offer = await pc.createOffer({});
          await pc.setLocalDescription(offer);
          socket.emit("call:webrtc", { call_id: d.call_id, to_user_id: peerIdRef.current, type: "offer", payload: offer });
        } catch { hangupRef.current(); }
      });

      socket.on("call:rejected", (d: any) => { if (d.call_id === callIdRef.current) cleanup(); });
      socket.on("call:ended", (d: any) => { if (d.call_id === callIdRef.current) cleanup(); });

      // WebRTC signalling relay (offer / answer / ice-candidate).
      socket.on("call:webrtc", async (d: any) => {
        if (d.call_id !== callIdRef.current || !isWebRtcAvailable()) return;
        try {
          if (d.type === "offer") {
            const pc = pcRef.current ?? buildPeer();
            if (!pc) return;
            await pc.setRemoteDescription(new (getWebRtc()!.RTCSessionDescription)(d.payload));
            await flushIce();
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit("call:webrtc", { call_id: d.call_id, to_user_id: peerIdRef.current, type: "answer", payload: answer });
          } else if (d.type === "answer") {
            await pcRef.current?.setRemoteDescription(new (getWebRtc()!.RTCSessionDescription)(d.payload));
            await flushIce();
          } else if (d.type === "ice-candidate") {
            if (pcRef.current?.remoteDescription) await pcRef.current.addIceCandidate(new (getWebRtc()!.RTCIceCandidate)(d.payload));
            else pendingIceRef.current.push(d.payload);
          }
        } catch { /* ignore malformed signalling */ }
      });

      // Realtime notifications: refresh the inbox badge + list the instant a new
      // notification is pushed by the backend (likes/comments/follows/saves/…).
      // A new group, an aggregated bump (X and N others…), or a withdrawn group
      // (unlike/unfollow) - all refresh the badge + notification lists so the
      // aggregated card is patched in place, never duplicated.
      /* The keys here MUST be the ones the screens register. The rebuild renamed
       * them (camelCase → kebab-case) and this file kept the old spellings, so
       * every event landed on a cache entry that did not exist: the push
       * arrived, nothing was invalidated, and the list only changed on a manual
       * refresh. Cross-check against the screen before editing either side. */
      /* Coalesced: a burst of events (three people liking the same reel within a
       * second) is one refetch of each list, not three. Without this every
       * event invalidated four query keys on its own, which is a handful of
       * requests per like on every foregrounded device. */
      const refreshNotifs = (d: any) => {
        // Prefix match: covers both ["profile-views","summary"] and "list".
        if (d?.type === "profile_view") void qc.invalidateQueries({ queryKey: ["profile-views"] });
        if (notifRefreshTimer.current) clearTimeout(notifRefreshTimer.current);
        notifRefreshTimer.current = setTimeout(() => {
          void qc.invalidateQueries({ queryKey: ["notificationsUnreadBadge"] });
          void qc.invalidateQueries({ queryKey: ["inbox-notifications"] });  // InboxScreen rows
          void qc.invalidateQueries({ queryKey: ["notifications-feed"] });   // NotificationsScreen
          void qc.invalidateQueries({ queryKey: ["inboxNotifPopupList"] });  // tab-bar nudge
        }, 350);
      };
      socket.on("notification:new", refreshNotifs);
      socket.on("notification:update", refreshNotifs);
      socket.on("notification:remove", refreshNotifs);

      // ── Story interactions → the owner's own story viewer ──
      // The backend records views/reactions/replies correctly, but until these
      // events existed nothing invalidated the viewers query, so an owner with
      // the story open saw a stale "Seen by N" for the query's whole staleTime
      // (and a view, which raises no notification, never landed at all).
      // Invalidating by story_id keeps it to the one story that changed rather
      // than refetching every open list.
      //
      // These keys are kebab-case because that is what the screens actually
      // register - ["story-viewers", id] and ["user-stories", username]. They
      // were camelCase here, which matches no query at all (React Query compares
      // key elements by value), so the events fired and invalidated nothing and
      // the owner sat on a stale "Seen by N" for the whole staleTime. If either
      // key is ever renamed, it has to be renamed in both places.
      const refreshStoryViewers = (d: any) => {
        if (d?.story_id == null) return;
        void qc.invalidateQueries({ queryKey: ["story-viewers", Number(d.story_id)] });
        void qc.invalidateQueries({ queryKey: ["user-stories"] });
      };
      socket.on("story.viewed", refreshStoryViewers);
      socket.on("story.reacted", refreshStoryViewers);
      socket.on("story.replied", refreshStoryViewers);
      // The consolidated event: the backend fires this from every path that can
      // move a counter (view / react / unreact / reply / share), carrying the
      // authoritative numbers. Handled the same way as the three above rather
      // than by writing its payload into the cache, because a refetch also
      // picks up the viewer LIST, which the payload does not carry - and a list
      // that disagrees with its own header is worse than one refetch.
      socket.on("story.analytics.updated", refreshStoryViewers);

      // Live online/offline → flip inbox presence dots instantly.
      socket.on("presence:update", (d: any) => {
        if (d?.user_id != null) usePresenceStore.getState().setOnline(Number(d.user_id), !!d.online);
      });

      // ── Realtime engagement (Phase 1): everyone in a video's room gets the
      // authoritative count the instant someone likes/comments - no refresh. ──
      const onLike = (d: any) => {
        if (d?.video_id == null) return;
        // Our own toggle is mid-flight → these are echoes of intermediate
        // states; the final response reconciles the count. Applying them
        // would make the number flap (and a stale last echo would stick).
        if (hasPendingLike(Number(d.video_id))) return;
        useRealtimeStore.getState().setCount(Number(d.video_id), { likes_count: Number(d.likes_count) });
      };
      socket.on("video.liked", onLike);
      socket.on("video.unliked", onLike);
      // comment.created/deleted both move video_comments_count and should
      // refresh the open comment sheet the same way - delete has no per-
      // comment like data to patch, just the video-level tally.
      const onCommentCountChange = (d: any) => {
        if (d?.video_id == null) return;
        if (typeof d.video_comments_count === "number") {
          useRealtimeStore.getState().setCount(Number(d.video_id), { comments_count: d.video_comments_count });
        }
        void qc.invalidateQueries({ queryKey: ["comments", Number(d.video_id)] });
      };
      socket.on("comment.created", onCommentCountChange);
      socket.on("comment.deleted", onCommentCountChange);

      // A comment's own like count changed - the video tally is unaffected;
      // just refresh the open sheet so the per-comment count updates live.
      const onCommentLikeChange = (d: any) => {
        if (d?.video_id == null) return;
        void qc.invalidateQueries({ queryKey: ["comments", Number(d.video_id)] });
      };
      socket.on("comment.liked", onCommentLikeChange);
      socket.on("comment.unliked", onCommentLikeChange);

      // ── Phase 2: live saves count (video room) ──
      const onSave = (d: any) => {
        if (d?.video_id != null && typeof d.saves_count === "number") {
          useRealtimeStore.getState().setCount(Number(d.video_id), { saves_count: Number(d.saves_count) });
        }
      };
      socket.on("video.saved", onSave);
      socket.on("video.unsaved", onSave);

      // Live share count (video room) - everyone watching sees the tally move
      // the instant ANY share completes, not just their own.
      socket.on("video.shared", (d: any) => {
        if (d?.video_id != null && typeof d.shares_count === "number") {
          useRealtimeStore.getState().setCount(Number(d.video_id), { shares_count: Number(d.shares_count) });
        }
      });

      // ── Phase 2: live follower count on my own profile (user room). Someone
      // followed/unfollowed me → refresh the authoritative profile counts. ──
      // Both spellings the profile screen registers - ["profile"] matched neither.
      const onFollowChange = () => {
        void qc.invalidateQueries({ queryKey: ["profile-me"] });
        void qc.invalidateQueries({ queryKey: ["profile-user"] });
      };
      socket.on("user.followed", onFollowChange);
      socket.on("user.unfollowed", onFollowChange);

      // ── DM receipts (WhatsApp-style): instant incoming messages plus live
      // ✓ delivered / ✓✓ read updates - cache patched in place, no refetch. ──
      socket.on("message.new", (d: any) => {
        if (!d?.message || d.message.receiver_id !== user.id) return;
        applyDmNew(qc, d);
        ackDelivered(socket, [Number(d.message.id)]); // this device has it → sender's ✓
      });
      socket.on("message.sent", (d: any) => {
        if (d?.message?.sender_id === user.id) applyDmSent(qc, d);
      });
      socket.on("message.delivered", (d: any) => { if (d) applyDmDelivered(qc, d, user.id); });
      socket.on("message.read", (d: any) => { if (d) applyDmRead(qc, d, user.id); });
      socket.on("message.typing", (d: any) => { if (d) applyDmTyping(d); });
    })();

    return () => {
      live = false;
      if (notifRefreshTimer.current) clearTimeout(notifRefreshTimer.current);
      if (socket) {
        ["call:incoming", "call:accepted", "call:rejected", "call:ended", "call:webrtc", "notification:new", "notification:update", "notification:remove", "story.viewed", "story.reacted", "story.replied", "story.analytics.updated", "presence:update", "video.liked", "video.unliked", "comment.created", "comment.deleted", "comment.liked", "comment.unliked", "video.saved", "video.unsaved", "video.shared", "user.followed", "user.unfollowed", "message.new", "message.sent", "message.delivered", "message.read", "message.typing"].forEach((e) => socket.off(e));
        releaseSocket();
      }
    };
  }, [user?.id, qc, patch, buildPeer, flushIce, cleanup, startTimer]);

  // Drop any active call on sign-out / unmount.
  useEffect(() => () => cleanup(), [cleanup]);

  const value: CallContextValue = { ...state, startCall, accept, decline, hangup, toggleMute };
  return (
    <CallContext.Provider value={value}>
      {children}
      <CallOverlay />
    </CallContext.Provider>
  );
}

/* ── Full-screen call UI (incoming + active) ───────────────────── */
function fmt(s: number) {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2, "0")}`;
}

function CallOverlay() {
  const { status, peer, type, muted, seconds, audioUnavailable, accept, decline, hangup, toggleMute } = useCall();
  const insets = useSafeAreaInsets();
  if (status === "idle" || status === "ended" || !peer) return null;

  const ringing = status === "outgoing" || status === "incoming" || status === "connecting";
  const subtitle =
    status === "incoming" ? `Incoming ${type} call…`
    : status === "outgoing" ? "Calling…"
    : status === "connecting" ? "Connecting…"
    : fmt(seconds);

  return (
    <Modal visible animationType="fade" transparent={false} statusBarTranslucent onRequestClose={hangup}>
      <View style={[styles.overlay, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 36 }]}>
        <View style={styles.top}>
          <Avatar uri={peer.avatar} style={styles.avatar} />
          <Text style={styles.name} numberOfLines={1}>{peer.name}</Text>
          <View style={styles.subRow}>
            {(status === "outgoing" || status === "connecting") && <ActivityIndicator color="rgba(255,255,255,0.8)" style={{ marginRight: 8 }} />}
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          {audioUnavailable && status !== "incoming" && (
            <Text style={styles.notice}>{callUnavailableReason}</Text>
          )}
        </View>

        {status === "incoming" ? (
          <View style={styles.actionsRow}>
            <CallButton icon="close" label="Decline" color="#ef4444" onPress={decline} />
            <CallButton icon="call" label="Accept" color="#22c55e" onPress={accept} />
          </View>
        ) : (
          <View style={styles.actionsRow}>
            <CallButton icon={muted ? "mic-off" : "mic"} label={muted ? "Unmute" : "Mute"} color="rgba(255,255,255,0.18)" onPress={toggleMute} disabled={audioUnavailable} />
            <CallButton icon="call" label="End" color="#ef4444" rotate onPress={hangup} />
          </View>
        )}
        {ringing && status !== "incoming" && <View style={{ height: 4 }} />}
      </View>
    </Modal>
  );
}

function CallButton({ icon, label, color, onPress, rotate, disabled }: { icon: any; label: string; color: string; onPress: () => void; rotate?: boolean; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.btnWrap, pressed && { opacity: 0.7 }, disabled && { opacity: 0.4 }]}>
      <View style={[styles.btn, { backgroundColor: color }]}>
        <Ionicons name={icon} size={30} color={colors.white} style={rotate ? { transform: [{ rotate: "135deg" }] } : undefined} />
      </View>
      <Text style={styles.btnLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "#0e0e12", alignItems: "center", justifyContent: "space-between" },
  top: { alignItems: "center", paddingHorizontal: spacing.lg, flex: 1, justifyContent: "center" },
  avatar: { width: 132, height: 132, borderRadius: 66, backgroundColor: "#23232b" },
  avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
  avatarLetter: { color: colors.white, fontSize: 54, fontWeight: font.weightHeavy },
  name: { color: colors.white, fontSize: 26, fontWeight: font.weightHeavy, marginTop: spacing.lg, textAlign: "center" },
  subRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.sm },
  subtitle: { color: "rgba(255,255,255,0.75)", fontSize: font.md },
  notice: { color: "rgba(255,255,255,0.5)", fontSize: font.xs, textAlign: "center", marginTop: spacing.md, paddingHorizontal: spacing.lg, lineHeight: 17 },
  actionsRow: { flexDirection: "row", justifyContent: "space-evenly", alignItems: "flex-end", width: "100%", paddingHorizontal: spacing.xl },
  btnWrap: { alignItems: "center", gap: 10 },
  btn: { width: 70, height: 70, borderRadius: 35, alignItems: "center", justifyContent: "center" },
  btnLabel: { color: "rgba(255,255,255,0.85)", fontSize: font.sm },
});
