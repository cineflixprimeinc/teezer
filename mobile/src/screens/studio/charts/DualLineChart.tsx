import { useState } from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { colors } from "@/constants/colors";
import { font, spacing } from "@/constants/theme";
import type { ChartPoint } from "@/api/studio.api";

const CHART_HEIGHT = 180;
const Y_TICKS = 4;
const AXIS_W = 40;

function niceStep(max: number): number {
  if (max <= 0) return 1;
  const rough = max / (Y_TICKS - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}
function fmtAxis(n: number): string {
  if (n === 0) return "0";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return String(Math.round(n));
}
function axisFor(data: ChartPoint[]) {
  const rawMax = Math.max(1, ...data.map((d) => d.value));
  const step = niceStep(rawMax);
  const max = Math.max(step, Math.ceil(rawMax / step) * step);
  return { max, ticks: Array.from({ length: Y_TICKS }, (_, i) => max - i * step).filter((v) => v >= 0) };
}

/** Smooth, gentle curve through the points (horizontal-tangent Bezier) -
 *  reads far cleaner on a small screen than sharp point-to-point segments. */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const midX = (p0.x + p1.x) / 2;
    d += ` C ${midX.toFixed(1)} ${p0.y.toFixed(1)}, ${midX.toFixed(1)} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }
  return d;
}

/**
 * Reelsoo Studio's "Content Performance" chart - Views (filled, primary axis)
 * against Watch Time (a light trend line, no axis of its own). Two full
 * numeric axes side by side made the plot area feel cramped and busy on a
 * phone, so only Views gets labeled ticks; Watch Time is still normalized
 * to its own min/max so its shape is meaningful, and the legend + color
 * are enough to identify it without a second axis to read.
 */
export function DualLineChart({
  primary, secondary, primaryColor = colors.brand, secondaryColor = colors.textFaint,
}: {
  primary: ChartPoint[]; secondary: ChartPoint[]; primaryColor?: string; secondaryColor?: string;
}) {
  const [width, setWidth] = useState(0);
  const plotW = Math.max(0, width - AXIS_W);
  const plotH = CHART_HEIGHT;

  const left = axisFor(primary);
  const right = axisFor(secondary);

  function toPoints(data: ChartPoint[], axisMax: number) {
    return data.map((d, i) => ({
      x: data.length > 1 ? (i / (data.length - 1)) * plotW : plotW / 2,
      y: axisMax > 0 ? plotH - (d.value / axisMax) * plotH : plotH,
      label: d.label,
    }));
  }
  const primaryPts = toPoints(primary, left.max);
  const secondaryPts = toPoints(secondary, right.max);

  const primaryLine = smoothPath(primaryPts);
  const secondaryLine = smoothPath(secondaryPts);
  const primaryArea = primaryPts.length
    ? `${primaryLine} L ${primaryPts[primaryPts.length - 1].x.toFixed(1)} ${plotH} L ${primaryPts[0].x.toFixed(1)} ${plotH} Z`
    : "";

  const labelEvery = Math.max(1, Math.ceil(primaryPts.length / 4));

  return (
    <View>
      <View style={styles.row}>
        <View style={[styles.yAxis, { width: AXIS_W, height: plotH }]}>
          {left.ticks.map((t) => <Text key={t} style={styles.yLabel}>{fmtAxis(t)}</Text>)}
        </View>

        <View style={{ flex: 1 }} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
          {plotW > 0 && (
            <Svg width={plotW} height={plotH}>
              <Defs>
                <LinearGradient id="perfFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={primaryColor} stopOpacity={0.24} />
                  <Stop offset="1" stopColor={primaryColor} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              {left.ticks.map((t) => {
                const y = left.max > 0 ? plotH - (t / left.max) * plotH : plotH;
                return <Path key={t} d={`M 0 ${y} L ${plotW} ${y}`} stroke={colors.border} strokeWidth={1} />;
              })}
              <Path d={secondaryLine} stroke={secondaryColor} strokeWidth={1.75} fill="none" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="4 4" />
              <Path d={primaryArea} fill="url(#perfFill)" />
              <Path d={primaryLine} stroke={primaryColor} strokeWidth={2.75} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              {primaryPts.length > 0 && (
                <Circle
                  cx={primaryPts[primaryPts.length - 1].x} cy={primaryPts[primaryPts.length - 1].y}
                  r={4.5} fill={colors.card} stroke={primaryColor} strokeWidth={2.5}
                />
              )}
            </Svg>
          )}
        </View>
      </View>

      <View style={{ height: 16, marginLeft: AXIS_W, width: plotW }}>
        {primaryPts.map((p, i) => (i % labelEvery === 0 || i === primaryPts.length - 1) ? (
          <Text key={i} style={[styles.xLabel, { left: Math.max(0, Math.min(plotW - 40, p.x - 20)) }]} numberOfLines={1}>
            {p.label}
          </Text>
        ) : null)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  yAxis: { justifyContent: "space-between", paddingRight: spacing.xs },
  yLabel: { fontSize: 10, fontWeight: font.weightMedium, color: colors.textFaint, textAlign: "right" },
  xLabel: { position: "absolute", width: 40, fontSize: 10, color: colors.textFaint, fontWeight: font.weightMedium, textAlign: "center" },
});
