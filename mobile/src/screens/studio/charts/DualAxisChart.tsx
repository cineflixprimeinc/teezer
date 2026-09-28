import { useState } from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Line, Path, Stop } from "react-native-svg";
import { colors } from "@/constants/colors";
import { font } from "@/constants/theme";
import type { ChartPoint } from "@/api/studio.api";

const CHART_HEIGHT = 150;
const Y_TICKS = 4; // 0 + three steps, e.g. 0 / 300K / 600K / 900K
const AXIS_W = 40;
const DOT_R = 3.5;

/** Rounds an axis up to a "nice" maximum (300K/600K/900K rather than 847,231). */
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const rough = max / (Y_TICKS - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 3 ? 3 : norm <= 5 ? 5 : 10) * mag;
  return step * (Y_TICKS - 1);
}

function fmtAxis(n: number): string {
  if (n === 0) return "0";
  if (Math.abs(n) >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `${+(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return String(Math.round(n));
}

/** A smooth line through the points (Catmull-Rom converted to cubic béziers) -
 *  the gently curved shape the design uses, not straight segments. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length < 3) return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/** Content Performance graph: two independently-scaled series sharing an x-axis -
 *  views against the left axis, watch-time hours against the right, so both read
 *  clearly even though their magnitudes differ by orders of magnitude. */
export function DualAxisChart({ views, watchTime }: { views: ChartPoint[]; watchTime: ChartPoint[] }) {
  const [width, setWidth] = useState(0);
  const plotW = Math.max(0, width - AXIS_W * 2);
  const plotH = CHART_HEIGHT;

  const leftMax = niceMax(Math.max(1, ...views.map((d) => d.value)));
  const rightMax = niceMax(Math.max(1, ...watchTime.map((d) => d.value)));
  const ticks = Array.from({ length: Y_TICKS }, (_, i) => Y_TICKS - 1 - i); // 3,2,1,0 → top to bottom

  const project = (series: ChartPoint[], max: number) =>
    series.map((d, i) => ({
      x: series.length > 1 ? (i / (series.length - 1)) * plotW : plotW / 2,
      y: plotH - (Math.min(d.value, max) / max) * plotH,
    }));

  // Everything is drawn shifted down by DOT_R so the top-most dot isn't clipped
  // by the SVG edge; the negative margin in the style pulls that padding back.
  const viewLine = project(views, leftMax).map((p) => ({ x: p.x, y: p.y + DOT_R }));
  const watchLine = project(watchTime, rightMax).map((p) => ({ x: p.x, y: p.y + DOT_R }));

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.plotRow}>
        {/* Left axis - views */}
        <View style={styles.axisLeft}>
          {ticks.map((t) => (
            <Text key={t} style={[styles.axisLabel, { textAlign: "right" }]}>{fmtAxis((leftMax / (Y_TICKS - 1)) * t)}</Text>
          ))}
        </View>

        {width > 0 && (
          <Svg width={plotW} height={plotH + DOT_R * 2} style={{ marginVertical: -DOT_R }}>
            <>
              <Defs>
                <LinearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={colors.brand} stopOpacity={0.16} />
                  <Stop offset="1" stopColor={colors.brand} stopOpacity={0} />
                </LinearGradient>
              </Defs>

              {/* Faint gridlines, one per tick */}
              {ticks.map((t) => {
                const y = DOT_R + plotH - (t / (Y_TICKS - 1)) * plotH;
                return <Line key={t} x1={0} y1={y} x2={plotW} y2={y} stroke={colors.border} strokeWidth={1} />;
              })}

              {/* Views gets a soft fill so the primary series reads first; watch
                  time stays a bare line and never fights it for attention. */}
              {viewLine.length > 0 && (
                <Path
                  d={`${smoothPath(viewLine)} L ${viewLine[viewLine.length - 1].x} ${plotH + DOT_R} L ${viewLine[0].x} ${plotH + DOT_R} Z`}
                  fill="url(#viewsFill)"
                />
              )}

              <Path d={smoothPath(watchLine)} stroke={colors.textFaint} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Path d={smoothPath(viewLine)} stroke={colors.brand} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />

              {watchLine.map((p, i) => (
                <Circle key={`w${i}`} cx={p.x} cy={p.y} r={DOT_R} fill={colors.white} stroke={colors.textFaint} strokeWidth={1.75} />
              ))}
              {viewLine.map((p, i) => (
                <Circle key={`v${i}`} cx={p.x} cy={p.y} r={DOT_R} fill={colors.white} stroke={colors.brand} strokeWidth={2} />
              ))}
            </>
          </Svg>
        )}

        {/* Right axis - watch time */}
        <View style={styles.axisRight}>
          {ticks.map((t) => (
            <Text key={t} style={styles.axisLabel}>{fmtAxis((rightMax / (Y_TICKS - 1)) * t)}</Text>
          ))}
        </View>
      </View>

      {/* X labels sit under the plot, inset by both axis gutters so they line up
          with the points rather than the card edges. */}
      <View style={[styles.xRow, { marginHorizontal: AXIS_W }]}>
        {views.map((d, i) => (
          <Text key={`${d.date}-${i}`} style={styles.xLabel} numberOfLines={1}>{d.label}</Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plotRow: { flexDirection: "row", alignItems: "stretch" },
  axisLeft: { width: AXIS_W, height: CHART_HEIGHT, justifyContent: "space-between", paddingRight: 8 },
  axisRight: { width: AXIS_W, height: CHART_HEIGHT, justifyContent: "space-between", paddingLeft: 8 },
  axisLabel: { fontSize: 10, color: colors.textFaint, fontWeight: font.weightMedium },
  xRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  xLabel: { flex: 1, textAlign: "center", fontSize: 10, color: colors.textFaint, fontWeight: font.weightMedium },
});
