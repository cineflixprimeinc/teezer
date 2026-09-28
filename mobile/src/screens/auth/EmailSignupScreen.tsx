import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ChevronLeft } from "lucide-react-native";
import { StatusBar } from "expo-status-bar";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Screen } from "@/components/Screen";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/Button";
import { BottomLink, LegalNote, EmailInfoRow, MarketingCheckbox, AuthClose } from "@/components/AuthParts";
import { AuthField, EyeToggle } from "@/components/AuthField";
import { PickerField } from "@/components/PickerField";
import { CountryPickerModal } from "@/components/CountryPickerModal";
import { DatePickerModal } from "@/components/DatePickerModal";
import { OtpInput } from "@/components/OtpInput";
import { RateLimitBox, useRateLimit } from "@/components/RateLimitBox";
import { CountryRestrictionBanner } from "@/components/CountryRestrictionBanner";
import { authApi } from "@/api/auth.api";
import { apiErrorMessage } from "@/api/client";
import { useAuthStore } from "@/store/auth.store";
import { countryFlag } from "@/constants/countries";
import { colors } from "@/constants/colors";
import { spacing, font } from "@/constants/theme";
import type { AuthStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<AuthStackParamList, "EmailSignup">;
type Step = 1 | 2 | 3;
type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const RESEND_SECONDS = 60;

function formatDob(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}`;
}
function isValidEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}
function mmss(total: number) {
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Email signup flow (3 steps), wired to the same Laravel backend the website
 * uses: send-otp → verify-otp → register. The OTP email is delivered by the
 * server's existing SignupOtpMail/SMTP, and the account is created in the shared
 * users table - so an account made here logs in on both web and mobile.
 */
export function EmailSignupScreen({ navigation }: Props) {
  const signIn = useAuthStore((s) => s.signIn);

  const [step, setStep] = useState<Step>(1);

  // ── Step 1 fields ──
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [country, setCountry] = useState<{ name: string; code: string } | null>(null);

  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [usernameMsg, setUsernameMsg] = useState("");
  const usernameDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showDob, setShowDob] = useState(false);
  const [showCountry, setShowCountry] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Step 2 (OTP) ──
  const [draftToken, setDraftToken] = useState("");
  const [otp, setOtp] = useState("");
  const [resend, setResend] = useState(0);

  const [marketingOptIn, setMarketingOptIn] = useState(false);

  // ── Step 3 (password) ──
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const { rateLimit, fromError } = useRateLimit();

  /** UX signal only - ApiAuthController::register() re-checks independently
   *  at submit time (see CountryAvailabilityService's docblock). */
  const [signupRestriction, setSignupRestriction] = useState<{ country: string; reason: string } | null>(null);
  /** Every disabled country's code, for the picker (restricted entries stay
   *  visible but disabled rather than hidden). */
  const [disabledCountryCodes, setDisabledCountryCodes] = useState<Set<string>>(new Set());
  /** The full country list, from the SAME fetch as disabledCountryCodes -
   *  the backend-authoritative dataset (IsoCountries::map(), 247 codes),
   *  same source the admin panel's Country Availability page reads from.
   *  Passed to CountryPickerModal so signup and admin can never drift onto
   *  two different lists again. Starts null (the picker falls back to its
   *  own default COUNTRIES list) until this resolves, so a slow/failed
   *  fetch never blocks signup. */
  const [backendCountries, setBackendCountries] = useState<{ name: string; code: string }[] | null>(null);
  /** "Allow Manual Country Change" admin setting - defaults to true (today's
   *  behavior) until detectCountry() resolves. UX only; the backend always
   *  evaluates the detected country regardless of this. */
  const [allowManualCountryChange, setAllowManualCountryChange] = useState(true);

  // Pre-fill country from IP (same endpoint the website uses). Non-blocking.
  useEffect(() => {
    let active = true;
    authApi.detectCountry()
      .then((d) => {
        if (!active) return;
        if (d?.countryCode && d?.countryName) setCountry((c) => c ?? { name: d.countryName, code: d.countryCode });
        if (d && !d.signupAllowed) {
          setSignupRestriction({ country: d.countryName, reason: d.signupReason || "Teezer is currently unavailable in your country." });
        }
        if (d) setAllowManualCountryChange(d.allowManualCountryChange);
      })
      .catch(() => {});
    authApi.countryAvailabilityList()
      .then((list) => {
        if (!active) return;
        setDisabledCountryCodes(new Set(list.countries.filter((c) => !c.enabled).map((c) => c.code)));
        setBackendCountries(list.countries.map((c) => ({ name: c.name, code: c.code })));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Resend countdown.
  useEffect(() => {
    if (!resend) return;
    const t = setInterval(() => setResend((n) => (n > 0 ? n - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [resend]);

  /* ── Username availability (debounced) ── */
  function onUsernameChange(raw: string) {
    const val = raw.replace(/\s/g, "").toLowerCase();
    setUsername(val);
    setUsernameStatus("idle");
    setUsernameMsg("");
    if (usernameDebounce.current) clearTimeout(usernameDebounce.current);
    if (!val) return;
    if (!/^[a-zA-Z0-9_.]+$/.test(val)) { setUsernameStatus("invalid"); setUsernameMsg("Only letters, numbers, underscore and dot."); return; }
    if (val.length < 3) { setUsernameStatus("invalid"); setUsernameMsg("Must be at least 3 characters."); return; }
    if (val.length > 25) { setUsernameStatus("invalid"); setUsernameMsg("Cannot exceed 25 characters."); return; }
    setUsernameStatus("checking");
    usernameDebounce.current = setTimeout(async () => {
      try {
        const res = await authApi.checkUsername(val);
        setUsernameStatus(res.available ? "available" : "taken");
        setUsernameMsg(res.message);
      } catch { setUsernameStatus("idle"); setUsernameMsg(""); }
    }, 500);
  }

  function validateStep1(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Full name is required.";
    if (!username.trim()) e.username = "Username is required.";
    else if (usernameStatus === "taken") e.username = "Username already taken.";
    else if (usernameStatus === "invalid") e.username = usernameMsg;
    else if (usernameStatus === "checking") e.username = "Checking username…";
    if (!email.trim()) e.email = "Email is required.";
    else if (!isValidEmail(email)) e.email = "Enter a valid email.";
    if (!dob) e.dob = "Date of birth is required.";
    if (!country) e.country = "Please select your country.";
    return e;
  }

  /* ── Step 1 → send OTP ── */
  async function handleNext() {
    const e = validateStep1();
    setErrors(e);
    if (Object.keys(e).length) return;
    setLoading(true);
    try {
      const res = await authApi.sendOtp({
        email: email.trim(),
        name: name.trim(),
        username: username.trim(),
        date_of_birth: dob,
        country: country!.name,
        country_code: country!.code,
      });
      setDraftToken(res.draft_token);
      setOtp("");
      setResend(RESEND_SECONDS);
      setStep(2);
    } catch (err) {
      if (fromError(err)) return;
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
      if (code === "EMAIL_TAKEN") {
        setErrors((p) => ({ ...p, email: "This email is already registered. Please log in." }));
        setStep(1);
      } else {
        Alert.alert("Couldn't send code", apiErrorMessage(err, "Please try again."));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resend > 0 || loading) return;
    setLoading(true);
    try {
      const res = await authApi.sendOtp({
        email: email.trim(),
        name: name.trim(),
        username: username.trim(),
        date_of_birth: dob,
        country: country!.name,
        country_code: country!.code,
      });
      setDraftToken(res.draft_token);
      setOtp("");
      setResend(RESEND_SECONDS);
    } catch (err) {
      if (fromError(err)) return;
      Alert.alert("Couldn't resend code", apiErrorMessage(err, "Please try again."));
    } finally {
      setLoading(false);
    }
  }

  /* ── Step 2 → verify OTP ── */
  async function handleVerify() {
    if (otp.replace(/\D/g, "").length < 6) {
      setErrors({ otp: "Enter the full 6-digit code." });
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.verifyOtp({ email: email.trim(), otp: otp.replace(/\D/g, ""), draft_token: draftToken });
      setDraftToken(res.draft_token || draftToken);
      setErrors({});
      setStep(3);
    } catch (err) {
      if (fromError(err)) return;
      setErrors({ otp: apiErrorMessage(err, "Invalid or expired code.") });
    } finally {
      setLoading(false);
    }
  }

  /* ── Step 3 → create account ── */
  // Same rules as the website signup/account forms.
  function validatePassword(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!password) e.password = "Password required.";
    else if (password.length < 8 || password.length > 20) e.password = "Password must be 8–20 characters.";
    else if (!/[a-z]/.test(password)) e.password = "Include at least one lowercase letter.";
    else if (!/[A-Z]/.test(password)) e.password = "Include at least one uppercase letter.";
    else if (!/[0-9]/.test(password)) e.password = "Include at least one number.";
    else if (!/[^A-Za-z0-9]/.test(password)) e.password = "Include at least one special character.";
    if (confirm !== password) e.confirm = "Passwords don't match.";
    return e;
  }

  async function handleCreate() {
    const e = validatePassword();
    setErrors(e);
    if (Object.keys(e).length) return;
    if (!draftToken) { Alert.alert("Session expired", "Please verify your email again."); setStep(1); return; }
    setLoading(true);
    try {
      const res = await authApi.register({
        name: name.trim(),
        username: username.trim(),
        email: email.trim(),
        password,
        password_confirmation: confirm,
        date_of_birth: dob,
        country: country!.name,
        country_code: country!.code,
        draft_token: draftToken,
      });
      await signIn(res.data.token, res.data.user);
    } catch (err) {
      if (fromError(err)) return;
      Alert.alert("Couldn't create account", apiErrorMessage(err, "Please try again."));
    } finally {
      setLoading(false);
    }
  }

  /* ── Back behaviour per step ── */
  function onBack() {
    if (step === 1) navigation.goBack();
    else if (step === 2) { setStep(1); setErrors({}); }
    else { setStep(2); setErrors({}); }
  }

  const usernameHelper =
    usernameStatus === "available" ? usernameMsg
    : usernameStatus === "idle" || usernameStatus === "checking" ? "This will be your unique identity on Teezer."
    : undefined;
  const usernameError =
    errors.username ?? (usernameStatus === "taken" || usernameStatus === "invalid" ? usernameMsg : undefined);

  return (
    <Screen edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      <AuthClose onPress={() => navigation.popToTop()} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.topBar}>
          <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
            <ChevronLeft size={24} color={colors.text} strokeWidth={2} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoWrap}><Logo /></View>

          {rateLimit && <View style={styles.rateLimitWrap}><RateLimitBox rateLimit={rateLimit} /></View>}

          {/* ───────────────── STEP 1: Create account ───────────────── */}
          {step === 1 && (
            <>
              <Text style={styles.title}>Create your Teezer account</Text>
              <Text style={styles.subtitle}>Enter your details to get started</Text>

              <View style={styles.form}>
                <AuthField
                  icon="person-outline" placeholder="Full name" value={name}
                  onChangeText={setName} autoCapitalize="words" maxLength={20}
                  error={errors.name}
                />
                <AuthField
                  icon="at-outline" placeholder="Username" value={username}
                  onChangeText={onUsernameChange} autoCapitalize="none" autoCorrect={false} maxLength={25}
                  error={usernameError} helper={usernameHelper}
                  right={
                    usernameStatus === "checking" ? <ActivityIndicator size="small" color={colors.textFaint} />
                    : usernameStatus === "available" ? <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                    : (usernameStatus === "taken" || usernameStatus === "invalid") ? <Ionicons name="alert-circle" size={20} color={colors.brand} />
                    : undefined
                  }
                />
                <AuthField
                  icon="mail-outline" placeholder="email@gmail.com" value={email}
                  onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
                  error={errors.email} maxLength={40}
                />
                <PickerField
                  icon="calendar-outline" placeholder="Date of birth"
                  value={dob ? formatDob(dob) : null} onPress={() => setShowDob(true)} error={errors.dob}
                />
                <PickerField
                  icon="globe-outline" placeholder="Country"
                  value={country?.name} leading={country ? countryFlag(country.code) : undefined}
                  onPress={() => setShowCountry(true)} error={errors.country}
                  disabled={!allowManualCountryChange}
                />

                {signupRestriction && (
                  <CountryRestrictionBanner country={signupRestriction.country} reason={signupRestriction.reason} />
                )}

                <EmailInfoRow text="You'll receive a verification code via email. Your email address may be used for account security and to connect you with others depending on your settings." />
                <MarketingCheckbox value={marketingOptIn} onToggle={() => setMarketingOptIn((v) => !v)} />

                <Button
                  label={signupRestriction ? "Signup unavailable in your country" : "Next"}
                  loading={loading} disabled={!!rateLimit || !!signupRestriction} onPress={handleNext} style={styles.cta}
                />
              </View>
            </>
          )}

          {/* ───────────────── STEP 2: Verify email ───────────────── */}
          {step === 2 && (
            <>
              <Text style={styles.title}>Verify your email</Text>
              <Text style={styles.subtitle}>Enter the 6-digit code sent to your email</Text>

              <View style={styles.form}>
                <View style={styles.emailRow}>
                  <Ionicons name="mail-outline" size={18} color={colors.textMuted} />
                  <Text style={styles.emailText} numberOfLines={1}>{email.trim()}</Text>
                  <Pressable onPress={() => { setStep(1); setErrors({}); }} hitSlop={8}>
                    <Text style={styles.change}>Change</Text>
                  </Pressable>
                </View>

                <OtpInput value={otp} onChange={(v) => { setOtp(v); if (errors.otp) setErrors({}); }} autoFocus />
                {errors.otp ? <Text style={styles.otpError}>{errors.otp}</Text> : null}

                <Text style={styles.resendRow}>
                  Didn't receive the code?{" "}
                  {resend > 0 ? (
                    <Text style={styles.resendMuted}>Resend code ( {mmss(resend)} )</Text>
                  ) : (
                    <Text style={styles.resendActive} onPress={handleResend}>Resend code</Text>
                  )}
                </Text>

                <Button label="Verify & continue" loading={loading} disabled={!!rateLimit} onPress={handleVerify} style={styles.cta} />
              </View>
            </>
          )}

          {/* ───────────────── STEP 3: Set password ───────────────── */}
          {step === 3 && (
            <>
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark" size={30} color={colors.success} />
              </View>
              <Text style={styles.title}>Email verified!</Text>
              <Text style={styles.subtitle}>Set a password to secure your account</Text>

              <View style={styles.form}>
                <AuthField
                  icon="lock-closed-outline" placeholder="Password" value={password}
                  onChangeText={setPassword} secureTextEntry={!showPass} autoCapitalize="none" maxLength={20}
                  error={errors.password}
                  helper={errors.password ? undefined : "8–20 characters with upper & lowercase, a number and a symbol."}
                  right={<EyeToggle visible={showPass} onToggle={() => setShowPass((v) => !v)} />}
                />
                <AuthField
                  icon="lock-closed-outline" placeholder="Confirm password" value={confirm}
                  onChangeText={setConfirm} secureTextEntry={!showConfirm} autoCapitalize="none" maxLength={20}
                  error={errors.confirm}
                  right={<EyeToggle visible={showConfirm} onToggle={() => setShowConfirm((v) => !v)} />}
                />

                <Button
                  label={signupRestriction ? "Signup unavailable in your country" : "Create account"}
                  loading={loading} disabled={!!rateLimit || !!signupRestriction} onPress={handleCreate} style={styles.cta}
                />
              </View>
            </>
          )}
        </ScrollView>

        <View>
          <BottomLink prompt="Already have an account?" action="Log in" onPress={() => navigation.replace("LoginForm")} />
          {step === 1 && (
            <View style={styles.legalFooter}>
              <LegalNote countryName={country?.name} />
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Pickers */}
      <DatePickerModal
        visible={showDob}
        value={dob}
        onConfirm={(iso) => { setDob(iso); setErrors((p) => ({ ...p, dob: "" })); }}
        onClose={() => setShowDob(false)}
      />
      <CountryPickerModal
        visible={showCountry}
        selectedCode={country?.code}
        onSelect={(c) => { setCountry({ name: c.name, code: c.code }); setErrors((p) => ({ ...p, country: "" })); }}
        onClose={() => setShowCountry(false)}
        disabledCodes={disabledCountryCodes}
        countries={backendCountries ?? undefined}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, height: 44, justifyContent: "center" },
  backBtn: { width: 40, height: 40, justifyContent: "center" },

  content: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  logoWrap: { alignItems: "center", marginBottom: spacing.xl },
  rateLimitWrap: { marginBottom: spacing.lg },

  title: { fontSize: 26, fontWeight: "800", color: colors.text, textAlign: "center", letterSpacing: -0.5 },
  subtitle: { marginTop: spacing.sm, fontSize: 15, color: colors.textMuted, textAlign: "center" },

  form: { marginTop: spacing.xl, gap: spacing.lg },
  cta: { height: 56, marginTop: spacing.sm },
  legalFooter: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, marginTop: -spacing.sm },

  // Step 2
  emailRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    height: 56, borderRadius: 14, backgroundColor: colors.bgMuted, paddingHorizontal: spacing.lg,
  },
  emailText: { flex: 1, fontSize: font.md, color: colors.text },
  change: { fontSize: font.sm, fontWeight: "700", color: colors.brand },
  otpError: { marginTop: -spacing.xs, fontSize: font.xs, color: colors.brand, textAlign: "center" },
  resendRow: { textAlign: "center", fontSize: font.sm, color: colors.textMuted },
  resendMuted: { color: colors.textFaint, fontWeight: "600" },
  resendActive: { color: colors.brand, fontWeight: "700" },

  // Step 3
  verifiedBadge: {
    alignSelf: "center", width: 60, height: 60, borderRadius: 30,
    backgroundColor: "#e9f9ef", alignItems: "center", justifyContent: "center", marginBottom: spacing.lg,
  },
});
