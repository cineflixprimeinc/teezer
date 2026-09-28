import { useRef, useState } from "react";
import {
  Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { Check, CreditCard, Landmark, Lock, Send, Smartphone, Wallet, type LucideIcon } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { SettingsHeader } from "@/components/settings/SettingsKit";
import { usePaymentMethodsStore, type PaymentMethodType } from "@/store/payment-methods.store";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

type FieldKey =
  | "bankHolder" | "bankName" | "bankAccount" | "bankRouting" | "bankSwift"
  | "walletName" | "walletPhone" | "walletEmail"
  | "paypalEmail" | "stripeEmail" | "wiseEmail";
interface Field { key: FieldKey; label: string; placeholder: string; hint?: string; kb?: "default" | "email-address" | "number-pad" | "phone-pad"; cap?: "none" | "words" | "characters"; optional?: boolean }

/** The wallets a creator can be paid into. Which one is chosen is stored on the
 *  method as `walletProvider`, so the top-level list stays one "Wallets" card
 *  rather than growing a row per wallet. */
const WALLETS = ["Khalti", "eSewa", "UPI", "PhonePe"] as const;

const METHODS: { key: PaymentMethodType; icon: LucideIcon; desc: string; fields: Field[] }[] = [
  {
    key: "Bank Transfer", icon: Landmark, desc: "Direct deposit to your bank account",
    fields: [
      { key: "bankHolder", label: "Account Holder Name", placeholder: "Amit Kumar Shrestha", cap: "words" },
      { key: "bankName", label: "Bank Name", placeholder: "e.g. Nabil Bank", cap: "words" },
      { key: "bankAccount", label: "Account Number", placeholder: "0000 0000 0000", kb: "number-pad" },
      { key: "bankRouting", label: "Routing / IFSC / Sort Code", placeholder: "e.g. NARB0000123", cap: "characters" },
      { key: "bankSwift", label: "SWIFT / BIC", placeholder: "e.g. NARBNPKA", cap: "characters", optional: true },
    ],
  },
  {
    key: "Wallets", icon: Smartphone, desc: "Khalti, eSewa, UPI or PhonePe",
    fields: [
      { key: "walletName", label: "Full Name", placeholder: "Amit Kumar Shrestha", hint: "Must match the name registered on your wallet.", cap: "words" },
      { key: "walletPhone", label: "Wallet Mobile Number", placeholder: "98XXXXXXXX", kb: "phone-pad" },
      { key: "walletEmail", label: "Email ID", placeholder: "you@email.com", kb: "email-address", optional: true },
    ],
  },
  { key: "PayPal", icon: Wallet, desc: "Get paid to your PayPal account", fields: [{ key: "paypalEmail", label: "PayPal Email", placeholder: "you@email.com", kb: "email-address" }] },
  { key: "Stripe", icon: CreditCard, desc: "Payouts via your connected Stripe account", fields: [{ key: "stripeEmail", label: "Stripe Account Email", placeholder: "you@email.com", kb: "email-address" }] },
  { key: "Wise", icon: Send, desc: "Low-fee international transfers", fields: [{ key: "wiseEmail", label: "Wise Email", placeholder: "you@email.com", kb: "email-address" }] },
];

const EMPTY: Record<FieldKey, string> = {
  bankHolder: "", bankName: "", bankAccount: "", bankRouting: "", bankSwift: "",
  walletName: "", walletPhone: "", walletEmail: "",
  paypalEmail: "", stripeEmail: "", wiseEmail: "",
};

export function PayoutMethodScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<Record<string, { methodId?: string } | undefined>, string>>();
  const methodId = route.params?.methodId;

  const methods = usePaymentMethodsStore((s) => s.methods);
  const editing = methodId ? methods.find((m) => m.id === methodId) : undefined;

  const [type, setType] = useState<PaymentMethodType>(editing?.type ?? "Bank Transfer");
  const [vals, setVals] = useState<Record<FieldKey, string>>({ ...EMPTY, ...(editing?.fields as Record<FieldKey, string> | undefined) });
  const [wallet, setWallet] = useState<string>(editing?.fields?.walletProvider ?? WALLETS[0]);
  const [makeDefault, setMakeDefault] = useState(editing ? editing.isDefault : methods.length === 0);
  const setVal = (k: FieldKey, v: string) => setVals((p) => ({ ...p, [k]: v }));

  const selected = METHODS.find((m) => m.key === type)!;

  /* Scrolls the focused field clear of the keyboard. KeyboardAvoidingView alone
     only shrinks the scroll view - it does not move you to the field you
     tapped, which is why the lower inputs were typing behind the keyboard.

     Both offsets are needed: a field's own onLayout y is relative to the fields
     container, and the container's y is relative to the scroll content, so the
     position within the scroll view is the sum of the two. */
  const scroller = useRef<ScrollView>(null);
  const fieldsTop = useRef(0);
  const fieldTops = useRef<Record<string, number>>({});
  const revealField = (key: string) => {
    const y = fieldTops.current[key];
    if (y === undefined) return;
    scroller.current?.scrollTo({ y: Math.max(0, fieldsTop.current + y - 24), animated: true });
  };

  const [saving, setSaving] = useState(false);

  // Payout methods live on the server now, so the save can genuinely fail.
  // Going back regardless would show the creator a method that was never
  // stored - the exact confusion this screen is meant to end.
  const save = async () => {
    if (saving) return;
    const missing = selected.fields.find((f) => !f.optional && !vals[f.key].trim());
    if (missing) {
      Alert.alert("Add your details", `Enter your ${missing.label.toLowerCase()} to save this payment method.`);
      revealField(missing.key);
      return;
    }
    const fields: Record<string, string> = Object.fromEntries(selected.fields.map((f) => [f.key, vals[f.key].trim()]));
    // Which wallet, so the card can say "Khalti · •••• 4821" rather than just "Wallets".
    if (type === "Wallets") fields.walletProvider = wallet;
    const store = usePaymentMethodsStore.getState();

    setSaving(true);
    const ok = editing
      ? await store.updateMethod(editing.id, fields, makeDefault)
      : await store.addMethod(type, fields, makeDefault);
    setSaving(false);

    if (!ok) {
      Alert.alert(
        "Couldn't save that",
        usePaymentMethodsStore.getState().error ?? "Please try again.",
      );
      return;
    }
    navigation.goBack();
  };

  return (
    <Screen edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
      <ScrollView
        ref={scroller}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.body}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // iOS insets the scroll view for the keyboard on its own; the padding
        // in `body` is what guarantees the last field can clear it on Android.
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
      >
        <SettingsHeader
          title={editing ? "Edit Payment Method" : "Add Payment Method"}
          subtitle="Choose how you'd like to receive your payouts, then add your details."
        />

        <Text style={s.groupLabel}>METHOD TYPE</Text>
        <View style={{ gap: spacing.sm }}>
          {METHODS.map((m) => {
            const active = m.key === type;
            return (
              <Pressable key={m.key} style={[s.methodCard, active && s.methodCardOn]} onPress={() => setType(m.key)}>
                <View style={[s.methodIcon, active && s.methodIconOn]}>
                  <m.icon size={22} color={active ? colors.white : colors.brand} strokeWidth={2.1} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.methodTitle}>{m.key}</Text>
                  <Text style={s.methodDesc}>{m.desc}</Text>
                </View>
                <View style={[s.radioOuter, active && s.radioOuterOn]}>{active && <View style={s.radioInner} />}</View>
              </Pressable>
            );
          })}
        </View>

        {/* Which wallet - only asked once "Wallets" is the chosen method. */}
        {type === "Wallets" && (
          <>
            <Text style={[s.groupLabel, { marginTop: spacing.xl }]}>CHOOSE YOUR WALLET</Text>
            <View style={s.walletRow}>
              {WALLETS.map((w) => {
                const on = w === wallet;
                return (
                  <Pressable key={w} style={[s.walletChip, on && s.walletChipOn]} onPress={() => setWallet(w)}>
                    <Text style={[s.walletChipText, on && s.walletChipTextOn]}>{w}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        <Text style={[s.groupLabel, { marginTop: spacing.xl }]}>
          {(type === "Wallets" ? wallet : selected.key).toUpperCase()} DETAILS
        </Text>
        <View
          style={{ gap: spacing.md }}
          onLayout={(e) => { fieldsTop.current = e.nativeEvent.layout.y; }}
        >
          {selected.fields.map((f) => (
            <View
              key={f.key}
              style={s.box}
              onLayout={(e) => { fieldTops.current[f.key] = e.nativeEvent.layout.y; }}
            >
              <Text style={s.boxLabel}>{f.label}{f.optional ? "  (Optional)" : ""}</Text>
              <TextInput
                value={vals[f.key]}
                onChangeText={(t) => setVal(f.key, t)}
                onFocus={() => revealField(f.key)}
                placeholder={f.placeholder}
                placeholderTextColor={colors.textFaint}
                keyboardType={f.kb ?? "default"}
                autoCapitalize={f.cap ?? "none"}
                style={s.boxInput}
              />
              {!!f.hint && <Text style={s.boxHint}>{f.hint}</Text>}
            </View>
          ))}

          <Pressable style={s.defaultRow} onPress={() => setMakeDefault((d) => !d)}>
            <View style={[s.checkbox, makeDefault && s.checkboxOn]}>{makeDefault && <Check size={14} color={colors.white} strokeWidth={3.2} />}</View>
            <Text style={s.defaultText}>Set as default payout method</Text>
          </Pressable>
        </View>

        {/* Apple / App Store compliance note */}
        <View style={s.note}>
          <Lock size={15} color={colors.textMuted} strokeWidth={2} />
          <Text style={s.noteText}>
            Encrypted and used only to receive your earnings - never for purchases. Coins, gifts and subscriptions are
            bought through the App Store.
          </Text>
        </View>
      </ScrollView>

      <View style={s.footer}>
        <Pressable style={[s.primaryBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
          <Text style={s.primaryBtnText}>
            {saving ? "Saving…" : editing ? "Save Changes" : "Add Payment Method"}
          </Text>
        </Pressable>
      </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const s = StyleSheet.create({
  // The tall bottom pad is what lets the last field scroll clear of the
  // keyboard on Android, where the window resizes rather than insetting.
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl * 9 },
  groupLabel: { fontSize: font.xs, fontWeight: font.weightBold, color: colors.textFaint, letterSpacing: 0.6, marginBottom: spacing.sm },

  /* Which wallet - Khalti / eSewa / UPI / PhonePe */
  walletRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  walletChip: {
    paddingHorizontal: spacing.lg, height: 40, justifyContent: "center",
    borderWidth: 1.5, borderColor: colors.borderStrong, borderRadius: radius.pill, backgroundColor: colors.card,
  },
  walletChipOn: { borderColor: colors.brand, backgroundColor: colors.brandTint },
  walletChipText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.textSecondary },
  walletChipTextOn: { color: colors.brand },

  methodCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    borderWidth: 1.5, borderColor: colors.borderStrong, borderRadius: radius.lg, padding: spacing.md, backgroundColor: colors.card,
  },
  methodCardOn: { borderColor: colors.brand, backgroundColor: colors.brandTint },
  methodIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center" },
  methodIconOn: { backgroundColor: colors.brand },
  methodTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  methodDesc: { marginTop: 2, fontSize: font.xs, lineHeight: 16, color: colors.textMuted },
  radioOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  radioOuterOn: { borderColor: colors.brand },
  radioInner: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.brand },

  box: { borderWidth: 1.5, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingTop: 8, paddingBottom: 6, backgroundColor: colors.card },
  boxLabel: { fontSize: 11, color: colors.textMuted, fontWeight: font.weightMedium },
  boxHint: { fontSize: 11, lineHeight: 15, color: colors.textFaint, paddingBottom: 4 },
  boxInput: { fontSize: font.md, color: colors.text, padding: 0, paddingVertical: 4, marginTop: 1 },

  defaultRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs, paddingVertical: 4 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  defaultText: { flex: 1, fontSize: font.sm, color: colors.text, fontWeight: font.weightMedium },

  note: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", marginTop: spacing.xl, backgroundColor: colors.bgMuted, borderRadius: radius.md, padding: spacing.md },
  noteText: { flex: 1, fontSize: font.xs, lineHeight: 17, color: colors.textMuted },

  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
  primaryBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 15, alignItems: "center" },
  primaryBtnText: { color: colors.white, fontSize: font.md, fontWeight: font.weightBold },
});
