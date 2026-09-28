import { create } from "zustand";

import type { Video } from "@/types";

/**
 * The one post currently being published.
 *
 * Posting used to hold the composer open until the bytes were up and
 * /complete-upload had answered, so by the time the feed was back on screen the
 * upload was already finished. The composer now closes the moment Post is
 * tapped and the upload carries on behind it, which is what gives the feed
 * something to show: FeedHeader swaps the Live glyph for the upload animation
 * while this says `uploading`.
 *
 * A store rather than props because the two parties never meet in the tree -
 * the work is started by the composer (a screen that is gone by the time it
 * matters) and drawn by the feed header, which the composer does not render.
 * Same reasoning as speed-boost.store.ts.
 *
 * One at a time, deliberately: a second Post while one is in flight is not a
 * flow the composer can produce (it closes on the first), and modelling a queue
 * would mean deciding how to draw two at once for a case that cannot happen.
 *
 * `percent` is the file transfer only - it does not cover /complete-upload, so
 * it can sit at 100 for a moment before `success`. FeedHeader draws it inside
 * the animation's progress ring.
 *
 * `published` carries the finished post to the feed so it can be shown once,
 * right after publishing, as confirmation of what actually went up. It is
 * cleared by whoever consumes it - not by reset() - because the success
 * animation finishes long before the feed has had a chance to read it.
 */
export type UploadStatus = "idle" | "uploading" | "success";

/** How long the success burst is allowed to sit unwatched before it is cleared.
 *  A post finishing while the user is on another tab must not leave the feed
 *  header stuck on a celebration they never saw. Comfortably longer than the
 *  animation's own 150→210 frame tail (~1s at 60fps). */
const SUCCESS_TIMEOUT_MS = 2500;

type UploadState = {
  status: UploadStatus;
  /** 0-100, file transfer only - it does not include /complete-upload. */
  percent: number;
  /** The just-published post, waiting to be shown once on the feed. */
  published: Video | null;
  start: () => void;
  setPercent: (p: number) => void;
  /** Upload finished and the post exists. Moves to the success segment, and
   *  hands the created post over for the feed to show once. */
  succeed: (video?: Video | null) => void;
  /** Upload failed. Straight back to idle - the composer's own alert is what
   *  tells the user; the header must not keep implying work is happening. */
  fail: () => void;
  /** Back to idle. Called by the header once the success burst has played.
   *  Deliberately leaves `published` alone - see consumePublished. */
  reset: () => void;
  /** Take the just-published post, exactly once. Returns null when there is
   *  nothing waiting, so a second reader (or a remount) gets nothing. */
  consumePublished: () => Video | null;
};

let successTimer: ReturnType<typeof setTimeout> | null = null;

const clearSuccessTimer = () => {
  if (successTimer) {
    clearTimeout(successTimer);
    successTimer = null;
  }
};

export const useUploadStore = create<UploadState>((set, get) => ({
  status: "idle",
  percent: 0,
  published: null,

  start: () => {
    clearSuccessTimer();
    // A new upload supersedes an unshown previous one - better to drop a
    // confirmation nobody looked at than to show the wrong post.
    set({ status: "uploading", percent: 0, published: null });
  },

  setPercent: (p) => {
    // Only while running: a late progress callback from a job that already
    // failed must not resurrect the indicator.
    if (get().status !== "uploading") return;
    set({ percent: Math.max(0, Math.min(100, Math.round(p))) });
  },

  succeed: (video = null) => {
    clearSuccessTimer();
    set({ status: "success", percent: 100, published: video ?? null });
    successTimer = setTimeout(() => {
      successTimer = null;
      if (useUploadStore.getState().status === "success") {
        useUploadStore.setState({ status: "idle", percent: 0 });
      }
    }, SUCCESS_TIMEOUT_MS);
  },

  fail: () => {
    clearSuccessTimer();
    set({ status: "idle", percent: 0 });
  },

  reset: () => {
    clearSuccessTimer();
    set({ status: "idle", percent: 0 });
  },

  consumePublished: () => {
    const v = get().published;
    if (v) set({ published: null });

    return v;
  },
}));
