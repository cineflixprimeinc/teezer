import { useEffect, useState } from "react";
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
import { LegalNote, EmailInfoRow, BottomLink, AuthClose } from "@/components/AuthParts";
import { RateLimitBox, useRateLimit } from "@/components/RateLimitBox";
import { CountryRestrictionBanner } from "@/components/CountryRestrictionBanner";
import { authApi } from "@/api/auth.api";
import { apiErrorMessage } from "@/api/client";
import { useAuthStore } from "@/store/auth.store";
import { colors } from "@/constants/colors";
import { spacing, radius, font } from "@/constants/theme";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "LoginForm">;

/** Email/username + password login - wired to the live backend (same Laravel
    `/auth/login` endpoint the web app uses; Turnstile is bypassed for the
    mobile client via the X-Client header). */
export function LoginFormScreen({ navigation, route }: Props) {
  // Pre-fill the identifier when we arrive here to re-authenticate an expired
  // saved session (from the Saved Accounts screen).
  const params = route.params as { prefillLogin?: string; expired?: boolean } | undefined;
  const [login, setLogin] = useState(params?.prefillLogin ?? "");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  /** Set once /auth/login answers two_factor_required - switches this screen
   *  to the code step. Null means we are on the password step. */
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  /** Recovery codes are the way back in when the authenticator is lost. */
  const [useRecovery, setUseRecovery] = useState(false);
  const { rateLimit, fromError } = useRateLimit();
  const signIn = useAuthStore((s) => s.signIn);

  /** UX signal only - ApiAuthController::login() re-checks independently at
   *  submit time (see CountryAvailabilityService's docblock). */
  const [loginRestriction, setLoginRestriction] = useState<{ country: string; reason: string } | null>(null);
  useEffect(() => {
    let active = true;
    authApi.detectCountry()
      .then((d) => {
        if (active && d && !d.loginAllowed) {
          setLoginRestriction({ country: d.countryName, reason: d.loginReason || "Teezer login is currently unavailable in your country." });
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  function forgotPassword() {
    // Prefill only when it looks like an email - the form field also
    // accepts a username, which ForgotPasswordScreen's email-only field
    // can't use.
    const prefillEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login.trim()) ? login.trim() : undefined;
    navigation.navigate("ForgotPassword", { prefillEmail });
  }

  async function submit() {
    if (!login.trim() || !password) {
      Alert.alert("Missing info", "Enter your email/username and password.");
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.login({ login: login.trim(), password });
      // An account with TOTP on gets no token here - just a challenge to
      // exchange for one. Switches this screen to the code step below.
      const twoFactor = res as unknown as { two_factor_required?: boolean; data?: { challenge?: string } };
      if (twoFactor.two_factor_required && twoFactor.data?.challenge) {
        setChallenge(twoFactor.data.challenge);
        setCode("");
        setUseRecovery(false);
        return;
      }
      await signIn(res.data.token, res.data.user);
    } catch (e) {
      if (fromError(e)) return;
      Alert.alert("Login failed", apiErrorMessage(e, "Please check your credentials and try again."));
    } finally {
      setLoading(false);
    }
  }

  /** Second step: exchange the challenge + code for a real session. */
  async function submitTwoFactor() {
    const value = code.trim();
    if (!value) {
      Alert.alert("Missing code", useRecovery ? "Enter one of your recovery codes." : "Enter the 6-digit code from your authenticator app.");
      return;
    }
    if (!challenge) return;
    setLoading(true);
    try {
      const res = await authApi.twoFactorChallenge(
        useRecovery ? { challenge, recovery_code: value } : { challenge, code: value },
      );
      await signIn(res.data.token, res.data.user);
    } catch (e) {
      if (fromError(e)) return;
      const msg = apiErrorMessage(e, "That code wasn't right. Please try again.");
      // The server discards the challenge after 5 wrong codes, or when it
      // expires - retrying then can only fail, so send them back to the
      // password step rather than leaving them stuck on a dead challenge.
      const dead = /expired|no longer valid|log in again/i.test(msg);
      Alert.alert(dead ? "Sign-in expired" : "Incorrect code", msg);
      if (dead) {
        setChallenge(null);
        setCode("");
        setPassword("");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      <AuthClose onPress={() => navigation.popToTop()} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        {/* Back (one step) - the ✕ above closes the whole flow */}
        <View style={styles.topBar}>
          {/* On the two-factor step this steps back to the password rather than
              leaving the screen, which would silently abandon the challenge. */}
          <Pressable
            onPress={() => {
              if (challenge) {
                setChallenge(null);
                setCode("");
                setUseRecovery(false);
                setPassword("");
                return;
              }
              navigation.goBack();
            }}
            hitSlop={12}
            style={styles.backBtn}
          >
            <ChevronLeft size={24} color={colors.text} strokeWidth={2} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoWrap}><Logo /></View>

          <Text style={styles.title}>{challenge ? "Two-factor authentication" : "Log in"}</Text>
          <Text style={styles.subtitle}>
            {challenge
              ? (useRecovery
                  ? "Enter one of the recovery codes you saved when you turned on two-factor."
                  : "Enter the 6-digit code from your authenticator app.")
              : params?.expired
                ? "Your saved session expired - enter your password to continue."
                : "Enter your details to continue"}
          </Text>

          {challenge ? (
            /* ── Two-factor step ── */
            <View style={styles.form}>
              <View style={styles.field}>
                <Ionicons
                  name={useRecovery ? "key-outline" : "shield-checkmark-outline"}
                  size={20} color={colors.textFaint} style={styles.fieldIcon}
                />
                <TextInput
                  style={[styles.input, !useRecovery && styles.codeInput]}
                  value={code}
                  onChangeText={setCode}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  // A TOTP code is digits; a recovery code is not, so only the
                  // former gets the number pad and the 6-character cap.
                  keyboardType={useRecovery ? "default" : "number-pad"}
                  maxLength={useRecovery ? 40 : 6}
                  // Lets iOS offer the code straight from the Messages/
                  // authenticator autofill bar instead of making them switch apps.
                  textContentType={useRecovery ? "none" : "oneTimeCode"}
                  placeholder={useRecovery ? "Recovery code" : "6-digit code"}
                  placeholderTextColor={colors.textFaint}
                  returnKeyType="go"
                  onSubmitEditing={submitTwoFactor}
                />
              </View>

              {rateLimit && <RateLimitBox rateLimit={rateLimit} />}

              <Button label="Verify" loading={loading} disabled={!!rateLimit} onPress={submitTwoFactor} style={styles.loginBtn} />

              <Pressable
                onPress={() => { setUseRecovery((v) => !v); setCode(""); }}
                hitSlop={8}
                style={styles.twoFaAlt}
              >
                <Text style={styles.forgot}>
                  {useRecovery ? "Use my authenticator app instead" : "Lost your device? Use a recovery code"}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => { setChallenge(null); setCode(""); setUseRecovery(false); setPassword(""); }}
                hitSlop={8}
                style={styles.twoFaAlt}
              >
                <Text style={styles.forgot}>Back to login</Text>
              </Pressable>
            </View>
          ) : (
          <View style={styles.form}>
            {/* Email or username */}
            <View style={styles.field}>
              <Ionicons name="person-outline" size={20} color={colors.textFaint} style={styles.fieldIcon} />
              <TextInput
                style={styles.input}
                value={login}
                onChangeText={setLogin}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="default"
                textContentType="username"
                placeholder="Email or username"
                placeholderTextColor={colors.textFaint}
                returnKeyType="next"
                maxLength={40}
              />
            </View>

            {/* Password */}
            <View style={styles.field}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.textFaint} style={styles.fieldIcon} />
              <TextInput
                style={[styles.input, { paddingRight: 44 }]}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPass}
                placeholder="Password"
                placeholderTextColor={colors.textFaint}
                returnKeyType="go"
                onSubmitEditing={submit}
              />
              <Pressable onPress={() => setShowPass((v) => !v)} hitSlop={10} style={styles.eyeBtn}>
                <Ionicons name={showPass ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textFaint} />
              </Pressable>
            </View>

            <Pressable onPress={forgotPassword} hitSlop={8} style={styles.forgotWrap}>
              <Text style={styles.forgot}>Forgot password?</Text>
            </Pressable>

            {rateLimit && <RateLimitBox rateLimit={rateLimit} />}
            {loginRestriction && (
              <CountryRestrictionBanner country={loginRestriction.country} reason={loginRestriction.reason} />
            )}

            <Button
              label={loginRestriction ? "Login unavailable in your country" : "Log in"}
              loading={loading} disabled={!!rateLimit || !!loginRestriction} onPress={submit} style={styles.loginBtn}
            />
          </View>
          )}

          <View style={{ flex: 1 }} />

          <View style={styles.footer}>
            <LegalNote />
            <EmailInfoRow text="Your email is used for account access and security." />
          </View>
        </ScrollView>

        <BottomLink prompt="Don't have an account?" action="Sign up" onPress={() => navigation.replace("EmailSignup")} />
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

  form: { marginTop: spacing.xxl, gap: spacing.lg },
  field: {
    flexDirection: "row", alignItems: "center",
    height: 58, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.borderStrong,
    backgroundColor: colors.white, paddingHorizontal: spacing.lg,
  },
  fieldIcon: { marginRight: spacing.md },
  input: { flex: 1, fontSize: font.md, color: colors.text, height: "100%" },
  eyeBtn: { position: "absolute", right: spacing.lg, height: "100%", justifyContent: "center" },

  forgotWrap: { alignSelf: "flex-end", marginTop: -spacing.xs },
  forgot: { fontSize: 15, fontWeight: "600", color: colors.textSecondary },

  /* Two-factor step. Centred rather than right-aligned like "Forgot password?"
     - these are the only actions on that step, not a footnote to a form. */
  twoFaAlt: { alignSelf: "center" },
  /* Six digits read as a code, not prose: spaced and centred so a mistyped
     digit is easy to spot before submitting. */
  codeInput: { letterSpacing: 8, fontSize: 22, fontWeight: "700", textAlign: "center" },

  footer: { gap: spacing.lg, marginTop: spacing.lg },

  loginBtn: {
    height: 56, borderRadius: radius.lg, marginTop: spacing.md,
    // Soft red glow to match the mockup.
    shadowColor: colors.brand, shadowOpacity: 0.4, shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
});
