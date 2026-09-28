import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import {
  Banknote, BarChart3, Bot, Boxes, Briefcase, Building2, CalendarClock, ChevronRight, CircleDollarSign, Clapperboard,
  Clock, Code2, Coins, Copyright, CreditCard, Download, FileSpreadsheet, FileText, Gift, Globe,
  Handshake, Hash, ImagePlus, KeyRound, Landmark, Languages, LayoutDashboard, Link2, Megaphone,
  Music4, Receipt, RefreshCw, Rocket, Scale, ScrollText, ShieldCheck, SlidersHorizontal, Sparkles,
  Star, Tag, Terminal, Ticket, TriangleAlert, Wand2, Webhook, type LucideIcon,
} from "lucide-react-native";
import { Screen } from "@/components/Screen";
import {
  SettingsHeader, Section, ToggleRow, NavRow,
} from "@/components/settings/SettingsKit";
import { useStudioSettingsStore, type StudioSettings } from "@/store/studio-settings.store";
import { useTaxFormsStore } from "@/store/tax-forms.store";
import { useAdAccountStore } from "@/store/ad-account.store";
import { usePaymentMethodsStore, methodSummary } from "@/store/payment-methods.store";
import { type StudioChoiceKey, type StudioCountryKey } from "./studio-choices";
import { colors } from "@/constants/colors";
import { font, radius, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

export type StudioSettingsCategory =
  | "payments" | "tax" | "monetization" | "business" | "advertising" | "analytics"
  | "ai" | "music" | "developers" | "data" | "localization" | "advanced" | "legal";

/** Single source of truth for each category's menu identity (title/icon/colour),
 *  shared by the Studio Settings menu and this sub-page's header. */
export const STUDIO_CATEGORY_META: Record<StudioSettingsCategory, {
  title: string; subtitle: string; desc: string; icon: LucideIcon; color: string;
}> = {
  payments:     { title: "Payments & Earnings", subtitle: "Payout methods, currency and payout history.", desc: "Payout methods, currency and history", icon: Banknote, color: "#059669" },
  tax:          { title: "Tax Information", subtitle: "Your tax residency, ID and forms for payouts.", desc: "Residency, tax ID and forms", icon: FileText, color: "#2563eb" },
  monetization: { title: "Monetization", subtitle: "Choose which revenue streams are enabled.", desc: "Revenue streams and preferences", icon: CircleDollarSign, color: colors.brand },
  business:     { title: "Creator Business", subtitle: "Business profile shown on invoices and for verification.", desc: "Business profile and contact", icon: Briefcase, color: "#4f46e5" },
  advertising:  { title: "Advertising", subtitle: "Ad account, billing, invoices and credits.", desc: "Ad account, billing and invoices", icon: Megaphone, color: "#ea580c" },
  analytics:    { title: "Analytics", subtitle: "Default dashboard, reports and data export.", desc: "Dashboards, reports and exports", icon: BarChart3, color: "#2563eb" },
  ai:           { title: "AI Studio", subtitle: "Creator AI tools that help you make content.", desc: "Creator AI tools and preferences", icon: Sparkles, color: "#0891b2" },
  music:        { title: "Music & Copyright", subtitle: "Copyright preferences, Content ID and claims.", desc: "Copyright, Content ID and claims", icon: Music4, color: "#7c3aed" },
  developers:   { title: "API & Developers", subtitle: "API keys, webhooks and developer access.", desc: "API keys, webhooks and OAuth apps", icon: Code2, color: "#475569" },
  data:         { title: "Data & Reports", subtitle: "Export your revenue, tax and content data.", desc: "Export revenue, tax and content", icon: Download, color: "#0d9488" },
  localization: { title: "Localization", subtitle: "Language, timezone and number formats for Studio.", desc: "Language, timezone and formats", icon: Globe, color: "#d97706" },
  advanced:     { title: "Advanced", subtitle: "Beta and experimental Studio features.", desc: "Beta and experimental features", icon: SlidersHorizontal, color: "#64748b" },
  legal:        { title: "Legal", subtitle: "Creator agreements and policies.", desc: "Creator agreement and policies", icon: Scale, color: "#6b7280" },
};

export function StudioSettingsDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<Record<string, { category: StudioSettingsCategory }>, string>>();
  const category = route.params?.category ?? "payments";
  const meta = STUDIO_CATEGORY_META[category];

  const prefs = useStudioSettingsStore((s) => s.prefs);
  const save = (patch: Partial<StudioSettings>) => useStudioSettingsStore.getState().update(patch);
  const adData = useAdAccountStore((s) => s.data);
  useEffect(() => {
    void useStudioSettingsStore.getState().hydrate();
    void usePaymentMethodsStore.getState().hydrate();
    void useAdAccountStore.getState().hydrate();
  }, []);

  // Default payout account (managed on the Payment Methods page).
  const payMethods = usePaymentMethodsStore((s) => s.methods);
  const defaultPay = payMethods.find((m) => m.isDefault);
  const payDesc = defaultPay
    ? `${defaultPay.type} · ${methodSummary(defaultPay)}`
    : payMethods.length > 0 ? `${payMethods.length} method${payMethods.length > 1 ? "s" : ""}` : "Add a payout account";

  const soon = (label: string) => Alert.alert(label, "This is coming soon.");

  // Live tax-form status shown on the single Tax Forms row (no duplicate rows).
  const taxForms = useTaxFormsStore((s) => s.forms);
  const nForms = taxForms.length;
  const taxStatusDesc =
    nForms === 0 ? "Not submitted - add your tax form"
    : taxForms.some((f) => f.status === "Approved") ? `${nForms} form${nForms > 1 ? "s" : ""} · Verified`
    : taxForms.some((f) => f.status === "Under Review") ? `${nForms} form${nForms > 1 ? "s" : ""} · Under review`
    : `${nForms} form${nForms > 1 ? "s" : ""} · Action needed`;

  // Brand-coloured, slightly larger Lucide icon for every row's icon slot.
  const ic = (Icon: LucideIcon) => <Icon size={22} color={colors.brand} strokeWidth={2.1} />;
  // A single-choice setting that opens on its OWN page (no bottom-sheet dropdown).
  const choice = (key: StudioChoiceKey, title: string, icon: LucideIcon) => (
    <NavRow iconNode={ic(icon)} title={title} desc={String(prefs[key]) || "Not set"} onPress={() => navigation.navigate("StudioSettingChoice", { settingKey: key })} />
  );
  // A country setting that opens the full searchable country page.
  const countryChoice = (key: StudioCountryKey, title: string, icon: LucideIcon) => (
    <NavRow iconNode={ic(icon)} title={title} desc={prefs[key] || "Not set"} onPress={() => navigation.navigate("StudioCountryChoice", { settingKey: key })} />
  );

  return (
    <Screen edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.lg }}>
        <SettingsHeader title={meta.title} subtitle={meta.subtitle} />

        {category === "payments" && (
          <>
            <Section title="PAYOUT" footer="Payouts run once your balance passes the minimum and your tax info is complete.">
              <NavRow iconNode={ic(Landmark)} title="Payment Methods" desc={payDesc} onPress={() => navigation.navigate("PaymentMethods")} />
              <ToggleRow iconNode={ic(RefreshCw)} title="Automatic Payouts" desc="Pay out automatically at the threshold" value={prefs.autoPayout} onValueChange={(v) => save({ autoPayout: v })} />
              {choice("minPayout", "Minimum Payout Amount", Coins)}
              {choice("payoutCurrency", "Payout Currency", CreditCard)}
            </Section>
            <Section title="HISTORY">
              <NavRow iconNode={ic(Receipt)} title="Payout History" desc="Past payouts and statements" onPress={() => navigation.navigate("StudioTransactions")} />
            </Section>
          </>
        )}

        {category === "tax" && (
          <>
            <Section title="TAX DETAILS" footer="Required before payouts above the reporting threshold in your region.">
              {countryChoice("taxResidency", "Tax Residency", Globe)}
              <Field label="Tax ID / VAT Number" value={prefs.taxId} placeholder="e.g. 12-3456789" onCommit={(t) => save({ taxId: t })} />
            </Section>
            <Section title="TAX FORMS" footer="Submit W-8BEN / W-9 and track their verification status here.">
              <NavRow iconNode={ic(FileText)} title="Tax Forms" desc={taxStatusDesc} onPress={() => navigation.navigate("TaxForms")} />
            </Section>
          </>
        )}

        {category === "monetization" && (
          <Section title="REVENUE STREAMS" footer="Turn revenue streams on or off. Changes apply to new content.">
            <ToggleRow iconNode={ic(Megaphone)} title="Ad Revenue" value={prefs.revAds} onValueChange={(v) => save({ revAds: v })} />
            <ToggleRow iconNode={ic(Star)} title="Fan Subscriptions" value={prefs.revSubs} onValueChange={(v) => save({ revSubs: v })} />
            <ToggleRow iconNode={ic(Gift)} title="Gifts & Coins" value={prefs.revGifts} onValueChange={(v) => save({ revGifts: v })} />
            <ToggleRow iconNode={ic(Handshake)} title="Sponsorships & Brand Deals" value={prefs.revSponsor} onValueChange={(v) => save({ revSponsor: v })} />
          </Section>
        )}

        {category === "business" && (
          <>
            <Section title="BUSINESS PROFILE" footer="Shown on invoices and used for business verification and brand deals.">
              <Field label="Business Name" value={prefs.bizName} placeholder="Teezer Media LLC" onCommit={(t) => save({ bizName: t })} />
              {choice("bizType", "Legal Structure", Building2)}
              <Field label="Registration / Company No." value={prefs.bizReg} placeholder="Registration / EIN" onCommit={(t) => save({ bizReg: t })} />
              <Field label="Business Tax ID / VAT" value={prefs.bizTaxId} placeholder="Tax / VAT number" onCommit={(t) => save({ bizTaxId: t })} />
              {choice("bizIndustry", "Industry", Tag)}
              <Field label="Website" value={prefs.bizWebsite} placeholder="https://yourbrand.com" onCommit={(t) => save({ bizWebsite: t })} />
            </Section>
            <Section title="REGISTERED ADDRESS">
              <Field label="Address Line 1" value={prefs.bizAddress} placeholder="Street address" onCommit={(t) => save({ bizAddress: t })} />
              <Field label="Address Line 2 (Optional)" value={prefs.bizAddr2} placeholder="Suite, floor, etc." onCommit={(t) => save({ bizAddr2: t })} />
              <Field label="City" value={prefs.bizCity} placeholder="Kathmandu" onCommit={(t) => save({ bizCity: t })} />
              <Field label="State / Province" value={prefs.bizState} placeholder="Bagmati" onCommit={(t) => save({ bizState: t })} />
              <Field label="Postal Code" value={prefs.bizPostal} placeholder="44600" onCommit={(t) => save({ bizPostal: t })} />
              {countryChoice("bizCountry", "Country", Globe)}
            </Section>
            <Section title="PRIMARY CONTACT">
              <Field label="Contact Name" value={prefs.bizContactName} placeholder="Full name" onCommit={(t) => save({ bizContactName: t })} />
              <Field label="Contact Email" value={prefs.bizEmail} placeholder="business@brand.com" keyboardType="email-address" onCommit={(t) => save({ bizEmail: t })} />
              <Field label="Business Phone" value={prefs.bizPhone} placeholder="+1 555 000 1234" keyboardType="phone-pad" onCommit={(t) => save({ bizPhone: t })} />
            </Section>
          </>
        )}

        {category === "advertising" && (
          <>
            <Section title="AD ACCOUNT">
              <NavRow iconNode={ic(Megaphone)} title="Ad Account" desc="Manage your ad account" onPress={() => navigation.navigate("AdAccount")} />
              <NavRow iconNode={ic(CreditCard)} title="Billing Information" desc="View and manage billing" onPress={() => navigation.navigate("AdBilling")} />
              <NavRow iconNode={ic(Receipt)} title="Payment History & Invoices" desc="Download invoices" onPress={() => navigation.navigate("AdPaymentHistory")} />
              <NavRow iconNode={ic(Ticket)} title="Promotional Credits" desc={`$${adData.creditsAvailable.toFixed(2)} available`} onPress={() => navigation.navigate("AdPromoCredits")} />
            </Section>

            <Text style={sa.adFootnote}>Ad billing is separate from your creator payouts.</Text>
          </>
        )}

        {category === "analytics" && (
          <>
            <Section title="PREFERENCES">
              {choice("defaultDashboard", "Default Dashboard", LayoutDashboard)}
              <ToggleRow iconNode={ic(CalendarClock)} title="Scheduled Report Emails" desc="Weekly performance summary" value={prefs.scheduledReports} onValueChange={(v) => save({ scheduledReports: v })} />
            </Section>
            <Section title="DATA">
              <NavRow iconNode={ic(Download)} title="Export Analytics" desc="Download as CSV" onPress={() => soon("Export Analytics")} />
              <NavRow iconNode={ic(Link2)} title="Connected Analytics" desc="Google Analytics, Meta" onPress={() => soon("Connected Analytics")} />
            </Section>
          </>
        )}

        {category === "ai" && (
          <Section title="CREATOR AI" footer="Controls the AI that helps you create. Viewing & recommendation AI lives in the main app's AI Features.">
            <ToggleRow iconNode={ic(Bot)} title="AI Assistant" desc="Title, tag and idea suggestions" value={prefs.aiAssistant} onValueChange={(v) => save({ aiAssistant: v })} />
            <ToggleRow iconNode={ic(Wand2)} title="AI Caption Generation" desc="Auto-caption your uploads" value={prefs.aiCaptions} onValueChange={(v) => save({ aiCaptions: v })} />
            <ToggleRow iconNode={ic(ImagePlus)} title="AI Thumbnail Generation" value={prefs.aiThumbnails} onValueChange={(v) => save({ aiThumbnails: v })} />
            <ToggleRow iconNode={ic(Clapperboard)} title="AI Video Tools" desc="Auto clips, highlights and edits" value={prefs.aiVideoTools} onValueChange={(v) => save({ aiVideoTools: v })} />
            {choice("aiLang", "AI Language", Languages)}
          </Section>
        )}

        {category === "music" && (
          <Section title="COPYRIGHT" footer="Manage how your audio is protected and used across Teezer.">
            <ToggleRow iconNode={ic(Copyright)} title="Let others use my sounds" desc="Allow reuse of your original audio" value={prefs.allowSoundReuse} onValueChange={(v) => save({ allowSoundReuse: v })} />
            <NavRow iconNode={ic(ShieldCheck)} title="Content ID Status" desc="Inactive" onPress={() => soon("Content ID")} />
            <NavRow iconNode={ic(TriangleAlert)} title="Copyright Claims" desc="No active claims" onPress={() => soon("Copyright Claims")} />
            <NavRow iconNode={ic(Scale)} title="Copyright Appeals" onPress={() => soon("Copyright Appeals")} />
          </Section>
        )}

        {category === "developers" && (
          <Section title="DEVELOPER" footer="Third-party apps you've authorized appear in the main app's Authorized Apps.">
            <NavRow iconNode={ic(KeyRound)} title="API Keys" desc="Create and manage keys" onPress={() => soon("API Keys")} />
            <NavRow iconNode={ic(Webhook)} title="Webhooks" desc="Event notifications to your server" onPress={() => soon("Webhooks")} />
            <NavRow iconNode={ic(Boxes)} title="OAuth Applications" onPress={() => soon("OAuth Applications")} />
            <ToggleRow iconNode={ic(Terminal)} title="Developer Mode" desc="Show debug tools and raw data" value={prefs.devMode} onValueChange={(v) => save({ devMode: v })} />
          </Section>
        )}

        {category === "data" && (
          <Section title="EXPORT" footer="For a full copy of your account data, use the main app's Account Data.">
            <NavRow iconNode={ic(FileSpreadsheet)} title="Export Revenue Reports" desc="Download earnings as CSV" onPress={() => soon("Revenue Reports")} />
            <NavRow iconNode={ic(FileText)} title="Download Tax Documents" onPress={() => soon("Tax Documents")} />
            <NavRow iconNode={ic(Download)} title="Export Content Library" onPress={() => soon("Export Content")} />
          </Section>
        )}

        {category === "localization" && (
          <Section title="REGION & FORMATS" footer="Applies to dates, earnings and reports across Studio.">
            {choice("studioLang", "Studio Language", Languages)}
            {choice("timezone", "Timezone", Clock)}
            {choice("currencyFormat", "Currency Format", CircleDollarSign)}
            {choice("numberFormat", "Number Format", Hash)}
          </Section>
        )}

        {category === "advanced" && (
          <Section title="ADVANCED" footer="Storage, cache and signed-in devices are managed in the main Settings app.">
            <ToggleRow iconNode={ic(Rocket)} title="Beta Features" desc="Try new Studio tools early" value={prefs.beta} onValueChange={(v) => save({ beta: v })} />
            <ToggleRow iconNode={ic(TriangleAlert)} title="Experimental Features" desc="May be unstable" value={prefs.experimental} onValueChange={(v) => save({ experimental: v })} />
          </Section>
        )}

        {category === "legal" && (
          <Section title="AGREEMENTS & POLICIES">
            <NavRow iconNode={ic(ScrollText)} title="Creator Agreement" desc="Your terms as a Teezer Creator" onPress={() => navigation.navigate("StudioLegal", { doc: "creator-agreement" })} />
            <NavRow iconNode={ic(CircleDollarSign)} title="Monetization Terms" desc="Earning, revenue share and payouts" onPress={() => navigation.navigate("StudioLegal", { doc: "monetization-terms" })} />
            <NavRow iconNode={ic(Copyright)} title="Copyright Policy" desc="Rights, claims and appeals" onPress={() => navigation.navigate("StudioLegal", { doc: "copyright" })} />
            <NavRow iconNode={ic(Megaphone)} title="Advertising Policy" desc="Rules for ads on Teezer" onPress={() => navigation.navigate("StudioLegal", { doc: "advertising" })} />
          </Section>
        )}
      </ScrollView>
    </Screen>
  );
}

/** Inline labelled text field (commits to the store on blur, not per keystroke). */
function Field({ label, value, placeholder, keyboardType, multiline, onCommit }: {
  label: string; value: string; placeholder?: string;
  keyboardType?: "email-address" | "phone-pad" | "default"; multiline?: boolean; onCommit: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        onEndEditing={() => onCommit(text.trim())}
        onBlur={() => onCommit(text.trim())}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        keyboardType={keyboardType ?? "default"}
        autoCapitalize="none"
        multiline={multiline}
        style={[s.input, multiline && s.inputArea]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  field: { paddingVertical: spacing.sm },
  fieldLabel: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.textSecondary, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 11, fontSize: font.md, color: colors.text, backgroundColor: colors.bgMuted,
  },
  inputArea: { minHeight: 80, textAlignVertical: "top" },
});

/** Advertising-menu extras (promo card + footnote). */
const sa = StyleSheet.create({
  promoCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.brandTint, borderRadius: radius.lg,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    marginHorizontal: spacing.lg, marginTop: spacing.lg,
  },
  promoIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  promoTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  promoBody: { marginTop: 2, fontSize: font.sm, lineHeight: 19, color: colors.textMuted },
  adFootnote: { paddingHorizontal: spacing.lg, marginTop: spacing.lg, fontSize: font.xs, lineHeight: 18, color: colors.textFaint },
});
