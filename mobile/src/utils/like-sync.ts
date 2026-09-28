import { videoApi } from "@/api/video.api";

/**
 * Single-flight like synchroniser - the TikTok/Instagram pattern for rapid
 * heart-tapping.
 *
 * The UI flips instantly on every tap; the network layer keeps AT MOST ONE
 * request in flight per video. While a request flies, further taps only
 * update the desired end-state ("last intent wins"). On completion, if the
 * intent changed mid-flight, exactly one more request is sent for the FINAL
 * intent; only that final authoritative response is applied to the UI.
 *
 * This eliminates the two rapid-tap display bugs:
 *  - interleaved like/unlike requests whose responses arrive out of order
 *    (stale snapshot overwriting the newer one), and
 *  - a flood of per-tap requests hammering the API.
 */

type LikeResponse = { liked: boolean; likes_count: number };

type Handlers = {
  /** Final authoritative server state - apply to UI/caches. */
  onSettled: (res: LikeResponse) => void;
  /** Network/API failure - revert the optimistic UI. */
  onError: () => void;
};

const pending = new Map<number, { desired: boolean; handlers: Handlers }>();

/** True while this device has an unconfirmed like intent for the video -
    realtime echoes of our own action should be ignored meanwhile. */
export function hasPendingLike(videoId: number): boolean {
  return pending.has(videoId);
}

export function syncLike(videoId: number, desired: boolean, handlers: Handlers): void {
  const existing = pending.get(videoId);
  if (existing) {
    // A request is already flying - just move the goalpost.
    existing.desired = desired;
    existing.handlers = handlers;
    return;
  }

  const entry = { desired, handlers };
  pending.set(videoId, entry);

  const dispatch = () => {
    const want = entry.desired;
    (want ? videoApi.like(videoId) : videoApi.unlike(videoId))
      .then((res) => {
        if (entry.desired !== want) { dispatch(); return; } // intent moved - one more round
        pending.delete(videoId);
        entry.handlers.onSettled(res);
      })
      .catch(() => {
        pending.delete(videoId);
        entry.handlers.onError();
      });
  };
  dispatch();
}
