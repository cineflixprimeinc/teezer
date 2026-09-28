import { useEffect } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { ChevronLeft, CreditCard, Landmark, Lock, Plus, Send, Smartphone, Star, Trash2, Wallet, type LucideIcon } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { usePaymentMethodsStore, methodSummary, type PaymentMethod, type PaymentMethodType } from "@/store/payment-methods.store";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

const ICONS: Record<PaymentMethodType, LucideIcon> = {
  "Bank Transfer": Landmark, Wallets: Smartphone, PayPal: Wallet, Stripe: CreditCard, Wise: Send,
};

export function PaymentMethodsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const methods = usePaymentMethodsStore((s) => s.methods);
  const setDefault = usePaymentMethodsStore((s) => s.setDefault);
  const removeMethod = usePaymentMethodsStore((s) => s.removeMethod);
  useEffect(() => { void usePaymentMethodsStore.getState().hydrate(); }, []);

  const add = () => navigation.navigate("PayoutMethod");
  const edit = (m: PaymentMethod) => navigation.navigate("PayoutMethod", { methodId: m.id });
  /* These write to the server now, so they can fail. Reporting it matters more
     than usual here: silently reverting the list is what let a creator believe
     a payout method was set when it never reached the server. */
  const reportIfFailed = async (run: Promise<boolean>) => {
    if (await run) return;
    Alert.alert("Couldn't do that", usePaymentMethodsStore.getState().error ?? "Please try again.");
  };

  const confirmRemove = (m: PaymentMethod) =>
    Alert.alert("Remove payment method", `Remove ${m.type}? You can add it again anytime.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => void reportIfFailed(removeMethod(m.id)) },
    ]);

  return (
    <Screen edges={["top"]} bg={colors.bg}>
      {/* Header */}
      <View style={s.header}>
        <Pressable hitSlop={8} style={s.iconBtn} onPress={() => navigation.goBack()}>
          <ChevronLeft size={22} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={s.headerTitle}>Payment Methods</Text>
        <Pressable hitSlop={8} style={s.iconBtn} onPress={add}>
          <Plus size={22} color={colors.text} strokeWidth={2.4} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.body, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Text style={s.intro}>Add and manage the accounts you receive your creator payouts to.</Text>

        {methods.length === 0 ? (
          <View style={s.empty}>
            <View style={s.emptyIcon}><Wallet size={26} color={colors.brand} strokeWidth={2} /></View>
            <Text style={s.emptyTitle}>No payment methods yet</Text>
            <Text style={s.emptySub}>Add a bank account, PayPal, Stripe or Wise to receive your earnings.</Text>
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            {methods.map((m) => {
              const Icon = ICONS[m.type];
              return (
                <View key={m.id} style={s.card}>
                  <Pressable style={s.cardTop} onPress={() => edit(m)}>
                    <View style={s.cardIcon}><Icon size={22} color={colors.brand} strokeWidth={2.1} /></View>
                    <View style={{ flex: 1 }}>
                      <View style={s.cardTitleRow}>
                        <Text style={s.cardType}>{m.type}</Text>
                        {m.isDefault && (
                          <View style={s.defaultBadge}>
                            <Star size={10} color={colors.brand} strokeWidth={2.6} fill={colors.brand} />
                            <Text style={s.defaultBadgeText}>Default</Text>
                          </View>
                        )}
                        {/* Saved here but not yet on the server - say so rather
                            than let it look ready to be paid into. */}
                        {m.pendingSync && (
                          <View style={s.pendingBadge}>
                            <Text style={s.pendingBadgeText}>On this device</Text>
                          </View>
                        )}
                      </View>
                      <Text style={s.cardSummary} numberOfLines={1}>{methodSummary(m)}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
                  </Pressable>

                  <View style={s.cardActions}>
                    {!m.isDefault && (
                      <Pressable style={s.actionBtn} onPress={() => void reportIfFailed(setDefault(m.id))} hitSlop={6}>
                        <Star size={14} color={colors.brand} strokeWidth={2.4} />
                        <Text style={s.actionText}>Set as default</Text>
                      </Pressable>
                    )}
                    <View style={{ flex: 1 }} />
                    <Pressable style={s.actionBtn} onPress={() => confirmRemove(m)} hitSlop={6}>
                      <Trash2 size={14} color={colors.danger} strokeWidth={2.2} />
                      <Text style={[s.actionText, { color: colors.danger }]}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <Pressable style={s.addBtn} onPress={add}>
          <Plus size={17} color={colors.white} strokeWidth={2.8} />
          <Text style={s.addBtnText}>Add Payment Method</Text>
        </Pressable>

        {/* Apple / App Store compliance note */}
        <View style={s.note}>
          <Lock size={16} color={colors.textMuted} strokeWidth={2} />
          <Text style={s.noteText}>
            Payment methods are used only to receive your creator earnings - never for purchases. Coins, gifts and
            subscriptions are bought through the App Store. Some regions may require you to complete verification on the web.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, height: 52 },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },

  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  intro: { fontSize: font.sm, lineHeight: 19, color: colors.textMuted, marginBottom: spacing.lg },

  empty: { alignItems: "center", paddingVertical: spacing.xl, gap: 6 },
  emptyIcon: { width: 64, height: 64, borderRadius: radius.lg, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center", marginBottom: spacing.xs },
  emptyTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.textSecondary },
  emptySub: { fontSize: font.sm, color: colors.textFaint, textAlign: "center", maxWidth: 280, lineHeight: 18 },

  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  cardIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center" },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cardType: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  defaultBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.brandTint, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  defaultBadgeText: { fontSize: 10, fontWeight: font.weightBold, color: colors.brand },
  pendingBadge: { backgroundColor: colors.bgMuted, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  pendingBadgeText: { fontSize: 10, fontWeight: font.weightBold, color: colors.textMuted },
  cardSummary: { marginTop: 3, fontSize: font.sm, color: colors.textMuted, fontWeight: font.weightMedium },
  cardActions: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, paddingTop: 2 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 6 },
  actionText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.brand },

  addBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: spacing.lg,
    backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 14,
  },
  addBtnText: { color: colors.white, fontSize: font.md, fontWeight: font.weightBold },

  note: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", marginTop: spacing.lg, backgroundColor: colors.bgMuted, borderRadius: radius.md, padding: spacing.md },
  noteText: { flex: 1, fontSize: font.xs, lineHeight: 17, color: colors.textMuted },
});
