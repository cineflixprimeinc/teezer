import { useEffect, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import {
  LayoutDashboard, PlaySquare, BarChart2, CircleDollarSign, BadgeCheck, Settings,
  Megaphone, Crown, Wallet, Wrench, MessageCircle, Music4,
  ShieldCheck, TrendingUp, Users, ChevronLeft,
  type LucideIcon,
} from "lucide-react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { studioApi } from "@/api/studio.api";
import type { Video } from "@/types";
import { Screen } from "@/components/Screen";
import { WelcomePopup, type WelcomeFeature } from "@/components/WelcomePopup";
import { useOnboarding } from "@/store/onboarding.store";
import { StudioDashboardSection } from "./StudioDashboardSection";
import { StudioAnalyticsSection } from "./StudioAnalyticsSection";
import { StudioContentSection } from "./StudioContentSection";
import { StudioMonetizationSection } from "./StudioMonetizationSection";
import { StudioVerificationSection } from "./StudioVerificationSection";
import { StudioWalletsSection } from "./StudioWalletsSection";
import { StudioToolsSection } from "./StudioToolsSection";
import { StudioCommentsSection } from "./StudioCommentsSection";
import { StudioMusicSection } from "./StudioMusicSection";
import { StudioAdsSection } from "./StudioAdsSection";
import { StudioPremiumSection } from "./StudioPremiumSection";
import { StudioSettingsSection } from "./StudioSettingsSection";
import { useAuthStore } from "@/store/auth.store";
import { sd, sr } from "./studio-design";
import { colors } from "@/constants/colors";
import { font, spacing } from "@/constants/theme";

export type StudioSection = "dashboard" | "content" | "analytics" | "monetization" | "verification" | "wallet" | "tools" | "comments" | "music" | "ads" | "premium" | "settings";
type Section = StudioSection;

/* ── Top menu - a scrolling row of chips (the prototype's studioNav), not a
   separate navigated page. Items with a `section` swap the content below in
   place; the rest are not built yet.

   Nothing here is gated. Monetization used to wear a padlock until Creator
   Level 5; eligibility is now measured per programme inside the Monetization
   tab itself, so the tab is open to everyone and the requirements live where
   they can actually be read.

   `badge` names the counter a chip carries. Comments is the only one with a
   real number behind it right now. ── */
const NAV_ITEMS: {
  key: string; label: string; icon: LucideIcon; section?: Section;
  badge?: "comments";
}[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, section: "dashboard" },
  { key: "content", label: "Content", icon: PlaySquare, section: "content" },
  { key: "analytics", label: "Analytics", icon: BarChart2, section: "analytics" },
  { key: "comments", label: "Comments", icon: MessageCircle, section: "comments", badge: "comments" },
  { key: "monetization", label: "Monetization", icon: CircleDollarSign, section: "monetization" },
  { key: "verification", label: "Verification", icon: BadgeCheck, section: "verification" },
  { key: "ads", label: "Teezer ADS", icon: Megaphone, section: "ads" },
  { key: "settings", label: "Settings", icon: Settings, section: "settings" },
];
/* Music Library, Premium, Wallets & Coins and Creator Tools were removed from
   this row on request. Only the chips are gone - the sections themselves are
   untouched below, so restoring any of them is a one-line addition here.

   They are not all unreachable as a result: the Dashboard's "Creator tools"
   card still opens Creator Tools via its "See all", and Creator Tools still
   links on to Wallet & Coins and Music Library. Premium now has no entry point
   at all.

   Verification was briefly removed and has been rebuilt to the design's LIGHT
   revision, so its chip routes to a section again like the rest. */

/** Reelsoo Studio - reachable from the profile three-dot menu › Reelsoo Studio.
 *  A single screen: the top pill menu switches which section renders below
 *  it, in place - nothing here is a separate navigated page. */
export function StudioScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const user = useAuthStore((s) => s.user);
  const [section, setSection] = useState<Section>("dashboard");
  // The post handed in via Studio route params (Post Insights' "Promote this
  // post"), passed on to the Ads section so its campaign wizard opens
  // already pointed at it. See the effect below for why this - not
  // route.params directly - is what StudioAdsSection actually reads.
  const [pendingPromoteVideo, setPendingPromoteVideo] = useState<Video | undefined>(undefined);

  // Navigating to an ALREADY-mounted "Studio" screen (this one - Studio is
  // reached from many places across the app) does not remount it or re-run
  // useState's initializer, it only updates route.params - so jumping to a
  // specific tab from elsewhere (e.g. Insights -> Ads) has to be reactive,
  // not a one-time default. Params are consumed once and cleared via
  // setParams so simply returning to Studio later doesn't replay them.
  useEffect(() => {
    if (!route.params?.section) return;
    setSection(route.params.section);
    setPendingPromoteVideo(route.params.promoteVideo);
    navigation.setParams({ section: undefined, promoteVideo: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params]);

  // Both reuse the keys the sections below already query on, so the chip row
  // costs no extra request - React Query serves it from the same cache entry.
  const commentsQ = useQuery({
    queryKey: ["studio-comment-stats"],
    queryFn: studioApi.commentStats,
    staleTime: 60_000,
  });

  // First-run welcome popup for the Studio hub, shown once on first entry.
  const hubWp = useOnboarding("studio.hub");

  const comingSoon = (what: string) => Alert.alert(what, "Coming soon.");

  return (
    <Screen edges={["top"]} bg={sd.page}>
      {/* Header - the prototype's lockup: a circular back control, the Reelsoo
          mark + "Reelsoo | Studio", then the account controls. */}
      <View style={styles.header}>
        <Pressable hitSlop={8} style={styles.circleBtn} onPress={() => navigation.goBack()}>
          <ChevronLeft size={18} color={sd.text} strokeWidth={2.2} />
        </Pressable>

        {/* Studio's own wordmark, as it has always been - not a Reelsoo mark
            with "Studio" set beside it. */}
        <View style={styles.lockup}>
          <Image source={require("../../assets/reelsoo-studio-wordmark.png")} style={styles.wordmarkImg} />
        </View>

        <Pressable hitSlop={8} onPress={() => navigation.navigate("Main", { screen: "Profile" })}>
          <Avatar uri={user?.avatar} style={styles.avatarImg} />
        </Pressable>
      </View>

      {/* Top menu - chips: the active one is a solid ink pill, the rest are
          hairline outlines on white. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.navRow}
        contentContainerStyle={styles.navRowContent}
      >
        {NAV_ITEMS.map((item) => {
          const active = item.key === section;
          const Icon = item.icon;
          // Unread, which is the "New comments" figure the Comments page shows
          // in its own stat strip - the two must not disagree. (The page's big
          // number counts VIDEOS waiting, which is a different thing and has
          // its own label there.)
          const count = item.badge === "comments" ? commentsQ.data?.unread ?? 0 : 0;
          return (
            <Pressable
              key={item.key}
              style={[styles.navChip, active && styles.navChipActive]}
              onPress={() => {
                if (active) return;
                if (item.section) { setSection(item.section); return; }
                comingSoon(item.label);
              }}
            >
              <Icon size={15} color={active ? "#FFFFFF" : sd.slate} strokeWidth={2.2} />
              {/* No numberOfLines: the chip sizes to its label, so
                  "Monetization" is never clipped mid-word. */}
              <Text style={[styles.navChipText, active && styles.navChipTextActive]}>
                {item.label}
              </Text>
              {count > 0 && (
                <View style={styles.navChipBadge}>
                  <Text style={styles.navChipBadgeText}>{count > 99 ? "99+" : count}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {section === "dashboard" && (
        <StudioDashboardSection
          onViewContent={() => setSection("content")}
          onOpenTools={() => setSection("tools")}
          onOpenComments={() => setSection("comments")}
        />
      )}
      {section === "content" && <StudioContentSection />}
      {section === "analytics" && <StudioAnalyticsSection onSeeAllVideos={() => setSection("content")} />}
      {section === "monetization" && <StudioMonetizationSection />}
      {section === "verification" && <StudioVerificationSection />}
      {section === "wallet" && <StudioWalletsSection />}
      {section === "comments" && <StudioCommentsSection />}
      {section === "music" && <StudioMusicSection />}
      {section === "ads" && (
        <StudioAdsSection
          initialPromoteVideo={pendingPromoteVideo}
          onConsumedInitialPromoteVideo={() => setPendingPromoteVideo(undefined)}
        />
      )}
      {section === "premium" && <StudioPremiumSection />}
      {section === "tools" && <StudioToolsSection onNavigate={setSection} />}
      {section === "settings" && <StudioSettingsSection />}

      {/* Landing (hub) popup on first entry… */}
      <WelcomePopup
        visible={hubWp.open}
        onClose={hubWp.dismiss}
        icon={LayoutDashboard}
        title="Welcome to Teezer Studio"
        description="Everything you need to track, grow and monetize your content - all in one place."
        features={[
          { Icon: BarChart2, title: "Track your growth", body: "Views, watch time, followers and earnings at a glance." },
          { Icon: CircleDollarSign, title: "Grow & monetize", body: "Unlock monetization, run ads and manage Premium." },
          { Icon: Wrench, title: "All your tools", body: "Dashboard, analytics, comments, music and more." },
        ]}
      />
      {/* …then a one-time popup the first time each menu is opened. */}
      {SECTION_POPUPS.map((p) => (
        <SectionOnboarding key={p.section} active={section === p.section} config={p} />
      ))}
    </Screen>
  );
}

/** One studio-section welcome popup, shown the first time its menu is opened. */
function SectionOnboarding({ active, config }: { active: boolean; config: SectionPopup }) {
  const wp = useOnboarding(`studio.${config.section}`, active);
  return (
    <WelcomePopup
      visible={wp.open}
      onClose={wp.dismiss}
      icon={config.icon}
      title={config.title}
      description={config.description}
      features={config.features}
    />
  );
}

type SectionPopup = {
  section: Section;
  icon: LucideIcon;
  title: string;
  description: string;
  features: WelcomeFeature[];
};

// One entry per Studio menu (Dashboard is covered by the hub popup above).
const SECTION_POPUPS: SectionPopup[] = [
  {
    section: "content", icon: PlaySquare, title: "Your Content",
    description: "Everything you've posted, in one place.",
    features: [
      { Icon: PlaySquare, title: "All your posts", body: "View, edit and track every video and photo you've shared." },
      { Icon: BarChart2, title: "See what performs", body: "Spot your top content and do more of what works." },
    ],
  },
  {
    section: "analytics", icon: BarChart2, title: "Welcome to Analytics",
    description: "Understand your reach with accurate, real numbers.",
    features: [
      { Icon: BarChart2, title: "Real numbers", body: "Views, watch time and retention - measured, never estimated." },
      { Icon: Users, title: "Know your audience", body: "See where your viewers are and when they watch." },
    ],
  },
  {
    section: "comments", icon: MessageCircle, title: "Comments",
    description: "Every comment across your content, together.",
    features: [
      { Icon: MessageCircle, title: "All in one place", body: "Read and reply without hopping between posts." },
      { Icon: ShieldCheck, title: "Stay in control", body: "Filter, hide or moderate to keep things healthy." },
    ],
  },
  {
    section: "music", icon: Music4, title: "Music Library",
    description: "Find the perfect sound for your content.",
    features: [
      { Icon: Music4, title: "Browse tracks", body: "Explore trending and licensed music for your videos." },
      { Icon: PlaySquare, title: "Add to posts", body: "Drop a track onto your content in a couple of taps." },
    ],
  },
  {
    section: "monetization", icon: CircleDollarSign, title: "Welcome to Monetization",
    description: "See what you've earned and manage your payouts.",
    features: [
      { Icon: CircleDollarSign, title: "See all your earnings", body: "Total earnings, balance and payouts in one view." },
      { Icon: Wallet, title: "Request payouts", body: "Withdraw your available balance whenever you're ready." },
      { Icon: TrendingUp, title: "Hit your goals", body: "Set a revenue goal and track your progress." },
    ],
  },
  {
    section: "verification", icon: BadgeCheck, title: "Get Verified on Teezer",
    description: "Earn the blue badge and build trust with your audience.",
    features: [
      { Icon: BadgeCheck, title: "Your blue badge", body: "Show your audience you're the real, verified you." },
      { Icon: ShieldCheck, title: "Simple check", body: "Pick a plan and verify your identity with an ID and selfie." },
    ],
  },
  {
    section: "ads", icon: Megaphone, title: "Teezer Ads",
    description: "Promote your content and reach more people.",
    features: [
      { Icon: Megaphone, title: "Promote content", body: "Turn any post into an ad to boost its reach." },
      { Icon: Users, title: "Reach new audiences", body: "Target the right viewers and grow your following." },
    ],
  },
  {
    section: "premium", icon: Crown, title: "Teezer Premium",
    description: "Unlock premium perks built for creators.",
    features: [
      { Icon: Crown, title: "Premium perks", body: "Access creator-only features and boosts." },
      { Icon: TrendingUp, title: "Grow faster", body: "Get the tools to level up your channel." },
    ],
  },
  {
    section: "wallet", icon: Wallet, title: "Wallets & Coins",
    description: "Manage your coins, balance and gifts.",
    features: [
      { Icon: Wallet, title: "Coins & balance", body: "Top up coins and keep an eye on your balance." },
      { Icon: CircleDollarSign, title: "Send & receive gifts", body: "Support creators and get supported with gifts." },
    ],
  },
  {
    section: "tools", icon: Wrench, title: "Creator Tools",
    description: "Handy tools to help you create and grow.",
    features: [
      { Icon: Wrench, title: "Creator tools", body: "Everything you need to make and manage content." },
      { Icon: TrendingUp, title: "Grow your channel", body: "Shortcuts to promote, schedule and improve." },
    ],
  },
];

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: sd.divider,
  },
  // One control size for back / notifications: a 36pt fill circle, flat - the
  // prototype has no shadows on the header controls.
  circleBtn: {
    width: 36, height: 36, borderRadius: sr.pill, backgroundColor: sd.fill,
    alignItems: "center", justifyContent: "center",
  },
  lockup: { flex: 1, minWidth: 0, justifyContent: "center" },
  wordmarkImg: { width: 122, height: 28, resizeMode: "contain" },

  avatarImg: { width: 36, height: 36, borderRadius: 18 },

  // Chip row - hairline underline separates it from the section below.
  navRow: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: sd.divider },
  navRowContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 7 },
  // No fixed width: each chip is exactly as wide as its label plus padding, so
  // nothing is clipped.
  navChip: {
    flexDirection: "row", alignItems: "center", gap: 7,
    borderRadius: sr.chip, borderWidth: 1, borderColor: sd.line,
    backgroundColor: sd.page, paddingHorizontal: 13, height: 38,
  },
  navChipActive: { backgroundColor: sd.ink, borderColor: sd.ink },
  navChipText: { fontSize: 12.5, fontWeight: font.weightBold, color: sd.slate },
  navChipTextActive: { color: "#FFFFFF" },

  // The prototype's padlock and count badge on a nav chip. `#C7C2CE` is the
  // hex it uses for these secondary glyphs and nowhere else, so it stays here
  // rather than in the shared `sd` tokens.
  navChipBadge: {
    minWidth: 17, height: 17, borderRadius: sr.pill, backgroundColor: sd.accent,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 5,
  },
  navChipBadgeText: { fontSize: 10, fontWeight: font.weightHeavy, color: "#FFFFFF" },
});

