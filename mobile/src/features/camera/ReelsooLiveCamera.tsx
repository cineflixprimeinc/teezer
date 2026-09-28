import { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { CameraView, type CameraMode, type CameraType } from "expo-camera";

/**
 * The live camera preview shared by the Post camera (PostCameraScreen) and
 * the Story camera (StoryLiveCameraScreen, not yet built) - the ONE place
 * either screen touches expo-camera directly. A screen only ever hands this
 * `facing`/`flash`/`mode`/`isActive` and gets back a ref shaped like
 * CameraView's own capture methods (takePictureAsync/recordAsync/
 * stopRecording).
 *
 * This used to run react-native-vision-camera with a live Skia frame
 * processor - every camera frame was GPU-shaded with the active filter
 * before it ever reached the screen, so the picked look was visible while
 * framing/recording, not just afterwards. expo-camera has no frame-processor
 * equivalent (no raw-frame access at all), so that live preview is gone: the
 * viewfinder now shows the unfiltered feed, and the filter becomes visible
 * starting at the post-capture Edit phase. That was already the only place
 * the filter was ever baked in - takePictureAsync/recordAsync always
 * returned the RAW camera output even with the old engine (the Edit-phase
 * pipeline, EditorCanvas, re-renders the same SkSL shader
 * (features/editor/shaders/colorPipeline.ts) over the captured file
 * afterwards, still driven by activeFilterKey) - so nothing about what a
 * published post looks like has changed, only when the look first becomes
 * visible to the person shooting it.
 */

export interface ReelsooLiveCameraHandle {
  takePictureAsync(): Promise<{ uri: string } | null>;
  recordAsync(options?: { maxDuration?: number }): Promise<{ uri: string } | null>;
  stopRecording(): void;
}

interface ReelsooLiveCameraProps {
  facing: CameraType;
  /** A plain on/off toggle, same as the screen's existing `flash` state -
   *  drives the torch for the live feed/video and the flash for photos. */
  flash: "off" | "on";
  isActive: boolean;
  /** Which capture this camera is currently armed for - expo-camera needs
   *  the session mode set up front, unlike the old engine which didn't
   *  distinguish photo/video on the device itself. */
  mode: CameraMode;
  onCameraReady?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const ReelsooLiveCamera = forwardRef<ReelsooLiveCameraHandle, ReelsooLiveCameraProps>(
  function ReelsooLiveCamera({ facing, flash, isActive, mode, onCameraReady, style }, ref) {
    const cameraRef = useRef<CameraView>(null);

    useImperativeHandle(
      ref,
      () => ({
        async takePictureAsync() {
          const photo = await cameraRef.current?.takePictureAsync();
          return photo?.uri ? { uri: photo.uri } : null;
        },

        async recordAsync(options) {
          const result = await cameraRef.current?.recordAsync({ maxDuration: options?.maxDuration });
          return result?.uri ? { uri: result.uri } : null;
        },

        stopRecording() {
          cameraRef.current?.stopRecording();
        },
      }),
      [],
    );

    return (
      <CameraView
        ref={cameraRef}
        style={style ?? StyleSheet.absoluteFill}
        active={isActive}
        facing={facing}
        mode={mode}
        flash={flash}
        enableTorch={flash === "on"}
        onCameraReady={onCameraReady}
      />
    );
  },
);
