import { createContext, useCallback, useContext, useRef, useState } from "react";
// Type-only: `import type` is erased at compile time, so this never evaluates
// livekit-client. The runtime values (Room, RoomEvent, ConnectionState) come
// from getLiveKit() instead - see livekit.ts for why importing the package
// eagerly crashes Hermes on the DOMException it declares at module scope.
import type { Room } from "livekit-client";
import { spaceRoomApi } from "@/api/spaces.api";
import { getLiveKit } from "@/realtime/livekit";
import { isWebRtcAvailable } from "@/realtime/webrtc";

/**
 * The mic and the ears of a Space, on self-hosted LiveKit (StreamHub).
 *
 * Mounted ONCE at the app-shell level (MainTabs.tsx, next to SpaceMiniBar -
 * same reasoning: it needs to outlive SpaceRoomScreen so minimising a room
 * genuinely keeps the connection alive instead of just showing a bar backed
 * by nothing). This fixes a real bug in the previous (Cloudflare-SFU)
 * version: useSpaceAudio was a plain hook living on SpaceRoomScreen, so its
 * cleanup effect tore down both peer connections on unmount regardless of
 * whether the user minimised or actually left - the mini-bar's mute button
 * controlled nothing real. Hoisting the Room instance here, above the
 * screen, is the actual fix; useSpaceAudio.ts is now a thin hook over this
 * context so SpaceRoomScreen's call site doesn't change.
 *
 * One Room at a time - a user can't practically be in two Spaces at once.
 */

type SpaceAudioState = {
  spaceId: string | null;
  connecting: boolean;
  connected: boolean;
  /** True once we're allowed to publish AND have actually turned the mic on. */
  publishing: boolean;
  muted: boolean;
  error: string | null;
  /** False in Expo Go / a build without the native WebRTC module. */
  available: boolean;
};

interface SpaceAudioContextValue extends SpaceAudioState {
  /** Idempotent - a no-op if already connected to this exact space. */
  joinSpace: (spaceId: string) => Promise<void>;
  /** Real disconnect - only call this on an actual leave, never a minimise. */
  leaveSpace: () => Promise<void>;
  /** Reactive publish grant - call whenever the seat's role/canSpeak changes. */
  setCanSpeak: (canSpeak: boolean) => Promise<void>;
  setMuted: (muted: boolean) => Promise<void>;
}

const SpaceAudioContext = createContext<SpaceAudioContextValue | null>(null);

export function useSpaceAudioContext(): SpaceAudioContextValue {
  const ctx = useContext(SpaceAudioContext);
  if (!ctx) throw new Error("useSpaceAudioContext must be used within <SpaceAudioProvider>");
  return ctx;
}

/**
 * A function, not a const, so nothing here runs at module-evaluation time.
 *
 * `available` deliberately keys off the cheap WebRTC/Expo Go check rather than
 * getLiveKit(): this provider mounts at app boot, and resolving the full
 * LiveKit stack here would drag livekit-client into the startup path for every
 * user, including everyone who never opens a Space. The heavy load happens on
 * the first joinSpace() instead - and the two answers can't diverge, because
 * the LiveKit loader gates on this same check.
 */
const idleState = (): SpaceAudioState => ({
  spaceId: null,
  connecting: false,
  connected: false,
  publishing: false,
  muted: true,
  error: null,
  available: isWebRtcAvailable(),
});

export function SpaceAudioProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SpaceAudioState>(idleState);
  const roomRef = useRef<Room | null>(null);
  const canSpeakRef = useRef(false);

  const patch = useCallback((p: Partial<SpaceAudioState>) => setState((s) => ({ ...s, ...p })), []);

  const teardownRoom = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    canSpeakRef.current = false;
    if (room) {
      room.removeAllListeners();
      try { await room.disconnect(); } catch { /* already gone */ }
    }
  }, []);

  const joinSpace = useCallback(async (spaceId: string) => {
    // Already connected to this exact room - e.g. re-entering after a
    // minimise. Nothing to do; the connection never dropped.
    if (roomRef.current && state.spaceId === spaceId && state.connected) return;

    // First real use of the LiveKit stack - this is where it gets required.
    // Null covers Expo Go and a build whose native side didn't come through.
    const lk = getLiveKit();
    if (!lk) {
      patch({ error: null, available: false, spaceId, connected: false });
      return;
    }

    // Switching spaces (shouldn't normally happen, but don't leak a room).
    if (roomRef.current) await teardownRoom();

    patch({ spaceId, connecting: true, connected: false, publishing: false, muted: true, error: null, available: true });

    try {
      const { url, token } = await spaceRoomApi.token(spaceId);
      const room: Room = new lk.Room();
      roomRef.current = room;

      room.on(lk.RoomEvent.Disconnected, () => {
        if (roomRef.current === room) {
          roomRef.current = null;
          patch({ connected: false, connecting: false, publishing: false });
        }
      });

      await room.connect(url, token);
      if (roomRef.current !== room) return; // superseded by a newer join/leave mid-flight

      patch({ connecting: false, connected: true, error: null });
    } catch (e: any) {
      roomRef.current = null;
      patch({ connecting: false, connected: false, error: e?.message ?? "Could not connect to the room audio." });
    }
  }, [patch, state.spaceId, state.connected, teardownRoom]);

  const leaveSpace = useCallback(async () => {
    await teardownRoom();
    setState(idleState());
  }, [teardownRoom]);

  /**
   * Reactive publish grant, mirroring the previous Cloudflare-SFU client's
   * actual behaviour exactly: publish and unmute the mic the instant the
   * seat can speak (not the moment the user taps anything). Note this is
   * NOT what SpaceModerationController::promote() sets in the DB
   * (`muted: true` - "comes up muted; first tap unmutes") - that mismatch
   * between server DB state and client behaviour predates this migration
   * and isn't something Phase 1 is trying to fix; changing it would be a
   * real behaviour change beyond "swap the transport."
   */
  const setCanSpeak = useCallback(async (canSpeak: boolean) => {
    canSpeakRef.current = canSpeak;
    const room = roomRef.current;
    // A room instance only exists if the stack loaded, so getLiveKit() is warm.
    if (!room || room.state !== getLiveKit()?.ConnectionState.Connected) return;

    if (!canSpeak) {
      if (room.localParticipant.isMicrophoneEnabled) {
        await room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
      }
      patch({ publishing: false });
      return;
    }

    if (!room.localParticipant.isMicrophoneEnabled) {
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
        patch({ publishing: true, muted: false });
      } catch (e: any) {
        patch({ error: e?.message ?? "Could not turn the microphone on." });
      }
    }
  }, [patch]);

  const setMuted = useCallback(async (muted: boolean) => {
    const room = roomRef.current;
    // Local first so the button never feels laggy, then tell the room - the
    // flag is what everyone else's mic badge reads (self-mute stays a plain
    // DB sync, see SpaceRtcController::mute - no server-media round-trip).
    patch({ muted });
    try {
      if (room && room.state === getLiveKit()?.ConnectionState.Connected && canSpeakRef.current) {
        await room.localParticipant.setMicrophoneEnabled(!muted);
        patch({ publishing: !muted });
      }
    } catch { /* local state already updated; retry happens on next toggle */ }

    if (state.spaceId) {
      spaceRoomApi.mute(state.spaceId, muted).catch(() => {
        // The badge others see may lag; our own audio is already correct.
      });
    }
  }, [patch, state.spaceId]);

  const value: SpaceAudioContextValue = { ...state, joinSpace, leaveSpace, setCanSpeak, setMuted };
  return <SpaceAudioContext.Provider value={value}>{children}</SpaceAudioContext.Provider>;
}
