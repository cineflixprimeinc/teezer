import { useEffect } from "react";
import { Alert, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "@/components/Screen";
import { SettingsHeader, Section, ToggleRow } from "@/components/settings/SettingsKit";
import { useFamilyStore } from "@/store/app-prefs.store";
import type { FamilyPreferences } from "@/api/prefs.api";
import { spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

export function ContentControlsScreen() {
  const insets = useSafeAreaInsets();
  const prefs = useFamilyStore((s) => s.prefs);

  useEffect(() => {
    void useFamilyStore.getState().hydrate().then(() => useFamilyStore.getState().sync());
  }, []);

  const save = (p: Partial<FamilyPreferences>) => {
    useFamilyStore.getState().update(p).catch(() => Alert.alert("Couldn't save", "Check your connection and try again."));
  };

  return (
    <Screen edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.lg }}>
        <SettingsHeader title="Content Controls" subtitle="Filter what can appear in feeds, search and recommendations." />

        <Section title="CONTENT CONTROLS" footer="Filters apply across feeds, search and recommendations. Child Mode enforces stricter defaults automatically.">
          <ToggleRow icon="search-outline" title="Safe Search" desc="Hide explicit results in search"
            value={prefs.safe_search} onValueChange={(v) => save({ safe_search: v })} />
          <ToggleRow icon="eye-off-outline" title="Sensitive Content Filter" desc="Reduce potentially sensitive videos"
            value={prefs.sensitive_content_filter} onValueChange={(v) => save({ sensitive_content_filter: v })} />
          <ToggleRow icon="flame-outline" title="Mature Content Filter" desc="Hide content marked mature (18+)"
            value={prefs.mature_content_filter} onValueChange={(v) => save({ mature_content_filter: v })} />
          <ToggleRow icon="hand-left-outline" title="Hide Violence" desc="Filter graphic or violent content"
            value={prefs.hide_violence} onValueChange={(v) => save({ hide_violence: v })} />
          <ToggleRow icon="lock-closed-outline" title="Hide Adult Content" desc="Block adult and suggestive content"
            value={prefs.hide_adult_content} onValueChange={(v) => save({ hide_adult_content: v })} />
          <ToggleRow icon="school-outline" title="Educational Content Only" desc="Optional - show only educational videos"
            value={prefs.educational_only} onValueChange={(v) => save({ educational_only: v })} />
        </Section>
      </ScrollView>
    </Screen>
  );
}
