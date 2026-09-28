import type Hls from "hls.js";

/**
 * Imperative source wiring for a <video> element, HLS-aware.
 *
 * Extracted verbatim from useHlsSource so the React hook and the ReelsooPlayer
 * adapter share ONE implementation. Every hard-won detail below was learned from
 * a real failure; duplicating it into the adapter would mean fixing the next one
 * twice, and the two copies would diverge exactly where it matters least
 * visibly - the error paths nobody exercises until production.
 */

let hlsCtorPromise: Promise<typeof Hls> | null = null;

function loadHls(): Promise<typeof Hls> {
  if (!hlsCtorPromise) {
    hlsCtorPromise = import("hls.js").then((mod) => mod.default);
  }
  return hlsCtorPromise;
}

/** Warm the hls.js chunk before anything needs it. */
export function preloadHls(): void {
  void loadHls();
}

function isHlsUrl(src: string | null | undefined): boolean {
  return !!src && src.includes(".m3u8");
}

/**
 * A fatal hls.js error is usually transient - a dropped segment, a 5xx from the
 * edge, a decode hiccup - and hls.js can be told to pick itself back up. It will
 * not do so on its own: without an ERROR handler the first fatal error stalls
 * playback permanently. Recovery is bounded so a genuinely broken ladder stops
 * instead of spinning forever against the CDN.
 */
const MAX_RECOVERIES = 4;

/**
 * Point a <video> element at `src`, transparently using hls.js for .m3u8 on
 * browsers without native HLS. Returns a detach function that tears down any
 * hls.js instance it created.
 *
 * `getVideo` is a getter rather than the element itself because the source is
 * attached asynchronously (hls.js is code-split) and the element can be gone or
 * replaced by the time the chunk lands.
 *
 * Pass `src` as null/undefined to detach and stop loading - e.g. a feed slide
 * scrolled out of range.
 *
 * `fallbackSrc` is an optional progressive (mp4) source used when the adaptive
 * ladder cannot be played at all - no MSE and no native HLS, or the segments
 * refuse to load. A progressive file is fetched by the media element itself
 * rather than by script, so it survives conditions hls.js cannot: notably a
 * segment host that serves no Access-Control-Allow-Origin, where every XHR for
 * a .ts is blocked but a plain <video src> is not. Without it a viewer whose
 * HLS fails just sits on a dead player.
 */
export function attachMediaSource(
  getVideo: () => HTMLVideoElement | null,
  src: string | null | undefined,
  fallbackSrc?: string | null,
): () => void {
  const video = getVideo();
  if (!video) return () => {};

  if (!src) {
    video.removeAttribute("src");
    video.load();
    return () => {};
  }

  // Progressive (mp4/webm) - straight onto the element, no hls.js involved.
  if (!isHlsUrl(src)) {
    video.src = src;
    return () => {};
  }

  let cancelled = false;
  let hlsInstance: Hls | null = null;

  void loadHls().then((HlsCtor) => {
    if (cancelled) return;
    const el = getVideo();
    if (!el) return;

    // hls.js wherever MSE exists; native HLS only as the fallback.
    //
    // This order matters and used to be reversed - native was tried first,
    // gated on canPlayType("application/vnd.apple.mpegurl"). That gate is not
    // a support check: Chrome answers "maybe" (a truthy string) for that MIME
    // type while shipping no HLS demuxer at all, so every desktop Chrome
    // assigned the playlist straight to video.src and the element failed with
    // MEDIA_ERR_SRC_NOT_SUPPORTED - hls.js was never even loaded. Safari/iOS
    // is the only engine that really plays HLS natively, and there MSE is
    // absent, so isSupported() is false and it takes the branch below.
    if (!HlsCtor.isSupported()) {
      if (el.canPlayType("application/vnd.apple.mpegurl")) el.src = src;
      else if (fallbackSrc) el.src = fallbackSrc;
      return;
    }

    // Last resort: tear hls.js down and hand the element a progressive file.
    const fallBackToProgressive = (hls: Hls) => {
      hls.destroy();
      if (hlsInstance === hls) hlsInstance = null;
      const el2 = getVideo();
      if (!cancelled && el2 && fallbackSrc && fallbackSrc !== src) el2.src = fallbackSrc;
    };

    const hls = new HlsCtor({
      enableWorker: true,
      startLevel: 0,
      capLevelToPlayerSize: true,
    });
    hlsInstance = hls;

    // Whether the ladder has ever actually delivered media. This is what
    // separates "the stream works and hit a bump" from "this stream cannot be
    // fetched at all" - and they deserve opposite treatment. A bump mid-play
    // is worth retrying; a first segment that never arrives is a standing
    // condition (segment host without CORS, dead ladder, bad token) that
    // retrying only makes the viewer wait longer for, so fall straight over
    // to the progressive file instead of burning the retry budget first.
    let everLoadedFragment = false;
    hls.on(HlsCtor.Events.FRAG_LOADED, () => {
      everLoadedFragment = true;
    });

    let recoveries = 0;
    hls.on(HlsCtor.Events.ERROR, (_event, data) => {
      // Non-fatal errors are hls.js's own to retry; leave them alone.
      if (!data.fatal) return;
      if (recoveries >= MAX_RECOVERIES) {
        fallBackToProgressive(hls);
        return;
      }
      switch (data.type) {
        case HlsCtor.ErrorTypes.NETWORK_ERROR:
          // Playlist or segment fetch failed - expired token, edge 5xx, blip.
          if (!everLoadedFragment) {
            fallBackToProgressive(hls);
            return;
          }
          recoveries += 1;
          hls.startLoad();
          break;
        case HlsCtor.ErrorTypes.MEDIA_ERROR:
          recoveries += 1;
          hls.recoverMediaError();
          break;
        default:
          fallBackToProgressive(hls);
      }
    });

    hls.loadSource(src);
    hls.attachMedia(el);
  });

  return () => {
    cancelled = true;
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }
  };
}
