import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { font, radius, spacing } from "@/constants/theme";

/**
 * Shared by EmailSignupScreen and the login screen - shows the reason a
 * detected country's signup/login is currently unavailable
 * (App\Services\CountryAvailabilityService, via authApi.detectCountry()).
 * UX only: the backend re-checks independently at submit time regardless of
 * whether this banner rendered at all.
 */
export function CountryRestrictionBanner({ country, reason }: { country: string; reason: string }) {
  return (
    <View style={styles.box}>
      <View style={styles.headerRow}>
        <Ionicons name="alert-circle-outline" size={16} color="#991b1b" />
        <Text style={styles.title}>Unavailable in {country}</Text>
      </View>
      <Text style={styles.body}>{reason}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontWeight: font.weightHeavy, color: "#991b1b", fontSize: font.sm },
  body: { marginTop: 4, color: "#991b1b", fontSize: font.xs, lineHeight: 17 },
});
