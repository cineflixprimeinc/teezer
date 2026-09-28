import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BottomSheet } from "@/components/BottomSheet";
import { EditShell } from "@/components/settings/EditShell";
import { CountryPickerModal } from "@/components/CountryPickerModal";
import { countryApi } from "@/api/country.api";
import { profileApi } from "@/api/profile.api";
import { apiErrorMessage } from "@/api/client";
import { useAuthStore } from "@/store/auth.store";
import type { ProfileDetails } from "@/types";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

const LANGUAGES = [
  { code: "en", name: "English" }, { code: "ne", name: "Nepali" }, { code: "hi", name: "Hindi" },
  { code: "es", name: "Spanish" }, { code: "fr", name: "French" }, { code: "de", name: "German" },
  { code: "pt", name: "Portuguese" }, { code: "ar", name: "Arabic" }, { code: "zh", name: "Chinese" },
  { code: "ja", name: "Japanese" }, { code: "ko", name: "Korean" }, { code: "ru", name: "Russian" },
  { code: "id", name: "Indonesian" }, { code: "bn", name: "Bengali" }, { code: "ur", name: "Urdu" },
  { code: "tr", name: "Turkish" }, { code: "it", name: "Italian" }, { code: "vi", name: "Vietnamese" },
  { code: "th", name: "Thai" }, { code: "fil", name: "Filipino" },
];
const langName = (code?: string | null) => LANGUAGES.find((l) => l.code === code)?.name ?? (code ? code.toUpperCase() : "English");

/** Country & Region - Account Settings › Country & Region. */
export function CountryRegionScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);

  const status = useQuery({ queryKey: ["countryStatus"], queryFn: countryApi.status });
  const profile = useQuery({ queryKey: ["profileMe"], queryFn: profileApi.me });

  const [language, setLanguage] = useState<string | null>(null);
  const [langOpen, setLangOpen] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);

  useEffect(() => {
    if (profile.data && language === null) setLanguage(profile.data.language ?? "en");
  }, [profile.data, language]);

  const initialLang = profile.data?.language ?? "en";
  const canSave = language !== null && language !== initialLang;

  const saveLang = useMutation({
    mutationFn: () => profileApi.update({ language: language ?? "en" }),
    onSuccess: (fresh) => {
      queryClient.setQueryData(["profileMe"], fresh);
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      Alert.alert("Saved", "Your regional preferences were updated.");
    },
    onError: (err) => Alert.alert("Couldn't save", apiErrorMessage(err, "Please try again.")),
  });

  const reqChange = useMutation({
    mutationFn: (code: string) => countryApi.requestChange(code),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["countryStatus"] });
      Alert.alert("Country change", res.message || "Country change request started.");
    },
    onError: (err) => Alert.alert("Couldn't request change", apiErrorMessage(err, "Please try again.")),
  });

  const s = status.data;
  const countryName = s?.currentCountryName || s?.detectedCountryName || "Unknown";
  const confirmed = !!s?.currentCountryCode;
  const locked = (s?.remainingLockDays ?? 0) > 0;

  const loading = status.isLoading || profile.isLoading;

  return (
    <EditShell
      title="Country & Region"
      helper="Manage your country, language and regional account preferences."
      canSave={canSave}
      saving={saveLang.isPending}
      onSave={() => saveLang.mutate()}
    >
      {loading ? (
        <View style={{ paddingTop: spacing.xxl, alignItems: "center" }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <View style={{ gap: spacing.lg }}>
          {/* CURRENT COUNTRY */}
          <View>
            <Text style={styles.sectionLabel}>CURRENT COUNTRY</Text>
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <View style={styles.iconGray}><Ionicons name="globe-outline" size={22} color={colors.text} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bigValue}>{countryName}</Text>
                  <Text style={styles.subValue}>{confirmed ? "Confirmed" : "Detected · not confirmed"}</Text>
                </View>
                <View style={[styles.badge, locked ? styles.badgeLocked : styles.badgeUnlocked]}>
                  <Text style={[styles.badgeText, locked ? styles.badgeTextLocked : styles.badgeTextUnlocked]}>
                    {locked ? `Locked ${s?.remainingLockDays}d` : "Unlocked"}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* COUNTRY CHANGE */}
          <View>
            <Text style={styles.sectionLabel}>COUNTRY CHANGE</Text>
            <Pressable style={[styles.card, styles.tapCard]} onPress={() => setCountryOpen(true)} disabled={reqChange.isPending}>
              <View style={styles.iconPink}><Ionicons name="sync" size={20} color={colors.brand} /></View>
              <Text style={styles.rowTitle}>Request country change</Text>
              {reqChange.isPending ? <ActivityIndicator size="small" color={colors.brand} /> : <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />}
            </Pressable>

            <View style={[styles.card, { marginTop: spacing.md }]}>
              <View style={styles.docHead}>
                <View style={styles.iconPink}><Ionicons name="document-text-outline" size={20} color={colors.brand} /></View>
                <Text style={[styles.rowTitle, { flex: 1 }]}>Change country with documents</Text>
                <Pressable hitSlop={8} onPress={() => navigation.navigate("CountryDocument")}>
                  <Text style={styles.upload}>Upload</Text>
                </Pressable>
              </View>
              <Text style={styles.docDesc}>
                Prefer a manual review? Upload a government-issued document (visa, passport, residence permit, recent
                utility bill, etc.) proving you've been residing in the new country for the past 60 days. Our team
                reviews submissions within 1–3 business days.
              </Text>
            </View>
          </View>

          {/* LANGUAGE & REGION */}
          <View>
            <Text style={styles.sectionLabel}>LANGUAGE & REGION</Text>
            <InfoRow
              icon={<MaterialCommunityIcons name="translate" size={20} color={colors.text} />}
              label="App Language"
              value={langName(language)}
              hint={`${langName(language)} · saved to your profile.`}
              onPress={() => setLangOpen(true)}
            />
            <InfoRow
              icon={<MaterialCommunityIcons name="translate" size={20} color={colors.text} />}
              label="Language Code"
              value={(language ?? "en").toUpperCase()}
              onPress={() => setLangOpen(true)}
            />
            <InfoRow
              icon={<Ionicons name="location-outline" size={20} color={colors.text} />}
              label="Detected Country"
              value={s?.detectedCountryName || "Unknown"}
            />
            <InfoRow
              icon={<Ionicons name="globe-outline" size={20} color={colors.text} />}
              label="Region / Location"
              value={profile.data?.location || s?.detectedCountryName || "Unknown"}
            />
            <InfoRow
              icon={<Ionicons name="wifi-outline" size={20} color={colors.text} />}
              label="ISP Info"
              value="Unknown"
              trailing={
                <Pressable hitSlop={8} onPress={() => status.refetch()}>
                  <Ionicons name="refresh" size={18} color={colors.textMuted} />
                </Pressable>
              }
            />
          </View>
        </View>
      )}

      {/* Country picker for change request */}
      <CountryPickerModal
        visible={countryOpen}
        selectedCode={s?.currentCountryCode ?? s?.detectedCountryCode ?? undefined}
        onSelect={(c) => reqChange.mutate(c.code)}
        onClose={() => setCountryOpen(false)}
      />

      {/* Language picker */}
      <BottomSheet visible={langOpen} onClose={() => setLangOpen(false)}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <Text style={styles.sheetTitle}>App Language</Text>
          {LANGUAGES.map((l) => {
            const active = language === l.code;
            return (
              <Pressable key={l.code} style={styles.langRow} onPress={() => { setLanguage(l.code); setLangOpen(false); }}>
                <Text style={[styles.langName, active && styles.langActive]}>{l.name}</Text>
                <Text style={styles.langCode}>{l.code.toUpperCase()}</Text>
                {active && <Ionicons name="checkmark" size={20} color={colors.brand} />}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
    </EditShell>
  );
}

function InfoRow({
  icon, label, value, hint, trailing, onPress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable style={[styles.card, styles.infoRow]} onPress={onPress} disabled={!onPress}>
      <View style={styles.iconGray}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
        {!!hint && <Text style={styles.infoHint}>{hint}</Text>}
      </View>
      {trailing ?? (onPress ? <Ionicons name="chevron-forward" size={20} color={colors.textFaint} /> : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: font.xs, fontWeight: font.weightBold, color: colors.textFaint, letterSpacing: 0.7, marginBottom: spacing.sm },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  cardRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  tapCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },

  iconGray: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },
  iconPink: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center" },

  bigValue: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  subValue: { marginTop: 2, fontSize: font.sm, color: colors.textMuted },

  badge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  badgeUnlocked: { backgroundColor: "#e7f8ee" },
  badgeLocked: { backgroundColor: "#fdeaea" },
  badgeText: { fontSize: font.sm, fontWeight: font.weightBold },
  badgeTextUnlocked: { color: colors.success },
  badgeTextLocked: { color: colors.danger },

  rowTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },

  docHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  upload: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.brand },
  docDesc: { marginTop: spacing.md, fontSize: font.sm, color: colors.textMuted, lineHeight: 20 },

  infoRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  infoLabel: { fontSize: font.sm, color: colors.textMuted },
  infoValue: { marginTop: 1, fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  infoHint: { marginTop: 2, fontSize: font.xs, color: colors.textFaint },

  sheet: { paddingHorizontal: spacing.xl, paddingTop: spacing.xs },
  sheetTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text, marginBottom: spacing.sm },
  langRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  langName: { flex: 1, fontSize: font.md, color: colors.text },
  langActive: { color: colors.brand, fontWeight: font.weightBold },
  langCode: { fontSize: font.sm, color: colors.textFaint },
});
