import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { loadSkia } from "./skia";

/**
 * Pulls decoded frames out of a video so they can be drawn through the colour
 * pipeline - the thing that makes the live preview of a *video* filtered rather
 * than a filtered thumbnail over raw playback.
 *
 * Written against Skia's imperative `Skia.Video` rather than its `useVideo`
 * hook on purpose. useVideo lives in @shopify/react-native-skia/external/reanimated
 * and drives frames from a worklet, so it drags in react-native-reanimated -
 * which this app deliberately does not have (ports use RN Animated, see
 * src/hooks/useSheetDrag.ts). The underlying Video object is on the core API
 * and exposes everything needed, so the frame loop is just requestAnimationFrame.
 *
 * The cost of that choice: frames are pulled on the JS thread, so a busy JS
 * thread can drop preview frames. Acceptable here - this is a preview, and
 * export does not go through it. If preview smoothness ever becomes the
 * complaint, that is the moment to reconsider reanimated, not before.
 *
 * ANDROID: nextImage() hands back a texture that the decoder invalidates on the
 * next frame, so it must be copied off-texture before it can be held for a
 * render. Skipping that copy is the classic "video preview shows garbage or the
 * wrong frame on Android" bug. Only the texture we copied from is disposed; the
 * copy is left to be collected, which is what Skia's own implementation does.
 */

export interface SkiaVideoMeta {
  width: number;
  height: number;
  /** Seconds. */
  duration: number;
  framerate: number;
  rotation: number;
}

export interface SkiaVideoControls {
  /** The current decoded frame, ready to hand to an ImageShader. */
  frame: any | null;
  meta: SkiaVideoMeta | null;
  ready: boolean;
  error: string | null;
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
}

export function useSkiaVideo(uri: string | null, autoPlay = true): SkiaVideoControls {
  const [frame, setFrame] = useState<any | null>(null);
  const [meta, setMeta] = useState<SkiaVideoMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    const S = loadSkia();
    if (!S || !uri) return;

    cancelledRef.current = false;
    let disposed = false;

    const start = async () => {
      try {
        // Skia.Video is typed as Promise<Video> | Video depending on platform,
        // so it is awaited unconditionally rather than branched on.
        const video = await Promise.resolve(S.Skia.Video(uri));
        if (cancelledRef.current) {
          video?.dispose?.();
          return;
        }
        videoRef.current = video;

        const size = video.size();
        setMeta({
          width: size.width,
          height: size.height,
          duration: video.duration(),
          framerate: video.framerate(),
          rotation: video.rotation(),
        });

        if (autoPlay) video.play();

        const tick = () => {
          if (cancelledRef.current || disposed) return;
          const v = videoRef.current;
          if (v) {
            // Returns null when the next frame is not due yet, which is what
            // paces this loop to the video's own framerate.
            const img = v.nextImage();
            if (img) {
              if (Platform.OS === "android") {
                const copy = img.makeNonTextureImage();
                img.dispose();
                setFrame(copy);
              } else {
                setFrame(img);
              }
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (e: any) {
        if (!cancelledRef.current) setError(e?.message ?? "Could not open this video.");
      }
    };

    void start();

    return () => {
      cancelledRef.current = true;
      disposed = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      try {
        videoRef.current?.pause?.();
        videoRef.current?.dispose?.();
      } catch {
        // Already gone - nothing to release.
      }
      videoRef.current = null;
      setFrame(null);
    };
  }, [uri, autoPlay]);

  const play = useCallback(() => videoRef.current?.play?.(), []);
  const pause = useCallback(() => videoRef.current?.pause?.(), []);
  const seek = useCallback((seconds: number) => videoRef.current?.seek?.(seconds), []);
  const setVolume = useCallback((v: number) => videoRef.current?.setVolume?.(v), []);

  return { frame, meta, ready: !!meta, error, play, pause, seek, setVolume };
}
