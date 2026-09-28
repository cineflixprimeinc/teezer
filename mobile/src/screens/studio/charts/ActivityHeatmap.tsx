import { useState } from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Server heatmap rows are 0=Sunday..6=Saturday - remap to Monday-first display order.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const CELL_H = 13;
const ROW_GAP = 3;
const LABEL_W = 28;

function cellColor(score: number): string {
  const t = Math.max(0, Math.min(1, score / 100));
  const from = { r: 0xff, g: 0xf0, b: 0xf4 }; // colors.brandTint
  const to = { r: 0xfe, g: 0x2c, b: 0x55 };   // colors.brand
  const r = Math.round(from.r + (to.r - from.r) * t);
  const g = Math.round(from.g + (to.g - from.g) * t);
  const b = Math.round(from.b + (to.b - from.b) * t);
  return `rgb(${r},${g},${b})`;
}

/** 7×24 day-of-week × hour-of-day activity grid - "Best Time To Post". */
export function ActivityHeatmap({ heatmap }: { heatmap: number[][] }) {
  const [width, setWidth] = useState(0);
  const gridW = Math.max(0, width - LABEL_W);
  const cellGap = 1.5;
  const cellW = gridW > 0 ? (gridW - cellGap * 23) / 24 : 0;
  const gridH = 7 * CELL_H + 6 * ROW_GAP;

  return (
    <View>
      <View style={styles.row} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
        <View style={{ width: LABEL_W }}>
          {DAY_LABELS.map((label) => (
            <View key={label} style={styles.dayCell}>
              <Text style={styles.dayLabel}>{label}</Text>
            </View>
          ))}
        </View>
        {gridW > 0 && (
          <Svg width={gridW} height={gridH}>
            {DAY_ORDER.map((dayIdx, r) =>
              (heatmap[dayIdx] ?? []).map((score, h) => (
                <Rect
                  key={`${dayIdx}-${h}`}
                  x={h * (cellW + cellGap)}
                  y={r * (CELL_H + ROW_GAP)}
                  width={cellW}
                  height={CELL_H}
                  rx={2.5}
                  fill={cellColor(score)}
                />
              )),
            )}
          </Svg>
        )}
      </View>

      <View style={[styles.hourRow, { marginLeft: LABEL_W }]}>
        {["12AM", "6AM", "12PM", "6PM", "12AM"].map((l, i) => (
          <Text key={i} style={styles.hourLabel}>{l}</Text>
        ))}
      </View>

      <View style={styles.legendRow}>
        <Text style={styles.legendLabel}>Low activity</Text>
        <View style={styles.legendBar}>
          {Array.from({ length: 14 }).map((_, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: cellColor((i / 13) * 100) }} />
          ))}
        </View>
        <Text style={styles.legendLabel}>High activity</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  dayCell: { height: CELL_H + ROW_GAP, justifyContent: "center" },
  dayLabel: { fontSize: 10, color: colors.textFaint, fontWeight: font.weightMedium },
  hourRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs },
  hourLabel: { fontSize: 9, color: colors.textFaint, fontWeight: font.weightMedium },
  legendRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.sm },
  legendLabel: { fontSize: 9, color: colors.textFaint, fontWeight: font.weightMedium },
  legendBar: { flex: 1, height: 6, borderRadius: radius.sm, overflow: "hidden", flexDirection: "row" },
});
