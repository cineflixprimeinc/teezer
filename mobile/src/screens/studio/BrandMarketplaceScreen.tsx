import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronLeft, ChevronRight, Handshake, HelpCircle, Megaphone, Play, TrendingUp } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { monetizationProgramsApi } from "@/api/monetization-programs.api";
import { featureIcon } from "./feature-icons";
import { REQUIREMENT_FIX, goFixRequirement } from "./requirement-fix";
import { openPolicy } from "@/store/policy.store";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

/**
 * Reelsoo Studio -> Monetization -> Brand Marketplace. Replaces the generic
 * requirements-checklist template (StudioProgrammeScreen) for this one
 * programme, same reasoning/template as Gifts & Coins/Creator Rewards/
 * Subscriptions - see StudioMonetizationSection.tsx's onPress. This is now
 * the last of the five to get its own dedicated screen.
 *
 * No reference illustration exists for this one yet (unlike the other three,
 * which each came with a matching SVG - shop-creator-pilot-intro.png,
 * gifts-coins-intro.png, creator-rewards-intro.png, subscriptions-intro.png).
 * MarketplaceIllustration below is a hand-coded stand-in in the same
 * technique the Shop intro screen originally used before its real artwork
 * arrived (see git history on SellerApplicationScreen.tsx pre-91d2bcef) -
 * phone + two floating cards + flourishes, not a pixel recreation of the
 * hand-drawn reference style. Swap it for a real asset the same way that one
 * was swapped, whenever one exists.
 *
 * Like Creator Rewards/Subscriptions, Marketplace is admin-set to
 * coming_soon - it cannot become `active` until an admin actually launches
 * it, no matter how many requirements a creator meets. So the CTA here is
 * the same real waitlist signup the other two coming-soon programmes use
 * (ProgramWaitlistSignup), not a "start earning" action.
 */

function MarketplaceIllustration() {
  return (
    <View style={s.illustration}>
      <View style={[s.floatCard, s.floatCardLeft]}>
        <Handshake size={26} color={colors.brand} strokeWidth={1.8} />
      </View>
      <View style={[s.floatCard, s.floatCardRight]}>
        <TrendingUp size={26} color="#16a34a" strokeWidth={1.8} />
      </View>

      <View style={s.phone}>
        <View style={s.phoneScreen}>
          <Play size={26} color={colors.text} fill={colors.text} />
        </View>
      </View>

      <View style={s.megaphoneBadge}>
        <Megaphone size={17} color={colors.text} strokeWidth={2} />
      </View>
      <Text style={s.sparkle}>✦</Text>
      <Text style={s.heart}>♥</Text>
    </View>
  );
}

/** icon is a name from the same curated set the admin panel's picker offers
 *  (feature-icons.ts) - the default bullets are just data in that same
 *  shape, so an admin override (`marketplace.features`) is a drop-in swap. */
const FEATURES = [
  { icon: "Handshake", title: "Get Matched With Brands", desc: "Brands find you by audience, topic and engagement - no pitching required." },
  { icon: "Megaphone", title: "Run Paid Campaigns", desc: "Accept briefs that fit your content and set your own rate." },
  { icon: "TrendingUp", title: "Grow While You Earn", desc: "Every campaign adds real reach on top of real payouts." },
];

/** Shown only until the real (admin-configured, live-computed) requirements
 *  load - same convention as every other intro screen's fallback list. */
const FALLBACK_REQUIREMENTS = ["10,000 followers", "Account at least 60 days old", "100 public videos", "Identity verified"];

const requirementIsOwnToProgram = (r: { baseline: boolean }) => !r.baseline;

export function BrandMarketplaceScreen() {
  const navigation = useNavigation<any>();

  const q = useQuery({ queryKey: ["monetization-programs"], queryFn: monetizationProgramsApi.list });
  const marketplace = q.data?.programs.find((p) => p.key === "marketplace");
  const live = marketplace?.requirements.filter(requirementIsOwnToProgram);

  const ownMet = live?.filter((r) => r.met).length ?? 0;
  const ownTotal = live?.length ?? 0;
  /* "locked" specifically (not "eligible"/"coming_soon") means every OWN
   * requirement is met but a platform-wide baseline check still isn't -
   * see ProgramStatus's doc in monetization-programs.api.ts. */
  const blockedByPlatform = ownTotal > 0 && ownMet === ownTotal && marketplace?.status === "locked";
  /* Which platform-wide checks are actually blocking, by name, each tappable
   * to its real fix (requirement-fix.ts) - see GiftsIntroScreen's own note. */
  const baselineBlockers = blockedByPlatform ? (marketplace?.requirements ?? []).filter((r) => r.baseline && !r.met) : [];

  /* Same two-tone heading treatment as the other three dedicated screens:
   * only the LAST line of an admin override gets the accent colour,
   * matching the default's own split; a single-line override renders plain. */
  const heroTitle = marketplace?.hero_title || "Turn Your Reach Into\nBrand Partnerships";
  const heroBreak = heroTitle.lastIndexOf("\n");
  const heroLead = heroBreak >= 0 ? heroTitle.slice(0, heroBreak + 1) : null;
  const heroAccent = heroBreak >= 0 ? heroTitle.slice(heroBreak + 1) : heroTitle;

  const alreadyWaitlisted = !!marketplace?.waitlisted;
  const canJoinWaitlist = !!marketplace?.waitlist_enabled && !alreadyWaitlisted;
  const waitlistMutation = useMutation({
    mutationFn: () => monetizationProgramsApi.joinWaitlist("marketplace"),
    onSuccess: () => {
      q.refetch();
      Alert.alert("You're on the list", "We'll notify you when Brand Marketplace opens.");
    },
    onError: () => Alert.alert("Something went wrong", "Please try again."),
  });

  return (
    <Screen edges={["top", "bottom"]} bg={colors.bg}>
      <View style={s.header}>
        <Pressable hitSlop={8} style={s.iconBtn} onPress={() => navigation.goBack()}>
          <ChevronLeft size={24} color={colors.text} strokeWidth={2.2} />
        </Pressable>
        <Text style={s.headerTitle}>Brand Marketplace</Text>
        <Pressable hitSlop={8} style={s.iconBtn} onPress={() => navigation.navigate("HelpCenter")} accessibilityRole="button" accessibilityLabel="Help">
          <HelpCircle size={22} color={colors.text} strokeWidth={2} />
        </Pressable>
      </View>

      {q.isLoading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.brand} />
      ) : (
        <>
          <ScrollView contentContainerStyle={s.introBody} showsVerticalScrollIndicator={false}>
            <MarketplaceIllustration />

            <Text style={s.introTitle}>
              {heroLead}
              {heroBreak >= 0 ? <Text style={s.introTitleAccent}>{heroAccent}</Text> : heroAccent}
            </Text>
            <Text style={s.introSub}>
              {marketplace?.hero_description ||
                "Brands browse creators by audience and topic, then send paid briefs you choose to accept - every deal and rate is yours to set."}
            </Text>

            <View style={s.featureCard}>
              {(marketplace?.features.length ? marketplace.features : FEATURES).map((f, i, arr) => {
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
                {alreadyWaitlisted ? "You're on the List" : marketplace?.cta_label || "Notify Me When It Opens"}
              </Text>
            </Pressable>
            {blockedByPlatform && !alreadyWaitlisted && marketplace?.waitlist_enabled ? (
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
                  ? "We'll notify you the moment Brand Marketplace opens."
                  : !marketplace?.waitlist_enabled
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

  illustration: { width: "100%", height: 150, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  phone: { width: 96, height: 150, borderRadius: 20, borderWidth: 2, borderColor: colors.text, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  phoneScreen: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  floatCard: { position: "absolute", top: 38, width: 54, height: 54, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  floatCardLeft: { left: 10 },
  floatCardRight: { right: 10 },
  megaphoneBadge: { position: "absolute", left: 18, bottom: 14, width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: colors.text, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  sparkle: { position: "absolute", top: 4, left: 26, fontSize: 18, color: colors.textFaint },
  heart: { position: "absolute", top: 34, right: 16, fontSize: 16, color: colors.brand },

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
