import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import {
  Building2, ChevronRight, DollarSign, FileText, Headphones, Lock, Mail, MapPin, Percent, Phone,
  Plus, Receipt, ShieldCheck, Users, Wallet,
} from "lucide-react-native";
import { useCallback } from "react";
import { Screen } from "@/components/Screen";
import { BottomSheet } from "@/components/BottomSheet";
import { OptionSheet } from "@/components/settings/SettingsKit";
import { AdHeader, HeroCard, Card, CardTitle, LabeledRow, Badge, Divider, fmtUsd } from "./ad-ui";
import { useAdAccountStore, type AdAccount } from "@/store/ad-account.store";
import { useTaxFormsStore } from "@/store/tax-forms.store";
import { studioApi } from "@/api/studio.api";
import { fetchAdFundProducts, purchaseAdFunds, iapAvailable, iapUnavailableReason, type AdFundProduct } from "@/api/iap";
import { colors } from "@/constants/colors";
import { font, radius, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

const HELP = "Manage the funds, business details and preferences Teezer uses to bill your ad campaigns.";
const THRESHOLDS = [250, 500, 1000, 1500, 2500];

export function AdBillingScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const data = useAdAccountStore((s) => s.data);
  const update = useAdAccountStore((s) => s.update);
  const addFunds = useAdAccountStore((s) => s.addFunds);
  useEffect(() => { void useAdAccountStore.getState().hydrate(); }, []);

  // Real tax info = the form the user submitted in Teezer Studio → Tax Forms
  // (approved one if any, else the latest). We show THAT here instead of a
  // separate, conflicting set of billing tax fields.
  const taxForms = useTaxFormsStore((s) => s.forms);
  useFocusEffect(useCallback(() => { void useTaxFormsStore.getState().load(true); }, []));
  const taxForm = taxForms.find((f) => f.status === "Approved") ?? taxForms[0] ?? null;

  // Real spendable balance from the server (ledger), not the local demo balance.
  const [serverBalance, setServerBalance] = useState<number | null>(null);
  useFocusEffect(useCallback(() => {
    let alive = true;
    studioApi.adAccount().then((d) => { if (alive) setServerBalance(d.balance_cents / 100); }).catch(() => {});
    return () => { alive = false; };
  }, []));

  const [fundsOpen, setFundsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [thresholdOpen, setThresholdOpen] = useState(false);
  const [freqOpen, setFreqOpen] = useState(false);
  const [taxExOpen, setTaxExOpen] = useState(false);

  // Credited only AFTER the store confirms a verified In-App Purchase (see
  // AddFundsSheet) - there is no path that adds balance without a real payment.
  const onFunded = (amt: number) => {
    addFunds(amt);
    Alert.alert("Funds added", `${fmtUsd(amt)} was added to your ad account balance.`);
  };

  return (
    <Screen edges={["top"]}>
      <AdHeader title="Billing Information" help={HELP} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.lg }}>
        {/* Balance + billing controls */}
        <HeroCard>
          <View style={styles.balTop}>
            <View>
              <Text style={styles.balLabel}>Current Balance</Text>
              <Text style={styles.balValue}>{fmtUsd(serverBalance ?? data.balance)}</Text>
              <Text style={styles.balCur}>USD</Text>
            </View>
            <Pressable style={styles.addBtn} onPress={() => setFundsOpen(true)}>
              <Plus size={16} color={colors.white} strokeWidth={2.6} />
              <Text style={styles.addBtnText}>Add Funds</Text>
            </Pressable>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroRow}>
            <Text style={styles.heroRowLabel}>Auto Pay</Text>
            <Switch
              value={data.autoPay}
              onValueChange={(v) => update({ autoPay: v })}
              trackColor={{ false: colors.borderStrong, true: colors.brand }}
              thumbColor={colors.white}
            />
          </View>
          <View style={styles.heroDivider} />
          <Pressable style={styles.heroRow} onPress={() => setThresholdOpen(true)}>
            <Text style={styles.heroRowLabel}>Billing Threshold</Text>
            <View style={styles.heroRowRight}>
              <Text style={styles.heroRowValue}>{fmtUsd(data.billingThreshold)}</Text>
              <ChevronRight size={16} color={colors.textMuted} />
            </View>
          </Pressable>
        </HeroCard>

        {/* Business Information */}
        <Card>
          <CardTitle title="Business Information" action="Edit" onAction={() => setEditOpen(true)} />
          <LabeledRow icon={Users} label="Business Name" value={data.businessName} />
          <Divider />
          <LabeledRow icon={Mail} label="Business Email" value={data.billingEmail} />
          <Divider />
          <LabeledRow icon={Phone} label="Phone Number" value={data.phone} />
          <Divider />
          <LabeledRow icon={MapPin} label="Address" value={data.address} />
        </Card>

        {/* Tax Information - pulled from the user's submitted Tax Form, managed in
            Teezer Studio → Tax Forms (not a separate set of billing tax fields). */}
        <Card>
          <CardTitle title="Tax Information" action={taxForm ? "Manage" : "Add"} onAction={() => navigation.navigate("TaxForms")} />
          {taxForm ? (
            <>
              <LabeledRow
                icon={ShieldCheck}
                label="Tax Status"
                valueNode={<View style={{ marginTop: 4, alignSelf: "flex-start" }}>
                  <Badge label={taxForm.status} tone={taxForm.status === "Approved" ? "success" : taxForm.status === "Rejected" ? "warning" : "muted"} />
                </View>}
              />
              <Divider />
              <LabeledRow icon={FileText} label="Form Type" value={`${taxForm.formType} (${taxForm.entityKind})`} />
              <Divider />
              <LabeledRow icon={Building2} label={`${taxForm.tinType || "Tax"} Number`} value={taxForm.taxId || "-"} />
              <Divider />
              <LabeledRow icon={MapPin} label="Tax Country" value={taxForm.residenceCountry || "-"} />
            </>
          ) : (
            <Pressable style={styles.taxEmpty} onPress={() => navigation.navigate("TaxForms")}>
              <FileText size={18} color={colors.textMuted} strokeWidth={2} />
              <Text style={styles.taxEmptyText}>No tax form submitted yet. Tap to add your tax information.</Text>
              <ChevronRight size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </Card>

        {/* Billing Preferences */}
        <Card>
          <CardTitle title="Billing Preferences" />
          <LabeledRow icon={Receipt} label="Invoice Frequency" value={data.invoiceFrequency} chevron onPress={() => setFreqOpen(true)} />
          <Divider />
          <LabeledRow icon={DollarSign} label="Currency" value="USD – US Dollar" />
          <Divider />
          <LabeledRow icon={Percent} label="Tax Exemption" value={data.taxExemption ? "Yes" : "No"} chevron onPress={() => setTaxExOpen(true)} />
        </Card>

        {/* Support */}
        <Pressable
          style={styles.support}
          onPress={() => Linking.openURL("mailto:billing@teezer.live?subject=Ad%20billing%20help").catch(() => Alert.alert("Contact billing", "Email billing@teezer.live for help with your ad billing."))}
        >
          <Headphones size={16} color={colors.warning} strokeWidth={2.2} />
          <Text style={styles.supportText}>Need help? Contact billing support</Text>
        </Pressable>
      </ScrollView>

      {/* Add Funds - verified In-App Purchase only */}
      <AddFundsSheet visible={fundsOpen} balance={data.balance} onClose={() => setFundsOpen(false)} onFunded={onFunded} />

      {/* Edit business & tax */}
      <EditBusinessSheet visible={editOpen} data={data} onClose={() => setEditOpen(false)} onSave={(patch) => { update(patch); setEditOpen(false); }} />

      {/* Pickers */}
      <OptionSheet
        visible={thresholdOpen}
        title="Billing Threshold"
        selected={String(data.billingThreshold)}
        options={THRESHOLDS.map((t) => ({ value: String(t), label: fmtUsd(t) }))}
        onSelect={(v) => update({ billingThreshold: Number(v) })}
        onClose={() => setThresholdOpen(false)}
      />
      <OptionSheet
        visible={freqOpen}
        title="Invoice Frequency"
        selected={data.invoiceFrequency}
        options={[{ value: "Monthly", label: "Monthly" }, { value: "Weekly", label: "Weekly" }, { value: "On threshold", label: "On threshold" }]}
        onSelect={(v) => update({ invoiceFrequency: v as AdAccount["invoiceFrequency"] })}
        onClose={() => setFreqOpen(false)}
      />
      <OptionSheet
        visible={taxExOpen}
        title="Tax Exemption"
        selected={data.taxExemption ? "yes" : "no"}
        options={[{ value: "no", label: "No", desc: "Standard tax applies to your ad spend." }, { value: "yes", label: "Yes", desc: "Your account is tax exempt." }]}
        onSelect={(v) => update({ taxExemption: v === "yes" })}
        onClose={() => setTaxExOpen(false)}
      />
    </Screen>
  );
}

/* ── Add funds (verified In-App Purchase) ───────────────────────────────────── */

/**
 * Adds money to the ad balance through Apple/Google In-App Purchase ONLY. Funds
 * are digital content spent in the app, so the store's billing is mandatory
 * (Apple Review 3.1.1) and a "just add $50" button is a rejection. Packs come
 * from the server (they must match App Store Connect / Play Console), the receipt
 * is verified server-side, and the balance is credited only on a confirmed,
 * verified purchase - never on tap alone.
 */
function AddFundsSheet({ visible, balance, onClose, onFunded }: {
  visible: boolean; balance: number; onClose: () => void; onFunded: (amount: number) => void;
}) {
  const available = iapAvailable();
  const [buying, setBuying] = useState<string | null>(null);

  const productsQ = useQuery({
    queryKey: ["adFundProducts"],
    queryFn: fetchAdFundProducts,
    enabled: visible && available,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const buy = async (p: AdFundProduct) => {
    if (buying) return;
    setBuying(p.product_id);
    try {
      const res = await purchaseAdFunds(p.product_id);
      if (res.ok) {
        // Trust the server's credited amount; fall back to the pack's face value.
        const added = res.amountAdded > 0 ? res.amountAdded : p.amount_usd + (p.bonus_usd ?? 0);
        onClose();
        onFunded(added);
      } else if (!res.cancelled) {
        Alert.alert("Payment failed", res.message);
      }
    } finally {
      setBuying(null);
    }
  };

  const products = productsQ.data?.products ?? [];
  const storeEnabled = available && productsQ.data?.enabled && products.length > 0;

  return (
    <BottomSheet visible={visible} onClose={onClose} scrollable={false}>
      <Text style={styles.sheetTitle}>Add Funds</Text>
      <Text style={styles.sheetSub}>Top up your ad balance ({fmtUsd(balance)}) to keep campaigns running.</Text>

      {!available ? (
        <View style={styles.fundNotice}>
          <Lock size={20} color={colors.textMuted} strokeWidth={2} />
          <Text style={styles.fundNoticeText}>{iapUnavailableReason}</Text>
        </View>
      ) : productsQ.isLoading ? (
        <View style={styles.fundLoading}><ActivityIndicator color={colors.brand} /></View>
      ) : !storeEnabled ? (
        <View style={styles.fundNotice}>
          <Lock size={20} color={colors.textMuted} strokeWidth={2} />
          <Text style={styles.fundNoticeText}>Adding funds isn&apos;t available right now. Please try again later.</Text>
        </View>
      ) : (
        <View style={styles.packs}>
          {products.map((p) => {
            const isBuying = buying === p.product_id;
            const hasBonus = (p.bonus_usd ?? 0) > 0;
            return (
              <Pressable
                key={p.product_id}
                style={({ pressed }) => [styles.pack, pressed && styles.packPressed, isBuying && styles.packBusy]}
                disabled={!!buying}
                onPress={() => buy(p)}
              >
                {p.label ? <View style={styles.packTag}><Text style={styles.packTagText}>{p.label}</Text></View> : null}
                <Text style={styles.packAmount}>{fmtUsd(p.amount_usd)}</Text>
                {hasBonus
                  ? <Text style={styles.packBonus}>+{fmtUsd(p.bonus_usd!)} bonus</Text>
                  : <Text style={styles.packBonusMuted}>Ad balance</Text>}
                {isBuying ? (
                  <ActivityIndicator size="small" color={colors.brand} style={{ marginTop: 6 }} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={styles.securedRow}>
        <ShieldCheck size={14} color={colors.success} strokeWidth={2.2} />
        <Text style={styles.securedText}>Secured by the App Store - every payment is verified.</Text>
      </View>
    </BottomSheet>
  );
}

/* ── Edit business & tax details ────────────────────────────────────────────── */

function EditBusinessSheet({ visible, data, onClose, onSave }: {
  visible: boolean; data: AdAccount; onClose: () => void; onSave: (patch: Partial<AdAccount>) => void;
}) {
  const [businessName, setBusinessName] = useState(data.businessName);
  const [billingEmail, setBillingEmail] = useState(data.billingEmail);
  const [phone, setPhone] = useState(data.phone);
  const [address, setAddress] = useState(data.address);
  const [taxId, setTaxId] = useState(data.taxId);
  const [businessType, setBusinessType] = useState(data.businessType);
  const [registered, setRegistered] = useState(data.taxStatus === "Registered");

  // Re-seed the fields whenever the sheet re-opens with fresh data.
  useEffect(() => {
    if (!visible) return;
    setBusinessName(data.businessName); setBillingEmail(data.billingEmail); setPhone(data.phone);
    setAddress(data.address); setTaxId(data.taxId); setBusinessType(data.businessType);
    setRegistered(data.taxStatus === "Registered");
  }, [visible, data]);

  const save = () => onSave({
    businessName: businessName.trim(),
    billingEmail: billingEmail.trim(),
    phone: phone.trim(),
    address: address.trim(),
    taxId: taxId.trim(),
    businessType: businessType.trim(),
    taxStatus: registered ? "Registered" : "Not registered",
  });

  return (
    <BottomSheet visible={visible} onClose={onClose} keyboardAvoid height={0.82}>
      <Text style={styles.sheetTitle}>Business & Tax Details</Text>
      <Text style={styles.sheetSub}>Shown on your ad invoices and used for billing.</Text>
      <EditField label="Business Name" value={businessName} onChangeText={setBusinessName} placeholder="Teezer Brand" />
      <EditField label="Business Email" value={billingEmail} onChangeText={setBillingEmail} placeholder="billing@brand.com" keyboardType="email-address" />
      <EditField label="Phone Number" value={phone} onChangeText={setPhone} placeholder="+977 9800000000" keyboardType="phone-pad" />
      <EditField label="Address" value={address} onChangeText={setAddress} placeholder="City, Region, Country" />
      <EditField label="Tax ID / VAT" value={taxId} onChangeText={setTaxId} placeholder="604123456" />
      <EditField label="Business Type" value={businessType} onChangeText={setBusinessType} placeholder="Private Limited Company" />
      <View style={styles.regRow}>
        <Text style={styles.editLabel}>Tax registered</Text>
        <Switch value={registered} onValueChange={setRegistered} trackColor={{ false: colors.borderStrong, true: colors.brand }} thumbColor={colors.white} />
      </View>
      <Pressable style={styles.saveBtn} onPress={save}>
        <Text style={styles.saveBtnText}>Save Changes</Text>
      </Pressable>
    </BottomSheet>
  );
}

function EditField({ label, value, onChangeText, placeholder, keyboardType }: {
  label: string; value: string; onChangeText: (t: string) => void; placeholder?: string;
  keyboardType?: "email-address" | "phone-pad" | "default";
}) {
  return (
    <View style={styles.editField}>
      <Text style={styles.editLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        keyboardType={keyboardType ?? "default"}
        autoCapitalize="none"
        style={styles.editInput}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  balTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  balLabel: { fontSize: font.sm, color: colors.textMuted, fontWeight: font.weightBold },
  balValue: { marginTop: 4, fontSize: 30, fontWeight: font.weightHeavy, color: colors.text },
  balCur: { fontSize: font.xs, color: colors.textMuted, fontWeight: font.weightBold },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9, marginTop: 4 },
  addBtnText: { color: colors.white, fontSize: font.sm, fontWeight: font.weightHeavy },
  heroDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(0,0,0,0.08)", marginVertical: spacing.sm },
  heroRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  heroRowLabel: { fontSize: font.md, color: colors.text, fontWeight: font.weightBold },
  heroRowRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  heroRowValue: { fontSize: font.sm, color: colors.textSecondary, fontWeight: font.weightBold },

  taxEmpty: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  taxEmptyText: { flex: 1, fontSize: font.sm, color: colors.textMuted, fontWeight: font.weightMedium, lineHeight: 18 },

  support: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: "#fff6e9", borderRadius: 14, paddingVertical: 13, marginHorizontal: spacing.lg, marginTop: spacing.lg },
  supportText: { fontSize: font.sm, color: colors.textSecondary, fontWeight: font.weightBold },

  sheetTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text, paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  sheetSub: { fontSize: font.sm, color: colors.textMuted, paddingHorizontal: spacing.lg, marginTop: 4, marginBottom: spacing.md },
  packs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  pack: {
    width: "31.5%", minHeight: 78, borderRadius: 16, backgroundColor: colors.brandTint,
    borderWidth: 1, borderColor: colors.brand, alignItems: "center", justifyContent: "center",
    paddingVertical: spacing.md, paddingHorizontal: 4,
  },
  packPressed: { opacity: 0.7 },
  packBusy: { opacity: 0.9 },
  packTag: { position: "absolute", top: -8, backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  packTagText: { color: colors.white, fontSize: 9, fontWeight: font.weightHeavy },
  packAmount: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.brand },
  packBonus: { marginTop: 2, fontSize: font.xs, fontWeight: font.weightBold, color: colors.success },
  packBonusMuted: { marginTop: 2, fontSize: 10, fontWeight: font.weightMedium, color: colors.textMuted },
  fundLoading: { paddingVertical: spacing.xl, alignItems: "center" },
  fundNotice: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg,
    backgroundColor: colors.bgMuted, borderRadius: 14, padding: spacing.md,
  },
  fundNoticeText: { flex: 1, fontSize: font.sm, lineHeight: 19, color: colors.textSecondary, fontWeight: font.weightMedium },
  securedRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  securedText: { fontSize: font.xs, color: colors.textMuted, fontWeight: font.weightMedium },

  editField: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  editLabel: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.textSecondary, marginBottom: 6 },
  editInput: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 11, fontSize: font.md, color: colors.text, backgroundColor: colors.bgMuted },
  regRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  saveBtn: { backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 15, alignItems: "center", marginHorizontal: spacing.lg, marginTop: spacing.xs, marginBottom: spacing.lg },
  saveBtnText: { color: colors.white, fontSize: font.md, fontWeight: font.weightHeavy },
});
