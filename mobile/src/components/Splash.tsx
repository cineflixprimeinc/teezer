import { useEffect, useRef } from "react";
import { Animated, Dimensions, Image, StyleSheet, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { colors } from "@/constants/colors";

// The real website logo (R mark + "Reelsoo" wordmark) - not the favicon mark.
const LOGO = require("../assets/logo.png");
const { width: W, height: H } = Dimensions.get("window");

/** Soft pink corner gradients on white - recreates the splash artwork. */
function SplashBackground() {
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="tl" cx="0%" cy="0%" r="60%">
          <Stop offset="0%" stopColor="#ff6fa6" stopOpacity="0.40" />
          <Stop offset="55%" stopColor="#ffc4d8" stopOpacity="0.16" />
          <Stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="br" cx="100%" cy="100%" r="70%">
          <Stop offset="0%" stopColor="#ff5b95" stopOpacity="0.46" />
          <Stop offset="55%" stopColor="#ffc4d8" stopOpacity="0.18" />
          <Stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="tr" cx="100%" cy="0%" r="45%">
          <Stop offset="0%" stopColor="#ff8fb8" stopOpacity="0.22" />
          <Stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="bl" cx="0%" cy="100%" r="50%">
          <Stop offset="0%" stopColor="#ff8fb8" stopOpacity="0.26" />
          <Stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width={W} height={H} fill="#ffffff" />
      <Rect width={W} height={H} fill="url(#tl)" />
      <Rect width={W} height={H} fill="url(#tr)" />
      <Rect width={W} height={H} fill="url(#bl)" />
      <Rect width={W} height={H} fill="url(#br)" />
    </Svg>
  );
}

/** Three pink dots with a staggered pulse - the loading indicator. */
function DotsLoader() {
  const dots = [useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current];

  useEffect(() => {
    const anims = dots.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 200),
          Animated.timing(v, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.3, duration: 320, useNativeDriver: true }),
          Animated.delay((2 - i) * 200),
        ]),
      ),
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.dots}>
      {dots.map((v, i) => (
        <Animated.View
          key={i}
          style={[styles.dot, { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0.3, 1], outputRange: [0.85, 1.25] }) }] }]}
        />
      ))}
    </View>
  );
}

/** Full-screen branded splash shown while the app boots. */
export function Splash() {
  // Dismiss the native splash only once this one has actually painted.
  //
  // App.tsx holds the native splash open (preventAutoHideAsync). Left to its
  // default it hides as soon as the RN root view mounts, which is earlier than
  // this component's first frame - the gap between the two showed as a flash of
  // bare white before the gradient and dots appeared.
  //
  // The effect runs after the first commit, so by the time this fires the
  // branded splash is on screen and the swap is invisible. Failures are
  // swallowed: hideAsync rejects if the splash is already gone (a warm start,
  // or a second mount), which is not an error worth surfacing.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <View style={styles.root}>
      <SplashBackground />
      <View style={styles.center}>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />
      </View>
      <View style={styles.loaderWrap}>
        <DotsLoader />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#ffffff" },
  center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  logo: { width: 220, height: 58 },
  loaderWrap: { position: "absolute", left: 0, right: 0, bottom: H * 0.16, alignItems: "center" },
  dots: { flexDirection: "row", gap: 10 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand },
});
