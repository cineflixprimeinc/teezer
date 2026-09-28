import { useMemo, useState } from "react";
import {
  FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { COUNTRIES, Country, countryFlag } from "@/constants/countries";
import { colors } from "@/constants/colors";
import { radius, spacing, font } from "@/constants/theme";

/** Full-screen searchable country list. Returns the chosen Country via onSelect.
 *  disabledCodes (App\Services\CountryAvailabilityService, via
 *  authApi.countryAvailabilityList()) keeps restricted countries visible but
 *  unselectable, with an inline reason instead of hiding them - see the
 *  "Restricted Country UI" requirement. UX only; the backend re-checks
 *  independently regardless of what this picker shows. */
export function CountryPickerModal({
  visible, selectedCode, onSelect, onClose, disabledCodes, countries,
}: {
  visible: boolean;
  selectedCode?: string;
  onSelect: (c: Country) => void;
  onClose: () => void;
  disabledCodes?: Set<string>;
  /** Overrides the default COUNTRIES list - optional and additive, so every
   *  other consumer of this shared modal (seller application, tax forms, ad
   *  campaigns, content preferences, etc. - confirmed via grep, none of them
   *  pass this) keeps working unchanged. Only EmailSignupScreen passes it,
   *  sourced from the SAME backend-authoritative /countries/availability
   *  list the admin panel's Country Availability page reads from
   *  (App\Services\IsoCountries::map(), 247 codes) - what makes the signup
   *  and admin country lists the same dataset instead of two hand-maintained
   *  files that can drift apart. */
  countries?: Country[];
}) {
  const [query, setQuery] = useState("");
  const [blockedMsg, setBlockedMsg] = useState<string | null>(null);

  const countryList = countries ?? COUNTRIES;

  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countryList;
    return countryList.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q);
  }, [query, countryList]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Text style={styles.title}>Select country</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textFaint} />
          <TextInput
            style={styles.search}
            placeholder="Search countries"
            placeholderTextColor={colors.textFaint}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoFocus
          />
        </View>

        {blockedMsg && (
          <View style={styles.blockedBox}>
            <Text style={styles.blockedText}>{blockedMsg}</Text>
          </View>
        )}

        <FlatList
          data={data}
          keyExtractor={(c) => c.code}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={20}
          renderItem={({ item }) => {
            const active = item.code === selectedCode;
            const disabled = disabledCodes?.has(item.code) ?? false;
            return (
              <Pressable
                onPress={() => {
                  if (disabled) { setBlockedMsg(`Teezer signup is currently unavailable in ${item.name}.`); return; }
                  setBlockedMsg(null);
                  onSelect(item); onClose();
                }}
                style={({ pressed }) => [styles.row, pressed && !disabled && styles.rowPressed, disabled && styles.rowDisabled]}
              >
                <Text style={[styles.flag, disabled && styles.flagDisabled]}>{countryFlag(item.code)}</Text>
                <Text style={[styles.name, active && styles.nameActive, disabled && styles.nameDisabled]}>{item.name}</Text>
                {disabled ? <Text style={styles.unavailable}>Unavailable</Text>
                  : active ? <Ionicons name="checkmark" size={20} color={colors.brand} /> : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>No countries found.</Text>}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.xl, paddingVertical: spacing.lg,
  },
  title: { fontSize: font.lg, fontWeight: "800", color: colors.text },
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    marginHorizontal: spacing.xl, marginBottom: spacing.md, paddingHorizontal: spacing.lg,
    height: 46, borderRadius: radius.md, backgroundColor: colors.bgMuted,
  },
  search: { flex: 1, fontSize: font.md, color: colors.text },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.xl, paddingVertical: 14,
  },
  rowPressed: { backgroundColor: colors.bgMuted },
  rowDisabled: { opacity: 0.45 },
  flag: { fontSize: 22 },
  flagDisabled: { opacity: 0.6 },
  name: { flex: 1, fontSize: font.md, color: colors.text },
  nameActive: { color: colors.brand, fontWeight: "700" },
  nameDisabled: { color: colors.textFaint },
  unavailable: { fontSize: font.xs, fontWeight: "700", color: colors.brand },
  empty: { textAlign: "center", marginTop: spacing.xxl, color: colors.textMuted },
  blockedBox: {
    marginHorizontal: spacing.xl, marginBottom: spacing.sm, padding: spacing.sm,
    borderRadius: radius.md, backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca",
  },
  blockedText: { fontSize: font.xs, color: "#991b1b" },
});
