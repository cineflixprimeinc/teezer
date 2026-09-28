import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View, type LayoutAnimationConfig, LayoutAnimation, Platform, UIManager } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import {
  ArrowUpRight, Building2, CalendarClock, ChevronDown, ChevronLeft, FileText, Info, Landmark,
  Lock, Percent, Plus, RefreshCw, ShieldCheck, User, type LucideIcon,
} from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { openPolicy } from "@/store/policy.store";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

// Enable smooth expand/collapse of the FAQ rows on Android.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
const EASE: LayoutAnimationConfig = LayoutAnimation.Presets.easeInEaseOut;

const CONTACT_EMAIL = "tax@teezer.live";
const WEB_GUIDE = { url: "https://teezer.live/tax-guide", title: "Tax Information Guide" };

type FormType = { icon: LucideIcon; code: string; who: string; desc: string };
const FORM_TYPES: FormType[] = [
  { icon: User, code: "W-8BEN", who: "Non-U.S. individuals", desc: "For individuals who are not U.S. persons. Most international creators use this form." },
  { icon: Landmark, code: "W-9", who: "U.S. persons", desc: "For U.S. citizens, U.S. tax residents, and U.S.-registered businesses." },
  { icon: Building2, code: "W-8BEN-E", who: "Non-U.S. entities", desc: "For a company or studio that is not a U.S. person." },
  { icon: FileText, code: "Other", who: "Local forms", desc: "Other forms your country's tax laws may require." },
];

type Tin = { code: string; region: string };
const TIN_TYPES: Tin[] = [
  { code: "PAN", region: "India" },
  { code: "SSN", region: "U.S. individuals" },
  { code: "EIN", region: "U.S. businesses" },
  { code: "ITIN", region: "U.S. (no SSN)" },
  { code: "Other", region: "Your national tax ID" },
];

const STEPS: string[] = [
  "Choose the form type that matches your tax status",
  "Enter your full legal name, exactly as on your ID",
  "Select your country of tax residency",
  "Enter your Tax Identification Number (TIN) and its type",
  "Review every field - mistakes here delay payouts",
  "Upload any supporting documents requested",
  "Preview, confirm, and submit",
];

type StatusInfo = { label: string; tint: string; color: string; desc: string };
const STATUSES: StatusInfo[] = [
  { label: "Under Review", tint: "#fff4f7", color: "#b45309", desc: "We're verifying your details. You'll get an email update." },
  { label: "Approved", tint: "#f0fdf4", color: "#15803d", desc: "Your form is valid and payouts can proceed." },
  { label: "Rejected", tint: "#fef2f2", color: "#dc2626", desc: "Something needs fixing - the reason is shown so you can resubmit." },
];

type InfoCard = { icon: LucideIcon; title: string; body: string };
const INFO_CARDS: InfoCard[] = [
  { icon: Percent, title: "Withholding & treaty benefits", body: "Depending on your status and country, some tax may be withheld before you're paid. A correctly completed form (e.g. W-8BEN claiming treaty benefits) may lower that rate where a tax treaty applies." },
  { icon: CalendarClock, title: "Year-end documents", body: "Where the law requires it, Teezer issues year-end tax documents summarizing your earnings and any tax withheld, available in Studio." },
  { icon: RefreshCw, title: "Keep your details current", body: "Update your form if you move country, switch from individual to a company, or your TIN changes - an out-of-date form can pause payouts." },
  { icon: Lock, title: "Security & privacy", body: "Your tax information is encrypted in transit, stored securely, and used only to process payouts and meet legal duties. We never sell it." },
];

const FAQ: { q: string; a: string }[] = [
  { q: "Do I have to submit a tax form?", a: "Yes, if you want to receive payouts. A verified form is required before earnings can be withdrawn." },
  { q: "I'm not in the U.S. - why is there a U.S. form?", a: "The W-8 series is how non-U.S. creators declare they are not U.S. persons and claim treaty benefits. It's standard for international payouts and does not make you a U.S. taxpayer." },
  { q: "Will Teezer file my taxes for me?", a: "No. Teezer may withhold and report where required, but filing your own return and paying any tax due is your responsibility. Teezer does not provide tax advice." },
  { q: "My form was rejected - what now?", a: "Open the form in Tax Forms to see the reason, correct the flagged details, and resubmit. Most rejections are simple typos in a name or TIN." },
];

export function TaxGuideScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<number | null>(0);

  const toggle = (i: number) => { LayoutAnimation.configureNext(EASE); setOpen((cur) => (cur === i ? null : i)); };

  return (
    <Screen edges={["top"]} bg={colors.bg}>
      <View style={s.header}>
        <Pressable hitSlop={8} style={s.iconBtn} onPress={() => navigation.goBack()}>
          <ChevronLeft size={22} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={s.headerTitle}>Tax Form Guide</Text>
        <View style={s.iconBtn} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.body, { paddingBottom: insets.bottom + spacing.xxl }]}>
        {/* Hero */}
        <View style={s.hero}>
          <View style={s.heroIcon}><FileText size={30} color={colors.brand} strokeWidth={2} /></View>
          <Text style={s.heroTitle}>Get your tax forms right</Text>
          <Text style={s.heroSub}>A quick guide to choosing the correct form and submitting it the first time, so your payouts are never held up.</Text>
        </View>

        {/* Not-advice callout */}
        <View style={s.callout}>
          <Info size={16} color="#b45309" strokeWidth={2.2} />
          <Text style={s.calloutText}>This is a guide, not tax advice. For your personal situation, consult a qualified tax professional.</Text>
        </View>

        {/* Which form */}
        <SectionTitle n={1} title="Which form applies to you?" />
        <Text style={s.sectionSub}>Studio guides you to the right one, but here's the quick version.</Text>
        <View style={s.stack}>
          {FORM_TYPES.map((f) => (
            <View key={f.code} style={s.formCard}>
              <View style={s.formIcon}><f.icon size={19} color={colors.brand} strokeWidth={2.2} /></View>
              <View style={{ flex: 1 }}>
                <View style={s.formHead}>
                  <Text style={s.formCode}>{f.code}</Text>
                  <View style={s.formTag}><Text style={s.formTagText}>{f.who}</Text></View>
                </View>
                <Text style={s.formDesc}>{f.desc}</Text>
              </View>
            </View>
          ))}
        </View>
        <Text style={s.fineNote}>A “U.S. person” is a U.S. citizen, a U.S. tax resident, or a business formed in the U.S. Unsure? Check with a tax professional.</Text>

        {/* Info you need */}
        <SectionTitle n={2} title="Information you'll need" />
        <View style={s.stack}>
          <Bullet text="Your full legal name, exactly as on your government ID." />
          <Bullet text="Your country of tax residency." />
          <Bullet text="Your Tax Identification Number (TIN) and its type." />
        </View>
        <View style={s.tinWrap}>
          {TIN_TYPES.map((t) => (
            <View key={t.code} style={s.tinChip}>
              <Text style={s.tinCode}>{t.code}</Text>
              <Text style={s.tinRegion}>{t.region}</Text>
            </View>
          ))}
        </View>

        {/* How to submit */}
        <SectionTitle n={3} title="How to submit in Studio" />
        <View style={s.steps}>
          {STEPS.map((step, i) => (
            <View key={i} style={s.stepRow}>
              <View style={s.stepNum}><Text style={s.stepNumText}>{i + 1}</Text></View>
              <Text style={s.stepText}>{step}</Text>
            </View>
          ))}
        </View>
        <Text style={s.fineNote}>Open it from Teezer Studio → Settings → Tax Information → Tax Forms → Add form.</Text>

        {/* After submit */}
        <SectionTitle n={4} title="After you submit" />
        <View style={s.stack}>
          {STATUSES.map((st) => (
            <View key={st.label} style={[s.statusCard, { backgroundColor: st.tint }]}>
              <View style={[s.statusDot, { backgroundColor: st.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={[s.statusLabel, { color: st.color }]}>{st.label}</Text>
                <Text style={s.statusDesc}>{st.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Good to know */}
        <SectionTitle n={5} title="Good to know" />
        <View style={s.stack}>
          {INFO_CARDS.map((c) => (
            <View key={c.title} style={s.infoCard}>
              <View style={s.infoIcon}><c.icon size={17} color={colors.brand} strokeWidth={2.2} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.infoTitle}>{c.title}</Text>
                <Text style={s.infoBody}>{c.body}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* FAQ */}
        <SectionTitle n={6} title="Frequently asked" />
        <View style={s.faq}>
          {FAQ.map((item, i) => {
            const isOpen = open === i;
            return (
              <View key={i} style={[s.faqItem, i < FAQ.length - 1 && s.faqDivider]}>
                <Pressable style={s.faqQRow} onPress={() => toggle(i)} hitSlop={4}>
                  <Text style={s.faqQ}>{item.q}</Text>
                  <ChevronDown size={18} color={colors.textFaint} strokeWidth={2.4} style={{ transform: [{ rotate: isOpen ? "180deg" : "0deg" }] }} />
                </Pressable>
                {isOpen && <Text style={s.faqA}>{item.a}</Text>}
              </View>
            );
          })}
        </View>

        {/* Contact + web */}
        <View style={s.contactCard}>
          <ShieldCheck size={18} color={colors.brand} strokeWidth={2.2} />
          <Text style={s.contactText}>
            Questions about the tax process on Teezer? Email{" "}
            <Text style={s.contactLink} onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)}>{CONTACT_EMAIL}</Text>.
          </Text>
        </View>
        <Pressable style={s.webRow} hitSlop={6} onPress={() => openPolicy(WEB_GUIDE)}>
          <Text style={s.webLink}>Read the full guide online</Text>
          <ArrowUpRight size={16} color={colors.brand} strokeWidth={2.4} />
        </Pressable>

        {/* CTA */}
        <Pressable style={s.cta} onPress={() => navigation.navigate("TaxFormWizard")}>
          <Plus size={18} color={colors.white} strokeWidth={2.8} />
          <Text style={s.ctaText}>Add a Tax Form</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function SectionTitle({ n, title }: { n: number; title: string }) {
  return (
    <View style={s.sectionTitleRow}>
      <Text style={s.sectionN}>{n}</Text>
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={s.bulletRow}>
      <View style={s.bulletDot} />
      <Text style={s.bulletText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, height: 52 },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },

  hero: { alignItems: "center", paddingTop: spacing.sm, paddingBottom: spacing.lg },
  heroIcon: { width: 74, height: 74, borderRadius: 20, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  heroTitle: { fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text, textAlign: "center" },
  heroSub: { marginTop: spacing.sm, fontSize: font.sm, lineHeight: 20, color: colors.textMuted, textAlign: "center", maxWidth: 320 },

  callout: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", backgroundColor: "#fff8ec", borderWidth: 1, borderColor: "#fde4bf", borderRadius: radius.md, padding: spacing.md },
  calloutText: { flex: 1, fontSize: font.xs, lineHeight: 17, color: "#92610f" },

  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xxl },
  sectionN: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.brand, color: colors.white, textAlign: "center", lineHeight: 22, fontSize: 12, fontWeight: font.weightHeavy, overflow: "hidden" },
  sectionTitle: { flex: 1, fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  sectionSub: { marginTop: spacing.xs, fontSize: font.sm, color: colors.textMuted, lineHeight: 19 },

  stack: { marginTop: spacing.md, gap: spacing.sm },
  fineNote: { marginTop: spacing.sm, fontSize: font.xs, lineHeight: 17, color: colors.textFaint },

  formCard: { flexDirection: "row", gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  formIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center" },
  formHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  formCode: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  formTag: { backgroundColor: colors.bgMuted, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  formTagText: { fontSize: 10.5, fontWeight: font.weightBold, color: colors.textSecondary },
  formDesc: { marginTop: 4, fontSize: font.sm, lineHeight: 19, color: colors.textMuted },

  bulletRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  bulletDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand, marginTop: 7 },
  bulletText: { flex: 1, fontSize: font.sm, lineHeight: 21, color: colors.textSecondary },

  tinWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  tinChip: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  tinCode: { fontSize: font.sm, fontWeight: font.weightHeavy, color: colors.text },
  tinRegion: { marginTop: 1, fontSize: 10.5, color: colors.textMuted, fontWeight: font.weightMedium },

  steps: { marginTop: spacing.md, gap: spacing.md },
  stepRow: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center" },
  stepNumText: { fontSize: font.xs, fontWeight: font.weightHeavy, color: colors.brand },
  stepText: { flex: 1, fontSize: font.sm, lineHeight: 20, color: colors.textSecondary },

  statusCard: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start", borderRadius: radius.lg, padding: spacing.lg },
  statusDot: { width: 9, height: 9, borderRadius: 5, marginTop: 5 },
  statusLabel: { fontSize: font.sm, fontWeight: font.weightHeavy },
  statusDesc: { marginTop: 3, fontSize: font.xs, lineHeight: 17, color: colors.textSecondary },

  infoCard: { flexDirection: "row", gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  infoIcon: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center" },
  infoTitle: { fontSize: font.sm, fontWeight: font.weightHeavy, color: colors.text },
  infoBody: { marginTop: 3, fontSize: font.xs, lineHeight: 18, color: colors.textMuted },

  faq: { marginTop: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg },
  faqItem: { paddingVertical: spacing.md },
  faqDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  faqQRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  faqQ: { flex: 1, fontSize: font.sm, fontWeight: font.weightBold, color: colors.text },
  faqA: { marginTop: spacing.sm, fontSize: font.sm, lineHeight: 20, color: colors.textMuted },

  contactCard: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start", marginTop: spacing.xxl, backgroundColor: colors.brandTint, borderRadius: radius.lg, padding: spacing.lg },
  contactText: { flex: 1, fontSize: font.sm, lineHeight: 20, color: colors.textSecondary },
  contactLink: { color: colors.brand, fontWeight: font.weightBold },
  webRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: spacing.lg },
  webLink: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.brand },

  cta: { flexDirection: "row", alignSelf: "stretch", marginTop: spacing.xl, backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 15, alignItems: "center", justifyContent: "center", gap: 8 },
  ctaText: { color: colors.white, fontSize: font.md, fontWeight: font.weightBold },
});
