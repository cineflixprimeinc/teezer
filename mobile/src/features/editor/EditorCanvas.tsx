import { useEffect, useMemo, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { loadSkia } from "./skia";
import { buildUniforms, getColorPipelineEffect } from "./shaders/colorPipeline";
import { useSkiaVideo, type SkiaVideoControls } from "./useSkiaVideo";
import type { RenderParams } from "./types";

/**
 * The live preview surface - a photo or a playing video drawn through the
 * colour pipeline.
 *
 * Split into an outer guard and inner Skia components on purpose: Skia's hooks
 * may only run where Skia exists and hooks cannot be called conditionally, so
 * the outer component decides whether to mount an inner one at all and the
 * inner ones may then assume Skia is real. loadSkia() is cached, so calling it
 * in each is free.
 *
 * Photo and video differ only in where the SkImage comes from - both end up in
 * the same FilteredSurface, so a look is guaranteed to render identically on a
 * still and on a frame. That shared path is the point.
 */

/** False when the SkSL failed to compile. Surfaced in dev to catch typos. */
export function isPipelineCompiled(): boolean {
  const S = loadSkia();
  if (!S) return false;
  return getColorPipelineEffect(S.Skia) !== null;
}

/* ── The shared draw ─────────────────────────────────────────────────────── */

function FilteredSurface({
  image,
  params,
  width,
  height,
  grainSeed = 0,
  style,
}: {
  image: any;
  params: RenderParams;
  width: number;
  height: number;
  grainSeed?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const S = loadSkia()!;
  const { Canvas, Fill, Shader, ImageShader, Skia } = S;

  const effect = getColorPipelineEffect(Skia);
  const uniforms = useMemo(
    () => buildUniforms(params, width, height, grainSeed),
    [params, width, height, grainSeed],
  );
  const rect = useMemo(() => ({ x: 0, y: 0, width, height }), [width, height]);

  if (!effect) {
    return (
      <Canvas style={[{ width, height }, style]}>
        <Fill>
          <ImageShader image={image} fit="cover" rect={rect} />
        </Fill>
      </Canvas>
    );
  }

  return (
    <Canvas style={[{ width, height }, style]}>
      <Fill>
        <Shader source={effect} uniforms={uniforms}>
          <ImageShader image={image} fit="cover" rect={rect} />
        </Shader>
      </Fill>
    </Canvas>
  );
}

/* ── Photo ───────────────────────────────────────────────────────────────── */

interface BaseProps {
  uri: string;
  params: RenderParams;
  /** Canvas size in px - the shader needs it for vignette and tap spacing. */
  width: number;
  height: number;
  grainSeed?: number;
  style?: StyleProp<ViewStyle>;
  /** Shown in Expo Go, or while the media is still decoding. */
  fallback?: ReactNode;
}

function SkiaImageCanvas(props: BaseProps) {
  const S = loadSkia()!;
  const image = S.useImage(props.uri);

  if (!image || props.width <= 0 || props.height <= 0) {
    return <View style={[styles.placeholder, props.style]}>{props.fallback}</View>;
  }
  return <FilteredSurface {...props} image={image} />;
}

/* ── Video ───────────────────────────────────────────────────────────────── */

interface VideoProps extends BaseProps {
  /** Handed the transport controls once the video opens, for trim and mute. */
  onVideoReady?: (controls: SkiaVideoControls) => void;
}

function SkiaVideoCanvas(props: VideoProps) {
  const controls = useSkiaVideo(props.uri, true);
  const { onVideoReady } = props;

  useEffect(() => {
    if (controls.ready) onVideoReady?.(controls);
  }, [controls, controls.ready, onVideoReady]);

  if (!controls.frame || props.width <= 0 || props.height <= 0) {
    return <View style={[styles.placeholder, props.style]}>{props.fallback}</View>;
  }
  return <FilteredSurface {...props} image={controls.frame} />;
}

/* ── Entry point ─────────────────────────────────────────────────────────── */

export function EditorCanvas(props: VideoProps & { isVideo: boolean }) {
  if (loadSkia() === null) {
    return <View style={[styles.placeholder, props.style]}>{props.fallback}</View>;
  }
  const { isVideo, ...rest } = props;
  return isVideo ? <SkiaVideoCanvas {...rest} /> : <SkiaImageCanvas {...rest} />;
}

const styles = StyleSheet.create({
  placeholder: { alignItems: "center", justifyContent: "center" },
});
