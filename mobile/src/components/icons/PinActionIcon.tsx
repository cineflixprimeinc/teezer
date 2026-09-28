import Svg, { Path } from "react-native-svg";
import { ds } from "@/theme/design";

/**
 * The one pin glyph for "pin this" actions app-wide - chat's message-pin menu
 * row and sticky-pin bar, and Inbox's swipe-to-pin/long-press-to-pin action,
 * all render the exact same icon rather than each screen keeping its own
 * near-identical copy that drifts over time.
 */
export function PinActionIcon({ size = 22, color = ds.text }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M18 3V5H17V11L19 14V16H13V23H11V16H5V14L7 11V5H6V3H18Z" />
    </Svg>
  );
}
