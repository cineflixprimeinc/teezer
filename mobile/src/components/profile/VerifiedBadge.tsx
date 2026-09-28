import type { StyleProp, ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";

/** Scalloped blue verified seal with a white check.
 *
 *  Geometry and colour are copied verbatim from the website's badge
 *  (frontend/src/components/ui/verified-badge.tsx) so the two platforms render
 *  an identical mark - keep them in sync if either changes. This is the single
 *  source of the badge in the app; never hand-roll a checkmark-circle icon. */
export function VerifiedBadge({ size = 18, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={style}>
      <Path
        fill="#1d8cff"
        d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
      />
      <Path
        fill="none"
        stroke="#ffffff"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m8.5 12 2.5 2.5 4.5-5"
      />
    </Svg>
  );
}
