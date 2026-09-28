import { memo } from "react";
import { Text, type TextProps, type TextStyle } from "react-native";
import { emojiName } from "@/utils/emoji";

/**
 * One emoji, rendered by the platform font.
 *
 * This is a <Text>, and that is the entire implementation - no <Image>, no SVG,
 * no sprite sheet, no download. Android, iOS and the web each draw the glyph
 * from the font they already ship, which is why this costs nothing to render
 * and always looks native to the device it is on.
 *
 * What the component adds over writing the character inline is the part that is
 * easy to forget: a screen-reader label. A bare emoji in a <Text> is announced
 * inconsistently, and inside a Pressable it is often announced not at all. Here
 * every instance carries its CLDR name.
 *
 * `allowFontScaling` is left ON, matching the rest of the app - an emoji that
 * ignores the user's text-size setting is an accessibility regression, even
 * though it means the glyph grows with the label beside it.
 */
export const Emoji = memo(function Emoji({
  emoji,
  size = 18,
  label,
  style,
  ...rest
}: {
  emoji: string;
  /** Font size in points. The glyph is square, so this is its height too. */
  size?: number;
  /** Overrides the looked-up name. Pass "" to hide it from screen readers when
   *  the emoji is purely decorative and the surrounding text already says it. */
  label?: string;
  style?: TextStyle | TextStyle[];
} & Omit<TextProps, "style" | "children">) {
  const name = label ?? emojiName(emoji);

  return (
    <Text
      // lineHeight tracks size: without it the tallest emoji in a row clips on
      // Android, which uses the font's own ascent rather than the box.
      style={[{ fontSize: size, lineHeight: size * 1.25 }, style as TextStyle]}
      accessible={name !== ""}
      accessibilityRole="image"
      accessibilityLabel={name || undefined}
      {...rest}
    >
      {emoji}
    </Text>
  );
});
