import { StyleSheet, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";

const SIZE = 116;
const STROKE = 22;

export type DonutSlice = { value: number; color: string };

/** Traffic-sources ring: each slice is a dash on one circle, so there are no
 *  seams or overdraw between segments. Slices below ~1% are still drawn - a
 *  hairline is honest, a dropped slice isn't. */
export function DonutChart({ slices }: { slices: DonutSlice[] }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const r = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * r;

  let offset = 0;

  return (
    <View style={styles.wrap}>
      <Svg width={SIZE} height={SIZE}>
        {/* -90° so the first slice starts at 12 o'clock */}
        <G rotation={-90} origin={`${SIZE / 2}, ${SIZE / 2}`}>
          {total > 0 &&
            slices.map((s, i) => {
              const length = (s.value / total) * circumference;
              const dash = `${length} ${circumference - length}`;
              const el = (
                <Circle
                  key={i}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={r}
                  stroke={s.color}
                  strokeWidth={STROKE}
                  fill="none"
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                />
              );
              offset += length;
              return el;
            })}
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE },
});
