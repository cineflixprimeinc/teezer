import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { colors } from "@/constants/colors";
import { font } from "@/constants/theme";

/**
 * The app's one follow button.
 *
 * It has a FIXED width, and that is the whole point. Every previous version
 * sized itself from its label with padding and a minWidth, so "Following" came
 * out wider than "Follow" - which meant that in any list where some people were
 * followed and some were not, the buttons sat at different x positions and the
 * column looked broken. Sizing to the longest label the button can ever show
 * makes the edge stable no matter what state each row is in.
 *
 * The size is exported so anything that has to match this footprint - a
 * skeleton, a disabled placeholder - can line up with it instead of guessing.
 */
export const FOLLOW_BTN_WIDTH = 104;
export const FOLLOW_BTN_HEIGHT = 34;

export function FollowButton({
  following,
  onPress,
  pending = false,
  disabled = false,
  style,
  followLabel = "Follow",
  followingLabel = "Following",
}: {
  following: boolean;
  onPress: () => void;
  pending?: boolean;
  disabled?: boolean;
  style?: ViewStyle | ViewStyle[];
  followLabel?: string;
  followingLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || pending}
      accessibilityRole="button"
      accessibilityState={{ selected: following, disabled: disabled || pending }}
      style={({ pressed }) => [
        styles.btn,
        following && styles.btnOn,
        (disabled || pending) && styles.btnDisabled,
        pressed && { opacity: 0.85 },
        style as ViewStyle,
      ]}
    >
      {pending ? (
        <ActivityIndicator size="small" color={following ? colors.text : colors.white} />
      ) : (
        // numberOfLines guards the one case a fixed width cannot: a localisation
        // whose word for "Following" does not fit. It ellipsises rather than
        // wrapping to a second line and making this row taller than its
        // neighbours.
        <Text style={[styles.text, following && styles.textOn]} numberOfLines={1}>
          {following ? followingLabel : followLabel}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: FOLLOW_BTN_WIDTH,
    height: FOLLOW_BTN_HEIGHT,
    borderRadius: 9,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    // Never shrink: in a row with a long display name the text column is the
    // elastic zone, not this. Without it the button loses its width first and
    // the label clips instead of the name.
    flexShrink: 0,
  },
  btnOn: { backgroundColor: "#f1f1f3" },
  btnDisabled: { opacity: 0.6 },
  text: { fontSize: 13, fontWeight: font.weightBold, color: colors.white },
  textOn: { color: colors.text },
});
