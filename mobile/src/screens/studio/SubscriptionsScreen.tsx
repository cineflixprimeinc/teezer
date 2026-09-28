import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronLeft, ChevronRight, HelpCircle } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { monetizationProgramsApi } from "@/api/monetization-programs.api";
import { featureIcon } from "./feature-icons";
import { REQUIREMENT_FIX, goFixRequirement } from "./requirement-fix";
import { openPolicy } from "@/store/policy.store";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

/**
 * Reelsoo Studio -> Monetization -> Subscriptions. Replaces the generic
 * requirements-checklist template (StudioProgrammeScreen) for this one
 * programme, same reasoning and same pattern as Gifts & Coins/Creator
 * Rewards opening their own dedicated screens instead of it - see
 * StudioMonetizationSection.tsx's onPress.
 *
 * Like Creator Rewards, Subscriptions is admin-set to coming_soon - it
 * cannot become `active` until an admin actually launches it, no matter how
 * many requirements a creator meets. So the CTA here is the same real
 * waitlist signup StudioProgrammeScreen already offers the other coming-soon
 * programmes (see ProgramWaitlistSignup), not a "start earning" action.
 *
 * The reference design's own copy ("Unlock Premium Features with
 * Subscriptions", "Explore Subscriptions") is written for a FAN subscribing
 * to a creator, not for the creator setting subscriptions up - this screen
 * opens from the creator's own Studio, so the pitch is reframed the same
 * way Gifts & Coins was: same illustration and layout, creator-earning copy.
 */

/** The reference design's illustration, same asset-loading convention as
 *  every other pre-made illustration in this folder. */
const SUBSCRIPTIONS_INTRO_ILLUSTRATION = require("../../assets/subscriptions-intro.png");

/** icon is a name from the same curated set the admin panel's picker offers
 *  (feature-icons.ts) - the default bullets are just data in that same
 *  shape, so an admin override (`subs.features`) is a drop-in swap. */
const FEATURES = [
  { icon: "Crown", title: "Set Your Own Tiers", desc: "Choose what subscribers get and how much they pay each month." },
  { icon: "Star", title: "Subscriber Perks", desc: "Badges, subscriber-only posts and more to reward your supporters." },
  { icon: "ShieldCheck", title: "Paid Automatically", desc: "Subscriptions bill monthly and pay straight to your Creator Wallet." },
];

/** Shown only until the real (admin-configured, live-computed) requirements
 *  load - same convention as every other intro screen's fallback list. */
const FALLBACK_REQUIREMENTS = ["5,000 followers", "Account at least 30 days old", "50 public videos", "Identity verified"];

const requirementIsOwnToProgram = (r: { baseline: boolean }) => !r.baseline;

export function SubscriptionsScreen() {
  const navigation = useNavigation<any>();

  const q = useQuery({ queryKey: ["monetization-programs"], queryFn: monetizationProgramsApi.list });
  const subs = q.data?.programs.find((p) => p.key === "subscriptions");
  const live = subs?.requirements.filter(requirementIsOwnToProgram);

  const ownMet = live?.filter((r) => r.met).length ?? 0;
  const ownTotal = live?.length ?? 0;
  /* "locked" specifically (not "eligible"/"coming_soon") means every OWN
   * requirement is met but a platform-wide baseline check still isn't -
   * see ProgramStatus's doc in monetization-programs.api.ts. */
  const blockedByPlatform = ownTotal > 0 && ownMet === ownTotal && subs?.status === "locked";
  /* Which platform-wide checks are actually blocking, by name, each tappable
   * to its real fix (requirement-fix.ts) - see GiftsIntroScreen's own note. */
  const baselineBlockers = blockedByPlatform ? (subs?.requirements ?? []).filter((r) => r.baseline && !r.met) : [];

  /* Same two-tone heading treatment as Gifts & Coins/Creator Rewards: only
   * the LAST line of an admin override gets the accent colour, matching
   * the default's own split; a single-line override renders plain. */
  const heroTitle = subs?.hero_title || "Turn Fans Into\nPaying Subscribers";
  const heroBreak = heroTitle.lastIndexOf("\n");
  const heroLead = heroBreak >= 0 ? heroTitle.slice(0, heroBreak + 1) : null;
  const heroAccent = heroBreak >= 0 ? heroTitle.slice(heroBreak + 1) : heroTitle;

  const alreadyWaitlisted = !!subs?.waitlisted;
  const canJoinWaitlist = !!subs?.waitlist_enabled && !alreadyWaitlisted;
  const waitlistMutation = useMutation({
    mutationFn: () => monetizationProgramsApi.joinWaitlist("subscriptions"),
    onSuccess: () => {
      q.refetch();
      Alert.alert("You're on the list", "We'll notify you when Subscriptions opens.");
    },
    onError: () => Alert.alert("Something went wrong", "Please try again."),
  });

  return (
    <Screen edges={["top", "bottom"]} bg={colors.bg}>
      <View style={s.header}>
        <Pressable hitSlop={8} style={s.iconBtn} onPress={() => navigation.goBack()}>
          <ChevronLeft size={24} color={colors.text} strokeWidth={2.2} />
        </Pressable>
        <Text style={s.headerTitle}>Subscriptions</Text>
        <Pressable hitSlop={8} style={s.iconBtn} onPress={() => navigation.navigate("HelpCenter")} accessibilityRole="button" accessibilityLabel="Help">
          <HelpCircle size={22} color={colors.text} strokeWidth={2} />
        </Pressable>
      </View>

      {q.isLoading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.brand} />
      ) : (
        <>
          <ScrollView contentContainerStyle={s.introBody} showsVerticalScrollIndicator={false}>
            <Image source={SUBSCRIPTIONS_INTRO_ILLUSTRATION} style={s.illustration} resizeMode="contain" />

            <Text style={s.introTitle}>
              {heroLead}
              {heroBreak >= 0 ? <Text style={s.introTitleAccent}>{heroAccent}</Text> : heroAccent}
            </Text>
            <Text style={s.introSub}>
              {subs?.hero_description ||
                "Offer exclusive perks fans can subscribe to monthly - private posts, badges and more, paid straight to your Creator Wallet."}
            </Text>

            <View style={s.featureCard}>
              {(subs?.features.length ? subs.features : FEATURES).map((f, i, arr) => {
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
              {(live && live.length > 0 ? live : null)?.map((r) => {
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
              disabled={alreadyWaitlisted || !canJoinWaitlist}
              style={[s.primaryBtn, (alreadyWaitlisted || !canJoinWaitlist) && s.primaryBtnDisabled]}
              onPress={() => canJoinWaitlist && waitlistMutation.mutate()}
            >
              <Text style={[s.primaryBtnText, (alreadyWaitlisted || !canJoinWaitlist) && s.primaryBtnTextDisabled]}>
                {alreadyWaitlisted ? "You're on the List" : subs?.cta_label || "Notify Me When It Opens"}
              </Text>
            </Pressable>
            {blockedByPlatform && !alreadyWaitlisted && subs?.waitlist_enabled ? (
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
                {alreadyWaitlisted
                  ? "We'll notify you the moment Subscriptions opens."
                  : !subs?.waitlist_enabled
                  ? "This programme isn't open for signups yet - check back soon."
                  : `Complete the requirements above to get ready (${ownMet}/${ownTotal} met).`}
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
