import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import {
  ChevronLeft, FileText, Globe, HelpCircle, Plus, Receipt, ShieldCheck, X, Zap, type LucideIcon,
} from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { useTaxFormsStore, type TaxForm, type TaxFormStatus } from "@/store/tax-forms.store";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (ts: number) => { const d = new Date(ts); return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; };

const STATUS_STYLE: Record<TaxFormStatus, { tint: string; color: string }> = {
  "Under Review": { tint: "#fff4f7", color: "#b45309" },
  Approved: { tint: "#f0fdf4", color: "#15803d" },
  Rejected: { tint: "#fef2f2", color: "#dc2626" },
};

const BENEFITS: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: Zap, title: "Faster Payouts", desc: "Get paid on time with verified tax information." },
  { icon: ShieldCheck, title: "Secure & Safe", desc: "Your information is encrypted and always protected." },
  { icon: Globe, title: "Global Compliance", desc: "We comply with international tax regulations." },
];

export function TaxFormsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const forms = useTaxFormsStore((s) => s.forms);
  const remove = useTaxFormsStore((s) => s.remove);
  const loading = useTaxFormsStore((s) => s.loading);
  const loaded = useTaxFormsStore((s) => s.loaded);
  const error = useTaxFormsStore((s) => s.error);
  const [refreshing, setRefreshing] = useState(false);

  // Re-fetch the LIVE status every time the screen is focused (silent - the cached
  // list stays visible), so an admin approval/rejection shows up without an app
  // restart. `load(true)` forces past the store's "already loaded" short-circuit.
  useFocusEffect(useCallback(() => { void useTaxFormsStore.getState().load(true); }, []));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await useTaxFormsStore.getState().load(true); } finally { setRefreshing(false); }
  }, []);
  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} colors={[colors.brand]} />;

  const [tab, setTab] = useState<"active" | "history">("active");
  // Active = the forms currently in effect: still under review OR approved (the
  // live, valid tax info). History keeps the full record (approved + rejected).
  const active = forms.filter((f) => f.status === "Under Review" || f.status === "Approved");
  const history = forms.filter((f) => f.status !== "Under Review");
  const list = tab === "active" ? active : history;

  const addForm = () => navigation.navigate("TaxFormWizard");
  const openGuide = () => navigation.navigate("TaxGuide");

  return (
    <Screen edges={["top"]} bg={colors.bg}>
      {/* Header */}
      <View style={s.header}>
        <Pressable hitSlop={8} style={s.iconBtn} onPress={() => navigation.goBack()}>
          <ChevronLeft size={22} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={s.headerTitle}>Tax Forms</Text>
        <View style={s.headerRight}>
          <Pressable hitSlop={8} style={s.iconBtn} onPress={openGuide}>
            <HelpCircle size={21} color={colors.text} strokeWidth={2.2} />
          </Pressable>
          <Pressable hitSlop={8} style={s.iconBtn} onPress={addForm}>
            <Plus size={22} color={colors.text} strokeWidth={2.4} />
          </Pressable>
        </View>
      </View>

      {!loaded && loading ? (
        /* ── First load ── */
        <View style={s.stateWrap}><ActivityIndicator color={colors.brand} /></View>
      ) : forms.length === 0 ? (
        /* ── Home / first-run - also the fallback when the list couldn't load, so
              the user is never blocked from adding a form (they can still submit;
              a load error just gets a dismissible retry banner up top). ── */
        <ScrollView showsVerticalScrollIndicator={false} refreshControl={refreshControl} contentContainerStyle={[s.homeBody, { paddingBottom: insets.bottom + spacing.xl }]}>
          {error ? (
            <Pressable style={s.errBanner} onPress={() => useTaxFormsStore.getState().load(true)}>
              <Ionicons name="cloud-offline-outline" size={16} color="#b45309" />
              <Text style={s.errBannerText}>Couldn&apos;t load your saved forms. Tap to retry.</Text>
              {loading ? <ActivityIndicator size="small" color="#b45309" /> : <Ionicons name="refresh" size={15} color="#b45309" />}
            </Pressable>
          ) : null}
          <View style={s.heroIcon}>
            <FileText size={34} color={colors.brand} strokeWidth={2} />
            <View style={s.heroPct}><Text style={s.heroPctText}>%</Text></View>
          </View>
          <Text style={s.homeTitle}>Manage Your Tax Information</Text>
          <Text style={s.homeSub}>Submit your tax forms to receive payouts and comply with tax regulations.</Text>

          <View style={s.benefits}>
            {BENEFITS.map((b) => (
              <View key={b.title} style={s.benefitRow}>
                <View style={s.benefitIcon}><b.icon size={18} color={colors.brand} strokeWidth={2.2} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.benefitTitle}>{b.title}</Text>
                  <Text style={s.benefitDesc}>{b.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          <Pressable style={s.primaryBtn} onPress={addForm}>
            <Plus size={18} color={colors.white} strokeWidth={2.8} />
            <Text style={s.primaryBtnText}>Add New Tax Form</Text>
          </Pressable>
          <Pressable hitSlop={8} onPress={openGuide}>
            <Text style={s.learnMore}>Learn more about tax information</Text>
          </Pressable>
        </ScrollView>
      ) : (
        /* ── Forms list (chart step 10) ── */
        <>
          <View style={s.tabs}>
            {(["active", "history"] as const).map((t) => (
              <Pressable key={t} style={s.tab} onPress={() => setTab(t)}>
                <Text style={[s.tabText, tab === t && s.tabTextOn]}>{t === "active" ? "Active" : "History"}</Text>
                <View style={[s.tabUnderline, tab === t && s.tabUnderlineOn]} />
              </Pressable>
            ))}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} refreshControl={refreshControl} contentContainerStyle={[s.listBody, { paddingBottom: insets.bottom + spacing.xl }]}>
            {list.length === 0 ? (
              <View style={s.empty}>
                <View style={s.emptyIcon}><Receipt size={26} color={colors.textFaint} strokeWidth={2} /></View>
                <Text style={s.emptyTitle}>{tab === "active" ? "No active tax forms" : "No past tax forms"}</Text>
                <Text style={s.emptySub}>{tab === "active" ? "Add a tax form to start receiving payouts." : "Approved and rejected forms will appear here."}</Text>
                {tab === "active" && (
                  <Pressable style={s.emptyBtn} onPress={addForm}>
                    <Plus size={15} color={colors.white} strokeWidth={2.8} />
                    <Text style={s.emptyBtnText}>Add New Tax Form</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              list.map((f) => (
                <FormCard
                  key={f.id}
                  form={f}
                  onRemove={() =>
                    Alert.alert("Delete tax form?", "This removes the submitted form. You can add a new one anytime.", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => void remove(f.id) },
                    ])
                  }
                />
              ))
            )}

            {/* Help card */}
            <Pressable style={s.helpCard} onPress={openGuide}>
              <View style={s.helpIcon}><HelpCircle size={18} color={colors.brand} strokeWidth={2.2} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.helpTitle}>Need help with tax forms?</Text>
                <Text style={s.helpLink}>View our tax form guide</Text>
              </View>
            </Pressable>
          </ScrollView>
        </>
      )}
    </Screen>
  );
}

function FormCard({ form, onRemove }: { form: TaxForm; onRemove: () => void }) {
  const st = STATUS_STYLE[form.status];
  const details = () =>
    Alert.alert(
      `${form.formType} · ${form.entityKind}`,
      `Status: ${form.status}\nSubmission ID: ${form.submissionId}\nSubmitted: ${fmtDate(form.submittedAt)}\n\n` +
      `Name: ${[form.firstName, form.middleName, form.lastName].filter(Boolean).join(" ")}\n` +
      `Tax residence: ${form.residenceCountry || "-"}\n${form.tinType}: ${form.taxId || "-"}`,
    );
  return (
    <View style={[s.card, { backgroundColor: st.tint }]}>
      <View style={s.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={s.cardType}>{form.formType}</Text>
          <Text style={s.cardEntity}>{form.entityKind}</Text>
        </View>
        <Pressable hitSlop={8} onPress={onRemove}><X size={17} color={colors.textFaint} strokeWidth={2.4} /></Pressable>
      </View>

      <Text style={s.cardStatus}>Status: <Text style={{ color: st.color, fontWeight: font.weightBold }}>{form.status}</Text></Text>

      <View style={s.cardMeta}>
        <View style={{ flex: 1 }}>
          <Text style={s.metaLabel}>Submitted on</Text>
          <Text style={s.metaValue}>{fmtDate(form.submittedAt)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.metaLabel}>Submission ID</Text>
          <Text style={s.metaValue}>{form.submissionId}</Text>
        </View>
      </View>

      <View style={s.cardDivider} />
      <Pressable hitSlop={6} onPress={details}>
        <Text style={s.viewDetails}>View Details</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, height: 52 },
  headerRight: { flexDirection: "row", alignItems: "center" },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },

  /* Home */
  homeBody: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, alignItems: "center" },
  errBanner: {
    flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "stretch",
    backgroundColor: "#fff4e6", borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10,
    marginBottom: spacing.lg,
  },
  errBannerText: { flex: 1, fontSize: font.xs, color: "#b45309", fontWeight: font.weightBold },
  heroIcon: { width: 84, height: 84, borderRadius: 22, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
  heroPct: { position: "absolute", right: -4, top: -4, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.bg },
  heroPctText: { color: colors.white, fontSize: 12, fontWeight: font.weightHeavy },
  homeTitle: { fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text, textAlign: "center" },
  homeSub: { marginTop: spacing.sm, fontSize: font.sm, lineHeight: 20, color: colors.textMuted, textAlign: "center", maxWidth: 320 },
  benefits: { alignSelf: "stretch", marginTop: spacing.xl, gap: spacing.lg },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  benefitIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center" },
  benefitTitle: { fontSize: font.sm, fontWeight: font.weightHeavy, color: colors.text },
  benefitDesc: { marginTop: 2, fontSize: font.xs, lineHeight: 16, color: colors.textMuted },
  primaryBtn: { flexDirection: "row", alignSelf: "stretch", marginTop: spacing.xxl, backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 15, alignItems: "center", justifyContent: "center", gap: 8 },
  primaryBtnText: { color: colors.white, fontSize: font.md, fontWeight: font.weightBold },
  learnMore: { marginTop: spacing.lg, fontSize: font.sm, fontWeight: font.weightBold, color: colors.brand, textAlign: "center" },

  /* Tabs */
  tabs: { flexDirection: "row", paddingHorizontal: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { marginRight: spacing.xl, alignItems: "center" },
  tabText: { fontSize: font.md, fontWeight: font.weightMedium, color: colors.textMuted, paddingVertical: spacing.md },
  tabTextOn: { color: colors.text, fontWeight: font.weightHeavy },
  tabUnderline: { height: 2.5, alignSelf: "stretch", borderRadius: 2, backgroundColor: "transparent" },
  tabUnderlineOn: { backgroundColor: colors.brand },

  /* List */
  listBody: { padding: spacing.lg, gap: spacing.md },
  card: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  cardTop: { flexDirection: "row", alignItems: "flex-start" },
  cardType: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  cardEntity: { marginTop: 1, fontSize: font.xs, color: colors.textMuted, fontWeight: font.weightMedium },
  cardStatus: { marginTop: spacing.md, fontSize: font.sm, color: colors.textSecondary, fontWeight: font.weightMedium },
  cardMeta: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  metaLabel: { fontSize: 10.5, color: colors.textFaint, fontWeight: font.weightMedium },
  metaValue: { marginTop: 2, fontSize: font.sm, fontWeight: font.weightBold, color: colors.text },
  cardDivider: { height: 1, backgroundColor: "rgba(0,0,0,0.06)", marginVertical: spacing.md },
  viewDetails: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.brand },

  /* Loading / error states */
  stateWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, gap: 6 },

  /* Empty */
  empty: { alignItems: "center", paddingVertical: spacing.xxl, gap: 6 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center", marginBottom: spacing.xs },
  emptyTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.textSecondary },
  emptySub: { fontSize: font.sm, color: colors.textFaint, textAlign: "center", maxWidth: 260, lineHeight: 18 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.md, backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 11 },
  emptyBtnText: { color: colors.white, fontSize: font.sm, fontWeight: font.weightBold },

  /* Help */
  helpCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm, backgroundColor: colors.brandTint, borderRadius: radius.lg, padding: spacing.lg },
  helpIcon: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  helpTitle: { fontSize: font.sm, fontWeight: font.weightHeavy, color: colors.text },
  helpLink: { marginTop: 2, fontSize: font.sm, fontWeight: font.weightBold, color: colors.brand },
});
