module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          root: ["./"],
          alias: { "@": "./src" },
          extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
        },
      ],
      // react-native-worklets/plugin - originally added for the camera filter
      // carousel's live GPU frame processor (react-native-vision-camera-skia
      // needed worklets to run the filter shader on each camera frame). The
      // camera has since moved to expo-camera, which has no frame processor
      // and needs none of this - but the plugin stays: react-native-reanimated's
      // runOnJS is now genuinely load-bearing on its own, fixing a real native
      // crash in ChatScreen's and StoryViewerScreen's swipe gestures (calling
      // non-worklet-safe code - Haptics, React state setters - directly from a
      // Gesture.Pan worklet). Everything else still uses classic Animated (see
      // useMiniPlayerTransition.ts, useSheetDrag.ts, useSwipeTabs.ts) - this
      // plugin doesn't change those, worklets/reanimated are additive. Must be
      // listed last.
      "react-native-worklets/plugin",
    ],
  };
};
