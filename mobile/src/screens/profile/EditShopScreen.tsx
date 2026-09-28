import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { ChevronRight, CheckCircle2 } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Avatar } from "@/components/Avatar";
import { EditShell } from "@/components/settings/EditShell";
import { Input } from "./SellerApplicationWizardScreen";
import { shopSettingsApi, type ShopSettings, type ShopSettingsUpdate } from "@/api/shop-settings.api";
import { shopApi, type ShopCategory } from "@/api/shop.api";
import { payoutMethodsApi } from "@/api/payout-methods.api";
import { apiErrorMessage } from "@/api/client";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";
import type { RootStackParamList } from "@/navigation/types";

/**
 * Settings -> Sell on Teezer -> Shop -> Edit Shop (ShopScreen.tsx's owner-
 * only "Edit Shop" button). Editing an ALREADY-APPROVED shop's storefront -
 * server-backed on shop-settings.api.ts (ShopSettingsController.php), NOT
 * seller-application.api.ts/SellerApplicationWizardScreen, which is
 * onboarding-only and refuses writes once approved.
 *
 * One screen, one Save Changes, same EditShell chrome every other Profile-
 * Information field editor already uses - not a second linear wizard. The
 * Shop Name / Description / Shipping / Returns / Support inputs reuse
 * SellerApplicationWizardScreen's own `Input` component (exported from
 * there) so the fields look identical to where a seller first entered them.
 *
 * Deliberately does NOT include a shop username field - the shop's public
 * handle is always the account's own @username (see ShopScreen.tsx), never
 * a second one to set up or maintain.
 */

const EMPTY: ShopSettingsUpdate & { policies: NonNullable<ShopSettings["policies"]> } = {
  shop_name: "", description: "", category_id: null, policies: {},
};

export function EditShopScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, "EditShop">>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [hasPayoutMethod, setHasPayoutMethod] = useState(false);
  const [original, setOriginal] = useState(EMPTY);
  const [form, setForm] = useState(EMPTY);
  const set = (patch: Partial<typeof form>) => setForm((p) => ({ ...p, ...patch }));
  const setShipping = (patch: Partial<NonNullable<ShopSettings["policies"]>["shipping"]>) =>
    set({ policies: { ...form.policies, shipping: { ...form.policies.shipping, ...patch } } });
  const setReturns = (patch: Partial<NonNullable<ShopSettings["policies"]>["returns"]>) =>
    set({ policies: { ...form.policies, returns: { ...form.policies.returns, ...patch } } });
  const setSupport = (patch: Partial<NonNullable<ShopSettings["policies"]>["support"]>) =>
    set({ policies: { ...form.policies, support: { ...form.policies.support, ...patch } } });

  const load = useCallback(async () => {
    try {
      const [settings, cats] = await Promise.all([shopSettingsApi.get(), shopApi.categories()]);
      setCategories(cats);
      setCategoryName(cats.find((c) => c.id === settings.category_id)?.name ?? null);
      setLogoUrl(settings.logo_url);
      const next = {
        shop_name: settings.shop_name ?? "",
        description: settings.description ?? "",
        category_id: settings.category_id,
        policies: settings.policies ?? {},
      };
      setOriginal(next);
      setForm(next);
    } catch (e) {
      Alert.alert("Couldn't load", apiErrorMessage(e, "Something went wrong loading your shop settings."));
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [navigation]);

  useEffect(() => { void load(); }, [load]);
  // Payout status can change from that screen while this one is still open.
  useFocusEffect(useCallback(() => {
    payoutMethodsApi.list().then((p) => setHasPayoutMethod(p.length > 0)).catch(() => {});
  }, []));

  // ShopCategoryPickerScreen navigates straight back here with its pick as a
  // param (this screen is already on the stack, so that's a pop, not a push -
  // the rest of the form is untouched). Applied once, then cleared from the
  // route so a later, unrelated return to this screen doesn't re-apply it.
  const pickedCategoryId = route.params?.pickedCategoryId;
  useEffect(() => {
    if (pickedCategoryId == null) return;
    set({ category_id: pickedCategoryId });
    setCategoryName(route.params?.pickedCategoryName ?? null);
    navigation.setParams({ pickedCategoryId: undefined, pickedCategoryName: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedCategoryId]);

  const dirty = JSON.stringify(form) !== JSON.stringify(original);

  const pickLogo = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert("Permission needed", "Allow photo access to change your shop logo."); return; }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: true, aspect: [1, 1] });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      setUploadingLogo(true);
      const { logo_url } = await shopSettingsApi.uploadLogo({ uri: a.uri, name: a.fileName || "logo.jpg", type: "image/jpeg" });
      setLogoUrl(logo_url);
    } catch (e) {
      Alert.alert("Upload failed", apiErrorMessage(e, "Couldn't upload a logo. Please try again."));
    } finally {
      setUploadingLogo(false);
    }
  };

  const onSave = async () => {
    if (!form.shop_name?.trim()) { Alert.alert("Almost there", "Shop name is required."); return; }
    if (!form.category_id) { Alert.alert("Almost there", "Choose a shop category."); return; }
    setSaving(true);
    try {
      const updated = await shopSettingsApi.update({
        shop_name: form.shop_name,
        description: form.description,
        category_id: form.category_id,
        policies: form.policies,
      });
      const next = {
        shop_name: updated.shop_name ?? "",
        description: updated.description ?? "",
        category_id: updated.category_id,
        policies: updated.policies ?? {},
      };
      setOriginal(next);
      setForm(next);
      Alert.alert("Saved", "Your shop settings have been updated.");
    } catch (e) {
      Alert.alert("Couldn't save", apiErrorMessage(e, "Something went wrong. Please try again."));
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
      title="Edit Shop"
      helper="Update what customers see on your Shop page, and how orders are shipped, returned and supported."
      canSave={dirty}
      saving={saving}
      onSave={onSave}
    >
      <View style={s.logoSection}>
        <Pressable onPress={pickLogo} disabled={uploadingLogo} style={s.logoRing}>
          <Avatar uri={logoUrl ?? undefined} style={s.logo} />
          {uploadingLogo && (
            <View style={[s.logo, s.logoOverlay]}>
              <ActivityIndicator color={colors.white} />
            </View>
          )}
          <View style={s.cameraBadge}>
            <Ionicons name="camera" size={16} color={colors.white} />
          </View>
        </Pressable>
        <Pressable onPress={pickLogo} disabled={uploadingLogo} hitSlop={8}>
          <Text style={s.logoHint}>{logoUrl ? "Change logo" : "Add logo"}</Text>
        </Pressable>
      </View>

      <View style={{ gap: spacing.lg }}>
        <Input label="Shop Name" value={form.shop_name ?? ""} onChangeText={(t) => set({ shop_name: t })} placeholder="Luna Studio" autoCapitalize="words" />

        <Pressable
          style={s.box}
          onPress={() => navigation.navigate("ShopCategoryPicker", { selectedId: form.category_id })}
        >
          <Text style={s.boxLabel}>Shop Category</Text>
          <View style={s.boxRow}>
            <Text style={[s.boxInput, { flex: 1 }, !categoryName && { color: colors.textFaint }]} numberOfLines={1}>
              {categoryName ?? "Choose a category"}
            </Text>
            <ChevronRight size={18} color={colors.textFaint} />
          </View>
        </Pressable>

        <Input label="Shop Description" value={form.description ?? ""} onChangeText={(t) => set({ description: t })} placeholder="Modern fashion and accessories." multiline />
      </View>

      <Text style={s.groupLabel}>Shipping</Text>
      <View style={{ gap: spacing.lg }}>
        <Input label="Ships From" value={form.policies.shipping?.ships_from ?? ""} onChangeText={(t) => setShipping({ ships_from: t })} placeholder="City, Country" />
        <Input label="Delivery Regions" value={form.policies.shipping?.delivery_regions ?? ""} onChangeText={(t) => setShipping({ delivery_regions: t })} placeholder="e.g. Nationwide" />
        <Input label="Shipping Method" value={form.policies.shipping?.method ?? ""} onChangeText={(t) => setShipping({ method: t })} placeholder="Standard courier" />
        <Input label="Shipping Fee" value={form.policies.shipping?.fee ?? ""} onChangeText={(t) => setShipping({ fee: t })} placeholder="NPR 100" />
        <Input label="Free Shipping Threshold (Optional)" value={form.policies.shipping?.free_threshold ?? ""} onChangeText={(t) => setShipping({ free_threshold: t })} placeholder="NPR 999" />
        <Input label="Estimated Delivery Time" value={form.policies.shipping?.delivery_time ?? ""} onChangeText={(t) => setShipping({ delivery_time: t })} placeholder="2-5 business days" />
      </View>

      <Text style={s.groupLabel}>Returns &amp; Support</Text>
      <View style={{ gap: spacing.lg }}>
        <View style={s.toggleRow}>
          <Text style={s.toggleLabel}>Do you accept returns?</Text>
          <Switch
            value={!!form.policies.returns?.accepts_returns}
            onValueChange={(v) => setReturns({ accepts_returns: v })}
            trackColor={{ true: colors.brand }}
          />
        </View>
        {form.policies.returns?.accepts_returns && (
          <>
            <Input label="Return Period" value={form.policies.returns?.period ?? ""} onChangeText={(t) => setReturns({ period: t })} placeholder="14 days" />
            <Input label="Return Conditions" value={form.policies.returns?.conditions ?? ""} onChangeText={(t) => setReturns({ conditions: t })} placeholder="Unused, original packaging" multiline />
            <Input label="Refund Method" value={form.policies.returns?.refund_method ?? ""} onChangeText={(t) => setReturns({ refund_method: t })} placeholder="Original payment method" />
          </>
        )}
        <Input label="Support Email" value={form.policies.support?.email ?? ""} onChangeText={(t) => setSupport({ email: t })} placeholder="support@yourshop.com" keyboardType="email-address" />
        <Input label="Support Phone (Optional)" value={form.policies.support?.phone ?? ""} onChangeText={(t) => setSupport({ phone: t })} placeholder="+977 98XXXXXXXX" />
      </View>

      <Text style={s.groupLabel}>Account</Text>
      <View style={{ gap: spacing.sm }}>
        <Pressable style={s.linkCard} onPress={() => navigation.navigate("StudioRoot", { screen: "PaymentMethods" })}>
          <Text style={s.linkCardText}>{hasPayoutMethod ? "Payout method added" : "Add a payout method"}</Text>
          {hasPayoutMethod ? <CheckCircle2 size={18} color={colors.success} /> : <ChevronRight size={18} color={colors.textFaint} />}
        </Pressable>
        <Pressable style={s.linkCard} onPress={() => navigation.navigate("StudioRoot", { screen: "TaxFormWizard" })}>
          <Text style={s.linkCardText}>Tax Information</Text>
          <ChevronRight size={18} color={colors.textFaint} />
        </Pressable>
      </View>
    </EditShell>
  );
}

const s = StyleSheet.create({
  // Logo - same ring + camera-badge treatment as ProfileInfoScreen's own
  // avatar picker, so "tap a photo to change it" looks and feels identical
  // everywhere in the app it appears.
  logoSection: { alignItems: "center", gap: spacing.sm, marginBottom: spacing.xl },
  logoRing: { width: 90, height: 90, borderRadius: 45, padding: 3, backgroundColor: colors.bg, borderWidth: 2, borderColor: colors.border },
  logo: { width: "100%", height: "100%", borderRadius: 42, backgroundColor: colors.bgMuted },
  logoOverlay: { position: "absolute", top: 3, left: 3, right: 3, bottom: 3, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" },
  cameraBadge: {
    position: "absolute", bottom: -2, right: -2, width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: colors.bg,
  },
  logoHint: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.brand },

  // Same boxed field look as SellerApplicationWizardScreen's own Input/
  // SelectBox, for the one field here that opens another page instead of
  // taking text directly.
  box: { backgroundColor: colors.bgMuted, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 4 },
  boxLabel: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.textMuted },
  boxRow: { flexDirection: "row", alignItems: "center" },
  boxInput: { fontSize: 16, color: colors.text },

  groupLabel: { marginTop: spacing.xl, marginBottom: spacing.md, fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },

  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toggleLabel: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text, flex: 1, marginRight: spacing.md },

  linkCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: colors.bgMuted, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  linkCardText: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text },
});
