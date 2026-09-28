import { useEffect, useState } from "react";
import { haptics } from "@/services/haptics";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import {
  BadgeCheck, Copy, Gauge, Megaphone, Rocket, ScrollText, Settings2, Users,
} from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { CreateCampaignWizard } from "./CreateCampaignWizard";
import { AdPolicyGate } from "./AdPolicyGate";
import { AdHeader, HeroCard, Card, CardTitle, KV, IconRow, Badge, Divider, InfoCallout, fmtUsd } from "./ad-ui";
import { useAdAccountStore } from "@/store/ad-account.store";
import { useOnboardingStore } from "@/store/onboarding.store";
import { studioApi } from "@/api/studio.api";
import { colors } from "@/constants/colors";
import { font, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

const HELP =
  "Your ad account is your billing identity on Teezer Ads. It's created automatically the first time you launch a campaign and comes with a unique account number used on every invoice.";

export function AdAccountScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const data = useAdAccountStore((s) => s.data);
  useEffect(() => { void useAdAccountStore.getState().hydrate(); }, []);

  // Server truth for this ad account: the PERMANENT number (ACCT-…, matching the
  // website + admin), the REAL spendable balance (ledger) and the REAL lifetime
  // spend (actual ad-delivery charges) - not the device-local, committed-budget
  // figures that overstated spend.
  const [server, setServer] = useState<{ account_number: string; balance_cents: number; lifetime_spent_cents: number } | null>(null);
  useEffect(() => {
    let alive = true;
    studioApi.adAccount()
      .then((d) => { if (alive) setServer(d); })
      .catch(() => { /* fall back to the local values below */ });
    return () => { alive = false; };
  }, []);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [policyGate, setPolicyGate] = useState(false);
  const [copied, setCopied] = useState(false);
  const soon = (label: string) => Alert.alert(label, "This is coming soon.");

  // Same one-time Advertising Policy gate the Ads section uses: a creator must
  // accept the policy before the wizard opens (their per-campaign Terms are then
  // accepted inside the wizard). Accepting once is remembered.
  const startCreate = () => {
    if (useOnboardingStore.getState().seen["ads.policy"]) setWizardOpen(true);
    else setPolicyGate(true);
  };

  const hasAccount = data.status === "active" && !!data.accountId;
  const initial = (data.businessName || "R").replace(/[^a-zA-Z0-9]/g, "").slice(0, 1).toUpperCase() || "R";
  // Prefer the server's cross-surface number; fall back to the local id until it loads.
  const displayId = server?.account_number ?? data.accountId;
  // Real lifetime spend from the server (actual delivery charges), not the local
  // committed-budget total that showed spend the user never actually incurred.
  const spendDisplay = server ? fmtUsd(server.lifetime_spent_cents / 100) : fmtUsd(data.totalAdSpend);

  const copyId = async () => {
    if (!displayId) return;
    await Clipboard.setStringAsync(displayId);
    haptics.selection();
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <Screen edges={["top"]}>
      <AdHeader title="Ad Account" help={HELP} />

      {!hasAccount ? (
        // ── No ad account yet: it is minted automatically on the first campaign ──
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Megaphone size={34} color={colors.brand} strokeWidth={2} /></View>
          <Text style={styles.emptyTitle}>No ad account yet</Text>
          <Text style={styles.emptyBody}>
            Launch your first campaign and Teezer instantly sets up your ad account with a unique account number - just like the big platforms.
          </Text>
          <Pressable style={styles.cta} onPress={startCreate}>
            <Megaphone size={18} color={colors.white} strokeWidth={2.4} />
            <Text style={styles.ctaText}>Create New Campaign</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 96 + insets.bottom }}>
            {/* Hero: identity + status + headline stats */}
            <HeroCard>
              <View style={styles.heroTop}>
                <View style={styles.heroMark}><Megaphone size={22} color={colors.brand} strokeWidth={2.2} /></View>
                <Badge label="Active" tone="success" />
              </View>
              <View style={styles.heroIdRow}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{initial}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroName} numberOfLines={1}>{data.businessName}</Text>
                  <Text style={styles.heroSub}>{data.accountType} Account</Text>
                </View>
              </View>
              <View style={styles.heroTiles}>
                <View style={styles.heroTile}>
                  <Text style={styles.heroTileLabel}>Total Ad Spend</Text>
                  <Text style={styles.heroTileValue}>{spendDisplay}</Text>
                </View>
                <View style={styles.heroTile}>
                  <Text style={styles.heroTileLabel}>Active Campaigns</Text>
                  <Text style={styles.heroTileValue}>{data.activeCampaigns}</Text>
                </View>
              </View>
            </HeroCard>

            {/* Account Details */}
            <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Account Details</Text></View>
            <Card>
              <KV
                label="Account ID"
                valueNode={
                  <Pressable style={styles.copyWrap} onPress={copyId} hitSlop={8}>
                    <Text style={styles.copyValue}>{displayId}</Text>
                    <Copy size={15} color={copied ? colors.success : colors.textMuted} strokeWidth={2} />
                  </Pressable>
                }
              />
              <Divider />
              <KV label="Account Owner" value={data.accountOwner} />
              <Divider />
              <KV label="Account Type" value={data.accountType} />
              <Divider />
              <KV label="Time Zone" value={data.timeZone} />
            </Card>

            {/* Verified callout */}
            <InfoCallout
              icon={BadgeCheck}
              tone="info"
              title="Verified Ad Account"
              body="Your ad account is active and ready for campaigns."
            />

            {/* Quick Actions */}
            <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Quick Actions</Text></View>
            <Card>
              <IconRow icon={Settings2} title="Manage Account Settings" chevron onPress={() => navigation.navigate("AdBilling")} />
              <Divider />
              <IconRow icon={Users} title="Add Team Members" chevron onPress={() => soon("Add Team Members")} />
              <Divider />
              <IconRow icon={Gauge} title="Account Limits" chevron onPress={() => soon("Account Limits")} />
              <Divider />
              <IconRow icon={ScrollText} title="Ad Policies" chevron onPress={() => soon("Ad Policies")} />
            </Card>
          </ScrollView>

          {/* Pinned primary action */}
          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.sm }]}>
            <Pressable style={styles.cta} onPress={startCreate}>
              <Megaphone size={18} color={colors.white} strokeWidth={2.4} />
              <Text style={styles.ctaText}>Create New Campaign</Text>
            </Pressable>
          </View>
        </>
      )}

      <AdPolicyGate
        visible={policyGate}
        onClose={() => setPolicyGate(false)}
        onAccept={() => { useOnboardingStore.getState().markSeen("ads.policy"); setPolicyGate(false); setWizardOpen(true); }}
      />

      <CreateCampaignWizard
        visible={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={() => setWizardOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, paddingBottom: TAB_BAR_HEIGHT },
  emptyIcon: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
  emptyTitle: { fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text },
  emptyBody: { marginTop: spacing.sm, fontSize: font.sm, lineHeight: 21, color: colors.textMuted, textAlign: "center", maxWidth: 320 },

  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroMark: { width: 44, height: 44, borderRadius: 14, backgroundColor: "rgba(254,44,85,0.12)", alignItems: "center", justifyContent: "center" },
  heroIdRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.white, fontSize: font.lg, fontWeight: font.weightHeavy },
  heroName: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  heroSub: { marginTop: 1, fontSize: font.sm, color: colors.textMuted, fontWeight: font.weightMedium },
  heroTiles: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  heroTile: { flex: 1, backgroundColor: "rgba(255,255,255,0.7)", borderRadius: 14, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  heroTileLabel: { fontSize: font.xs, color: colors.textMuted, fontWeight: font.weightBold },
  heroTileValue: { marginTop: 4, fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },

  sectionHead: { paddingHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: 2 },
  sectionTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },

  copyWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  copyValue: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.text },

  bottomBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm,
    backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  cta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 15, paddingHorizontal: spacing.xl,
    marginTop: spacing.lg, alignSelf: "stretch",
  },
  ctaText: { color: colors.white, fontSize: font.md, fontWeight: font.weightHeavy, flexShrink: 1 },
});
