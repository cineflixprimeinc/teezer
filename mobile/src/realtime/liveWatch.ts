import { useEffect, useRef, useState } from "react";
// Type-only - see livekit.ts for why the runtime value comes from getLiveKit()
// instead of a plain import (Hermes crashes on livekit-client's module-scope
// DOMException reference unless @livekit/react-native's polyfill loads first).
import type { Room, Track } from "livekit-client";
import { liveStreamsApi } from "@/api/live-streams.api";
import { getLiveKit } from "@/realtime/livekit";

/**
 * Connects to a live stream's LiveKit room as a subscribe-only viewer and
 * exposes the broadcaster's remote video track for rendering.
 *
 * Scoped to the calling screen's own mount/unmount - unlike Spaces'
 * SpaceAudioProvider (mounted once at the app shell so minimising a room
 * keeps the audio connection alive), this design has no "minimise and keep
 * watching" mini-player, so nothing needs the connection to outlive
 * WatchLiveScreen. One Room per mount; leaving the screen tears it down.
 */

type LiveWatchState = {
  connecting: boolean;
  connected: boolean;
  error: string | null;
  /** False in Expo Go / a build without the native WebRTC module. */
  available: boolean;
  /** The broadcaster's remote video track, once subscribed - null before
   *  then, or if they haven't turned their camera on. */
  videoTrack: Track | null;
  viewers: number;
};

const idle = (available: boolean): LiveWatchState => ({
  connecting: false, connected: false, error: null, available, videoTrack: null, viewers: 0,
});

export function useLiveWatch(streamId: number | null): LiveWatchState {
  const lk = getLiveKit();
  const [state, setState] = useState<LiveWatchState>(() => idle(!!lk));
  const roomRef = useRef<Room | null>(null);

  useEffect(() => {
    if (!streamId) return;
    if (!lk) {
      setState(idle(false));
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...idle(true), connecting: true }));

    (async () => {
      try {
        const { watch, viewers } = await liveStreamsApi.join(streamId);
        if (cancelled) return;

        const room: Room = new lk.Room();
        roomRef.current = room;

        room.on(lk.RoomEvent.TrackSubscribed, (track: Track) => {
          if (track.kind === lk.Track.Kind.Video) setState((s) => ({ ...s, videoTrack: track }));
        });
        room.on(lk.RoomEvent.TrackUnsubscribed, (track: Track) => {
          if (track.kind === lk.Track.Kind.Video) {
            setState((s) => (s.videoTrack === track ? { ...s, videoTrack: null } : s));
          }
        });
        room.on(lk.RoomEvent.Disconnected, () => {
          if (roomRef.current === room) {
            roomRef.current = null;
            setState((s) => ({ ...s, connected: false, connecting: false }));
          }
        });

        await room.connect(watch.url, watch.token);
        if (cancelled || roomRef.current !== room) return;

        // Catches a track the broadcaster already had live before this
        // listener was attached - TrackSubscribed only fires for ones
        // subscribed to AFTER we're listening.
        room.remoteParticipants.forEach((p: any) => {
          p.videoTrackPublications.forEach((pub: any) => {
            if (pub.track) setState((s) => (s.videoTrack ? s : { ...s, videoTrack: pub.track }));
          });
        });

        setState((s) => ({ ...s, connecting: false, connected: true, viewers }));
      } catch (e: any) {
        if (!cancelled) {
          setState((s) => ({
            ...s, connecting: false, connected: false,
            error: e?.message ?? "Could not connect to this stream.",
          }));
        }
      }
    })();

    return () => {
      cancelled = true;
      const room = roomRef.current;
      roomRef.current = null;
      if (room) {
        room.removeAllListeners();
        room.disconnect().catch(() => {});
      }
      liveStreamsApi.leave(streamId).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lk is a stable
    // module-level reference once loaded (see livekit.ts's attempted/mod cache).
  }, [streamId, lk]);

  return state;
}
