import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Screen } from "@/components/Screen";
import { POLICIES, type PolicyKey } from "@/store/policy.store";
import { colors } from "@/constants/colors";
import { font, spacing } from "@/constants/theme";

/**
 * In-app viewer for the legal pages (Privacy Policy, Terms, Community
 * Guidelines). Registered as a native-stack MODAL screen so it stacks
 * correctly on top of the login/signup modals - a plain RN <Modal> cannot
 * present over an already-presented native modal on iOS (it fails silently),
 * which is exactly where these links live. Renders the live reelsoo.com page
 * in a WebView so the app never ships a stale copy.
 */
export function PolicyViewerScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  // Either a preset policy key, or an explicit url+title (e.g. a policy
  // section anchor from the Policies list).
  const key = (route.params?.policy ?? "privacy") as PolicyKey;
  const preset = POLICIES[key] ?? POLICIES.privacy;
  const rawUrl: string = route.params?.url ?? preset.url;
  const title: string = route.params?.title ?? preset.title;
  // Tells the website's own page header to drop its "Back to Reelsoo" link -
  // it would navigate this WebView to reelsoo.com/, not close the app's own
  // modal (the X above already does that), and it doesn't make sense inside
  // an in-app popup either way. The live website, opened normally in a real
  // browser, is unaffected - it never sends this param.
  const url = `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}embedded=1`;

  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  return (
    <Screen edges={["top", "bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.grabber} />
        <View style={styles.headerRow}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={styles.closeBtn} accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {/* Live page */}
      {failed ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={38} color={colors.textFaint} />
          <Text style={styles.errText}>Couldn&apos;t load the page. Check your connection.</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => { setFailed(false); setLoading(true); setAttempt((a) => a + 1); }}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <WebView
            key={attempt}
            source={{ uri: url }}
            onLoadEnd={() => setLoading(false)}
            onError={() => { setLoading(false); setFailed(true); }}
            startInLoadingState={false}
            setSupportMultipleWindows={false}
            style={{ flex: 1, backgroundColor: colors.bg }}
          />
          {loading && (
            <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: colors.bg }]}>
              <ActivityIndicator color={colors.brand} size="large" />
            </View>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.bg },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginTop: 8 },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { flex: 1, fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bgMuted,
    alignItems: "center", justifyContent: "center",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingHorizontal: spacing.xl },
  errText: { fontSize: font.sm, color: colors.textMuted, textAlign: "center" },
  retryBtn: { marginTop: spacing.sm, backgroundColor: colors.brand, borderRadius: 999, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  retryText: { color: colors.white, fontWeight: font.weightBold, fontSize: font.sm },
});
