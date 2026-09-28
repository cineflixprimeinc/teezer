import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Switch, Text, View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ChevronRight, Truck } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { EditShell } from "@/components/settings/EditShell";
import { Input } from "./SellerApplicationWizardScreen";
import { shopSettingsApi, type ShopSettings } from "@/api/shop-settings.api";
import type { ShopPolicies } from "@/api/seller-application.api";
import { apiErrorMessage } from "@/api/client";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

type Form = {
  returns: NonNullable<ShopPolicies["returns"]>;
  refund_policy: string;
  cancellation_policy: string;
  terms: string;
};
const EMPTY: Form = { returns: {}, refund_policy: "", cancellation_policy: "", terms: "" };

/**
 * Shop Settings > Policies > Shop Policies. Return Policy reuses the exact
 * `policies.returns` fields Edit Shop's "Returns & Support" group already
 * collects (same shopSettingsApi, merge-not-replace). Refund/Cancellation/
 * Terms are new free-text sub-keys under the same `policies` JSON column -
 * no schema change needed, ShopSettingsController::update() already accepts
 * any array shape there. Shipping Policy isn't re-edited here at all - it
 * links out to the dedicated Shipping & Delivery screen so the same fields
 * are never editable in two different forms within this new work.
 */
export function ShopPoliciesScreen() {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [original, setOriginal] = useState<Form>(EMPTY);
  const [form, setForm] = useState<Form>(EMPTY);
  const setReturns = (patch: Partial<Form["returns"]>) => setForm((p) => ({ ...p, returns: { ...p.returns, ...patch } }));

  useEffect(() => {
    shopSettingsApi.get()
      .then((s: ShopSettings) => {
        const next: Form = {
          returns: s.policies?.returns ?? {},
          refund_policy: s.policies?.refund_policy ?? "",
          cancellation_policy: s.policies?.cancellation_policy ?? "",
          terms: s.policies?.terms ?? "",
        };
        setOriginal(next);
        setForm(next);
      })
      .catch((e) => {
        Alert.alert("Couldn't load", apiErrorMessage(e));
        navigation.goBack();
      })
      .finally(() => setLoading(false));
  }, [navigation]);

  const dirty = JSON.stringify(form) !== JSON.stringify(original);

  const onSave = async () => {
    setSaving(true);
    try {
      const updated = await shopSettingsApi.update({
        policies: {
          returns: form.returns,
          refund_policy: form.refund_policy,
          cancellation_policy: form.cancellation_policy,
          terms: form.terms,
        },
      });
      const next: Form = {
        returns: updated.policies?.returns ?? {},
        refund_policy: updated.policies?.refund_policy ?? "",
        cancellation_policy: updated.policies?.cancellation_policy ?? "",
        terms: updated.policies?.terms ?? "",
      };
      setOriginal(next);
      setForm(next);
      Alert.alert("Saved", "Your shop policies have been updated.");
    } catch (e) {
      Alert.alert("Couldn't save", apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen edges={["top"]} bg={colors.bg}>
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.brand} />
      </Screen>
    );
  }

  return (
    <EditShell
      title="Shop Policies"
      helper="What customers can expect from your shop."
      canSave={dirty}
      saving={saving}
      onSave={onSave}
    >
      <Pressable style={s.linkCard} onPress={() => navigation.navigate("ShopShippingSettings")}>
        <Truck size={18} color={colors.text} strokeWidth={2} />
        <Text style={s.linkCardText}>Shipping Policy</Text>
        <ChevronRight size={18} color={colors.textFaint} />
      </Pressable>

      <Text style={s.groupLabel}>Return Policy</Text>
      <View style={{ gap: 16 }}>
        <View style={s.toggleRow}>
          <Text style={s.toggleLabel}>Do you accept returns?</Text>
          <Switch
            value={!!form.returns.accepts_returns}
            onValueChange={(v) => setReturns({ accepts_returns: v })}
            trackColor={{ true: colors.brand }}
          />
        </View>
        {form.returns.accepts_returns && (
          <>
            <Input label="Return Period" value={form.returns.period ?? ""} onChangeText={(t) => setReturns({ period: t })} placeholder="14 days" />
            <Input label="Return Conditions" value={form.returns.conditions ?? ""} onChangeText={(t) => setReturns({ conditions: t })} placeholder="Unused, original packaging" multiline />
          </>
        )}
      </View>

      <Text style={s.groupLabel}>Refund Policy</Text>
      <Input label="Refund Policy" value={form.refund_policy} onChangeText={(t) => setForm((p) => ({ ...p, refund_policy: t }))} placeholder="How and when you issue refunds" multiline />

      <Text style={s.groupLabel}>Cancellation Policy</Text>
      <Input label="Cancellation Policy" value={form.cancellation_policy} onChangeText={(t) => setForm((p) => ({ ...p, cancellation_policy: t }))} placeholder="When an order can be cancelled" multiline />

      <Text style={s.groupLabel}>Terms & Conditions</Text>
      <Input label="Shop Terms" value={form.terms} onChangeText={(t) => setForm((p) => ({ ...p, terms: t }))} placeholder="Any additional terms for buying from your shop" multiline />
    </EditShell>
  );
}

const s = StyleSheet.create({
  linkCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.bgMuted, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginBottom: spacing.lg,
  },
  linkCardText: { flex: 1, fontSize: font.md, fontWeight: font.weightBold, color: colors.text },
  groupLabel: { marginTop: spacing.xl, marginBottom: spacing.md, fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toggleLabel: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text, flex: 1, marginRight: spacing.md },
});
