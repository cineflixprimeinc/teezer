import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import {
  Calendar, Check, CheckCircle2, ChevronDown, ChevronLeft, FileText, Info, Pencil, UploadCloud,
} from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { DatePickerModal } from "@/components/DatePickerModal";
import { OptionSheet, type SettingsOption } from "@/components/settings/SettingsKit";
import {
  sellerApplicationApi, type SellerApplication, type SellerType, type ShopPolicies,
} from "@/api/seller-application.api";
import { shopApi, type ShopCategory as ApiShopCategory } from "@/api/shop.api";
import { payoutMethodsApi } from "@/api/payout-methods.api";
import { COUNTRIES } from "@/constants/countries";
import { apiErrorMessage, rateLimitInfo } from "@/api/client";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

/**
 * The "Sell on Reelsoo" application wizard - Settings -> Sell on Reelsoo ->
 * Start Selling/Continue (SellerApplicationScreen). Server-backed on
 * seller/application (SellerApplicationController.php); every step's
 * Continue PUTs that step's fields before advancing, so leaving mid-wizard
 * and coming back needs no local draft store - GET simply returns whatever
 * was last saved.
 *
 * Steps 4 (Seller/Business Information) and 5 (Verification) are built from
 * `requirements` (required_fields/required_documents), resolved server-side
 * from (country_code, seller_type) against country_seller_requirements - NOT
 * a fixed form. Payout reuses the existing PayoutMethodScreen and tax
 * information reuses the existing TaxFormWizardScreen (both under
 * StudioStack) rather than collecting either a second time.
 */

const FIELD_META: Record<string, {
  label: string; placeholder?: string; kind: "text" | "multiline" | "date" | "select" | "phone" | "email";
  options?: string[];
}> = {
  legal_full_name: { label: "Legal Full Name", placeholder: "As shown on your government ID", kind: "text" },
  date_of_birth: { label: "Date of Birth", kind: "date" },
  residential_address: { label: "Residential Address", placeholder: "Street, city, postal code", kind: "multiline" },
  phone: { label: "Phone Number", placeholder: "+977 98XXXXXXXX", kind: "phone" },
  email: { label: "Email Address", placeholder: "you@example.com", kind: "email" },
  id_type: { label: "ID Type", kind: "select", options: ["Passport", "National ID", "Driver's License", "Other"] },
  id_number: { label: "ID Number", placeholder: "As shown on the document", kind: "text" },
  legal_business_name: { label: "Legal Business Name", kind: "text" },
  business_type: { label: "Business Type", placeholder: "Sole proprietorship, LLC, etc.", kind: "text" },
  business_registration_number: { label: "Business Registration Number", kind: "text" },
  business_address: { label: "Registered Business Address", placeholder: "Street, city, postal code", kind: "multiline" },
  business_phone: { label: "Business Phone", kind: "phone" },
  business_email: { label: "Business Email", kind: "email" },
  business_website: { label: "Website (Optional)", placeholder: "https://", kind: "text" },
  authorized_rep_name: { label: "Authorized Representative Name", kind: "text" },
  authorized_rep_dob: { label: "Representative Date of Birth", kind: "date" },
  authorized_rep_position: { label: "Position / Role", placeholder: "Owner, Director, Manager...", kind: "text" },
};

const DOCUMENT_LABELS: Record<string, string> = {
  government_id: "Government-issued ID",
  business_registration_certificate: "Business Registration Certificate",
  authorized_rep_id: "Authorized Representative's Government ID",
  proof_of_address: "Proof of Address",
};

const AGREEMENTS: { key: string; label: string }[] = [
  { key: "seller_terms", label: "I agree to the Teezer Seller Terms." },
  { key: "marketplace_policies", label: "I agree to the Teezer Marketplace Policies." },
  { key: "accuracy_confirmed", label: "I confirm that the information provided is accurate." },
  { key: "tax_compliance", label: "I agree to comply with applicable laws and tax requirements." },
];
const AGREEMENT_VERSION = "1.0";

const STEPS = [
  { key: "seller_type", header: "Seller Type", title: "What type of seller are you?", sub: "", info: "" },
  { key: "country", header: "Country", title: "Confirm your country", sub: "Requirements depend on your account's country.", info: "Your country is taken from your Teezer account and can't be changed here - to change it, use Settings > Country & Region." },
  { key: "shop_info", header: "Shop Information", title: "Shop Information", sub: "This is public - it's what customers see.", info: "" },
  { key: "seller_info", header: "Seller Information", title: "Seller Information", sub: "This is kept private and used only for verification.", info: "Never shown publicly on your Shop - only used for identity/business verification, tax and payout purposes." },
  { key: "verification", header: "Verification", title: "Verify Your Seller Account", sub: "", info: "" },
  { key: "payout", header: "Payout", title: "Set Up Payouts", sub: "Your earnings will be sent to this account after eligible orders and applicable processing periods.", info: "" },
  { key: "shipping", header: "Shipping", title: "Shipping Setup", sub: "You can configure more detail later from Shop Settings.", info: "" },
  { key: "returns", header: "Returns", title: "Return & Refund Policy", sub: "Your final policy must comply with applicable laws and Teezer marketplace policies.", info: "" },
  { key: "agreements", header: "Agreements", title: "Seller Agreements", sub: "", info: "" },
  { key: "review", header: "Review", title: "Review Your Application", sub: "", info: "" },
] as const;

type Local = {
  seller_type: SellerType | null;
  country_code: string | null;
  shop_name: string;
  description: string;
  category_id: number | null;
  legal_data: Record<string, string>;
  policies: ShopPolicies;
  agreements: Record<string, { version: string; accepted_at: string }>;
};

const EMPTY: Local = {
  seller_type: null, country_code: null, shop_name: "", description: "", category_id: null,
  legal_data: {}, policies: {}, agreements: {},
};

export function SellerApplicationWizardScreen() {
  const navigation = useNavigation<any>();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [app, setApp] = useState<SellerApplication | null>(null);
  const [local, setLocal] = useState<Local>(EMPTY);
  const set = (patch: Partial<Local>) => setLocal((p) => ({ ...p, ...patch }));

  const [categories, setCategories] = useState<ApiShopCategory[]>([]);
  const [hasPayoutMethod, setHasPayoutMethod] = useState(false);
  const [idTypeSheet, setIdTypeSheet] = useState(false);
  const [dateField, setDateField] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  const hydrated = useRef(false);

  const load = useCallback(async () => {
    try {
      const [data, cats, payouts] = await Promise.all([
        sellerApplicationApi.get(), shopApi.categories(), payoutMethodsApi.list().catch(() => []),
      ]);
      setApp(data);
      setCategories(cats);
      setHasPayoutMethod(payouts.length > 0);
      if (!hydrated.current) {
        hydrated.current = true;
        setLocal({
          seller_type: data.seller_type,
          country_code: data.country_code ?? data.account_country_code,
          shop_name: data.shop_name ?? "",
          description: data.description ?? "",
          category_id: data.category_id,
          legal_data: data.legal_data ?? {},
          policies: data.policies ?? {},
          agreements: (data.agreements as Local["agreements"]) ?? {},
        });
      }
    } catch (e) {
      Alert.alert("Couldn't load", apiErrorMessage(e, "Something went wrong loading your application."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  // Payout/tax status can change from another screen (Payout Method, Tax
  // Forms) - refresh those two on refocus without re-hydrating the form the
  // user is actively editing.
  useFocusEffect(useCallback(() => {
    payoutMethodsApi.list().then((p) => setHasPayoutMethod(p.length > 0)).catch(() => {});
    sellerApplicationApi.get().then((data) => setApp((prev) => (prev ? { ...prev, has_tax_form: data.has_tax_form, documents: data.documents } : data))).catch(() => {});
  }, []));

  const requirements = app?.requirements;
  const countryName = COUNTRIES.find((c) => c.code === local.country_code)?.name ?? local.country_code ?? "";
  const back = () => (step === 0 ? navigation.goBack() : setStep((sp) => sp - 1));

  const save = async (payload: Parameters<typeof sellerApplicationApi.update>[0]) => {
    setSaving(true);
    try {
      const updated = await sellerApplicationApi.update(payload);
      setApp(updated);
      return true;
    } catch (e) {
      Alert.alert("Couldn't save", apiErrorMessage(e, "Something went wrong. Please try again."));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const validate = (): string | null => {
    if (step === 0 && !local.seller_type) return "Choose whether you're an individual or a business seller.";
    if (step === 1 && !local.country_code) return "We couldn't determine your country - set it from Settings > Country & Region first.";
    if (step === 2) {
      if (!local.shop_name.trim()) return "Shop name is required.";
      if (!local.category_id) return "Choose a shop category.";
    }
    if (step === 3) {
      for (const f of requirements?.required_fields ?? []) {
        if (!local.legal_data[f]?.trim()) return `${FIELD_META[f]?.label ?? f} is required.`;
      }
    }
    if (step === 8) {
      for (const a of AGREEMENTS) {
        if (!local.agreements[a.key]?.accepted_at) return "Please accept all required agreements to continue.";
      }
    }
    return null;
  };

  const onContinue = async () => {
    const err = validate();
    if (err) { Alert.alert("Almost there", err); return; }

    let payload: Parameters<typeof sellerApplicationApi.update>[0] = { current_step: STEPS[step].key };
    if (step === 0) payload = { ...payload, seller_type: local.seller_type! };
    else if (step === 1) payload = { ...payload, country_code: local.country_code! };
    else if (step === 2) payload = { ...payload, shop_name: local.shop_name, description: local.description, category_id: local.category_id };
    else if (step === 3) payload = { ...payload, legal_data: local.legal_data };
    else if (step === 6) payload = { ...payload, policies: { shipping: local.policies.shipping } };
    else if (step === 7) payload = { ...payload, policies: { returns: local.policies.returns, support: local.policies.support } };
    else if (step === 8) payload = { ...payload, agreements: local.agreements };

    const ok = await save(payload);
    if (!ok) return;
    if (step < STEPS.length - 1) setStep((sp) => sp + 1);
  };

  const onSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await sellerApplicationApi.submit();
      Alert.alert(
        "Application Submitted",
        "Your Teezer Shop application has been submitted and is waiting for review.",
        [{ text: "OK", onPress: () => navigation.goBack() }],
      );
    } catch (e: any) {
      const rateLimit = rateLimitInfo(e);
      const missing: string[] = e?.response?.data?.errors?.missing ?? [];
      if (rateLimit) {
        const minutes = Math.ceil(rateLimit.retryAfter / 60);
        Alert.alert(
          "Too many attempts",
          minutes > 0
            ? `You've tried submitting a few too many times. Please wait about ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`
            : "You've tried submitting a few too many times. Please wait a bit and try again.",
        );
      } else if (missing.length) {
        const labels = missing.map((m) => {
          if (m.startsWith("document:")) return DOCUMENT_LABELS[m.slice(9)] ?? m;
          if (m.startsWith("agreement:")) return AGREEMENTS.find((a) => a.key === m.slice(10))?.label ?? m;
          if (m === "tax_form") return "Tax Information";
          return FIELD_META[m]?.label ?? m;
        });
        Alert.alert("Required information is missing", labels.join("\n"));
      } else {
        Alert.alert("Couldn't submit", apiErrorMessage(e, "Something went wrong. Please try again."));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const pickDocument = async (documentKey: string) => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert("Permission needed", "Allow photo access to upload a document."); return; }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      setUploading(documentKey);
      const doc = await sellerApplicationApi.uploadDocument(documentKey, {
        uri: a.uri, name: a.fileName || `${documentKey}.jpg`, type: "image/jpeg",
      });
      setApp((p) => (p ? { ...p, documents: [...p.documents.filter((d) => d.document_key !== documentKey), doc] } : p));
    } catch (e) {
      Alert.alert("Upload failed", apiErrorMessage(e, "Couldn't upload that document. Please try again."));
    } finally {
      setUploading(null);
    }
  };

  const pickLogo = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert("Permission needed", "Allow photo access to choose a logo."); return; }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: true, aspect: [1, 1] });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      setUploading("logo");
      const { logo_url } = await sellerApplicationApi.uploadLogo({ uri: a.uri, name: a.fileName || "logo.jpg", type: "image/jpeg" });
      setApp((p) => (p ? { ...p, logo_url } : p));
    } catch (e) {
      Alert.alert("Upload failed", apiErrorMessage(e, "Couldn't upload a logo. Please try again."));
    } finally {
      setUploading(null);
    }
  };

  if (loading) {
    return (
      <Screen edges={["top"]} bg={colors.bg}>
        <Header title="Sell on Teezer" onBack={() => navigation.goBack()} info="" />
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.brand} />
      </Screen>
    );
  }

  const st = STEPS[step];

  return (
    <Screen edges={["top"]} bg={colors.bg}>
      <Header title={st.header} onBack={back} info={st.info} />
      <Stepper current={step + 1} total={STEPS.length} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Text style={s.stepTitle}>{st.title}</Text>
        {!!st.sub && <Text style={s.stepSub}>{st.sub}</Text>}

        {/* ── Step 1 · Seller Type ── */}
        {step === 0 && (
          <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
            <RadioCard
              title="Individual Seller" desc="I sell products personally."
              selected={local.seller_type === "individual"} onPress={() => set({ seller_type: "individual" })}
            />
            <RadioCard
              title="Business" desc="I represent a registered business."
              selected={local.seller_type === "business"} onPress={() => set({ seller_type: "business" })}
            />
          </View>
        )}

        {/* ── Step 2 · Country ── */}
        {step === 1 && (
          <View style={{ gap: spacing.lg, marginTop: spacing.md }}>
            <View style={s.box}>
              <Text style={s.boxLabel}>Country</Text>
              <Text style={s.boxInput}>{countryName || "Not set"}</Text>
            </View>
            <Text style={s.fieldHint}>
              This is your Teezer account's country and can't be changed here, to keep verification consistent with
              your account. To change your account country, use Settings &gt; Country &amp; Region.
            </Text>
          </View>
        )}

        {/* ── Step 3 · Shop Information ── */}
        {step === 2 && (
          <View style={{ gap: spacing.lg, marginTop: spacing.md }}>
            <Pressable style={s.logoPicker} onPress={pickLogo} disabled={uploading === "logo"}>
              {uploading === "logo" ? <ActivityIndicator color={colors.brand} /> : (
                app?.logo_url ? <Text style={s.logoHint}>Change logo</Text> : <Text style={s.logoHint}>Add Shop Logo</Text>
              )}
            </Pressable>
            <Input label="Shop Name" value={local.shop_name} onChangeText={(t) => set({ shop_name: t })} placeholder="Luna Studio" autoCapitalize="words" />
            {/* No separate shop handle to set - the shop's public @username is
             *  always the account's own, shown on the Shop screen right below
             *  the shop name (see ShopScreen.tsx). */}
            <View style={{ gap: spacing.sm }}>
              <Text style={s.boxLabel}>Shop Category</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {categories.map((c) => (
                  <Pressable key={c.id} style={[s.chip, local.category_id === c.id && s.chipOn]} onPress={() => set({ category_id: c.id })}>
                    <Text style={[s.chipText, local.category_id === c.id && s.chipTextOn]}>{c.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <Input label="Shop Description" value={local.description} onChangeText={(t) => set({ description: t })} placeholder="Modern fashion and accessories." multiline />
          </View>
        )}

        {/* ── Step 4 · Seller/Business Information (dynamic) ── */}
        {step === 3 && (
          <View style={{ gap: spacing.lg, marginTop: spacing.md }}>
            {!requirements ? (
              <Text style={s.fieldHint}>Loading requirements for your country...</Text>
            ) : requirements.required_fields.map((f) => {
              const meta = FIELD_META[f];
              if (!meta) return null;
              const value = local.legal_data[f] ?? "";
              const onChangeText = (t: string) => set({ legal_data: { ...local.legal_data, [f]: t } });
              if (meta.kind === "date") {
                return (
                  <SelectBox key={f} label={meta.label} value={value} placeholder="Select date" icon="calendar" onPress={() => setDateField(f)} />
                );
              }
              if (meta.kind === "select") {
                return (
                  <SelectBox key={f} label={meta.label} value={value} placeholder="Select" onPress={() => setIdTypeSheet(true)} />
                );
              }
              return (
                <Input
                  key={f} label={meta.label} value={value} onChangeText={onChangeText} placeholder={meta.placeholder}
                  multiline={meta.kind === "multiline"}
                  keyboardType={meta.kind === "phone" ? "phone-pad" : meta.kind === "email" ? "email-address" : "default"}
                />
              );
            })}
          </View>
        )}

        {/* ── Step 5 · Verification ── */}
        {step === 4 && (
          <View style={{ gap: spacing.xl, marginTop: spacing.md }}>
            {(requirements?.required_documents ?? []).map((key) => {
              const doc = app?.documents.find((d) => d.document_key === key);
              return (
                <View key={key} style={{ gap: spacing.sm }}>
                  <Text style={s.groupLabel}>{DOCUMENT_LABELS[key] ?? key}</Text>
                  {uploading === key ? (
                    <View style={s.uploadZone}><ActivityIndicator color={colors.brand} /></View>
                  ) : doc ? (
                    <DocChip label={DOCUMENT_LABELS[key] ?? key} status={doc.status} adminNote={doc.admin_note} onReplace={() => pickDocument(key)} />
                  ) : (
                    <UploadZone onPress={() => pickDocument(key)} />
                  )}
                </View>
              );
            })}

            {requirements?.requires_tax_form && (
              <View style={{ gap: spacing.sm }}>
                <Text style={s.groupLabel}>Tax Information</Text>
                <Pressable style={s.linkCard} onPress={() => navigation.navigate("StudioRoot", { screen: "TaxFormWizard" })}>
                  <Text style={s.linkCardText}>{app?.has_tax_form ? "Tax information submitted" : "Add Tax Information"}</Text>
                  {app?.has_tax_form ? <CheckCircle2 size={18} color={colors.success} /> : <ChevronDown size={16} color={colors.textFaint} style={{ transform: [{ rotate: "-90deg" }] }} />}
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* ── Step 6 · Payout ── */}
        {step === 5 && (
          <View style={{ gap: spacing.md, marginTop: spacing.md }}>
            <Pressable style={s.linkCard} onPress={() => navigation.navigate("StudioRoot", { screen: "PaymentMethods" })}>
              <Text style={s.linkCardText}>{hasPayoutMethod ? "Payout method added" : "Add a payout method"}</Text>
              {hasPayoutMethod ? <CheckCircle2 size={18} color={colors.success} /> : <ChevronDown size={16} color={colors.textFaint} style={{ transform: [{ rotate: "-90deg" }] }} />}
            </Pressable>
            <Text style={s.fieldHint}>Bank account, mobile wallet or another method supported in your country - same payout accounts creator payouts already use.</Text>
          </View>
        )}

        {/* ── Step 7 · Shipping ── */}
        {step === 6 && (
          <View style={{ gap: spacing.lg, marginTop: spacing.md }}>
            <Input label="Ships From" value={local.policies.shipping?.ships_from ?? ""} onChangeText={(t) => set({ policies: { ...local.policies, shipping: { ...local.policies.shipping, ships_from: t } } })} placeholder="City, Country" />
            <Input label="Delivery Regions" value={local.policies.shipping?.delivery_regions ?? ""} onChangeText={(t) => set({ policies: { ...local.policies, shipping: { ...local.policies.shipping, delivery_regions: t } } })} placeholder="e.g. Nationwide" />
            <Input label="Shipping Method" value={local.policies.shipping?.method ?? ""} onChangeText={(t) => set({ policies: { ...local.policies, shipping: { ...local.policies.shipping, method: t } } })} placeholder="Standard courier" />
            <Input label="Shipping Fee" value={local.policies.shipping?.fee ?? ""} onChangeText={(t) => set({ policies: { ...local.policies, shipping: { ...local.policies.shipping, fee: t } } })} placeholder="NPR 100" keyboardType="default" />
            <Input label="Free Shipping Threshold (Optional)" value={local.policies.shipping?.free_threshold ?? ""} onChangeText={(t) => set({ policies: { ...local.policies, shipping: { ...local.policies.shipping, free_threshold: t } } })} placeholder="NPR 999" />
            <Input label="Estimated Delivery Time" value={local.policies.shipping?.delivery_time ?? ""} onChangeText={(t) => set({ policies: { ...local.policies, shipping: { ...local.policies.shipping, delivery_time: t } } })} placeholder="2-5 business days" />
          </View>
        )}

        {/* ── Step 8 · Returns & Support ── */}
        {step === 7 && (
          <View style={{ gap: spacing.lg, marginTop: spacing.md }}>
            <View style={s.toggleRow}>
              <Text style={s.groupLabel}>Do you accept returns?</Text>
              <Switch
                value={!!local.policies.returns?.accepts_returns}
                onValueChange={(v) => set({ policies: { ...local.policies, returns: { ...local.policies.returns, accepts_returns: v } } })}
                trackColor={{ true: colors.brand }}
              />
            </View>
            {local.policies.returns?.accepts_returns && (
              <>
                <Input label="Return Period" value={local.policies.returns?.period ?? ""} onChangeText={(t) => set({ policies: { ...local.policies, returns: { ...local.policies.returns, period: t } } })} placeholder="14 days" />
                <Input label="Return Conditions" value={local.policies.returns?.conditions ?? ""} onChangeText={(t) => set({ policies: { ...local.policies, returns: { ...local.policies.returns, conditions: t } } })} placeholder="Unused, original packaging" multiline />
                <Input label="Refund Method" value={local.policies.returns?.refund_method ?? ""} onChangeText={(t) => set({ policies: { ...local.policies, returns: { ...local.policies.returns, refund_method: t } } })} placeholder="Original payment method" />
              </>
            )}
            <Text style={s.groupLabel}>Customer Support</Text>
            <Input label="Support Email" value={local.policies.support?.email ?? ""} onChangeText={(t) => set({ policies: { ...local.policies, support: { ...local.policies.support, email: t } } })} placeholder="support@yourshop.com" keyboardType="email-address" />
            <Input label="Support Phone (Optional)" value={local.policies.support?.phone ?? ""} onChangeText={(t) => set({ policies: { ...local.policies, support: { ...local.policies.support, phone: t } } })} placeholder="+977 98XXXXXXXX" keyboardType="phone-pad" />
          </View>
        )}

        {/* ── Step 9 · Agreements ── */}
        {step === 8 && (
          <View style={{ gap: spacing.md, marginTop: spacing.md }}>
            {AGREEMENTS.map((a) => {
              const checked = !!local.agreements[a.key]?.accepted_at;
              return (
                <Pressable
                  key={a.key} style={s.agreementRow}
                  onPress={() => set({
                    agreements: {
                      ...local.agreements,
                      [a.key]: checked ? { version: "", accepted_at: "" } : { version: AGREEMENT_VERSION, accepted_at: new Date().toISOString() },
                    },
                  })}
                >
                  <View style={[s.checkbox, checked && s.checkboxOn]}>{checked && <Check size={14} color="#fff" strokeWidth={3} />}</View>
                  <Text style={s.agreementText}>{a.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* ── Step 10 · Review ── */}
        {step === 9 && (
          <View style={{ gap: spacing.lg, marginTop: spacing.md }}>
            <SummarySection title="Shop" onEdit={() => setStep(2)}>
              <SummaryRow label="Shop Name" value={local.shop_name || "-"} />
            </SummarySection>
            <SummarySection title="Seller Type" onEdit={() => setStep(0)}>
              <SummaryRow label="Type" value={local.seller_type === "business" ? "Business" : "Individual"} />
              <SummaryRow label="Country" value={countryName || "-"} />
            </SummarySection>
            <SummarySection title="Seller Information" onEdit={() => setStep(3)}>
              <SummaryRow label="Status" value={(requirements?.required_fields ?? []).every((f) => local.legal_data[f]) ? "Completed" : "Incomplete"} />
            </SummarySection>
            <SummarySection title="Verification" onEdit={() => setStep(4)}>
              <SummaryRow label="Documents" value={`${app?.documents.length ?? 0} of ${requirements?.required_documents.length ?? 0} uploaded`} />
              {requirements?.requires_tax_form && <SummaryRow label="Tax Information" value={app?.has_tax_form ? "Submitted" : "Missing"} />}
            </SummarySection>
            <SummarySection title="Payout" onEdit={() => setStep(5)}>
              <SummaryRow label="Status" value={hasPayoutMethod ? "Completed" : "Not set up"} />
            </SummarySection>
            <SummarySection title="Shop Policies" onEdit={() => setStep(6)}>
              <SummaryRow label="Shipping & Returns" value={local.policies.shipping || local.policies.returns ? "Completed" : "Not set up"} />
            </SummarySection>
          </View>
        )}
      </ScrollView>

      <View style={s.footer}>
        {step === STEPS.length - 1 ? (
          <Pressable style={[s.primaryBtn, submitting && s.primaryBtnDisabled]} onPress={onSubmit} disabled={submitting}>
            {submitting ? <ActivityIndicator color={colors.white} /> : <Text style={s.primaryBtnText}>Submit Application</Text>}
          </Pressable>
        ) : (
          <Pressable style={[s.primaryBtn, saving && s.primaryBtnDisabled]} onPress={onContinue} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.white} /> : <Text style={s.primaryBtnText}>Continue</Text>}
          </Pressable>
        )}
      </View>

      <DatePickerModal
        visible={dateField != null}
        value={dateField ? local.legal_data[dateField] : undefined}
        onConfirm={(iso) => { if (dateField) set({ legal_data: { ...local.legal_data, [dateField]: iso } }); }}
        onClose={() => setDateField(null)}
        minAge={dateField === "authorized_rep_dob" ? 18 : 13}
      />
      <OptionSheet
        visible={idTypeSheet}
        title="ID Type"
        options={(FIELD_META.id_type.options ?? []).map((v): SettingsOption => ({ value: v, label: v }))}
        selected={local.legal_data.id_type}
        onSelect={(v) => set({ legal_data: { ...local.legal_data, id_type: v } })}
        onClose={() => setIdTypeSheet(false)}
      />
    </Screen>
  );
}

/* ── Header / Stepper ─────────────────────────────────────────────────────── */
function Header({ title, onBack, info }: { title: string; onBack: () => void; info: string }) {
  return (
    <View style={s.header}>
      <Pressable hitSlop={8} style={s.iconBtn} onPress={onBack}>
        <ChevronLeft size={24} color={colors.text} strokeWidth={2.2} />
      </Pressable>
      <Text style={s.headerTitle}>{title}</Text>
      {info ? (
        <Pressable hitSlop={8} style={s.iconBtn} onPress={() => Alert.alert(title, info)}>
          <Info size={20} color={colors.textFaint} strokeWidth={2} />
        </Pressable>
      ) : <View style={s.iconBtn} />}
    </View>
  );
}

function Stepper({ current, total }: { current: number; total: number }) {
  const WINDOW = Math.min(5, total);
  const start = Math.max(1, Math.min(current - 2, total - WINDOW + 1));
  const nums = Array.from({ length: WINDOW }, (_, i) => start + i);
  return (
    <View style={s.stepper}>
      {nums.map((n, i) => {
        const done = n < current;
        const active = n === current;
        return (
          <React.Fragment key={n}>
            <View style={[s.stepDot, (done || active) && s.stepDotOn]}>
              {done ? <Check size={12} color="#fff" strokeWidth={3} /> : <Text style={[s.stepNum, active && s.stepNumActive]}>{n}</Text>}
            </View>
            {i < nums.length - 1 && <View style={[s.stepLine, n < current && s.stepLineOn]} />}
          </React.Fragment>
        );
      })}
    </View>
  );
}

/* ── Field primitives (same visual language as TaxFormWizardScreen) ────────── */
function RadioCard({ title, desc, selected, onPress }: { title: string; desc: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable style={[s.radioCard, selected && s.radioCardOn]} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={s.radioTitle}>{title}</Text>
        <Text style={s.radioDesc}>{desc}</Text>
      </View>
      <View style={[s.radioOuter, selected && s.radioOuterOn]}>{selected && <View style={s.radioInner} />}</View>
    </Pressable>
  );
}

/** Exported for EditShopScreen - same boxed field look, one definition. */
export function Input({ label, value, onChangeText, placeholder, keyboardType, autoCapitalize, multiline, prefix }: {
  label: string; value: string; onChangeText: (t: string) => void; placeholder?: string;
  keyboardType?: "default" | "email-address" | "phone-pad"; autoCapitalize?: "none" | "words" | "characters";
  multiline?: boolean; prefix?: string;
}) {
  return (
    <View style={s.box}>
      <Text style={s.boxLabel}>{label}</Text>
      <View style={s.boxRow}>
        {!!prefix && <Text style={s.boxPrefix}>{prefix}</Text>}
        <TextInput
          value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.textFaint}
          keyboardType={keyboardType ?? "default"} autoCapitalize={autoCapitalize ?? "none"}
          multiline={multiline} style={[s.boxInput, { flex: 1 }, multiline && { minHeight: 60, textAlignVertical: "top" }]}
        />
      </View>
    </View>
  );
}

function SelectBox({ label, value, placeholder, onPress, icon }: {
  label: string; value: string; placeholder: string; onPress: () => void; icon?: "calendar";
}) {
  return (
    <Pressable style={s.box} onPress={onPress}>
      <Text style={s.boxLabel}>{label}</Text>
      <View style={s.boxRow}>
        <Text style={[s.boxInput, { flex: 1 }, !value && { color: colors.textFaint }]} numberOfLines={1}>{value || placeholder}</Text>
        {icon === "calendar" ? <Calendar size={18} color={colors.textFaint} /> : <ChevronDown size={18} color={colors.textFaint} />}
      </View>
    </Pressable>
  );
}

function SummarySection({ title, onEdit, children }: { title: string; onEdit?: () => void; children: React.ReactNode }) {
  return (
    <View style={s.summaryCard}>
      <View style={s.summaryHead}>
        <Text style={s.summaryTitle}>{title}</Text>
        {onEdit && <Pressable hitSlop={8} onPress={onEdit}><Pencil size={16} color={colors.brand} strokeWidth={2.2} /></Pressable>}
      </View>
      <View style={{ gap: spacing.md }}>{children}</View>
    </View>
  );
}
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.summaryRow}>
      <Text style={s.summaryLabel}>{label}</Text>
      <Text style={s.summaryValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function UploadZone({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [s.uploadZone, pressed && { opacity: 0.7 }]} onPress={onPress}>
      <View style={s.uploadIcon}><UploadCloud size={22} color={colors.brand} strokeWidth={2} /></View>
      <Text style={s.uploadTitle}>Upload Document</Text>
      <Text style={s.uploadHint}>PDF, JPG or PNG</Text>
    </Pressable>
  );
}
function DocChip({ label, status, adminNote, onReplace }: { label: string; status: string; adminNote: string | null; onReplace: () => void }) {
  const tone = status === "approved" ? colors.success : status === "rejected" ? colors.danger : colors.warning;
  const toneLabel = status === "approved" ? "Verified" : status === "rejected" ? "Rejected — Retry" : "Pending Review";
  return (
    <Pressable style={s.docChip} onPress={onReplace}>
      <View style={s.docIcon}><FileText size={16} color={colors.brand} strokeWidth={2.2} /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.docName} numberOfLines={1}>{label}</Text>
        {status === "rejected" && !!adminNote && <Text style={s.docNote} numberOfLines={2}>{adminNote}</Text>}
      </View>
      <Text style={[s.docStatus, { color: tone }]}>{toneLabel}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, height: 52 },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },

  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, paddingTop: 2 },
  stepDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  stepDotOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  stepNum: { fontSize: 11, fontWeight: font.weightBold, color: colors.textFaint },
  stepNumActive: { color: colors.white },
  stepLine: { flex: 1, height: 2, backgroundColor: colors.border, marginHorizontal: 4, maxWidth: 32 },
  stepLineOn: { backgroundColor: colors.brand },

  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  stepTitle: { fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text, lineHeight: 30 },
  stepSub: { marginTop: spacing.sm, fontSize: font.sm, lineHeight: 20, color: colors.textMuted },
  groupLabel: { fontSize: font.sm, fontWeight: font.weightHeavy, color: colors.text },
  fieldHint: { fontSize: font.xs, color: colors.textFaint, lineHeight: 16 },

  radioCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1.5, borderColor: colors.borderStrong, borderRadius: radius.lg, padding: spacing.lg, backgroundColor: colors.card },
  radioCardOn: { borderColor: colors.brand, backgroundColor: colors.brandTint },
  radioTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  radioDesc: { marginTop: 3, fontSize: font.sm, lineHeight: 18, color: colors.textMuted },
  radioOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  radioOuterOn: { borderColor: colors.brand },
  radioInner: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.brand },

  box: { borderWidth: 1.5, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingTop: 8, paddingBottom: 6, backgroundColor: colors.card },
  boxLabel: { fontSize: 11, color: colors.textMuted, fontWeight: font.weightMedium },
  boxRow: { flexDirection: "row", alignItems: "center" },
  boxPrefix: { fontSize: font.md, color: colors.textMuted, marginRight: 2 },
  boxInput: { fontSize: font.md, color: colors.text, padding: 0, paddingVertical: 4, marginTop: 1 },

  logoPicker: { alignSelf: "center", width: 84, height: 84, borderRadius: 42, backgroundColor: colors.bgMuted, borderWidth: 1.5, borderColor: colors.borderStrong, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  logoHint: { fontSize: 11, fontWeight: font.weightBold, color: colors.brand, textAlign: "center", paddingHorizontal: 8 },

  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.bgMuted },
  chipOn: { backgroundColor: colors.brand },
  chipText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.textSecondary },
  chipTextOn: { color: colors.white },

  linkCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1.5, borderColor: colors.borderStrong, borderRadius: radius.lg, padding: spacing.lg, backgroundColor: colors.card },
  linkCardText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.text },

  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  agreementRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center", marginTop: 1 },
  checkboxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  agreementText: { flex: 1, fontSize: font.sm, lineHeight: 20, color: colors.textSecondary },

  summaryCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, backgroundColor: colors.card },
  summaryHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  summaryTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  summaryRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  summaryLabel: { flex: 1, fontSize: font.sm, color: colors.textMuted },
  summaryValue: { flex: 1.3, fontSize: font.sm, fontWeight: font.weightBold, color: colors.text, textAlign: "right" },

  uploadZone: { borderWidth: 1.5, borderColor: colors.borderStrong, borderStyle: "dashed", borderRadius: radius.lg, alignItems: "center", justifyContent: "center", paddingVertical: spacing.xl, gap: 6, backgroundColor: colors.bgMuted },
  uploadIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  uploadTitle: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.textSecondary },
  uploadHint: { fontSize: font.xs, color: colors.textFaint },
  docChip: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.card },
  docIcon: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center" },
  docName: { fontSize: font.sm, fontWeight: font.weightMedium, color: colors.text },
  docNote: { fontSize: font.xs, color: colors.danger, marginTop: 2 },
  docStatus: { fontSize: 11, fontWeight: font.weightBold },

  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
  primaryBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 15, alignItems: "center" },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: colors.white, fontSize: font.md, fontWeight: font.weightBold },
});
