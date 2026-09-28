import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EditShell } from "@/components/settings/EditShell";
import { locationApi, LocationResult } from "@/api/location.api";
import { apiErrorMessage } from "@/api/client";
import type { ProfileDetails } from "@/types";
import { colors } from "@/constants/colors";
import { font, spacing } from "@/constants/theme";

/**
 * Edit Location - searches places via the backend (OpenStreetMap Nominatim) and
 * shows live results in a dropdown. Picking one and Save persists it via
 * /location/save (which also syncs the legacy profile `location`).
 */
export function EditLocationScreen() {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const initial = ((route.params ?? {}) as { value?: string }).value ?? "";

  const [query, setQuery] = useState(initial);
  const [selected, setSelected] = useState<LocationResult | null>(null);
  const [debounced, setDebounced] = useState(initial);

  // Debounce typing → search term (search is throttled 60/min server-side).
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 400);
    return () => clearTimeout(id);
  }, [query]);

  // Don't re-search the value the user just picked.
  const picked = !!selected && query === selected.formatted;
  const showDropdown = debounced.length >= 2 && !picked;

  const results = useQuery({
    queryKey: ["locsearch", debounced],
    queryFn: () => locationApi.search(debounced),
    enabled: showDropdown,
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: (r: LocationResult) => locationApi.save(r),
    onSuccess: (saved) => {
      const cur = queryClient.getQueryData<ProfileDetails>(["profileMe"]);
      if (cur) queryClient.setQueryData(["profileMe"], { ...cur, location: saved.local_location ?? null });
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      navigation.goBack();
    },
    onError: (err) => Alert.alert("Couldn't save location", apiErrorMessage(err, "Please try again.")),
  });

  const canSave = !!selected && selected.formatted.trim() !== initial.trim();

  function onChange(t: string) {
    setQuery(t);
    if (selected) setSelected(null); // typing invalidates the previous pick
  }
  function pick(r: LocationResult) {
    setSelected(r);
    setQuery(r.formatted);
  }

  return (
    <EditShell
      title="Location"
      helper="This helps us show you content relevant to your area."
      canSave={canSave}
      saving={save.isPending}
      onSave={() => selected && save.mutate(selected)}
    >
      {/* Search input */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.textFaint} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={onChange}
          autoFocus
          autoCapitalize="words"
          autoCorrect={false}
          placeholder="Search city or place"
          placeholderTextColor={colors.textFaint}
        />
        {query.length > 0 && (
          <Pressable hitSlop={8} onPress={() => onChange("")}>
            <Ionicons name="close-circle" size={18} color="#b9bdc6" />
          </Pressable>
        )}
      </View>

      {/* Dropdown results */}
      {showDropdown && (
        <View style={styles.dropdown}>
          {results.isLoading ? (
            <View style={styles.loading}><ActivityIndicator color={colors.brand} /></View>
          ) : (results.data ?? []).length === 0 ? (
            <Text style={styles.empty}>No places found.</Text>
          ) : (
            (results.data ?? []).map((r, i) => (
              <Pressable key={`${r.formatted}-${i}`} style={styles.option} onPress={() => pick(r)}>
                <Ionicons name="location-outline" size={18} color={colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.optTitle} numberOfLines={1}>{r.city || r.formatted.split(",")[0]}</Text>
                  {(r.region || r.country) && (
                    <Text style={styles.optSub} numberOfLines={1}>{[r.region, r.country].filter(Boolean).join(", ")}</Text>
                  )}
                </View>
              </Pressable>
            ))
          )}
        </View>
      )}
    </EditShell>
  );
}

const styles = StyleSheet.create({
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.bgMuted, borderRadius: 14, paddingHorizontal: 14, height: 54 },
  searchInput: { flex: 1, fontSize: 16, color: colors.text, padding: 0 },

  dropdown: { marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: 14, overflow: "hidden" },
  loading: { paddingVertical: spacing.lg, alignItems: "center" },
  empty: { paddingVertical: spacing.lg, textAlign: "center", color: colors.textFaint, fontSize: font.sm },
  option: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  optTitle: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text },
  optSub: { marginTop: 1, fontSize: font.sm, color: colors.textMuted },
});
