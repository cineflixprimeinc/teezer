import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, StyleProp, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { animFor, type GiftAnim } from "@/constants/gift-anim";

/**
 * A gift icon that moves like it does on the web.
 *
 * The web bakes each icon's motion into the SVG as CSS @keyframes. React Native
 * rasterises SVGs, so none of that runs - the icons would be frozen. This replays the
 * same ten motions natively, and reads which one a gift uses from the ported map, so
 * the rose still sways and the rocket still rises.
 *
 * Everything here is transform/opacity only, driven by the native driver, so a grid of
 * these stays at 60fps. Motion is skipped entirely when the OS asks for reduced motion.
 */

/** duration (ms), and how far the motion travels - tuned to the web's keyframes. */
const SPEC: Record<GiftAnim, { ms: number; drive: (v: Animated.Value) => Animated.WithAnimatedObject<ViewStyle> }> = {
  // Every loop below must start and end on the SAME value: Animated.loop snaps the driver
  // back to 0, so an interpolation that ends elsewhere visibly jumps at the seam. (spin is
  // the exception - 0deg and 360deg look identical.)
  float: {
    ms: 2600,
    drive: v => ({ transform: [{ translateY: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [3, -3, 3] }) }] }),
  },
  bounce: {
    ms: 1400,
    drive: v => ({ transform: [{ translateY: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -6, 0] }) }] }),
  },
  pulse: {
    ms: 1800,
    drive: v => ({ transform: [{ scale: v.interpolate({ inputRange: [0, 0.45, 1], outputRange: [1, 1.1, 1] }) }] }),
  },
  spin: {
    ms: 4200,
    drive: v => ({ transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }),
  },
  wiggle: {
    ms: 1600,
    drive: v => ({ transform: [{ rotate: v.interpolate({ inputRange: [0, 0.25, 0.75, 1], outputRange: ["0deg", "7deg", "-7deg", "0deg"] }) }] }),
  },
  sway: {
    ms: 2800,
    drive: v => ({ transform: [{ rotate: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: ["-6deg", "6deg", "-6deg"] }) }] }),
  },
  shimmer: {
    ms: 2200,
    drive: v => ({ opacity: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.72, 1] }) }),
  },
  glow: {
    ms: 2400,
    drive: v => ({
      opacity: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.85, 1, 0.85] }),
      transform: [{ scale: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.06, 1] }) }],
    }),
  },
  rise: {
    ms: 2000,
    drive: v => ({ transform: [{ translateY: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [2, -5, 2] }) }] }),
  },
  twinkle: {
    ms: 2000,
    drive: v => ({
      opacity: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.7, 1, 0.7] }),
      transform: [{ scale: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.94, 1.06, 0.94] }) }],
    }),
  },
};

export function AnimatedGift({ uri, slug, size = 48, delay = 0, style }: {
  uri: string;
  /** Gift slug - decides which of the web's ten motions this icon plays. */
  slug?: string | null;
  size?: number;
  /** Stagger, so a grid doesn't pulse in lockstep. */
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const v = useRef(new Animated.Value(0)).current;
  const anim = animFor(slug);
  const spec = SPEC[anim];

  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    let cancelled = false;

    AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (reduced || cancelled) return;

      loop = Animated.loop(
        Animated.timing(v, {
          toValue: 1,
          duration: spec.ms,
          delay,
          // spin reads wrong with an eased loop - it stutters at the seam.
          easing: anim === "spin" ? Easing.linear : Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      );
      loop.start();
    });

    return () => { cancelled = true; loop?.stop(); };
  }, [v, spec.ms, anim, delay]);

  return (
    <Animated.View style={[spec.drive(v), style]}>
      <Image
        source={uri}
        style={{ width: size, height: size }}
        contentFit="contain"
        transition={120}
        cachePolicy="memory-disk"
      />
    </Animated.View>
  );
}
