import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/constants/colors";
import { spacing } from "@/constants/theme";
import { openPolicy } from "@/store/policy.store";

const LINK_BLUE = "#2f6fed";

export function OrDivider() {
  return (
    <View style={styles.orRow}>
      <View style={styles.line} />
      <Text style={styles.orText}>or</Text>
      <View style={styles.line} />
    </View>
  );
}

/** "By {verb}, you agree to our Terms & Privacy Policy." */
export function TermsNote({ verb }: { verb: string }) {
  return (
    <Text style={styles.terms}>
      By {verb}, you agree to our{" "}
      <Text style={styles.link} onPress={() => openPolicy("terms")}>Terms</Text>
      {" "}&{" "}
      <Text style={styles.link} onPress={() => openPolicy("privacy")}>Privacy Policy</Text>.
    </Text>
  );
}

/**
 * Legal consent line. On signup we surface the user's (auto-detected) country -
 * "By continuing with an account located in {country}, you agree…" - matching the
 * website. On login (no country) it falls back to a plain "By continuing…".
 */
export function LegalNote({ countryName }: { countryName?: string | null }) {
  return (
    <Text style={styles.legal}>
      By continuing
      {countryName ? (
        <>
          {" with an account located in "}
          <Text style={styles.legalStrong}>{countryName}</Text>
        </>
      ) : null}
      , you agree to our{" "}
      <Text style={styles.linkBlue} onPress={() => openPolicy("terms")}>Terms of Service</Text>
      {" "}and acknowledge that you have read our{" "}
      <Text style={styles.linkBlue} onPress={() => openPolicy("privacy")}>Privacy Policy</Text>.
    </Text>
  );
}

/** Shield + explanatory line about how the email is used, with a "Learn more" link. */
export function EmailInfoRow({ text }: { text: string; learnMoreUrl?: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.shield}>
        <Ionicons name="shield-checkmark-outline" size={18} color={colors.textMuted} />
      </View>
      <Text style={styles.infoText}>
        {text}{" "}
        <Text style={styles.linkBlue} onPress={() => openPolicy("privacy")}>Learn more.</Text>
      </Text>
    </View>
  );
}

/** Optional marketing opt-in checkbox (unchecked by default). */
export function MarketingCheckbox({ value, onToggle }: { value: boolean; onToggle: () => void }) {
  return (
    <Pressable style={styles.optRow} onPress={onToggle} hitSlop={6}>
      <View style={[styles.checkbox, value && styles.checkboxOn]}>
        {value && <Ionicons name="checkmark" size={13} color={colors.white} />}
      </View>
      <Text style={styles.optText}>
        Get trending content, newsletters, promotions, recommendations and account updates sent to your email
      </Text>
    </Pressable>
  );
}

/**
 * Top-right close (✕) for the auth modals. Wire onPress to
 * `navigation.popToTop()` so it dismisses the ENTIRE login/signup flow at once -
 * not one stacked screen at a time.
 */
export function AuthClose({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} style={styles.closeBtn} accessibilityLabel="Close">
      <Ionicons name="close" size={22} color={colors.text} />
    </Pressable>
  );
}

export function BottomLink({ prompt, action, onPress }: { prompt: string; action: string; onPress: () => void }) {
  return (
    <View style={styles.bottom}>
      <Text style={styles.bottomText}>{prompt} </Text>
      <Text style={[styles.bottomText, styles.bottomAction]} onPress={onPress}>{action}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  closeBtn: {
    position: "absolute", top: spacing.xl, right: spacing.lg, zIndex: 20,
    width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.bgMuted,
  },
  orRow: { flexDirection: "row", alignItems: "center", marginVertical: spacing.md },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong },
  orText: { marginHorizontal: spacing.md, color: colors.textFaint, fontSize: 13 },

  terms: { marginTop: spacing.xl, textAlign: "center", fontSize: 12, lineHeight: 18, color: colors.textMuted },
  link: { color: colors.brand, textDecorationLine: "underline" },

  bottom: {
    flexDirection: "row", justifyContent: "center", alignItems: "center",
    paddingVertical: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  bottomText: { fontSize: 14, color: colors.textSecondary },
  bottomAction: { color: colors.brand, fontWeight: "700" },

  // Legal / email-usage info
  legal: { fontSize: 12, lineHeight: 18, color: colors.textMuted, textAlign: "center" },
  legalStrong: { color: LINK_BLUE, fontWeight: "600" },
  linkBlue: { color: LINK_BLUE, fontWeight: "500" },

  infoRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  shield: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: colors.bgMuted,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.textMuted },

  optRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  checkbox: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.borderStrong,
    alignItems: "center", justifyContent: "center", marginTop: 1, flexShrink: 0,
  },
  checkboxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  optText: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.text },
});
