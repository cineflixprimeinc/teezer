import { useState } from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { colors } from "@/constants/colors";
import { font, spacing } from "@/constants/theme";
import type { ChartPoint } from "@/api/studio.api";

const CHART_HEIGHT = 190;
const Y_TICKS = 5;
const AXIS_W = 46;

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

/** Big filled line chart - Performance Overview's main graph. Y-axis rounds to
 *  "nice" steps (100K/200K/…) the way analytics dashboards conventionally do. */
export function PerformanceChart({ data, color = colors.brand }: { data: ChartPoint[]; color?: string }) {
  const [width, setWidth] = useState(0);
  const plotW = Math.max(0, width - AXIS_W);
  const plotH = CHART_HEIGHT;

  const rawMax = Math.max(1, ...data.map((d) => d.value));
  const step = niceStep(rawMax);
  const axisMax = Math.max(step, Math.ceil(rawMax / step) * step);
  const ticks = Array.from({ length: Y_TICKS }, (_, i) => axisMax - i * step).filter((v) => v >= 0);

  const points = data.map((d, i) => ({
    x: data.length > 1 ? (i / (data.length - 1)) * plotW : plotW / 2,
    y: axisMax > 0 ? plotH - (d.value / axisMax) * plotH : plotH,
    label: d.label,
  }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${plotH} L ${points[0].x.toFixed(1)} ${plotH} Z`
    : "";
  const labelEvery = Math.max(1, Math.ceil(points.length / 5));

  return (
    <View>
      <View style={styles.row}>
        <View style={[styles.yAxis, { height: plotH }]}>
          {ticks.map((t) => <Text key={t} style={styles.yLabel}>{fmtAxis(t)}</Text>)}
        </View>
        <View style={{ flex: 1 }} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
          {plotW > 0 && (
            <Svg width={plotW} height={plotH}>
              <Defs>
                <LinearGradient id="perfFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={color} stopOpacity={0.28} />
                  <Stop offset="1" stopColor={color} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              {ticks.map((t) => {
                const y = axisMax > 0 ? plotH - (t / axisMax) * plotH : plotH;
                return <Path key={t} d={`M 0 ${y} L ${plotW} ${y}`} stroke={colors.border} strokeWidth={1} />;
              })}
              <Path d={areaPath} fill="url(#perfFill)" />
              <Path d={linePath} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              {points.map((p, i) => (
                <Circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 4 : 2.5} fill={colors.card} stroke={color} strokeWidth={2} />
              ))}
            </Svg>
          )}
        </View>
      </View>
      <View style={{ height: 16, marginLeft: AXIS_W, width: plotW }}>
        {points.map((p, i) => (i % labelEvery === 0 || i === points.length - 1) ? (
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
  yAxis: { width: AXIS_W, justifyContent: "space-between", paddingRight: spacing.xs },
  yLabel: { fontSize: 10, color: colors.textFaint, fontWeight: font.weightMedium, textAlign: "right" },
  xLabel: { position: "absolute", width: 40, fontSize: 10, color: colors.textFaint, fontWeight: font.weightMedium, textAlign: "center" },
});
