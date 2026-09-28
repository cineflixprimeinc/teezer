import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomSheet } from "@/components/BottomSheet";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/Button";
import { TermsNote } from "@/components/AuthParts";
import { GoogleIcon, TikTokIcon } from "@/components/BrandIcons";
import { useSocialAuth } from "@/hooks/useSocialAuth";
import { useAuthGate } from "@/store/auth-gate.store";
import { useAuthStore } from "@/store/auth.store";
import { navigationRef } from "@/navigation/ref";
import { colors } from "@/constants/colors";
import { spacing, font } from "@/constants/theme";

/**
 * "Log in or sign up to continue" popup. Rendered once at the root as a plain
 * overlay (NOT a navigation screen) and shown via the auth-gate store. Closing
 * it only hides the overlay - the feed underneath is never navigated, so the
 * current video and scroll position are preserved exactly.
 */
export function AuthGateModal() {
  const insets = useSafeAreaInsets();
  const visible = useAuthGate((s) => s.visible);
  const close = useAuthGate((s) => s.close);
  const { apple, google } = useSocialAuth();

  /* An account already saved on this device is one tap from being signed in, so
   * it is offered ahead of typing a password. The pending action survives
   * either route - it is stashed, not consumed, and replayed once auth lands. */
  const accounts = useAuthStore((s) => s.accounts);
  const saved = accounts[0] ?? null;

  // Hide the popup, then go to the full auth screen (pending action is kept and
  // replayed after a successful login).
  const goTo = (screen: "LoginForm" | "EmailSignup" | "SavedAccounts") => {
    useAuthGate.setState({ visible: false });
    if (navigationRef.isReady()) navigationRef.navigate(screen);
  };

  return (
    <BottomSheet visible={visible} onClose={close} scrollable={false}>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Pressable onPress={close} hitSlop={12} style={styles.close} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>

          <View style={styles.logoWrap}><Logo height={30} /></View>

          <Text style={styles.title}>
            {saved ? "Continue as yourself" : "Log in or sign up to continue"}
          </Text>
          <Text style={styles.subtitle}>
            {saved
              ? "You're signed out. Pick up where you left off, or use another account."
              : "Join Teezer to like, comment, follow creators and share your moments."}
          </Text>

          <View style={styles.actions}>
            {saved ? (
              <>
                {/* The saved card leads: it needs no password. */}
                <Button
                  label={`Continue as @${saved.username}`}
                  onPress={() => goTo("SavedAccounts")}
                />
                <Button label="Use another account" variant="outline" onPress={() => goTo("LoginForm")} />
              </>
            ) : (
              <>
                <Button label="Log in" onPress={() => goTo("LoginForm")} />
                <Button label="Sign up" variant="outline" onPress={() => goTo("EmailSignup")} />
              </>
            )}
          </View>

          <View style={styles.socialRow}>
            <SocialCircle onPress={() => { close(); google(); }}>
              <GoogleIcon size={24} />
            </SocialCircle>
            <SocialCircle onPress={() => { close(); apple(); }}>
              <Ionicons name="logo-apple" size={26} color={colors.black} />
            </SocialCircle>
            <SocialCircle onPress={() => Alert.alert("Coming soon", "TikTok login isn't enabled yet.")}>
              <TikTokIcon size={22} />
            </SocialCircle>
          </View>

          <TermsNote verb="continuing" />
      </View>
    </BottomSheet>
  );
}

function SocialCircle({ children, onPress }: { children: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.circle, pressed && { backgroundColor: "#fafafa" }]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  close: { position: "absolute", top: spacing.lg, right: spacing.lg, zIndex: 2, padding: 2 },
  logoWrap: { alignItems: "center", marginBottom: spacing.lg },
  title: { fontSize: 20, fontWeight: "800", color: colors.text, textAlign: "center", letterSpacing: -0.3 },
  subtitle: { marginTop: spacing.sm, fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: "center" },
  actions: { marginTop: spacing.xl, gap: spacing.md },
  socialRow: { flexDirection: "row", justifyContent: "center", gap: spacing.lg, marginTop: spacing.xl },
  circle: {
    width: 54, height: 54, borderRadius: 27, borderWidth: 1.5, borderColor: colors.borderStrong,
    backgroundColor: colors.white, alignItems: "center", justifyContent: "center",
  },
});
