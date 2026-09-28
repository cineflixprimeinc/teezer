import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ChevronLeft } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { shopSettingsApi, type ShopNotificationPrefs } from "@/api/shop-settings.api";
import { apiErrorMessage } from "@/api/client";
import { colors } from "@/constants/colors";
import { font, spacing } from "@/constants/theme";

const ROWS: { key: keyof ShopNotificationPrefs; title: string; desc: string }[] = [
  { key: "new_order", title: "New Orders", desc: "When a customer places an order" },
  { key: "order_update", title: "Order Updates", desc: "Status changes on orders you're managing" },
  { key: "payment", title: "Payments", desc: "When a payment settles to your wallet" },
  { key: "return", title: "Returns", desc: "Return and refund requests" },
  { key: "low_stock", title: "Low Stock", desc: "When a product drops below its stock threshold" },
  { key: "customer_message", title: "Customer Messages", desc: "Questions and messages from customers" },
  { key: "review", title: "Reviews", desc: "New reviews left on your shop" },
];

/**
 * Shop Settings > Customer Experience > Notifications. Same JSON-column +
 * merge-defaults mechanism as the account-level NotificationSettingsScreen,
 * shop-scoped - a separate screen/file rather than adding shop keys into
 * that one, since these toggle a different thing entirely (the shop, not
 * the account). See ShopSettingsController's own note: these preferences
 * are saved and real, but nothing dispatches an actual notification off
 * them yet - that's separate, larger work this pass doesn't include.
 */
export function ShopNotificationSettingsScreen() {
  const navigation = useNavigation<any>();
  const [prefs, setPrefs] = useState<ShopNotificationPrefs | null>(null);
  const [original, setOriginal] = useState<ShopNotificationPrefs | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    shopSettingsApi.getNotificationPrefs()
      .then((p) => { setPrefs(p); setOriginal(p); })
      .catch((e) => Alert.alert("Couldn't load", apiErrorMessage(e)));
  }, []);

  const isDirty = !!prefs && !!original && JSON.stringify(prefs) !== JSON.stringify(original);

  const toggle = (key: keyof ShopNotificationPrefs) => (v: boolean) =>
    setPrefs((p) => (p ? { ...p, [key]: v } : p));

  const save = () => {
    if (!prefs) return;
    setSaving(true);
    shopSettingsApi.updateNotificationPrefs(prefs)
      .then((updated) => { setPrefs(updated); setOriginal(updated); })
      .catch((e) => Alert.alert("Couldn't save", apiErrorMessage(e)))
      .finally(() => setSaving(false));
  };

  return (
    <Screen edges={["top"]} bg={colors.bg}>
      <View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => navigation.goBack()} style={s.back}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={s.headerTitle}>Notifications</Text>
        <View style={s.back} />
      </View>

      {!prefs ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.brand} />
      ) : (
        <>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.body}>
            {ROWS.map((row, i) => (
              <View key={row.key}>
                <View style={s.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle}>{row.title}</Text>
                    <Text style={s.rowDesc}>{row.desc}</Text>
                  </View>
                  <Switch value={prefs[row.key]} onValueChange={toggle(row.key)} trackColor={{ true: colors.brand }} thumbColor={colors.white} />
                </View>
                {i < ROWS.length - 1 && <View style={s.divider} />}
              </View>
            ))}
          </ScrollView>

          <View style={s.actionBar}>
            {isDirty && !saving && <Text style={s.dirtyHint}>Unsaved changes</Text>}
            <Pressable style={[s.saveBtn, (!isDirty || saving) && s.saveBtnDisabled]} disabled={!isDirty || saving} onPress={save}>
              {saving ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={s.saveText}>Save Changes</Text>}
            </Pressable>
          </View>
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, height: 52 },
  back: { width: 34, height: 40, justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },

  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  rowTitle: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text },
  rowDesc: { marginTop: 2, fontSize: font.sm, color: colors.textMuted },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },

  actionBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  dirtyHint: { flex: 1, fontSize: font.xs, color: colors.textMuted },
  saveBtn: { backgroundColor: colors.brand, borderRadius: 10, paddingHorizontal: spacing.xl, height: 42, minWidth: 140, alignItems: "center", justifyContent: "center" },
  saveBtnDisabled: { opacity: 0.4 },
  saveText: { fontSize: font.sm, fontWeight: font.weightHeavy, color: colors.white },
});
