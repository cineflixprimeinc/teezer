import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Cake, CalendarDays, Sparkles } from "lucide-react-native";
import { StatusBar } from "expo-status-bar";
import { Screen } from "@/components/Screen";
import { DatePickerModal } from "@/components/DatePickerModal";
import { profileApi } from "@/api/profile.api";
import { apiErrorMessage } from "@/api/client";
import { useAuthStore } from "@/store/auth.store";
import { formatDateLong } from "@/utils/date-format";

/**
 * Profile completion for an account social sign-in just created.
 *
 * Google / Facebook / Apple / TikTok give us an email and sometimes a name, so
 * the server invents a username and leaves the birthday empty. These three
 * steps replace those guesses before the account reaches the feed. Email signup
 * already collects all of it and never comes here - the server decides, via
 * needs_social_onboarding.
 *
 * Colours and metrics are lifted from the supplied design rather than the app's
 * usual tokens, which is deliberate: this flow was designed as its own thing
 * (#F5074D, not the app's #fe2c55) and matching the design was the request.
 * Anything the design left unspecified falls back to app conventions.
 */

/* Design palette - see the note above on why these are literals. */
const C = {
  accent: "#F5074D",
  ink: "#121014",
  muted: "#6E6979",
  faint: "#8A8592",
  hint: "#B6B1BE",
  placeholder: "#C7C2CE",
  line: "#E4E0E8",
  lineSoft: "#F4E3E8",
  field: "#F7F6F8",
  chip: "#F4F2F5",
  ctaOff: "#F1EFF3",
  good: "#1F9D6B",
  goodBg: "#EAF6F0",
  bad: "#E23B4E",
  badBg: "#FDECEE",
  blob: "#FDECF1",
  white: "#fff",
};

/* Limits match EmailSignupScreen, so the two signup routes agree on what a name
 * and a username are. The server is looser (100 / 50) and never rejects
 * something these allow. The design's chips said "3-24"; 25 is what this app
 * has always used, and a UI must not promise a rule the server does not keep. */
const NAME_MAX = 20;
const USERNAME_MAX = 25;
const USERNAME_MIN = 3;
/** Mirrors the server's regex exactly (ProfileController::checkUsername). */
const USERNAME_RE = /^[a-zA-Z0-9._]+$/;
const MIN_AGE = 13;

type Step = 1 | 2 | 3;
type Avail = "idle" | "checking" | "free" | "taken" | "error";

function ageFrom(iso: string): number {
  const d = new Date(iso);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

/**
 * Rendered only once a birthday has been picked - which is exactly when this
 * screen was crashing. toLocaleDateString with an options object is not safe
 * on Hermes/iOS (see utils/date-format), and an unhandled throw here is fatal
 * in a release build.
 */
function prettyDate(iso: string): string {
  return formatDateLong(iso);
}

/** The step dots + connecting lines from the design's header. */
function Dots({ step }: { step: Step }) {
  return (
    <View style={styles.dots} pointerEvents="none">
      {[1, 2, 3].map((n) => (
        <View key={n} style={styles.dotWrap}>
          <View style={[styles.dot, n <= step && styles.dotOn, n < step && styles.dotFilled]} />
          {n < 3 && <View style={[styles.line, n < step && styles.lineOn]} />}
        </View>
      ))}
    </View>
  );
}

/** The small icon + message under a field. Tone drives both colours. */
function Note({ tone, text }: { tone: "muted" | "good" | "bad"; text: string }) {
  const icon = tone === "good" ? "checkmark" : tone === "bad" ? "alert-circle-outline" : "lock-closed-outline";
  const color = tone === "good" ? C.good : tone === "bad" ? C.bad : C.hint;
  const bg = tone === "good" ? C.goodBg : tone === "bad" ? C.badBg : C.chip;
  return (
    <View style={styles.noteRow}>
      <View style={[styles.noteTile, { backgroundColor: bg }]}>
        <Ionicons name={icon as never} size={13} color={color} />
      </View>
      <Text style={[styles.noteTxt, tone === "good" && { color: C.good }, tone === "bad" && { color: C.bad }]}>
        {text}
      </Text>
    </View>
  );
}

function FooterNote({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.footerNote}>
      <View style={styles.footerTile}><Ionicons name={icon as never} size={15} color={C.faint} /></View>
      <Text style={styles.footerTxt}>{text}</Text>
    </View>
  );
}

export function SocialOnboardingScreen() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [step, setStep] = useState<Step>(1);

  /* Step 1 - birthday */
  const [dob, setDob] = useState("");
  const [dobOpen, setDobOpen] = useState(false);

  /* Step 2 - name. Pre-filled from the provider when it gave one, and freely
     editable: providers hand back legal names, display names, or an email
     local-part, and only the person knows which they want shown. */
  const [name, setName] = useState(user?.name ?? "");
  const [nameTouched, setNameTouched] = useState(false);

  /* Step 3 - username. NOT pre-filled from user.username: that value was
     invented by the server from the provider's email, and offering it as a
     suggestion invites people to keep a handle they never chose. */
  const [username, setUsername] = useState("");
  const [avail, setAvail] = useState<Avail>("idle");
  const [availMsg, setAvailMsg] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  /* ── validation ── */
  const age = dob ? ageFrom(dob) : null;
  const dobOk = !!dob && age !== null && age >= MIN_AGE;
  const dobErr = !!dob && age !== null && age < MIN_AGE ? `You need to be at least ${MIN_AGE} to use Teezer.` : "";

  // Two characters, not two words. The design asked for a surname, but a
  // required last name locks out everyone who has only one - common in Nepal,
  // where most of this app's users are - and the server asks for min:2 only.
  const trimmedName = name.trim();
  const nameOk = trimmedName.length >= 2;

  const uClean = username.trim();
  const uLenOk = uClean.length >= USERNAME_MIN && uClean.length <= USERNAME_MAX;
  const uCharsOk = uClean.length > 0 && USERNAME_RE.test(uClean);
  const uShapeOk = uLenOk && uCharsOk;
  const userOk = uShapeOk && avail === "free";

  /* ── username availability, debounced ── */
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!uShapeOk) { setAvail("idle"); setAvailMsg(""); return; }

    setAvail("checking");
    setAvailMsg("Checking availability…");
    debounce.current = setTimeout(async () => {
      try {
        const res = await profileApi.checkUsername(uClean);
        // The field may have moved on while the request was in flight; a stale
        // answer must not paint a verdict for a name no longer on screen.
        if (uClean !== username.trim()) return;
        setAvail(res.available ? "free" : "taken");
        setAvailMsg(res.available ? `@${uClean} is available.` : (res.reason || `@${uClean} is already taken.`));
      } catch (e) {
        if (uClean !== username.trim()) return;
        // Never show "available" for a check that failed - that would let
        // someone reach Finish and be rejected by the server instead.
        setAvail("error");
        setAvailMsg(apiErrorMessage(e, "Couldn't check that username. Tap to retry."));
      }
    }, 600);

    return () => { if (debounce.current) clearTimeout(debounce.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uClean, uShapeOk]);

  /* ── finish ── */
  async function finish() {
    if (!userOk || saving) return;
    setSaving(true);
    setSaveErr("");
    try {
      const res = await profileApi.completeOnboarding({
        name: trimmedName,
        username: uClean,
        date_of_birth: dob,
      });
      // The server returns the refreshed user with needs_social_onboarding now
      // false. Writing it back is what dismisses this screen: RootNavigator
      // renders the flow off that flag, so no navigation call is needed and
      // there is no window where the app is authenticated but still showing it.
      setUser(res.data);
    } catch (e) {
      setSaving(false);
      const msg = apiErrorMessage(e, "Couldn't save your profile. Please try again.");
      setSaveErr(msg);
      // A username lost in the race gets the user back to the field that needs
      // fixing, with everything else still entered.
      if (/username/i.test(msg)) { setAvail("taken"); setAvailMsg(msg); }
    }
  }

  const canContinue = step === 1 ? dobOk : step === 2 ? nameOk : userOk && !saving;

  function onCta() {
    if (step === 1 && dobOk) return setStep(2);
    if (step === 2 && nameOk) return setStep(3);
    if (step === 3) return void finish();
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        {/* Header: back + progress. No close button - the design has none, and
            the account cannot be used until this is done. */}
        <View style={styles.header}>
          <Pressable
            onPress={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}
            disabled={step === 1}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Go back one step"
            style={[styles.backBtn, step === 1 && styles.backBtnOff]}
          >
            <Ionicons name="chevron-back" size={17} color={C.ink} />
          </Pressable>
          <Dots step={step} />
        </View>

        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ───────────── STEP 1 · BIRTHDAY ───────────── */}
          {step === 1 && (
            <View>
              <View style={styles.headRow}>
                <Text style={styles.title}>When&apos;s your birthday?</Text>
                <View style={styles.mark}>
                  <View style={styles.markBlob} />
                  <Sparkles size={13} color={C.accent} style={{ position: "absolute", top: 4, left: -2 }} />
                  <View style={[styles.spark, { top: 10, right: 6, width: 7, height: 7 }]} />
                  <View style={[styles.spark, { bottom: 16, left: 8, width: 6, height: 6 }]} />
                  <Sparkles size={11} color={C.accent} style={{ position: "absolute", bottom: 6, right: -2 }} />
                  <Cake size={38} color={C.ink} strokeWidth={1.8} />
                </View>
              </View>
              <Text style={styles.blurb}>
                Enter your own age. Once you confirm, you can&apos;t edit it for a long time. This won&apos;t be shown publicly.
              </Text>

              <Text style={styles.fieldLabel}>Birthday</Text>
              <Pressable
                onPress={() => setDobOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={dob ? `Birthday ${prettyDate(dob)}. Change it` : "Select your birthdate"}
                style={styles.dobField}
              >
                <Text style={[styles.dobTxt, !!dob && { color: C.ink }]} numberOfLines={1}>
                  {dob ? prettyDate(dob) : "Select your birthdate"}
                </Text>
                <CalendarDays size={19} color={C.accent} strokeWidth={1.9} />
              </Pressable>

              {!!dobErr && <Note tone="bad" text={dobErr} />}
              {dobOk && <Note tone="good" text={`You're ${age} — you're good to go`} />}
            </View>
          )}

          {/* ───────────── STEP 2 · FULL NAME ───────────── */}
          {step === 2 && (
            <View>
              <View style={styles.headRowSmall}>
                <View style={{ flex: 1, minWidth: 0, gap: 9 }}>
                  <Text style={styles.titleSmall}>What should we call you?</Text>
                  <Text style={styles.blurbSmall}>
                    This is your display name, shown across Teezer. You can change it any time from your profile.
                  </Text>
                </View>
                <View style={styles.markSmall}>
                  <Ionicons name="person-outline" size={34} color={C.ink} />
                </View>
              </View>

              <Text style={styles.smallLabel}>FULL NAME</Text>
              <View style={[styles.fieldWrap, nameOk && styles.fieldOk, nameTouched && !nameOk && styles.fieldBad]}>
                <TextInput
                  value={name}
                  onChangeText={(v) => { setName(v); setNameTouched(true); }}
                  placeholder="Your name"
                  placeholderTextColor={C.placeholder}
                  autoCapitalize="words"
                  maxLength={NAME_MAX}
                  returnKeyType="next"
                  onSubmitEditing={onCta}
                  accessibilityLabel="Full name"
                  style={styles.input}
                />
                {nameOk && <Ionicons name="checkmark" size={16} color={C.good} />}
              </View>

              {nameTouched && !nameOk
                ? <Note tone="bad" text="Enter at least 2 characters." />
                : nameOk
                  ? <Note tone="good" text={user?.name && name === user.name ? "Pre-filled from your account — edit freely" : "Looks good"} />
                  : <Note tone="muted" text="Shown on your profile" />}

              <FooterNote icon="information-circle-outline" text="Your name helps friends recognize you — it's separate from your @username." />
            </View>
          )}

          {/* ───────────── STEP 3 · USERNAME ───────────── */}
          {step === 3 && (
            <View>
              <View style={styles.headRowSmall}>
                <View style={{ flex: 1, minWidth: 0, gap: 9 }}>
                  <Text style={styles.titleSmall}>Pick your username</Text>
                  <Text style={styles.blurbSmall}>
                    This is how people find and mention you. Letters, numbers, dots and underscores only.
                  </Text>
                </View>
                <View style={styles.markSmall}>
                  <Ionicons name="at-outline" size={34} color={C.ink} />
                </View>
              </View>

              <Text style={styles.smallLabel}>USERNAME</Text>
              <View style={[styles.fieldWrap, avail === "free" && styles.fieldOk, (avail === "taken" || (!!uClean && !uShapeOk)) && styles.fieldBad]}>
                <Text style={styles.atSign}>@</Text>
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  placeholder="yourname"
                  placeholderTextColor={C.placeholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={USERNAME_MAX}
                  returnKeyType="done"
                  onSubmitEditing={onCta}
                  accessibilityLabel="Username"
                  style={styles.input}
                />
                {avail === "checking" && <ActivityIndicator size="small" color={C.accent} />}
                {avail === "free" && <Ionicons name="checkmark" size={17} color={C.good} />}
                {avail === "taken" && <Ionicons name="close" size={17} color={C.bad} />}
              </View>

              {!!uClean && !uLenOk && <Note tone="bad" text={`Usernames are ${USERNAME_MIN}–${USERNAME_MAX} characters.`} />}
              {!!uClean && uLenOk && !uCharsOk && <Note tone="bad" text="Only letters, numbers, . and _ allowed." />}
              {uShapeOk && avail === "checking" && <Note tone="muted" text={availMsg} />}
              {uShapeOk && avail === "free" && <Note tone="good" text={availMsg} />}
              {uShapeOk && avail === "taken" && <Note tone="bad" text={availMsg} />}
              {uShapeOk && avail === "error" && (
                <Pressable onPress={() => setUsername((v) => v)} accessibilityRole="button">
                  <Note tone="bad" text={availMsg} />
                </Pressable>
              )}

              {/* Alternatives when the name is gone - saves retyping from scratch. */}
              {avail === "taken" && (
                <View style={styles.chipRow}>
                  {[`${uClean}.np`, `${uClean}_26`, `${uClean}.official`]
                    .filter((s) => s.length <= USERNAME_MAX)
                    .map((s) => (
                      <Pressable key={s} onPress={() => setUsername(s)} style={styles.chip} accessibilityRole="button">
                        <Text style={styles.chipTxt}>@{s}</Text>
                      </Pressable>
                    ))}
                </View>
              )}

              {/* Only rules the SERVER actually enforces. The design listed
                  "no . or _ at the ends"; nothing on the server checks that, and
                  showing it would block usernames the API would happily take. */}
              <View style={styles.chipRow}>
                {[
                  { label: `${USERNAME_MIN}–${USERNAME_MAX} characters`, ok: uLenOk },
                  { label: "a–z 0–9 . _", ok: uCharsOk },
                  { label: "not already taken", ok: avail === "free" },
                ].map((r) => (
                  <View key={r.label} style={[styles.ruleChip, r.ok && styles.ruleChipOk]}>
                    <Text style={[styles.ruleTxt, r.ok && styles.ruleTxtOk]}>{r.label}</Text>
                  </View>
                ))}
              </View>

              <FooterNote icon="lock-closed-outline" text="Your username is public and searchable. Pick one you'll want to keep." />
              {!!saveErr && <Note tone="bad" text={saveErr} />}
            </View>
          )}

          <Pressable
            onPress={onCta}
            disabled={!canContinue}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canContinue, busy: saving }}
            style={[styles.cta, canContinue && styles.ctaReady]}
          >
            {saving
              ? <ActivityIndicator size="small" color={C.white} />
              : <Text style={[styles.ctaTxt, canContinue && { color: C.white }]}>{step === 3 ? "Finish" : "Continue"}</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <DatePickerModal
        visible={dobOpen}
        value={dob}
        onConfirm={(iso) => setDob(iso)}
        onClose={() => setDobOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 22, paddingTop: 8, height: 44, flexDirection: "row", alignItems: "center" },
  backBtn: { width: 36, height: 36, borderRadius: 999, backgroundColor: C.chip, alignItems: "center", justifyContent: "center" },
  backBtnOff: { opacity: 0.3 },

  dots: { position: "absolute", left: 0, right: 0, height: 44, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  dotWrap: { flexDirection: "row", alignItems: "center" },
  dot: { width: 14, height: 14, borderRadius: 999, borderWidth: 2.5, borderColor: C.line, backgroundColor: C.white },
  dotOn: { borderColor: C.accent },
  dotFilled: { backgroundColor: C.accent },
  line: { width: 44, height: 2, backgroundColor: C.line },
  lineOn: { backgroundColor: C.accent },

  body: { paddingHorizontal: 22, paddingBottom: 32, flexGrow: 1 },

  headRow: { flexDirection: "row", gap: 10, paddingTop: 26 },
  headRowSmall: { flexDirection: "row", gap: 10, paddingTop: 22 },
  title: { flex: 1.3, fontSize: 32, fontWeight: "800", letterSpacing: -0.9, color: C.ink, lineHeight: 37 },
  titleSmall: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5, color: C.ink, lineHeight: 27 },
  blurb: { fontSize: 14, color: C.muted, lineHeight: 22, paddingTop: 14 },
  blurbSmall: { fontSize: 13, color: C.faint, lineHeight: 20 },

  mark: { width: 64, height: 64, alignItems: "center", justifyContent: "center" },
  markSmall: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },
  markBlob: { position: "absolute", width: 96, height: 96, borderRadius: 999, backgroundColor: C.blob },
  spark: { position: "absolute", borderRadius: 999, backgroundColor: C.accent },

  fieldLabel: { fontSize: 15, fontWeight: "700", color: C.ink, paddingTop: 34 },
  smallLabel: { fontSize: 10.5, fontWeight: "800", letterSpacing: 1.15, color: C.hint, paddingTop: 22 },

  dobField: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 11, height: 56,
    paddingHorizontal: 18, borderWidth: 1.5, borderColor: C.lineSoft, borderRadius: 15, backgroundColor: C.white,
  },
  dobTxt: { flex: 1, fontSize: 15, fontWeight: "600", color: C.placeholder },

  fieldWrap: {
    flexDirection: "row", alignItems: "center", gap: 9, height: 56, paddingHorizontal: 18,
    borderRadius: 17, backgroundColor: C.field, borderWidth: 1.5, borderColor: "transparent", marginTop: 6,
  },
  fieldOk: { borderColor: C.line },
  fieldBad: { backgroundColor: "#FFF6F7", borderColor: "#F3B7BF" },
  input: { flex: 1, fontSize: 17, fontWeight: "600", color: C.ink, letterSpacing: -0.3, padding: 0 },
  atSign: { fontSize: 17, fontWeight: "700", color: C.placeholder },

  noteRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 12 },
  noteTile: { width: 22, height: 22, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  noteTxt: { flex: 1, fontSize: 12.5, fontWeight: "600", color: C.faint, lineHeight: 18 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 },
  chip: { borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: C.chip },
  chipTxt: { fontSize: 12.5, fontWeight: "700", color: C.ink },
  ruleChip: { borderRadius: 999, paddingVertical: 7, paddingHorizontal: 11, backgroundColor: C.field },
  ruleChipOk: { backgroundColor: C.goodBg },
  ruleTxt: { fontSize: 11, fontWeight: "700", color: C.hint },
  ruleTxtOk: { color: "#1F7A5A" },

  footerNote: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 14, backgroundColor: C.field, marginTop: 16 },
  footerTile: { width: 28, height: 28, borderRadius: 9, backgroundColor: C.white, alignItems: "center", justifyContent: "center" },
  footerTxt: { flex: 1, fontSize: 12, fontWeight: "600", color: C.muted, lineHeight: 17 },

  cta: {
    height: 56, borderRadius: 999, alignItems: "center", justifyContent: "center",
    backgroundColor: C.ctaOff, marginTop: 16,
  },
  ctaReady: {
    backgroundColor: C.accent,
    shadowColor: C.accent, shadowOpacity: 0.26, shadowRadius: 13, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  ctaTxt: { fontSize: 16, fontWeight: "800", letterSpacing: -0.3, color: C.placeholder },
});
