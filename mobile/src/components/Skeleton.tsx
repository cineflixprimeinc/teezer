import { useEffect, useRef } from "react";
import { Animated, DimensionValue, StyleProp, ViewStyle } from "react-native";

/** A single shimmering placeholder block. Compose several to build a skeleton. */
export function Skeleton({
  width = "100%",
  height = 14,
  radius = 6,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const o = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(o, { toValue: 0.5, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [o]);

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: "#e7e9ee", opacity: o }, style]}
    />
  );
}
