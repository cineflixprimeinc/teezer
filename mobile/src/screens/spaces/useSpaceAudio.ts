import { useEffect, useRef } from "react";
import { useSpaceAudioContext } from "@/realtime/SpaceAudioProvider";

/**
 * The mic and the ears of a Space, on self-hosted LiveKit (StreamHub).
 *
 * Thin wrapper over SpaceAudioProvider's context - the actual Room instance
 * lives one level up (mounted in MainTabs.tsx, same place as SpaceMiniBar),
 * so minimising this screen (unmounting it) does NOT tear down the
 * connection; only an explicit leave does. See SpaceAudioProvider.tsx's own
 * doc comment for why that split exists - it's the fix for a real bug in the
 * previous Cloudflare-SFU version, where the connection lived on this hook
 * and died with the screen regardless of minimise vs. leave.
 *
 * `keepAliveRef`, when provided and true at unmount time, skips the
 * leaveSpace() call - this is SpaceRoomScreen's own `minimisingRef`, the
 * exact same signal it already uses to skip the `/leave` REST call on
 * minimise (see its unmount effect). Passing the same ref keeps both
 * teardowns - the DB seat and the LiveKit connection - in sync.
 */
export function useSpaceAudio(spaceId: string, opts: {
  canSpeak: boolean;
  enabled: boolean;
  keepAliveRef?: React.RefObject<boolean>;
  // Kept for API compatibility with the previous hook signature - noise
  // cancellation/quality tiers are OS/WebRTC-level constraints applied when
  // the mic track is captured; not yet wired into the LiveKit publish path
  // (Phase 1 scope was the transport swap, not re-tuning capture options).
  noiseCancellation?: boolean;
  audioQuality?: "standard" | "high" | "ultra";
}) {
  const { canSpeak, enabled, keepAliveRef } = opts;
  const ctx = useSpaceAudioContext();
  const joinedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    joinedRef.current = true;
    ctx.joinSpace(spaceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, spaceId]);

  useEffect(() => {
    if (!enabled) return;
    ctx.setCanSpeak(canSpeak);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, canSpeak]);

  // Only a REAL leave disconnects - minimising (keepAliveRef.current === true
  // at unmount) leaves the room connection exactly as it was.
  useEffect(() => {
    return () => {
      if (joinedRef.current && !keepAliveRef?.current) {
        ctx.leaveSpace();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    publishing: ctx.publishing,
    listening: ctx.connected,
    muted: ctx.muted,
    error: ctx.error,
    available: ctx.available,
    setMuted: ctx.setMuted,
    resubscribe: async () => {}, // no-op: LiveKit subscribes automatically, no manual resubscribe needed
  };
}
