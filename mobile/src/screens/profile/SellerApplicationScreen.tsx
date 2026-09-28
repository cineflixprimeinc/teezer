import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronLeft, ChevronRight, HelpCircle, PartyPopper } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { sellerApplicationApi, type ShopStatus } from "@/api/seller-application.api";
import { featureIcon } from "@/screens/studio/feature-icons";
import { REQUIREMENT_FIX, goFixRequirement } from "@/screens/studio/requirement-fix";
import { useAuthStore } from "@/store/auth.store";
import { openPolicy } from "@/store/policy.store";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

/**
 * Settings -> Sell on Teezer. Not the public Shop screen (ShopScreen.tsx) -
 * this is the application/status landing page in front of the wizard
 * (SellerApplicationWizardScreen). One GET decides everything shown here;
 * there is no local draft to fall out of sync with the server.
 */

/** The Shop intro hero art (phone + product cards + reaching hand), same
 *  asset-loading convention as every other pre-made illustration in the
 *  app (empty-playlist.png etc. in this same folder). */
const SHOP_INTRO_ILLUSTRATION = require("../../assets/shop-creator-pilot-intro.png");

/** Shown only until the real (admin-configured, live-computed) eligibility
 *  loads - see `app?.eligibility` below. Never left on screen for long: the
 *  loading spinner above already covers the fetch, so this is just the
 *  shape while `app` itself is still null on a first render. */
const FALLBACK_REQUIREMENTS = ["Meet our Community Guidelines", "Be at least 18 years old", "Have 1,000 followers"];

/**
 * Which of the full eligibility checklist to surface on this intro/pitch
 * screen: exactly the ones an admin configured specifically for Sell on
 * Teezer (Admin Panel -> Monetization Control Center -> Sell on Teezer
 * -> Requirements), i.e. `!baseline`. The platform-wide checks every
 * programme carries (age, two-factor, one-account-per-person, no active
 * strikes...) are real too, but they're not this programme's own
 * requirements, and hard-coding a subset of THOSE here was the actual bug:
 * an admin added "Profile complete" and "Email verified" in the panel and
 * neither showed up in the app, because this list didn't know their keys
 * existed. Filtering on `baseline` instead of a fixed key list means
 * anything an admin adds/removes/retargets there now shows here
 * automatically, with no code change - the app and the admin panel can no
 * longer drift apart the way they just did.
 */
const requirementIsOwnToProgram = (r: { baseline: boolean }) => !r.baseline;

/** icon is a name from the same curated set the admin panel's picker offers
 *  (feature-icons.ts) - the default bullets are just data in that same
 *  shape, so an admin override (`app.eligibility.features`) is a drop-in
 *  swap. */
const FEATURES = [
  { icon: "Package", title: "List your own products", desc: "Add items from your own inventory and manage them from your Shop." },
  { icon: "Store", title: "Sell directly to your audience", desc: "Showcase products in your videos, LIVE streams and on your profile." },
  { icon: "BarChart3", title: "Track orders and earnings", desc: "See orders, revenue and how your Shop is performing, all in one place." },
];

const STATUS_COPY: Partial<Record<ShopStatus, { title: string; body: string }>> = {
  pending_review: { title: "Application Submitted", body: "Your Teezer Shop application has been submitted and is waiting for review." },
  needs_information: { title: "Additional Information Needed", body: "The Teezer team needs a bit more information before your Shop can be approved." },
  rejected: { title: "Application Not Approved", body: "Your Shop application was not approved this time." },
  suspended: { title: "Shop Suspended", body: "Your Shop has been suspended and is not publicly visible." },
};

export function SellerApplicationScreen() {
  const navigation = useNavigation<any>();
  const authUser = useAuthStore((s) => s.user);

  const q = useQuery({ queryKey: ["seller-application"], queryFn: sellerApplicationApi.get });

  // Re-fetch every time this screen regains focus - the whole point is to
  // reflect an admin decision (approve/reject/suspend) made since the user
  // last looked, without needing a logout/reinstall.
  useFocusEffect(useCallback(() => { q.refetch(); }, [])); // eslint-disable-line react-hooks/exhaustive-deps

  const app = q.data;
  const started = !!(app?.seller_type || app?.shop_name);
  const goWizard = () => navigation.navigate("SellerApplicationWizard");

  /* Brief spinner-in-button before the intro's own Apply Now/Get Started CTA
   * navigates, rather than an instant jump. Scoped to that one button only -
   * Manage Shop and Complete Required Information/Update Application, below,
   * also call goWizard() but weren't part of this. */
  const [starting, setStarting] = useState(false);
  const startTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (startTimer.current) clearTimeout(startTimer.current); }, []);
  const startWizard = () => {
    if (starting) return;
    setStarting(true);
    startTimer.current = setTimeout(goWizard, 3000);
  };
  /* Every one of the programme's own requirements (admin panel ->
   * Monetization Control Center -> Sell on Teezer -> Requirements), live-
   * computed - see MonetizationEligibilityService. Gates Apply Now/Get
   * Started, matching every other programme's CTA (Gifts & Coins, the
   * waitlist programmes) now that eligibility is required before enrolling
   * anywhere - this used to be deliberately display-only (an applicant could
   * start before fully qualifying, since a human reviews every application
   * anyway), but that's been overridden: real requirements now gate every
   * programme's entry point consistently, this one included. */
  const eligible = app?.eligibility?.all_met ?? false;
  const live = app?.eligibility?.requirements.filter(requirementIsOwnToProgram);
  /* Same fix as GiftsIntroScreen: the footer note must count the same rows
   * the checklist above shows (the 5 the admin configured for THIS
   * programme), not app.eligibility.met_count/total_count, which also
   * counts the platform-wide baseline checks nobody sees here. */
  const ownMet = live?.filter((r) => r.met).length ?? 0;
  const ownTotal = live?.length ?? 0;
  const blockedByPlatform = ownTotal > 0 && ownMet === ownTotal && !eligible;
  /* Which platform-wide checks are actually blocking, by name, each tappable
   * to its real fix (requirement-fix.ts) - see GiftsIntroScreen's own note. */
  const baselineBlockers = blockedByPlatform ? (app?.eligibility?.requirements ?? []).filter((r) => r.baseline && !r.met) : [];

  if (q.isLoading) {
    return (
      <Screen edges={["top"]} bg={colors.bg}>
        <Header onBack={() => navigation.goBack()} />
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.brand} />
      </Screen>
    );
  }

  /* ── Approved: the "your shop is ready" state ── */
  if (app?.status === "approved") {
    return (
      <Screen edges={["top"]} bg={colors.bg}>
        <Header onBack={() => navigation.goBack()} />
        <View style={s.center}>
          <View style={s.successCircle}><PartyPopper size={40} color="#fff" strokeWidth={2.2} /></View>
          <Text style={s.title}>Your Shop is Approved!</Text>
          <Text style={s.body}>Your Teezer Shop is now ready.</Text>
          <Text style={s.shopName}>{app.shop_name}</Text>

          <View style={{ gap: spacing.md, alignSelf: "stretch", marginTop: spacing.xl }}>
            <Pressable
              style={s.primaryBtn}
              onPress={() => authUser?.username && navigation.navigate("Shop", { username: authUser.username })}
            >
              <Text style={s.primaryBtnText}>Open My Shop</Text>
            </Pressable>
            <Pressable
              style={s.secondaryBtn}
              onPress={() => authUser?.username && navigation.navigate("AddProduct", { username: authUser.username })}
            >
              <Text style={s.secondaryBtnText}>Add First Product</Text>
            </Pressable>
            {/* Same destination as ShopScreen's own "Edit Shop" button - an
             *  approved shop's settings, not the onboarding wizard goWizard()
             *  below still correctly points to for the needs_information/
             *  rejected states (SellerApplicationController::update() 422s
             *  once approved, so this could never have actually worked). */}
            <Pressable style={s.secondaryBtn} onPress={() => navigation.navigate("EditShop")}>
              <Text style={s.secondaryBtnText}>Manage Shop</Text>
            </Pressable>
          </View>
        </View>
      </Screen>
    );
  }

  /* ── Any other in-progress/decided status once something has been started ── */
  if (started && app && STATUS_COPY[app.status]) {
    const copy = STATUS_COPY[app.status]!;
    return (
      <Screen edges={["top"]} bg={colors.bg}>
        <Header onBack={() => navigation.goBack()} />
        <View style={s.center}>
          <StatusPill status={app.status} />
          <Text style={s.title}>{copy.title}</Text>
          <Text style={s.body}>{copy.body}</Text>

          {app.admin_note ? (
            <View style={s.noteCard}>
              <Text style={s.noteLabel}>{app.status === "rejected" ? "Reason" : "Note from Teezer"}</Text>
              <Text style={s.noteText}>{app.admin_note}</Text>
            </View>
          ) : null}

          {(app.status === "needs_information" || app.status === "rejected") && (
            <Pressable style={[s.primaryBtn, { marginTop: spacing.xl, alignSelf: "stretch" }]} onPress={goWizard}>
              <Text style={s.primaryBtnText}>
                {app.status === "needs_information" ? "Complete Required Information" : "Update Application"}
              </Text>
            </Pressable>
          )}
        </View>
      </Screen>
    );
  }

  /* ── Not started, or started but still a draft: the Shop intro.
     Get Started/Apply Now is pinned in its own bar below the ScrollView,
     not inside it - the one thing this screen exists to get someone to tap
     has to be reachable without scrolling, on every device, not just tall
     ones. The informational content above it still scrolls if it has to
     (a big system font size, a small phone), it just isn't what gates the
     button. ── */
  return (
    <Screen edges={["top", "bottom"]} bg={colors.bg}>
      <Header onBack={() => navigation.goBack()} title="Teezer Shop" onHelp={() => navigation.navigate("ShopHelp")} />
      <ScrollView contentContainerStyle={s.introBody} showsVerticalScrollIndicator={false}>
        <Image source={SHOP_INTRO_ILLUSTRATION} style={s.illustration} resizeMode="contain" />

        <Text style={s.introTitle}>{app?.eligibility?.hero_title || "Turn Your Profile Into\nYour Own Shop"}</Text>
        <Text style={s.introSub}>
          {app?.eligibility?.hero_description ||
            "A marketplace built into the app - list your own products and sell directly to your audience."}
        </Text>

        <View style={s.featureCard}>
          {(app?.eligibility?.features.length ? app.eligibility.features : FEATURES).map((f, i, arr) => {
            const Icon = featureIcon(f.icon);
            return (
              <View key={f.title} style={[s.featureRow, i < arr.length - 1 && s.featureRowDivider]}>
                <View style={s.featureIcon}><Icon size={20} color={colors.brand} strokeWidth={2.1} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.featureTitle}>{f.title}</Text>
                  <Text style={s.featureDesc}>{f.desc}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={s.requirements}>
          {(() => {
            if (live && live.length > 0) {
              return live.map((r) => {
                const fixable = !r.met && !r.counted && !!REQUIREMENT_FIX[r.key];
                return (
                  <Pressable
                    key={r.key}
                    style={s.requirementRow}
                    disabled={!fixable}
                    onPress={() => fixable && goFixRequirement(navigation, r.key, r.label)}
                  >
                    <CheckCircle2
                      size={18}
                      color={r.met ? colors.brand : colors.borderStrong}
                      strokeWidth={2.2}
                    />
                    <Text style={[s.requirementText, !r.met && s.requirementTextPending, { flex: 1 }]}>
                      {r.target ? `${r.label} (${Math.min(r.current, r.target)}/${r.target})` : r.label}
                    </Text>
                    {fixable && <ChevronRight size={16} color={colors.textFaint} />}
                  </Pressable>
                );
              });
            }
            // Only reached if eligibility failed to load for some reason -
            // the same copy the screen always showed, so nothing regresses.
            return FALLBACK_REQUIREMENTS.map((r) => (
              <View key={r} style={s.requirementRow}>
                <CheckCircle2 size={18} color={colors.brand} strokeWidth={2.2} />
                <Text style={s.requirementText}>{r}</Text>
              </View>
            ));
          })()}
        </View>
      </ScrollView>

      <View style={s.bottomBar}>
        <Pressable
          disabled={!eligible || starting}
          style={[s.primaryBtn, { marginTop: 0 }, !eligible && s.primaryBtnDisabled]}
          onPress={startWizard}
        >
          {starting ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={[s.primaryBtnText, !eligible && s.primaryBtnTextDisabled]}>
              {app?.eligibility?.cta_label || (started ? "Get Started" : "Apply Now")}
            </Text>
          )}
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
            {eligible
              ? "We'll review your application and get back to you within a few days."
              : `Complete the requirements above to apply (${ownMet}/${ownTotal} met).`}
          </Text>
        )}
        <Text style={s.agreeNote}>
          By continuing, you agree to Teezer's{" "}
          <Text style={s.agreeLink} onPress={() => openPolicy("terms")}>Terms of Service</Text> and{" "}
          <Text style={s.agreeLink} onPress={() => openPolicy("privacy")}>Privacy Policy</Text>.
        </Text>

        {!started && (
          <Pressable style={s.linkBtn} onPress={() => q.refetch()}>
            <Text style={s.linkText}>Already applied? </Text>
            <Text style={[s.linkText, s.linkTextStrong]}>View Application Status</Text>
          </Pressable>
        )}
      </View>
    </Screen>
  );
}

function Header({ onBack, title = "Sell on Teezer", onHelp }: { onBack: () => void; title?: string; onHelp?: () => void }) {
  return (
    <View style={s.header}>
      <Pressable hitSlop={8} style={s.iconBtn} onPress={onBack}>
        <ChevronLeft size={24} color={colors.text} strokeWidth={2.2} />
      </Pressable>
      <Text style={s.headerTitle}>{title}</Text>
      {onHelp ? (
        <Pressable hitSlop={8} style={s.iconBtn} onPress={onHelp} accessibilityRole="button" accessibilityLabel="Help">
          <HelpCircle size={22} color={colors.text} strokeWidth={2} />
        </Pressable>
      ) : (
        <View style={s.iconBtn} />
      )}
    </View>
  );
}

const STATUS_TONE: Partial<Record<ShopStatus, { bg: string; fg: string; label: string }>> = {
  pending_review: { bg: "#fff7ed", fg: colors.warning, label: "PENDING REVIEW" },
  needs_information: { bg: "#fff7ed", fg: colors.warning, label: "NEEDS INFORMATION" },
  rejected: { bg: "#fef2f2", fg: colors.danger, label: "REJECTED" },
  suspended: { bg: "#fef2f2", fg: colors.danger, label: "SUSPENDED" },
};

function StatusPill({ status }: { status: ShopStatus }) {
  const tone = STATUS_TONE[status];
  if (!tone) return null;
  return (
    <View style={[s.pill, { backgroundColor: tone.bg }]}>
      <Text style={[s.pillText, { color: tone.fg }]}>{tone.label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, height: 52 },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  successCircle: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: colors.success,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.lg,
  },
  title: { fontSize: font.xxl, fontWeight: font.weightHeavy, color: colors.text, textAlign: "center" },
  body: { marginTop: spacing.sm, fontSize: font.md, lineHeight: 22, color: colors.textMuted, textAlign: "center" },
  shopName: { marginTop: spacing.xs, fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.brand },

  pill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill, marginBottom: spacing.lg },
  pillText: { fontSize: 12, fontWeight: font.weightHeavy, letterSpacing: 0.4 },

  noteCard: { alignSelf: "stretch", marginTop: spacing.lg, backgroundColor: colors.bgMuted, borderRadius: radius.lg, padding: spacing.lg },
  noteLabel: { fontSize: font.xs, fontWeight: font.weightHeavy, color: colors.textMuted },
  noteText: { marginTop: 4, fontSize: font.sm, color: colors.text, lineHeight: 20 },

  introBody: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg, alignItems: "center" },
  introTitle: {
    fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text, textAlign: "center",
    lineHeight: 26, textTransform: "uppercase", letterSpacing: 0.3,
  },
  introSub: { marginTop: spacing.sm, fontSize: font.sm, lineHeight: 20, color: colors.textMuted, textAlign: "center" },

  // Compact on purpose: this content scrolls above a bottom bar that's
  // always visible (see bottomBar below), but the smaller everything above
  // it is, the less anyone ever needs to scroll to see it in the first
  // place - most of this screen's job is done by the button, not the copy.
  illustration: { width: "100%", height: 130, marginBottom: spacing.sm },

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

  primaryBtn: { alignSelf: "stretch", backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 15, alignItems: "center", marginTop: spacing.xxl },
  primaryBtnDisabled: { backgroundColor: colors.borderStrong },
  primaryBtnText: { color: colors.white, fontSize: font.md, fontWeight: font.weightBold },
  primaryBtnTextDisabled: { color: colors.textMuted },
  secondaryBtn: { alignSelf: "stretch", borderWidth: 1.5, borderColor: colors.borderStrong, borderRadius: radius.md, paddingVertical: 15, alignItems: "center" },
  secondaryBtnText: { color: colors.text, fontSize: font.md, fontWeight: font.weightBold },
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

  linkBtn: { flexDirection: "row", marginTop: spacing.lg },
  linkText: { fontSize: font.sm, color: colors.textMuted },
  linkTextStrong: { color: colors.brand, fontWeight: font.weightBold },

  // Pinned below the ScrollView, not inside it - see the render comment
  // above where this is used.
  bottomBar: {
    alignSelf: "stretch", paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bg,
  },
});
