import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { colors } from "@/constants/colors";
import { font, radius } from "@/constants/theme";

type Variant = "primary" | "outline" | "ghost";

export function Button({
  label, onPress, variant = "primary", loading, disabled, style,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" && styles.primary,
        variant === "outline" && styles.outline,
        variant === "ghost" && styles.ghost,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? colors.white : colors.brand} />
      ) : (
        <Text style={[styles.label, variant !== "primary" && styles.labelDark]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { height: 50, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  primary: { backgroundColor: colors.brand },
  outline: { borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.white },
  ghost: { backgroundColor: "transparent" },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  label: { color: colors.white, fontSize: font.md, fontWeight: font.weightBold },
  labelDark: { color: colors.text },
});
