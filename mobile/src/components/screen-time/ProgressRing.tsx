import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";

/**
 * Reusable SVG progress ring for the Screen Time "today" card - a rounded,
 * gradient arc over a faint track, with arbitrary centered content.
 */
export function ProgressRing({
  size = 190,
  stroke = 16,
  progress,
  from = "#fe2c55",
  to = "#a855f7",
  track = "rgba(148,163,184,0.22)",
  children,
}: {
  size?: number;
  stroke?: number;
  progress: number;            // 0..1 (clamped)
  from?: string;
  to?: string;
  track?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, isFinite(progress) ? progress : 0));
  const offset = c * (1 - p);
  const cx = size / 2;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Circle cx={cx} cy={cx} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={cx}
          cy={cx}
          r={r}
          stroke="url(#ringGrad)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cx})`}
        />
      </Svg>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.center}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
