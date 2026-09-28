import { useState } from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";
import type { RetentionCurvePoint } from "@/api/studio.api";

const CHART_HEIGHT = 130;
const AXIS_W = 34;
const Y_TICKS = [100, 75, 50, 25, 0];

/** Audience-retention curve - % of a clip's duration on X, % of viewers still
 *  watching on Y. A static callout marks the midpoint checkpoint. */
export function RetentionChart({ curve }: { curve: RetentionCurvePoint[] }) {
  const [width, setWidth] = useState(0);
  const plotW = Math.max(0, width - AXIS_W);
  const plotH = CHART_HEIGHT;

  const points = curve.map((c) => ({
    x: (c.pct / 100) * plotW,
    y: plotH - (c.retention / 100) * plotH,
    pct: c.pct,
    retention: c.retention,
  }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${plotH} L 0 ${plotH} Z`
    : "";
  const mid = points[Math.floor(points.length / 2)];

  return (
    <View>
      <View style={styles.row}>
        <View style={[styles.yAxis, { height: plotH }]}>
          {Y_TICKS.map((t) => <Text key={t} style={styles.yLabel}>{t}%</Text>)}
        </View>
        <View style={{ flex: 1 }} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
          {plotW > 0 && (
            <Svg width={plotW} height={plotH}>
              <Defs>
                <LinearGradient id="retFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={colors.brand} stopOpacity={0.25} />
                  <Stop offset="1" stopColor={colors.brand} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              {Y_TICKS.map((t) => (
                <Path key={t} d={`M 0 ${plotH - (t / 100) * plotH} L ${plotW} ${plotH - (t / 100) * plotH}`} stroke={colors.border} strokeWidth={1} />
              ))}
              <Path d={areaPath} fill="url(#retFill)" />
              <Path d={linePath} stroke={colors.brand} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              {mid && <Path d={`M ${mid.x} ${mid.y} L ${mid.x} ${plotH}`} stroke={colors.brand} strokeWidth={1} strokeDasharray="3,3" />}
              {points.map((p, i) => <Circle key={i} cx={p.x} cy={p.y} r={2} fill={colors.brand} />)}
              {mid && <Circle cx={mid.x} cy={mid.y} r={4.5} fill={colors.card} stroke={colors.brand} strokeWidth={2.5} />}
            </Svg>
          )}
          {mid && plotW > 0 && (
            <View pointerEvents="none" style={[styles.callout, { left: Math.max(0, Math.min(plotW - 58, mid.x - 29)), top: Math.max(0, mid.y - 42) }]}>
              <Text style={styles.calloutPct}>{mid.pct}% in</Text>
              <Text style={styles.calloutVal}>{mid.retention}%</Text>
            </View>
          )}
        </View>
      </View>
      <View style={{ height: 16, marginLeft: AXIS_W, width: plotW, flexDirection: "row", justifyContent: "space-between" }}>
        {[0, 25, 50, 75, 100].map((t) => <Text key={t} style={styles.xLabel}>{t}%</Text>)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  yAxis: { width: AXIS_W, justifyContent: "space-between", paddingRight: spacing.xs },
  yLabel: { fontSize: 10, color: colors.textFaint, fontWeight: font.weightMedium, textAlign: "right" },
  xLabel: { fontSize: 10, color: colors.textFaint, fontWeight: font.weightMedium },
  callout: {
    position: "absolute", width: 58, alignItems: "center", paddingVertical: 5,
    backgroundColor: colors.text, borderRadius: radius.md,
  },
  calloutPct: { fontSize: 9, color: "rgba(255,255,255,0.75)", fontWeight: font.weightMedium },
  calloutVal: { fontSize: 12, color: colors.white, fontWeight: font.weightHeavy, marginTop: 1 },
});
