import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "./Screen";
import { colors } from "@/constants/colors";
import { font, spacing } from "@/constants/theme";

/** Temporary screen body used until each feature phase replaces it. */
export function Placeholder({ title, icon = "construct-outline", note }: {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  note?: string;
}) {
  return (
    <Screen>
      <View style={styles.center}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={28} color={colors.brand} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.note}>{note ?? "Coming in a later phase."}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  iconWrap: {
    width: 60, height: 60, borderRadius: 18, marginBottom: spacing.lg,
    alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTint,
  },
  title: { fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text },
  note: { marginTop: spacing.xs, fontSize: font.sm, color: colors.textMuted },
});
