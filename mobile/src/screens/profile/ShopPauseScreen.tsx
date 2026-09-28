import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ChevronLeft, PauseCircle, PlayCircle } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { shopSettingsApi, type ShopSettings } from "@/api/shop-settings.api";
import { apiErrorMessage } from "@/api/client";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

/** Quick-select durations - no calendar/date-picker dependency exists anywhere else in the app yet, and a short preset list is the more common pattern for exactly this "pause until" UX anyway. */
const DURATIONS = [
  { label: "1 day", days: 1 },
  { label: "3 days", days: 3 },
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "No end date", days: null as number | null },
];

/**
 * Shop Settings > Shop Operations > Pause Shop. Pausing never deletes
 * products or orders - it only flips Shop.status to STATUS_PAUSED (see the
 * backend's own docblock), which every existing isApproved()-gated read/
 * checkout already treats exactly like a suspended shop with zero other
 * code changes. Existing orders keep being manageable normally from Orders
 * & Returns the whole time.
 */
export function ShopPauseScreen() {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [shop, setShop] = useState<ShopSettings | null>(null);
  const [selectedDays, setSelectedDays] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    shopSettingsApi.get()
      .then(setShop)
      .catch((e) => { Alert.alert("Couldn't load", apiErrorMessage(e)); navigation.goBack(); })
      .finally(() => setLoading(false));
  }, [navigation]);

  const pause = () => {
    setBusy(true);
    const resume_date = selectedDays ? new Date(Date.now() + selectedDays * 86400000).toISOString() : null;
    shopSettingsApi.pause({ resume_date, message: message.trim() || null })
      .then(setShop)
      .catch((e) => Alert.alert("Couldn't pause shop", apiErrorMessage(e)))
      .finally(() => setBusy(false));
  };

  const resume = () => {
    setBusy(true);
    shopSettingsApi.resume()
      .then(setShop)
      .catch((e) => Alert.alert("Couldn't resume shop", apiErrorMessage(e)))
      .finally(() => setBusy(false));
  };

  if (loading || !shop) {
    return (
      <Screen edges={["top"]} bg={colors.bg}>
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.brand} />
      </Screen>
    );
  }

  return (
    <Screen edges={["top"]} bg={colors.bg}>
      <View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => navigation.goBack()} style={s.back}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={s.headerTitle}>Pause Shop</Text>
        <View style={s.back} />
      </View>

      {shop.is_paused ? (
        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          <View style={s.statusCard}>
            <PauseCircle size={28} color={colors.warning} strokeWidth={2} />
            <Text style={s.statusTitle}>Your shop is paused</Text>
            <Text style={s.statusSub}>Customers can't place new orders. Existing orders can still be managed from Orders & Returns.</Text>
            {!!shop.paused_until && <Text style={s.statusMeta}>Resumes {new Date(shop.paused_until).toLocaleDateString()}</Text>}
            {!!shop.pause_message && <Text style={s.statusMeta}>Message shown to customers: "{shop.pause_message}"</Text>}
          </View>

          <Pressable style={s.primaryBtn} disabled={busy} onPress={resume}>
            {busy ? <ActivityIndicator color={colors.white} /> : (
              <View style={s.primaryBtnInner}>
                <PlayCircle size={18} color={colors.white} strokeWidth={2.2} />
                <Text style={s.primaryBtnText}>Resume Shop</Text>
              </View>
            )}
          </Pressable>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          <Text style={s.helper}>
            Pausing stops new orders immediately. Your products and existing orders are never deleted.
          </Text>

          <Text style={s.groupLabel}>Resume Date (Optional)</Text>
          <View style={s.chips}>
            {DURATIONS.map((d) => (
              <Pressable key={d.label} style={[s.chip, selectedDays === d.days && s.chipOn]} onPress={() => setSelectedDays(d.days)}>
                <Text style={[s.chipText, selectedDays === d.days && s.chipTextOn]}>{d.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={s.groupLabel}>Message to Customers (Optional)</Text>
          <TextInput
            style={s.input}
            value={message}
            onChangeText={setMessage}
            placeholder="e.g. On vacation, back soon!"
            placeholderTextColor={colors.textFaint}
            multiline
            maxLength={300}
          />

          <Pressable style={s.pauseBtn} disabled={busy} onPress={pause}>
            {busy ? <ActivityIndicator color={colors.white} /> : (
              <View style={s.primaryBtnInner}>
                <PauseCircle size={18} color={colors.white} strokeWidth={2.2} />
                <Text style={s.primaryBtnText}>Pause Shop</Text>
              </View>
            )}
          </Pressable>
        </ScrollView>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, height: 52 },
  back: { width: 34, height: 40, justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },

  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  helper: { fontSize: font.sm, lineHeight: 20, color: colors.textMuted, marginBottom: spacing.lg },

  groupLabel: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.text, marginBottom: spacing.sm, marginTop: spacing.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.bgMuted, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.textSecondary },
  chipTextOn: { color: colors.white },

  input: { backgroundColor: colors.bgMuted, borderRadius: radius.md, padding: spacing.md, fontSize: font.sm, color: colors.text, minHeight: 80, textAlignVertical: "top" },

  pauseBtn: { marginTop: spacing.xl, height: 52, borderRadius: radius.lg, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" },
  primaryBtn: { marginTop: spacing.lg, height: 52, borderRadius: radius.lg, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  primaryBtnInner: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  primaryBtnText: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.white },

  statusCard: { alignItems: "center", backgroundColor: "#fff7ed", borderRadius: radius.lg, padding: spacing.xl, borderWidth: 1, borderColor: "#fed7aa" },
  statusTitle: { marginTop: spacing.sm, fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  statusSub: { marginTop: spacing.xs, fontSize: font.sm, color: colors.textMuted, textAlign: "center", lineHeight: 19 },
  statusMeta: { marginTop: spacing.md, fontSize: font.xs, color: colors.textSecondary, textAlign: "center" },
});
