import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ChevronLeft } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "@/components/Screen";
import { BottomSheet } from "@/components/BottomSheet";
import { profileApi, ContentPrefs } from "@/api/profile.api";
import { usePrefsStore } from "@/store/prefs.store";
import type { ContentPreferences } from "@/api/prefs.api";
import { clearRecentSearches } from "@/utils/recent-searches";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

type Ion = keyof typeof Ionicons.glyphMap;

/* Same language/country sets the website's Content Preferences page offers. */
const LANGUAGES: { code: string; name: string; native: string }[] = [
  { code: "en", name: "English", native: "English" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "fr", name: "French", native: "Français" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "ne", name: "Nepali", native: "नेपाली" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "ko", name: "Korean", native: "한국어" },
  { code: "zh", name: "Chinese", native: "中文" },
  { code: "ar", name: "Arabic", native: "العربية" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "tr", name: "Turkish", native: "Türkçe" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia" },
  { code: "th", name: "Thai", native: "ภาษาไทย" },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt" },
  { code: "ms", name: "Malay", native: "Bahasa Melayu" },
  { code: "bn", name: "Bengali", native: "বাংলা" },
  { code: "uk", name: "Ukrainian", native: "Українська" },
  { code: "pl", name: "Polish", native: "Polski" },
  { code: "nl", name: "Dutch", native: "Nederlands" },
  { code: "sv", name: "Swedish", native: "Svenska" },
  { code: "fi", name: "Finnish", native: "Suomi" },
  { code: "no", name: "Norwegian", native: "Norsk" },
  { code: "da", name: "Danish", native: "Dansk" },
];

const COUNTRIES: { code: string; name: string; flag: string }[] = [
  { code: "US", name: "United States", flag: "🇺🇸" }, { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "IN", name: "India", flag: "🇮🇳" }, { code: "NP", name: "Nepal", flag: "🇳🇵" },
  { code: "AU", name: "Australia", flag: "🇦🇺" }, { code: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "DE", name: "Germany", flag: "🇩🇪" }, { code: "JP", name: "Japan", flag: "🇯🇵" },
  { code: "KR", name: "South Korea", flag: "🇰🇷" }, { code: "CN", name: "China", flag: "🇨🇳" },
  { code: "FR", name: "France", flag: "🇫🇷" }, { code: "IT", name: "Italy", flag: "🇮🇹" },
  { code: "ES", name: "Spain", flag: "🇪🇸" }, { code: "BR", name: "Brazil", flag: "🇧🇷" },
  { code: "MX", name: "Mexico", flag: "🇲🇽" }, { code: "AR", name: "Argentina", flag: "🇦🇷" },
  { code: "RU", name: "Russia", flag: "🇷🇺" }, { code: "PK", name: "Pakistan", flag: "🇵🇰" },
  { code: "BD", name: "Bangladesh", flag: "🇧🇩" }, { code: "NG", name: "Nigeria", flag: "🇳🇬" },
  { code: "ID", name: "Indonesia", flag: "🇮🇩" }, { code: "PH", name: "Philippines", flag: "🇵🇭" },
  { code: "EG", name: "Egypt", flag: "🇪🇬" }, { code: "TR", name: "Turkey", flag: "🇹🇷" },
  { code: "SA", name: "Saudi Arabia", flag: "🇸🇦" }, { code: "TH", name: "Thailand", flag: "🇹🇭" },
  { code: "VN", name: "Vietnam", flag: "🇻🇳" }, { code: "ZA", name: "South Africa", flag: "🇿🇦" },
  { code: "UA", name: "Ukraine", flag: "🇺🇦" }, { code: "PL", name: "Poland", flag: "🇵🇱" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱" }, { code: "SE", name: "Sweden", flag: "🇸🇪" },
  { code: "NO", name: "Norway", flag: "🇳🇴" }, { code: "FI", name: "Finland", flag: "🇫🇮" },
  { code: "DK", name: "Denmark", flag: "🇩🇰" }, { code: "CH", name: "Switzerland", flag: "🇨🇭" },
  { code: "BE", name: "Belgium", flag: "🇧🇪" }, { code: "AT", name: "Austria", flag: "🇦🇹" },
  { code: "PT", name: "Portugal", flag: "🇵🇹" }, { code: "GR", name: "Greece", flag: "🇬🇷" },
  { code: "CZ", name: "Czech Republic", flag: "🇨🇿" }, { code: "RO", name: "Romania", flag: "🇷🇴" },
  { code: "HU", name: "Hungary", flag: "🇭🇺" }, { code: "BG", name: "Bulgaria", flag: "🇧🇬" },
  { code: "HR", name: "Croatia", flag: "🇭🇷" }, { code: "SK", name: "Slovakia", flag: "🇸🇰" },
  { code: "SI", name: "Slovenia", flag: "🇸🇮" }, { code: "RS", name: "Serbia", flag: "🇷🇸" },
  { code: "IL", name: "Israel", flag: "🇮🇱" }, { code: "AE", name: "UAE", flag: "🇦🇪" },
  { code: "QA", name: "Qatar", flag: "🇶🇦" }, { code: "KW", name: "Kuwait", flag: "🇰🇼" },
  { code: "JO", name: "Jordan", flag: "🇯🇴" }, { code: "LB", name: "Lebanon", flag: "🇱🇧" },
  { code: "IQ", name: "Iraq", flag: "🇮🇶" }, { code: "IR", name: "Iran", flag: "🇮🇷" },
  { code: "MY", name: "Malaysia", flag: "🇲🇾" }, { code: "SG", name: "Singapore", flag: "🇸🇬" },
  { code: "HK", name: "Hong Kong", flag: "🇭🇰" }, { code: "TW", name: "Taiwan", flag: "🇹🇼" },
  { code: "NZ", name: "New Zealand", flag: "🇳🇿" }, { code: "IE", name: "Ireland", flag: "🇮🇪" },
  { code: "KE", name: "Kenya", flag: "🇰🇪" }, { code: "GH", name: "Ghana", flag: "🇬🇭" },
  { code: "ET", name: "Ethiopia", flag: "🇪🇹" }, { code: "TZ", name: "Tanzania", flag: "🇹🇿" },
  { code: "UG", name: "Uganda", flag: "🇺🇬" }, { code: "MA", name: "Morocco", flag: "🇲🇦" },
  { code: "DZ", name: "Algeria", flag: "🇩🇿" }, { code: "TN", name: "Tunisia", flag: "🇹🇳" },
  { code: "CO", name: "Colombia", flag: "🇨🇴" }, { code: "VE", name: "Venezuela", flag: "🇻🇪" },
  { code: "PE", name: "Peru", flag: "🇵🇪" }, { code: "CL", name: "Chile", flag: "🇨🇱" },
  { code: "EC", name: "Ecuador", flag: "🇪🇨" }, { code: "BO", name: "Bolivia", flag: "🇧🇴" },
  { code: "PY", name: "Paraguay", flag: "🇵🇾" }, { code: "UY", name: "Uruguay", flag: "🇺🇾" },
  { code: "KZ", name: "Kazakhstan", flag: "🇰🇿" }, { code: "UZ", name: "Uzbekistan", flag: "🇺🇿" },
  { code: "AF", name: "Afghanistan", flag: "🇦🇫" }, { code: "LK", name: "Sri Lanka", flag: "🇱🇰" },
  { code: "MM", name: "Myanmar", flag: "🇲🇲" }, { code: "KH", name: "Cambodia", flag: "🇰🇭" },
  { code: "LA", name: "Laos", flag: "🇱🇦" }, { code: "IS", name: "Iceland", flag: "🇮🇸" },
  { code: "LU", name: "Luxembourg", flag: "🇱🇺" }, { code: "CY", name: "Cyprus", flag: "🇨🇾" },
  { code: "MT", name: "Malta", flag: "🇲🇹" }, { code: "AL", name: "Albania", flag: "🇦🇱" },
  { code: "BY", name: "Belarus", flag: "🇧🇾" }, { code: "LT", name: "Lithuania", flag: "🇱🇹" },
  { code: "LV", name: "Latvia", flag: "🇱🇻" }, { code: "EE", name: "Estonia", flag: "🇪🇪" },
  { code: "MD", name: "Moldova", flag: "🇲🇩" }, { code: "GE", name: "Georgia", flag: "🇬🇪" },
  { code: "AM", name: "Armenia", flag: "🇦🇲" }, { code: "AZ", name: "Azerbaijan", flag: "🇦🇿" },
];

/* ── Searchable picker sheet (language / country) ── */
function PickerSheet({ visible, title, items, selected, onSelect, onClose }: {
  visible: boolean;
  title: string;
  items: { value: string; label: string; sublabel?: string; prefix?: string }[];
  selected: string;
  onSelect: (v: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return items;
    return items.filter((i) =>
      i.label.toLowerCase().includes(t) || i.value.toLowerCase().includes(t) || (i.sublabel ?? "").toLowerCase().includes(t),
    );
  }, [items, query]);

  return (
    <BottomSheet visible={visible} onClose={onClose} height={0.72} scrollable={false} dragArea="header" keyboardAvoid
      header={
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <View style={styles.sheetSearch}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search..."
              placeholderTextColor={colors.textMuted}
              style={styles.sheetInput}
              autoCorrect={false}
            />
            {query.length > 0 && (
              <Pressable hitSlop={8} onPress={() => setQuery("")}>
                <Ionicons name="close-circle" size={16} color={colors.textFaint} />
              </Pressable>
            )}
          </View>
        </View>
      }
    >
      <FlatList
        data={filtered}
        keyExtractor={(i) => i.value}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        renderItem={({ item }) => {
          const active = item.value === selected;
          return (
            <Pressable
              style={({ pressed }) => [styles.sheetRow, pressed && { backgroundColor: colors.bgMuted }]}
              onPress={() => { onSelect(item.value); setQuery(""); onClose(); }}
            >
              {!!item.prefix && <Text style={styles.sheetFlag}>{item.prefix}</Text>}
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetRowLabel, active && { color: colors.brand }]}>{item.label}</Text>
                {!!item.sublabel && <Text style={styles.sheetRowSub}>{item.sublabel}</Text>}
              </View>
              {active && <Ionicons name="checkmark" size={18} color={colors.brand} />}
            </Pressable>
          );
        }}
      />
    </BottomSheet>
  );
}

/* ── One settings row (Account Settings style) ── */
function Row({ icon, title, desc, right, last }: {
  icon: Ion; title: string; desc: string; right: React.ReactNode; last?: boolean;
}) {
  return (
    <View>
      <View style={styles.row}>
        <View style={styles.iconCircle}>
          <Ionicons name={icon} size={20} color={colors.text} />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>{title}</Text>
          <Text style={styles.rowDesc}>{desc}</Text>
        </View>
        {right}
      </View>
      {!last && <View style={styles.divider} />}
    </View>
  );
}

/** The 7 fields this page manages - same set as the website's page. The store
 *  holds more (player prefs like speed/quality) which this page must not touch. */
function pick(p: ContentPreferences): ContentPrefs {
  return {
    preferred_language: p.preferred_language,
    preferred_country: p.preferred_country,
    show_local_first: p.show_local_first,
    show_trending: p.show_trending,
    sensitive_content_filter: p.sensitive_content_filter,
    autoplay_videos: p.autoplay_videos,
    data_saver_mode: p.data_saver_mode,
  };
}

/**
 * Content Preferences - mirrors the website's /settings/content-preferences
 * rules (same prefs + feed reset + history clearing + pickers + dirty-state
 * Reset / Save) in the app's light settings design. Reads/writes through the
 * app-wide prefs store so the feed player and More-Options sheet always see
 * the same values (one shared GET/PATCH /profile/content-preferences).
 */
export function ContentPreferencesScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const stored = usePrefsStore((s) => s.prefs);
  const original = useMemo(() => pick(stored), [stored]);
  const [prefs, setPrefs] = useState<ContentPrefs>(original);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [picker, setPicker] = useState<"language" | "country" | null>(null);

  const isDirty = JSON.stringify(prefs) !== JSON.stringify(original);

  // Refresh from the server on open; while the user hasn't edited anything,
  // let store updates (sync result) flow into the draft.
  const dirtyRef = useRef(isDirty);
  useEffect(() => { dirtyRef.current = isDirty; }, [isDirty]);
  useEffect(() => { void usePrefsStore.getState().sync(); }, []);
  useEffect(() => { if (!dirtyRef.current) setPrefs(pick(stored)); }, [stored]);

  const set = <K extends keyof ContentPrefs>(key: K) => (v: ContentPrefs[K]) =>
    setPrefs((p) => ({ ...p, [key]: v }));

  const save = () => {
    setSaving(true);
    usePrefsStore.getState().update(prefs)
      .catch(() => Alert.alert("Content Preferences", "Could not save. Please try again."))
      .finally(() => setSaving(false));
  };

  const resetFeed = () =>
    Alert.alert("Reset Feed Algorithm", "Your personalised feed recommendations will be cleared and rebuilt from scratch.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset", style: "destructive",
        onPress: () => {
          setResetting(true);
          profileApi.resetFeedPreferences()
            .then(() => Alert.alert("Feed reset", "Your recommendations will be rebuilt from scratch."))
            .catch(() => Alert.alert("Reset Feed", "Could not reset feed. Please try again."))
            .finally(() => setResetting(false));
        },
      },
    ]);

  const clearWatch = () =>
    Alert.alert("Clear Watch History", "This will remove all your watched video history. This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear", style: "destructive",
        onPress: () => {
          profileApi.clearWatchHistory()
            .then(() => Alert.alert("Watch history", "Your watch history was cleared."))
            .catch(() => Alert.alert("Watch history", "Could not clear watch history."));
        },
      },
    ]);

  const clearSearch = () =>
    Alert.alert("Clear Search History", "This will remove all your recent searches on this device. This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear", style: "destructive",
        onPress: () => { void clearRecentSearches().then(() => Alert.alert("Search history", "Your recent searches were cleared.")); },
      },
    ]);

  const selLang = LANGUAGES.find((l) => l.code === prefs.preferred_language);
  const selCountry = COUNTRIES.find((c) => c.code === prefs.preferred_country);

  const brandSwitch = (value: boolean, onChange: (v: boolean) => void) => (
    <Switch value={value} onValueChange={onChange} trackColor={{ false: colors.borderStrong, true: colors.brand }} thumbColor={colors.white} />
  );

  return (
    <Screen edges={["top"]}>
      {(
        <>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: spacing.xl }}
          >
            {/* Heading - same treatment as Account Settings */}
            <View style={styles.titleRow}>
              <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={styles.back}>
                <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
              </Pressable>
              <Text style={styles.title}>Content Preferences</Text>
            </View>
            <Text style={styles.subtitle}>Customize your feed and content experience.</Text>

            {/* ── Feed preferences ── */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>FEED PREFERENCES</Text>
              <View style={styles.list}>
                <Row icon="sparkles-outline" title="Choose Interests" desc="Select topics you want to see more of"
                  right={
                    <Pressable style={styles.valueBtn} onPress={() => navigation.navigate("ProfileInfo")}>
                      <Text style={styles.valueText}>Manage</Text>
                      <Ionicons name="chevron-forward" size={13} color={colors.textMuted} />
                    </Pressable>
                  } />
                <Row icon="language-outline" title="Preferred Language" desc="Show content in your language"
                  right={
                    <Pressable style={styles.valueBtn} onPress={() => setPicker("language")}>
                      <Text style={styles.valueText}>{selLang?.name ?? prefs.preferred_language}</Text>
                      <Ionicons name="chevron-down" size={13} color={colors.textMuted} />
                    </Pressable>
                  } />
                <Row icon="globe-outline" title="Preferred Country Content" desc="Prioritize content from a specific region"
                  right={
                    <Pressable style={styles.valueBtn} onPress={() => setPicker("country")}>
                      {!!selCountry && <Text style={{ fontSize: 14 }}>{selCountry.flag}</Text>}
                      <Text style={styles.valueText} numberOfLines={1}>{selCountry?.name ?? prefs.preferred_country}</Text>
                      <Ionicons name="chevron-down" size={13} color={colors.textMuted} />
                    </Pressable>
                  } />
                <Row icon="location-outline" title="Show Local Videos First" desc="Prioritize videos from your country"
                  right={brandSwitch(prefs.show_local_first, set("show_local_first"))} />
                <Row icon="trending-up-outline" title="Show Trending Videos" desc="Include trending content in your feed"
                  right={brandSwitch(prefs.show_trending, set("show_trending"))} />
                <Row icon="refresh-outline" title="Reset Feed Algorithm" desc="Start fresh with feed recommendations" last
                  right={
                    <Pressable style={styles.valueBtn} onPress={resetFeed} disabled={resetting}>
                      {resetting
                        ? <ActivityIndicator size="small" color={colors.textMuted} />
                        : <Text style={styles.valueText}>Reset</Text>}
                    </Pressable>
                  } />
              </View>
            </View>

            {/* ── Content control ── */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>CONTENT CONTROL</Text>
              <View style={styles.list}>
                <Row icon="shield-half-outline" title="Sensitive Content Filter" desc="Filter potentially sensitive content"
                  right={brandSwitch(prefs.sensitive_content_filter, set("sensitive_content_filter"))} />
                <Row icon="play-outline" title="Autoplay Videos" desc="Videos play automatically as you scroll"
                  right={brandSwitch(prefs.autoplay_videos, set("autoplay_videos"))} />
                <Row icon="wifi-outline" title="Data Saver Mode" desc="Reduce data usage while watching" last
                  right={brandSwitch(prefs.data_saver_mode, set("data_saver_mode"))} />
              </View>
            </View>

            {/* ── History ── */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>HISTORY</Text>
              <View style={styles.list}>
                <Row icon="trash-outline" title="Clear Watch History" desc="Remove all watched video history"
                  right={
                    <Pressable style={styles.valueBtn} onPress={clearWatch}>
                      <Text style={styles.dangerText}>Clear</Text>
                    </Pressable>
                  } />
                <Row icon="trash-outline" title="Clear Search History" desc="Remove your recent searches on this device" last
                  right={
                    <Pressable style={styles.valueBtn} onPress={clearSearch}>
                      <Text style={styles.dangerText}>Clear</Text>
                    </Pressable>
                  } />
              </View>
            </View>
          </ScrollView>

          {/* Bottom bar - same Reset / Save rules as the website. */}
          <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
            <Pressable style={[styles.resetBtn, (!isDirty || saving) && styles.btnDisabled]} disabled={!isDirty || saving} onPress={() => setPrefs(original)}>
              <Text style={styles.resetText}>Reset</Text>
            </Pressable>
            {isDirty && !saving && <Text style={styles.dirtyHint}>Unsaved changes</Text>}
            <Pressable style={[styles.saveBtn, (!isDirty || saving) && styles.btnDisabled]} disabled={!isDirty || saving} onPress={save}>
              {saving ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.saveText}>Save Changes</Text>
              )}
            </Pressable>
          </View>

          {/* Pickers */}
          <PickerSheet
            visible={picker === "language"}
            title="Preferred Language"
            items={LANGUAGES.map((l) => ({ value: l.code, label: l.name, sublabel: l.native }))}
            selected={prefs.preferred_language}
            onSelect={set("preferred_language")}
            onClose={() => setPicker(null)}
          />
          <PickerSheet
            visible={picker === "country"}
            title="Preferred Country Content"
            items={COUNTRIES.map((c) => ({ value: c.code, label: c.name, prefix: c.flag }))}
            selected={prefs.preferred_country}
            onSelect={set("preferred_country")}
            onClose={() => setPicker(null)}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, height: 56 },
  back: { width: 30, height: 40, justifyContent: "center" },
  title: { fontSize: font.xxl, fontWeight: font.weightHeavy, color: colors.text },
  subtitle: { paddingHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.md, fontSize: font.lg, lineHeight: 26, color: colors.textMuted },

  section: { marginTop: spacing.lg },
  sectionLabel: { paddingHorizontal: spacing.lg, marginBottom: spacing.xs, fontSize: font.xs, fontWeight: font.weightBold, color: colors.textFaint, letterSpacing: 0.6 },
  list: { paddingHorizontal: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  iconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1 },
  rowTitle: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text },
  rowDesc: { marginTop: 2, fontSize: font.sm, lineHeight: 19, color: colors.textMuted },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 44 + spacing.md },

  valueBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 10, paddingHorizontal: spacing.sm, height: 34, maxWidth: 150, backgroundColor: colors.white },
  valueText: { fontSize: font.xs, fontWeight: font.weightBold, color: colors.textSecondary, flexShrink: 1 },
  dangerText: { fontSize: font.xs, fontWeight: font.weightBold, color: colors.danger },

  actionBar: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bg,
  },
  resetBtn: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 10, paddingHorizontal: spacing.lg, height: 42, alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
  resetText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.textSecondary },
  dirtyHint: { flex: 1, textAlign: "right", fontSize: font.xs, color: colors.textMuted, fontWeight: font.weightMedium },
  saveBtn: { alignItems: "center", justifyContent: "center", backgroundColor: colors.brand, borderRadius: 10, paddingHorizontal: spacing.xl, height: 42, minWidth: 140, marginLeft: "auto" },
  saveText: { fontSize: font.sm, fontWeight: font.weightHeavy, color: colors.white },
  btnDisabled: { opacity: 0.4 },

  sheetHead: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.sm, gap: spacing.sm },
  sheetTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  sheetSearch: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.bgMuted, borderRadius: radius.pill, paddingHorizontal: spacing.md, height: 38 },
  sheetInput: { flex: 1, fontSize: font.sm, color: colors.text, padding: 0 },
  sheetRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  sheetFlag: { fontSize: 18 },
  sheetRowLabel: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.text },
  sheetRowSub: { fontSize: font.xs, color: colors.textFaint, marginTop: 1 },
});
