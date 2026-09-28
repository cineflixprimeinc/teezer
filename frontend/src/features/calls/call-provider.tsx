"use client";

/**
 * Site-wide audio/video calling over Centrifugo (WebSocket + WebRTC).
 *
 * Mounted once in AppProviders so a call can ring anywhere on the site. Messages
 * themselves still use the REST API + polling - this only handles call signalling
 * and the peer connection. Mirrors the React Native CallProvider so both clients
 * speak the same protocol and can call each other.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff, Video as VideoIcon, VideoOff } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { type RealtimeSocket } from "@/services/realtime/centrifugo";
import { acquireSocket, releaseSocket } from "@/services/realtime/socket";

/* STUN gets most calls connected; symmetric-NAT networks also need a TURN
   server with credentials (COTURN_SECRET) - add here once available. */
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:teezer.live:3478" }],
};

export type CallType = "audio" | "video";
type CallStatus = "idle" | "outgoing" | "incoming" | "connecting" | "connected";

export interface CallPeer {
  id: number;
  name: string;
  username?: string | null;
  avatar?: string | null;
}

interface CallCtx {
  status: CallStatus;
  startCall: (peer: CallPeer, type?: CallType) => void;
  /** Imperative access to the shared Centrifugo socket (mirrors the mobile
   *  app's peekSocket()) - null until a signed-in session connects it. Used
   *  outside calls too: the feed joins per-video rooms for live like/comment/
   *  share/save counts (see feed-page.tsx). */
  getSocket: () => RealtimeSocket | null;
}

const Ctx = createContext<CallCtx | null>(null);
export const useCall = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCall must be used within <CallProvider>");
  return c;
};

export function CallProvider({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [status, setStatus] = useState<CallStatus>("idle");
  const [type, setType] = useState<CallType>("audio");
  const [peer, setPeer] = useState<CallPeer | null>(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const socketRef = useRef<RealtimeSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const peerIdRef = useRef<number | null>(null);
  const callIdRef = useRef<number | null>(null);
  const isCallerRef = useRef(false);
  const typeRef = useRef<CallType>("audio");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const attachRemote = useCallback((stream: MediaStream) => {
    if (remoteAudioRef.current) { remoteAudioRef.current.srcObject = stream; remoteAudioRef.current.play?.().catch(() => {}); }
    if (remoteVideoRef.current) { remoteVideoRef.current.srcObject = stream; remoteVideoRef.current.play?.().catch(() => {}); }
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try { pcRef.current?.getSenders().forEach((s) => s.track?.stop()); } catch {}
    try { pcRef.current?.close(); } catch {}
    try { localStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    pcRef.current = null;
    localStreamRef.current = null;
    pendingIceRef.current = [];
    peerIdRef.current = null;
    callIdRef.current = null;
    isCallerRef.current = false;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    setStatus("idle");
    setMuted(false);
    setCamOff(false);
    setSeconds(0);
    setPeer(null);
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }, []);

  const hangupRef = useRef<() => void>(() => {});

  const ensureLocalStream = useCallback(async (callType: CallType) => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === "video" });
    localStreamRef.current = stream;
    if (callType === "video" && localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  }, []);

  const buildPeer = useCallback(() => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pc.onicecandidate = (e) => {
      if (e.candidate && peerIdRef.current && callIdRef.current) {
        socketRef.current?.emit("call:webrtc", {
          call_id: callIdRef.current, to_user_id: peerIdRef.current,
          type: "ice-candidate", payload: e.candidate.toJSON(),
        });
      }
    };
    pc.ontrack = (e) => { if (e.streams[0]) attachRemote(e.streams[0]); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") { setStatus("connected"); startTimer(); }
      else if (pc.connectionState === "failed" || pc.connectionState === "closed") hangupRef.current();
    };
    const local = localStreamRef.current;
    if (local) local.getTracks().forEach((t) => pc.addTrack(t, local));
    pcRef.current = pc;
    return pc;
  }, [attachRemote, startTimer]);

  const flushIce = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    for (const c of pendingIceRef.current.splice(0)) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
  }, []);

  /* ── Actions ─────────────────────────────────────────────── */
  const startCall = useCallback(async (p: CallPeer, callType: CallType = "audio") => {
    if (callIdRef.current || status !== "idle") return;
    const socket = socketRef.current;
    if (!socket?.connected) { return; }
    isCallerRef.current = true;
    peerIdRef.current = p.id;
    typeRef.current = callType;
    setType(callType); setPeer(p); setStatus("outgoing"); setMuted(false); setCamOff(false); setSeconds(0);
    try {
      await ensureLocalStream(callType);
    } catch {
      cleanup();
      return;
    }
    socket.emit("call:initiate", { to_user_id: p.id, type: callType }, (ack: any) => {
      if (!ack?.ok) { cleanup(); return; }
      callIdRef.current = ack.call_id;
    });
  }, [status, ensureLocalStream, cleanup]);

  const accept = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket || !callIdRef.current) return;
    setStatus("connecting");
    try {
      await ensureLocalStream(typeRef.current);
      buildPeer(); // offer arrives next via call:webrtc
    } catch { cleanup(); return; }
    socket.emit("call:accept", { call_id: callIdRef.current });
  }, [ensureLocalStream, buildPeer, cleanup]);

  const decline = useCallback(() => {
    socketRef.current?.emit("call:reject", { call_id: callIdRef.current });
    cleanup();
  }, [cleanup]);

  const hangup = useCallback(() => {
    socketRef.current?.emit("call:end", { call_id: callIdRef.current });
    cleanup();
  }, [cleanup]);
  useEffect(() => { hangupRef.current = hangup; }, [hangup]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next; });
      return next;
    });
  }, []);

  const toggleCam = useCallback(() => {
    setCamOff((c) => {
      const next = !c;
      localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = !next; });
      return next;
    });
  }, []);

  /* ── Socket + call listeners while signed in ─────────────── */
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("reelsoo_token") || "" : "";
    if (!token) return;

    // The session's shared connection, not a second one of this provider's own:
    // the app shell holds the same socket for the notification stream, and two
    // sockets on one private channel is just twice the work for the same events.
    const socket: RealtimeSocket = acquireSocket(user.id);
    socketRef.current = socket;

    const onIncoming = (d: any) => {
      if (d.initiated_by === user.id) return;     // our own echo from the conv room
      if (callIdRef.current) return;               // already busy
      callIdRef.current = d.call_id;
      peerIdRef.current = d.initiated_by;
      isCallerRef.current = false;
      typeRef.current = d.type === "video" ? "video" : "audio";
      setType(typeRef.current);
      setPeer({ id: d.initiated_by, name: d.initiator_name || "Unknown", avatar: d.initiator_avatar });
      setMuted(false); setCamOff(false); setSeconds(0);
      setStatus("incoming");
    };

    const onAccepted = async (d: any) => {
      if (d.call_id !== callIdRef.current || !isCallerRef.current) return;
      setStatus("connecting");
      const pc = buildPeer();
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("call:webrtc", { call_id: d.call_id, to_user_id: peerIdRef.current, type: "offer", payload: offer });
      } catch { hangupRef.current(); }
    };

    const onRejected = (d: any) => { if (d.call_id === callIdRef.current) cleanup(); };
    const onEnded = (d: any) => { if (d.call_id === callIdRef.current) cleanup(); };

    const onWebrtc = async (d: any) => {
      if (d.call_id !== callIdRef.current) return;
      try {
        if (d.type === "offer") {
          const pc = pcRef.current ?? buildPeer();
          await pc.setRemoteDescription(new RTCSessionDescription(d.payload));
          await flushIce();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("call:webrtc", { call_id: d.call_id, to_user_id: peerIdRef.current, type: "answer", payload: answer });
        } else if (d.type === "answer") {
          await pcRef.current?.setRemoteDescription(new RTCSessionDescription(d.payload));
          await flushIce();
        } else if (d.type === "ice-candidate") {
          if (pcRef.current?.remoteDescription) await pcRef.current.addIceCandidate(new RTCIceCandidate(d.payload));
          else pendingIceRef.current.push(d.payload);
        }
      } catch { /* ignore malformed signalling */ }
    };

    socket.on("call:incoming", onIncoming);
    socket.on("call:accepted", onAccepted);
    socket.on("call:rejected", onRejected);
    socket.on("call:ended", onEnded);
    socket.on("call:webrtc", onWebrtc);

    return () => {
      // Remove THESE handlers, not every listener for the event: the socket is
      // shared now, and the no-callback form of off() would take the app shell's
      // notification listeners down with them.
      socket.off("call:incoming", onIncoming);
      socket.off("call:accepted", onAccepted);
      socket.off("call:rejected", onRejected);
      socket.off("call:ended", onEnded);
      socket.off("call:webrtc", onWebrtc);
      releaseSocket();
      socketRef.current = null;
    };
  }, [isAuthenticated, user?.id, buildPeer, flushIce, cleanup]);

  useEffect(() => () => cleanup(), [cleanup]);

  return (
    <Ctx.Provider value={{ status, startCall, getSocket: () => socketRef.current }}>
      {children}
      {/* Hidden media sinks (always mounted so refs exist before tracks arrive). */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
      {status !== "idle" && peer && (
        <CallOverlay
          status={status} type={type} peer={peer} muted={muted} camOff={camOff} seconds={seconds}
          localVideoRef={localVideoRef} remoteVideoRef={remoteVideoRef}
          onAccept={accept} onDecline={decline} onHangup={hangup} onToggleMute={toggleMute} onToggleCam={toggleCam}
        />
      )}
    </Ctx.Provider>
  );
}

/* ── Overlay UI ──────────────────────────────────────────────── */
function fmt(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function CallOverlay(props: {
  status: CallStatus; type: CallType; peer: CallPeer; muted: boolean; camOff: boolean; seconds: number;
  localVideoRef: React.RefObject<HTMLVideoElement | null>; remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  onAccept: () => void; onDecline: () => void; onHangup: () => void; onToggleMute: () => void; onToggleCam: () => void;
}) {
  const { status, type, peer, muted, camOff, seconds, localVideoRef, remoteVideoRef } = props;
  const isVideo = type === "video";
  const subtitle =
    status === "incoming" ? `Incoming ${type} call…`
    : status === "outgoing" ? "Calling…"
    : status === "connecting" ? "Connecting…"
    : fmt(seconds);

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-between bg-[#0e0e12] py-12 text-white">
      {/* Remote video fills the screen for video calls */}
      {isVideo && (
        <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 h-full w-full object-cover opacity-90" />
      )}

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6">
        {!isVideo && <CallAvatar src={peer.avatar} name={peer.name} />}
        <p className="mt-5 text-[26px] font-extrabold">{peer.name}</p>
        <p className="mt-1 text-[15px] text-white/70">{subtitle}</p>
      </div>

      {/* Local preview (video calls) */}
      {isVideo && status !== "incoming" && (
        <video ref={localVideoRef} autoPlay playsInline muted className="absolute right-4 top-4 z-10 h-40 w-28 rounded-xl object-cover shadow-lg" />
      )}

      <div className="relative z-10 flex items-center gap-8">
        {status === "incoming" ? (
          <>
            <CallBtn color="bg-red-500" onClick={props.onDecline} label="Decline"><PhoneOff className="h-7 w-7" /></CallBtn>
            <CallBtn color="bg-green-500" onClick={props.onAccept} label="Accept"><Phone className="h-7 w-7" /></CallBtn>
          </>
        ) : (
          <>
            <CallBtn color="bg-white/15" onClick={props.onToggleMute} label={muted ? "Unmute" : "Mute"}>
              {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </CallBtn>
            {isVideo && (
              <CallBtn color="bg-white/15" onClick={props.onToggleCam} label={camOff ? "Camera on" : "Camera off"}>
                {camOff ? <VideoOff className="h-6 w-6" /> : <VideoIcon className="h-6 w-6" />}
              </CallBtn>
            )}
            <CallBtn color="bg-red-500" onClick={props.onHangup} label="End"><PhoneOff className="h-7 w-7" /></CallBtn>
          </>
        )}
      </div>
    </div>
  );
}

function CallAvatar({ src, name }: { src?: string | null; name: string }) {
  if (src) return <img src={src} alt={name} className="h-[132px] w-[132px] rounded-full object-cover" />;
  return (
    <div className="grid h-[132px] w-[132px] place-items-center rounded-full bg-[#fe2c55] text-[54px] font-extrabold text-white">
      {(name || "U")[0]?.toUpperCase()}
    </div>
  );
}

function CallBtn({ color, onClick, label, children }: { color: string; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-2">
      <span className={`grid h-16 w-16 place-items-center rounded-full ${color} text-white transition hover:opacity-90`}>{children}</span>
      <span className="text-[12px] text-white/80">{label}</span>
    </button>
  );
}
