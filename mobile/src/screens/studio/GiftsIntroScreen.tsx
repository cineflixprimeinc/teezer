import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronLeft, ChevronRight, HelpCircle, PartyPopper } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { monetizationProgramsApi } from "@/api/monetization-programs.api";
import { featureIcon } from "./feature-icons";
import { REQUIREMENT_FIX, goFixRequirement } from "./requirement-fix";
import { openPolicy } from "@/store/policy.store";
import { useOnboardingStore } from "@/store/onboarding.store";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

/** Device-local one-shot flag (see onboarding.store.ts) gating the "You're
 *  Set Up!" landing below - shown once, the first time this creator is
 *  found active, never again after that on an ordinary visit. */
const SETUP_SEEN_KEY = "gifts.setup-seen";

/**
 * Teezer Studio -> Monetization -> Gifts. Replaces the generic requirements-
 * checklist template (StudioProgrammeScreen) for this one programme, same
 * reasoning and same pattern as "Sell on Teezer" opening SellerApplication-
 * Screen instead of it - see StudioMonetizationSection.tsx's onPress.
 *
 * Gifts needs no application: it is admin-controlled (mode) and unlocks the
 * instant every requirement is met (MonetizationEligibilityService's own
 * design principle - see its docblock), so unlike Sell on Teezer this screen
 * has no wizard/status branching - just the pitch, a live requirements
 * checklist (admin panel -> Monetization Control Center -> Gifts & Coins),
 * and a "Get Started" CTA that only opens up once every requirement is met.
 * The settings toggles, stats and recent-activity list the old template
 * showed are intentionally not reachable from here any more - gifts already
 * work automatically, and the balance/ledger still lives on the Inbox's
 * Gifts & Coins screen (which is exactly where "Get Started" leads once
 * unlocked).
 */

/** The reference design's illustration, same asset-loading convention as
 *  every other pre-made illustration in this folder (shop-creator-pilot-
 *  intro.png etc). */
const GIFTS_INTRO_ILLUSTRATION = require("../../assets/gifts-coins-intro.png");

/** icon is a name from the same curated set the admin panel's picker offers
 *  (feature-icons.ts) - the default bullets are just data in that same
 *  shape, so an admin override (`program.features`) is a drop-in swap. */
const FEATURES = [
  { icon: "Gift", title: "Receive Gifts", desc: "Fans send Coins as gifts on your videos and LIVE streams." },
  { icon: "Wallet", title: "Creator Wallet", desc: "Every gift lands in your wallet in full, the moment it's sent." },
  { icon: "Star", title: "Top Supporter Perks", desc: "Your biggest supporters can earn badges and stand out in comments." },
];

/** Shown only until the real (admin-configured, live-computed) requirements
 *  load - see the `!baseline` filter below, same convention as the Sell on
 *  Teezer intro screen's FALLBACK_REQUIREMENTS. */
const FALLBACK_REQUIREMENTS = ["Verify your email or phone", "Account at least 7 days old", "3 public videos posted"];

const requirementIsOwnToProgram = (r: { baseline: boolean }) => !r.baseline;

export function GiftsIntroScreen() {
  const navigation = useNavigation<any>();

  const hydrated = useOnboardingStore((s) => s.hydrated);
  const setupSeen = useOnboardingStore((s) => !!s.seen[SETUP_SEEN_KEY]);
  const markSetupSeen = useOnboardingStore((s) => s.markSeen);
  useEffect(() => { void useOnboardingStore.getState().hydrate(); }, []);

  /* Brief spinner-in-button before the CTA actually navigates, rather than
   * an instant jump - same pattern requested for Sell on Teezer's CTA. */
  const [starting, setStarting] = useState(false);
  const startTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (startTimer.current) clearTimeout(startTimer.current); }, []);
  const startThen = (go: () => void) => {
    if (starting) return;
    setStarting(true);
    startTimer.current = setTimeout(go, 3000);
  };

  const q = useQuery({ queryKey: ["monetization-programs"], queryFn: monetizationProgramsApi.list });
  const gifts = q.data?.programs.find((p) => p.key === "gifts");
  const live = gifts?.requirements.filter(requirementIsOwnToProgram);

  /* "active" already means exactly "admin has this on AND this creator meets
   * every requirement" (see ProgramStatus's own doc in monetization-
   * programs.api.ts) - the single correct signal to gate the CTA on, rather
   * than re-deriving met-count math here. Until the programme data loads,
   * the button stays disabled rather than optimistically enabled. */
  const active = gifts?.status === "active";

  /* Already saw the one-time "You're Set Up!" landing on an earlier visit -
   * skip straight to the real ledger instead of showing it, or the pitch,
   * again. Only fires once `q` has actually resolved active===true, so a
   * loading/undefined status never triggers a false navigate. */
  const skipToLedger = active && hydrated && setupSeen;
  useEffect(() => {
    if (skipToLedger) navigation.replace("GiftsCoins");
  }, [skipToLedger]); // eslint-disable-line react-hooks/exhaustive-deps

  /* The progress note below the button must count the SAME rows the
   * checklist above shows - not gifts.met_count/total_count, which include
   * the platform-wide baseline checks (two-factor, account age, one account
   * per person...) nobody sees here. Showing "7/10 met" under a 5-row
   * checklist was the actual bug: the admin only configured 5 requirements
   * for this programme, so the note has to count those same 5. */
  const ownMet = live?.filter((r) => r.met).length ?? 0;
  const ownTotal = live?.length ?? 0;
  /* Every visible row can be met and the button can still be disabled - a
   * baseline requirement not shown here (e.g. two-factor) is still blocking
   * it. Naming that honestly beats a "5/5 met" note next to a locked button. */
  const blockedByPlatform = ownTotal > 0 && ownMet === ownTotal && !active;
  /* Which platform-wide checks are actually blocking, by name, each tappable
   * to its real fix (requirement-fix.ts) - the generic sentence this used to
   * be replaced was true but useless: two-factor never appears as a row on
   * this screen (only the programme's own !baseline requirements do), so a
   * creator who had finished everything visible had no way to find out what
   * was actually still wrong, or where to go fix it. */
  const baselineBlockers = blockedByPlatform ? (gifts?.requirements ?? []).filter((r) => r.baseline && !r.met) : [];

  /* Admin-authored pitch content (Admin Panel -> Monetization Control Center
   * -> Gifts & Coins -> Overview -> App Intro Pitch / Feature Bullets). Any
   * of these can be left unset - each falls back to this screen's own
   * default copy independently, so an admin can override just the bullets
   * without having to also write a headline. */
  const displayFeatures = gifts?.features.length ? gifts.features : null;

  /* The default heading is two lines, the second in brand colour. An admin
   * override keeps that same treatment when it also has a line break
   * (typed as a new line in the admin's Title field) - only the LAST line
   * gets the accent, matching the default's own split. A single-line
   * override renders plain, since there is nothing to contrast it against. */
  const heroTitle = gifts?.hero_title || "Earn Real Rewards\nFrom Gifts & Coins";
  const heroBreak = heroTitle.lastIndexOf("\n");
  const heroLead = heroBreak >= 0 ? heroTitle.slice(0, heroBreak + 1) : null;
  const heroAccent = heroBreak >= 0 ? heroTitle.slice(heroBreak + 1) : heroTitle;

  return (
    <Screen edges={["top", "bottom"]} bg={colors.bg}>
      <View style={s.header}>
        <Pressable hitSlop={8} style={s.iconBtn} onPress={() => navigation.goBack()}>
          <ChevronLeft size={24} color={colors.text} strokeWidth={2.2} />
        </Pressable>
        <Text style={s.headerTitle}>Gifts &amp; Coins</Text>
        <Pressable hitSlop={8} style={s.iconBtn} onPress={() => navigation.navigate("GiftsCoinsHelp")} accessibilityRole="button" accessibilityLabel="Help">
          <HelpCircle size={22} color={colors.text} strokeWidth={2} />
        </Pressable>
      </View>

      {q.isLoading || skipToLedger ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.brand} />
      ) : active ? (
        /* Reached only the FIRST time this creator is found active - the
         * `skipToLedger` branch above takes every later visit straight to
         * the real ledger instead. Same "already done" landing pattern as
         * Sell on Teezer's approved state (SellerApplicationScreen). */
        <View style={s.center}>
          <View style={s.successCircle}><PartyPopper size={40} color={colors.white} strokeWidth={2.2} /></View>
          <Text style={s.title}>You&apos;re Set Up!</Text>
          <Text style={s.body}>Gifts &amp; Coins is active on your account - fans can send you gifts right now, credited to your wallet instantly.</Text>
          <Pressable
            disabled={starting}
            style={[s.primaryBtn, { marginTop: spacing.xl, alignSelf: "stretch" }]}
            onPress={() => startThen(() => { markSetupSeen(SETUP_SEEN_KEY); navigation.replace("GiftsCoins", { justSetUp: true }); })}
          >
            {starting
              ? <ActivityIndicator size="small" color={colors.white} />
              : <Text style={s.primaryBtnText}>Open Gifts &amp; Coins</Text>}
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={s.introBody} showsVerticalScrollIndicator={false}>
            <Image source={GIFTS_INTRO_ILLUSTRATION} style={s.illustration} resizeMode="contain" />

            <Text style={s.introTitle}>
              {heroLead}
              {heroBreak >= 0 ? <Text style={s.introTitleAccent}>{heroAccent}</Text> : heroAccent}
            </Text>
            <Text style={s.introSub}>
              {gifts?.hero_description ||
                "Fans send Coins as gifts on your videos and LIVE streams - credited to your wallet the instant they're sent."}
            </Text>

            <View style={s.featureCard}>
              {(displayFeatures ?? FEATURES).map((f, i, arr) => {
                const Icon = featureIcon(f.icon);
                return (
                  <View key={f.title} style={[s.featureRow, i < arr.length - 1 && s.featureRowDivider]}>
                    <View style={s.featureIcon}>
                      <Icon size={20} color={colors.brand} strokeWidth={2.1} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.featureTitle}>{f.title}</Text>
                      <Text style={s.featureDesc}>{f.desc}</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <View style={s.requirements}>
              {(live && live.length > 0 ? live : null)?.map((r) => {
                // Only a pass/fail requirement (not counted, e.g. followers/
                // videos which just grow with activity) with a real settings
                // destination is tappable - see requirement-fix.ts.
                const fixable = !r.met && !r.counted && !!REQUIREMENT_FIX[r.key];
                return (
                  <Pressable
                    key={r.key}
                    style={s.requirementRow}
                    disabled={!fixable}
                    onPress={() => fixable && goFixRequirement(navigation, r.key, r.label)}
                  >
                    <CheckCircle2 size={18} color={r.met ? colors.brand : colors.borderStrong} strokeWidth={2.2} />
                    <Text style={[s.requirementText, !r.met && s.requirementTextPending, { flex: 1 }]}>
                      {r.target ? `${r.label} (${Math.min(r.current, r.target)}/${r.target})` : r.label}
                    </Text>
                    {fixable && <ChevronRight size={16} color={colors.textFaint} />}
                  </Pressable>
                );
              }) ??
                FALLBACK_REQUIREMENTS.map((r) => (
                  <View key={r} style={s.requirementRow}>
                    <CheckCircle2 size={18} color={colors.brand} strokeWidth={2.2} />
                    <Text style={s.requirementText}>{r}</Text>
                  </View>
                ))}
            </View>
          </ScrollView>

          <View style={s.bottomBar}>
            <Pressable
              disabled={!active}
              style={[s.primaryBtn, !active && s.primaryBtnDisabled]}
              onPress={() => navigation.navigate("GiftsCoins")}
            >
              <Text style={[s.primaryBtnText, !active && s.primaryBtnTextDisabled]}>
                {gifts?.cta_label || "Get Started"}
              </Text>
            </Pressable>
            {blockedByPlatform ? (
              <View style={s.platformBlock}>
                <Text style={s.footerNote}>One more thing Teezer requires of every programme:</Text>
                {baselineBlockers.map((b) => {
                  const fix = REQUIREMENT_FIX[b.key];
                  return (
                    <Pressable
                      key={b.key}
                      disabled={!fix}
                      onPress={() => fix && goFixRequirement(navigation, b.key, b.label)}
                      style={s.platformBlockerRow}
                    >
                      <Text style={s.platformBlockerText}>{b.label}</Text>
                      {fix && (
                        <View style={s.platformBlockerAction}>
                          <Text style={s.platformBlockerActionText}>{fix.label}</Text>
                          <ChevronRight size={14} color={colors.brand} />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={s.footerNote}>
                {active
                  ? "Gifts convert to Coins in your wallet instantly - no waiting, no review."
                  : `Complete the requirements above to unlock Gifts & Coins (${ownMet}/${ownTotal} met).`}
              </Text>
            )}
            <Text style={s.agreeNote}>
              By continuing, you agree to Teezer's{" "}
              <Text style={s.agreeLink} onPress={() => openPolicy("terms")}>Terms of Service</Text> and{" "}
              <Text style={s.agreeLink} onPress={() => openPolicy("privacy")}>Privacy Policy</Text>.
            </Text>
          </View>
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, height: 52 },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },

  /* Already-active landing - same shape as SellerApplicationScreen's
   *  "approved" state. */
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  successCircle: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: colors.success,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.lg,
  },
  title: { fontSize: font.xxl, fontWeight: font.weightHeavy, color: colors.text, textAlign: "center" },
  body: { marginTop: spacing.sm, fontSize: font.md, lineHeight: 22, color: colors.textMuted, textAlign: "center" },

  introBody: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg, alignItems: "center" },
  introTitle: { fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text, textAlign: "center", lineHeight: 28 },
  introTitleAccent: { color: colors.brand },
  introSub: { marginTop: spacing.sm, fontSize: font.sm, lineHeight: 20, color: colors.textMuted, textAlign: "center" },

  illustration: { width: "100%", height: 150, marginBottom: spacing.sm },

  featureCard: { alignSelf: "stretch", marginTop: spacing.lg, backgroundColor: colors.bgMuted, borderRadius: radius.lg, paddingHorizontal: spacing.lg },
  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingVertical: spacing.md },
  featureRowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  featureIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center" },
  featureTitle: { fontSize: font.sm, fontWeight: font.weightHeavy, color: colors.text },
  featureDesc: { marginTop: 3, fontSize: font.xs, lineHeight: 16, color: colors.textMuted },

  requirements: { alignSelf: "stretch", marginTop: spacing.lg, gap: spacing.sm },
  requirementRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  requirementText: { fontSize: font.sm, color: colors.textSecondary, fontWeight: font.weightMedium },
  requirementTextPending: { color: colors.textMuted },

  primaryBtn: { alignSelf: "stretch", backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 15, alignItems: "center" },
  primaryBtnDisabled: { backgroundColor: colors.borderStrong },
  primaryBtnText: { color: colors.white, fontSize: font.md, fontWeight: font.weightBold },
  primaryBtnTextDisabled: { color: colors.textMuted },
  footerNote: { marginTop: spacing.md, fontSize: font.xs, color: colors.textMuted, textAlign: "center" },
  platformBlock: { marginTop: spacing.md, gap: 6 },
  platformBlockerRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 8, paddingHorizontal: spacing.md,
    backgroundColor: colors.bgMuted, borderRadius: radius.md,
  },
  platformBlockerText: { fontSize: font.xs, fontWeight: font.weightMedium, color: colors.textSecondary },
  platformBlockerAction: { flexDirection: "row", alignItems: "center", gap: 2 },
  platformBlockerActionText: { fontSize: font.xs, fontWeight: font.weightBold, color: colors.brand },
  agreeNote: { marginTop: spacing.sm, fontSize: 11, color: colors.textFaint, textAlign: "center", lineHeight: 15 },
  agreeLink: { fontSize: 11, color: colors.textMuted, fontWeight: font.weightBold },

  bottomBar: {
    alignSelf: "stretch", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bg,
  },
});
