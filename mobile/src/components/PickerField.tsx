import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/constants/colors";
import { radius, spacing, font } from "@/constants/theme";

type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * A read-only, tappable field that looks like AuthField but opens a picker
 * (date / country). Shows `value` when set, otherwise the muted `placeholder`,
 * with a trailing chevron.
 */
export function PickerField({
  icon, value, placeholder, onPress, error, leading, disabled,
}: {
  icon: IoniconName;
  value?: string | null;
  placeholder: string;
  onPress: () => void;
  error?: string;
  /** Optional element shown before the text (e.g. a flag emoji). */
  leading?: string;
  /** Admin-configurable ("Allow Manual Country Change") - when true, the
   *  field is frozen on whatever `value` already is instead of opening its
   *  picker. UX only; omitted/false preserves today's fully-interactive
   *  behavior for every other consumer (e.g. the date-of-birth field). */
  disabled?: boolean;
}) {
  const filled = Boolean(value);
  return (
    <View>
      <Pressable
        onPress={() => { if (!disabled) onPress(); }}
        style={({ pressed }) => [
          styles.field,
          error ? styles.fieldError : null,
          pressed && !disabled && styles.pressed,
          disabled && styles.fieldDisabled,
        ]}
      >
        <Ionicons name={icon} size={20} color={colors.textFaint} style={styles.icon} />
        {leading ? <Text style={styles.leading}>{leading}</Text> : null}
        <Text style={[styles.text, !filled && styles.placeholder]} numberOfLines={1}>
          {filled ? value : placeholder}
        </Text>
        {!disabled && <Ionicons name="chevron-down" size={18} color={colors.textFaint} />}
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row", alignItems: "center",
    height: 58, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.borderStrong,
    backgroundColor: colors.white, paddingHorizontal: spacing.lg,
  },
  fieldError: { borderColor: colors.brand },
  fieldDisabled: { backgroundColor: colors.bgMuted, opacity: 0.75 },
  pressed: { backgroundColor: "#fafafa" },
  icon: { marginRight: spacing.md },
  leading: { fontSize: 18, marginRight: spacing.sm },
  text: { flex: 1, fontSize: font.md, color: colors.text },
  placeholder: { color: colors.textFaint },
  error: { marginTop: 5, marginLeft: spacing.lg, fontSize: font.xs, color: colors.brand },
});
