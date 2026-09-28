import { videoService } from "@/services/video.service";

/**
 * Single-flight interaction synchronisers - the TikTok/Instagram pattern for
 * rapid heart/bookmark tapping. Ported from the mobile app (mobile/src/utils/
 * like-sync.ts) to fix the website's "have to press unlike 5-6 times" bug.
 *
 * The UI flips instantly on every tap; the network layer keeps AT MOST ONE
 * request in flight per video and hits the IDEMPOTENT like/unlike (and
 * save/unsave) endpoints instead of the flip-flop `toggle-*` ones. While a
 * request flies, further taps only move the desired end-state ("last intent
 * wins"); on completion, if the intent changed mid-flight exactly one more
 * request goes out for the FINAL intent, and only that authoritative response
 * is applied.
 *
 * This eliminates the two rapid-tap bugs the non-idempotent toggle caused:
 *  - two toggles from a doubled/overlapping tap netting to zero (the like
 *    appears stuck, so the user clicks 5-6 times), and
 *  - interleaved requests whose responses arrive out of order and let a stale
 *    snapshot overwrite the newer one.
 */

type LikeResponse = { liked: boolean; likes_count: number };
type SaveResponse = { saved: boolean; saves_count: number };

type Handlers<R> = {
  /** Final authoritative server state - apply to UI/store. */
  onSettled: (res: R) => void;
  /** Network/API failure - revert the optimistic UI. */
  onError: () => void;
};

function makeSync<R>(
  like: (id: number) => Promise<R>,
  unlike: (id: number) => Promise<R>,
) {
  const pending = new Map<number, { desired: boolean; handlers: Handlers<R> }>();
  return (videoId: number, desired: boolean, handlers: Handlers<R>): void => {
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
      (want ? like(videoId) : unlike(videoId))
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
  };
}

export const syncLike = makeSync<LikeResponse>(
  (id) => videoService.like(id),
  (id) => videoService.unlike(id),
);

export const syncSave = makeSync<SaveResponse>(
  (id) => videoService.save(id),
  (id) => videoService.unsave(id),
);
