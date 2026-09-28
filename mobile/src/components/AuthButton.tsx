import { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/constants/colors";

/**
 * Auth option button matching the designs: a white rounded card with the icon
 * pinned left and the label centered across the full width.
 */
export function AuthButton({ icon, label, onPress, loading, disabled }: {
  icon: ReactNode;
  label: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.card, pressed && styles.pressed, (disabled || loading) && styles.disabled]}
    >
      <Text style={styles.label}>{label}</Text>
      <View style={styles.icon}>
        {loading ? <ActivityIndicator color={colors.brand} /> : icon}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ececec",
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { backgroundColor: "#fafafa" },
  disabled: { opacity: 0.55 },
  label: { fontSize: 15.5, fontWeight: "600", color: colors.text, textAlign: "center" },
  icon: { position: "absolute", left: 20, top: 0, bottom: 0, width: 26, alignItems: "center", justifyContent: "center" },
});
