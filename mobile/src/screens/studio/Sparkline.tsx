import { View } from "react-native";
import Svg, { Polyline } from "react-native-svg";

/** Small decorative trend line under a stat tile - no axes, no labels. */
export function Sparkline({
  values,
  color,
  width = 96,
  height = 28,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return <View style={{ width, height }} />;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = width / (values.length - 1);
  const pad = 3;

  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = pad + (1 - (v - min) / span) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <Svg width={width} height={height}>
      <Polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
