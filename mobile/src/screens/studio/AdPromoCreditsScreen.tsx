import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Award, Gift, Lightbulb, Ticket, Users } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { BottomSheet } from "@/components/BottomSheet";
import { AdHeader, HeroCard, Card, CardTitle, IconRow, InfoCallout, Divider, fmtUsd } from "./ad-ui";
import { useAdAccountStore } from "@/store/ad-account.store";
import { colors } from "@/constants/colors";
import { font, radius, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

const HELP = "Promotional credits are free ad money you can earn from Teezer and apply to your campaigns.";

export function AdPromoCreditsScreen() {
  const insets = useSafeAreaInsets();
  const data = useAdAccountStore((s) => s.data);
  const applyPromo = useAdAccountStore((s) => s.applyPromo);
  useEffect(() => { void useAdAccountStore.getState().hydrate(); }, []);

  const [promoOpen, setPromoOpen] = useState(false);
  const [code, setCode] = useState("");
  const soon = (label: string) => Alert.alert(label, "This is coming soon.");

  const usedPct = data.creditsEarned > 0 ? Math.min(100, Math.round((data.creditsUsed / data.creditsEarned) * 100)) : 0;

  const onApply = () => {
    const res = applyPromo(code);
    if (res.ok) {
      setPromoOpen(false);
      setCode("");
      Alert.alert("Credit applied 🎉", res.message);
    } else {
      Alert.alert("Couldn't apply code", res.message);
    }
  };

  return (
    <Screen edges={["top"]}>
      <AdHeader title="Promotional Credits" help={HELP} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.lg }}>
        {/* Available balance */}
        <HeroCard>
          <View style={styles.balTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.balLabel}>Available Balance</Text>
              <Text style={styles.balValue}>{fmtUsd(data.creditsAvailable)}</Text>
              <Text style={styles.balSub}>
                {data.creditsAvailable > 0 ? `${fmtUsd(data.creditsAvailable)} in credits available` : "No promotional credits available"}
              </Text>
            </View>
            <View style={styles.giftIcon}><Gift size={26} color={colors.brand} strokeWidth={2} /></View>
          </View>
        </HeroCard>

        {/* Credit usage */}
        <View style={styles.usageHead}>
          <Text style={styles.sectionTitle}>Credit Usage</Text>
          <Text style={styles.usagePct}>{usedPct}%</Text>
        </View>
        <View style={styles.usageWrap}>
          <View style={styles.track}><View style={[styles.fill, { width: `${usedPct}%` }]} /></View>
          <View style={styles.usageRow}>
            <View>
              <Text style={styles.usageLabel}>Used</Text>
              <Text style={styles.usageValue}>{fmtUsd(data.creditsUsed)}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.usageLabel}>Total Earned</Text>
              <Text style={styles.usageValue}>{fmtUsd(data.creditsEarned)}</Text>
            </View>
          </View>
        </View>

        {/* Apply promo code */}
        <Card>
          <IconRow icon={Ticket} title="Apply Promo Code" chevron onPress={() => setPromoOpen(true)} />
        </Card>

        {/* Ways to earn */}
        <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Ways to Earn Credits</Text></View>
        <Card>
          <IconRow icon={Gift} title="Special Offers" subtitle="Get credits from limited time promotions" chevron onPress={() => soon("Special Offers")} />
          <Divider />
          <IconRow icon={Award} iconColor="#d97706" iconBg="#fef3e2" title="Events & Programs" subtitle="Earn credits from Teezer events" chevron onPress={() => soon("Events & Programs")} />
          <Divider />
          <IconRow icon={Users} iconColor="#7c3aed" iconBg="#f1eafe" title="Referral Rewards" subtitle="Invite businesses and earn credits" chevron onPress={() => soon("Referral Rewards")} />
        </Card>

        {/* About */}
        <InfoCallout
          icon={Lightbulb}
          tone="info"
          title="About Promotional Credits"
          body="Credits can be used to run ads on Teezer. Credits may be earned through promotions, events or offers."
        />
      </ScrollView>

      {/* Promo code entry */}
      <BottomSheet visible={promoOpen} onClose={() => setPromoOpen(false)} keyboardAvoid scrollable={false}>
        <Text style={styles.sheetTitle}>Apply Promo Code</Text>
        <Text style={styles.sheetSub}>Enter a valid Teezer Ads promo code to add free credits to your account.</Text>
        <TextInput
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          placeholder="ENTER CODE"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.codeInput}
        />
        <Pressable style={[styles.applyBtn, !code.trim() && styles.applyBtnOff]} disabled={!code.trim()} onPress={onApply}>
          <Text style={styles.applyBtnText}>Apply Code</Text>
        </Pressable>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  balTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  balLabel: { fontSize: font.sm, color: colors.textMuted, fontWeight: font.weightBold },
  balValue: { marginTop: 4, fontSize: 32, fontWeight: font.weightHeavy, color: colors.text },
  balSub: { marginTop: 2, fontSize: font.sm, color: colors.textMuted, fontWeight: font.weightMedium },
  giftIcon: { width: 48, height: 48, borderRadius: 15, backgroundColor: "rgba(254,44,85,0.12)", alignItems: "center", justifyContent: "center" },

  usageHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  usagePct: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.textMuted },
  usageWrap: { paddingHorizontal: spacing.lg },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.borderStrong, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4, backgroundColor: colors.brand },
  usageRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md },
  usageLabel: { fontSize: font.xs, color: colors.textMuted, fontWeight: font.weightMedium },
  usageValue: { marginTop: 2, fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },

  sectionHead: { paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: 2 },

  sheetTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text, paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  sheetSub: { fontSize: font.sm, color: colors.textMuted, paddingHorizontal: spacing.lg, marginTop: 4, marginBottom: spacing.md, lineHeight: 19 },
  codeInput: {
    marginHorizontal: spacing.lg, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 13, fontSize: font.lg, fontWeight: font.weightHeavy,
    letterSpacing: 2, color: colors.text, backgroundColor: colors.bgMuted, textAlign: "center",
  },
  applyBtn: { backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 15, alignItems: "center", marginHorizontal: spacing.lg, marginTop: spacing.md, marginBottom: spacing.lg },
  applyBtnOff: { opacity: 0.5 },
  applyBtnText: { color: colors.white, fontSize: font.md, fontWeight: font.weightHeavy },
});
