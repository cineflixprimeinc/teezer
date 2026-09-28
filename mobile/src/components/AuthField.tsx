import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/constants/colors";
import { radius, spacing, font } from "@/constants/theme";

type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * Rounded icon input used across the auth screens. Pass an Ionicons name for the
 * left icon, an optional `right` node (e.g. a password eye toggle), and an
 * optional `helper` / `error` line beneath. Visual style matches the web auth
 * pills (1.5px border, 16px radius, brand-red focus/error states).
 */
export function AuthField({
  icon, right, error, helper, focusedColor, ...input
}: TextInputProps & {
  icon: IoniconName;
  right?: ReactNode;
  error?: string;
  helper?: string;
  focusedColor?: string;
}) {
  return (
    <View>
      <View style={[styles.field, error ? styles.fieldError : null]}>
        <Ionicons name={icon} size={20} color={colors.textFaint} style={styles.icon} />
        <TextInput
          style={[styles.input, right ? { paddingRight: 40 } : null]}
          placeholderTextColor={colors.textFaint}
          {...input}
        />
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : helper ? (
        <Text style={styles.helper}>{helper}</Text>
      ) : null}
    </View>
  );
}

/** Eye show/hide toggle for password fields. */
export function EyeToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <Pressable onPress={onToggle} hitSlop={10}>
      <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row", alignItems: "center",
    height: 58, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.borderStrong,
    backgroundColor: colors.white, paddingHorizontal: spacing.lg,
  },
  fieldError: { borderColor: colors.brand },
  icon: { marginRight: spacing.md },
  input: { flex: 1, fontSize: font.md, color: colors.text, height: "100%" },
  right: { position: "absolute", right: spacing.lg, height: "100%", justifyContent: "center" },
  error: { marginTop: 5, marginLeft: spacing.lg, fontSize: font.xs, color: colors.brand },
  helper: { marginTop: 5, marginLeft: spacing.lg, fontSize: font.xs, color: colors.textMuted },
});
