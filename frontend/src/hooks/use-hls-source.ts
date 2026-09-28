import { useEffect } from "react";
import type { RefObject } from "react";
import { attachMediaSource, preloadHls } from "@/lib/playback/attach-source";

export { preloadHls };

/**
 * Wires a <video> element's source imperatively, transparently using hls.js
 * for .m3u8 sources on browsers without native HLS (everything but Safari/
 * iOS, which play it straight off `src`). Progressive sources (mp4) are set
 * directly - no hls.js involved.
 *
 * Pass `undefined` to detach/stop loading (e.g. a feed slide scrolled out of
 * range) - mirrors the existing pattern of conditionally omitting `src`.
 *
 * `fallbackSrc` is an optional progressive (mp4) source used when the adaptive
 * ladder cannot be played at all.
 *
 * The implementation now lives in lib/playback/attach-source.ts, shared with the
 * TeezerPlayer web adapter. This hook's signature and behaviour are unchanged -
 * it is the React-lifecycle wrapper, nothing more.
 */
export function useHlsSource(
  videoRef: RefObject<HTMLVideoElement | null>,
  src: string | null | undefined,
  fallbackSrc?: string | null,
): void {
  useEffect(() => {
    return attachMediaSource(() => videoRef.current, src, fallbackSrc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, fallbackSrc]);
}
