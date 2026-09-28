import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Screen } from "@/components/Screen";
import { EditShell } from "@/components/settings/EditShell";
import { Input } from "./SellerApplicationWizardScreen";
import { shopSettingsApi, type ShopSettings } from "@/api/shop-settings.api";
import type { ShopPolicies } from "@/api/seller-application.api";
import { apiErrorMessage } from "@/api/client";
import { colors } from "@/constants/colors";

/**
 * Shop Settings > Selling > Shipping & Delivery. Reads/writes the exact same
 * `policies.shipping` sub-key Edit Shop's own Shipping group already uses
 * (via the same shopSettingsApi, merge-not-replace on write) - a dedicated,
 * more discoverable place to reach it, not a second copy of the data.
 */
export function ShopShippingSettingsScreen() {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [original, setOriginal] = useState<NonNullable<ShopPolicies["shipping"]>>({});
  const [form, setForm] = useState<NonNullable<ShopPolicies["shipping"]>>({});
  const set = (patch: Partial<typeof form>) => setForm((p) => ({ ...p, ...patch }));

  useEffect(() => {
    shopSettingsApi.get()
      .then((s: ShopSettings) => {
        const shipping = s.policies?.shipping ?? {};
        setOriginal(shipping);
        setForm(shipping);
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
      const updated = await shopSettingsApi.update({ policies: { shipping: form } });
      const shipping = updated.policies?.shipping ?? {};
      setOriginal(shipping);
      setForm(shipping);
      Alert.alert("Saved", "Your shipping settings have been updated.");
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
      title="Shipping & Delivery"
      helper="Tell customers how, where and when their orders will arrive."
      canSave={dirty}
      saving={saving}
      onSave={onSave}
    >
      <View style={{ gap: 16 }}>
        <Input label="Ships From" value={form.ships_from ?? ""} onChangeText={(t) => set({ ships_from: t })} placeholder="City, Country" />
        <Input label="Delivery Regions" value={form.delivery_regions ?? ""} onChangeText={(t) => set({ delivery_regions: t })} placeholder="e.g. Nationwide" />
        <Input label="Shipping Method" value={form.method ?? ""} onChangeText={(t) => set({ method: t })} placeholder="Standard courier" />
        <Input label="Shipping Fee" value={form.fee ?? ""} onChangeText={(t) => set({ fee: t })} placeholder="NPR 100" />
        <Input label="Free Shipping Threshold (Optional)" value={form.free_threshold ?? ""} onChangeText={(t) => set({ free_threshold: t })} placeholder="NPR 999" />
        <Input label="Estimated Delivery Time" value={form.delivery_time ?? ""} onChangeText={(t) => set({ delivery_time: t })} placeholder="2-5 business days" />
      </View>
    </EditShell>
  );
}
