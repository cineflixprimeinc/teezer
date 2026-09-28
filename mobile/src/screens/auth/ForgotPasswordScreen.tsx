import { useState } from "react";
import {
  Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ChevronLeft } from "lucide-react-native";
import { StatusBar } from "expo-status-bar";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { Logo } from "@/components/Logo";
import { LegalNote, AuthClose } from "@/components/AuthParts";
import { RateLimitBox, useRateLimit } from "@/components/RateLimitBox";
import { authApi } from "@/api/auth.api";
import { apiErrorMessage } from "@/api/client";
import { colors } from "@/constants/colors";
import { spacing, radius, font } from "@/constants/theme";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "ForgotPassword">;

function isValidEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

/**
 * Email-only "forgot password" form, styled to match LoginFormScreen. Wired
 * to the same live Laravel endpoint the website's forgot-password page uses
 * (`/auth/forgot-password` -> Password::sendResetLink) - a real email goes
 * out via the server's configured mailer, same as web. The backend always
 * responds with the same generic message whether or not the address is
 * registered (anti account-enumeration), so this screen shows one "sent"
 * state regardless of the result, matching that by design.
 */
export function ForgotPasswordScreen({ navigation, route }: Props) {
  const [email, setEmail] = useState(route.params?.prefillEmail ?? "");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { rateLimit, fromError } = useRateLimit();

  async function submit() {
    const trimmed = email.trim();
    if (!trimmed) {
      Alert.alert("Missing info", "Enter the email address on your account.");
      return;
    }
    if (!isValidEmail(trimmed)) {
      Alert.alert("Invalid email", "Enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      await authApi.forgotPassword(trimmed);
      setSent(true);
    } catch (e) {
      if (fromError(e)) return;
      Alert.alert("Something went wrong", apiErrorMessage(e, "Please try again in a moment."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      <AuthClose onPress={() => navigation.popToTop()} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.topBar}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
            <ChevronLeft size={24} color={colors.text} strokeWidth={2} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoWrap}><Logo /></View>

          {sent ? (
            <>
              <View style={styles.sentIconWrap}>
                <Ionicons name="mail-outline" size={32} color={colors.brand} />
              </View>
              <Text style={styles.title}>Check your email</Text>
              <Text style={styles.subtitle}>
                If an account exists for {email.trim()}, we&apos;ve sent instructions to reset your password.
              </Text>

              <View style={styles.form}>
                <Button label="Back to log in" onPress={() => navigation.replace("LoginForm", { prefillLogin: email.trim() })} />
                <Button
                  label="Use a different email"
                  variant="outline"
                  onPress={() => setSent(false)}
                  style={styles.secondaryBtn}
                />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.title}>Forgot password?</Text>
              <Text style={styles.subtitle}>
                Enter the email on your account and we&apos;ll send you a link to reset your password.
              </Text>

              <View style={styles.form}>
                <View style={styles.field}>
                  <Ionicons name="mail-outline" size={20} color={colors.textFaint} style={styles.fieldIcon} />
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="username"
                    placeholder="Email address"
                    placeholderTextColor={colors.textFaint}
                    returnKeyType="go"
                    onSubmitEditing={submit}
                  />
                </View>

                {rateLimit && <RateLimitBox rateLimit={rateLimit} />}

                <Button label="Send reset link" loading={loading} disabled={!!rateLimit} onPress={submit} style={styles.submitBtn} />
              </View>
            </>
          )}

          <View style={{ flex: 1 }} />

          <View style={styles.footer}>
            <LegalNote />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, height: 44, justifyContent: "center" },
  backBtn: { width: 40, height: 40, justifyContent: "center" },

  content: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.lg },

  logoWrap: { alignItems: "center", marginBottom: spacing.xxl },
  title: { fontSize: 30, fontWeight: "800", color: colors.text, textAlign: "center", letterSpacing: -0.5 },
  subtitle: { marginTop: spacing.sm, fontSize: 16, color: colors.textMuted, textAlign: "center" },

  sentIconWrap: {
    alignSelf: "center", width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center",
    marginBottom: spacing.lg,
  },

  form: { marginTop: spacing.xxl, gap: spacing.lg },
  field: {
    flexDirection: "row", alignItems: "center",
    height: 58, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.borderStrong,
    backgroundColor: colors.white, paddingHorizontal: spacing.lg,
  },
  fieldIcon: { marginRight: spacing.md },
  input: { flex: 1, fontSize: font.md, color: colors.text, height: "100%" },

  footer: { gap: spacing.lg, marginTop: spacing.lg },

  submitBtn: {
    height: 56, borderRadius: radius.lg, marginTop: spacing.md,
    shadowColor: colors.brand, shadowOpacity: 0.4, shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  secondaryBtn: { height: 56, borderRadius: radius.lg },
});
