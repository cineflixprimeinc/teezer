import { useEffect } from "react";
import { Alert, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "@/components/Screen";
import { SettingsHeader, Section, ToggleRow } from "@/components/settings/SettingsKit";
import { useAiStore } from "@/store/app-prefs.store";
import type { AiPreferences } from "@/api/prefs.api";
import { spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

export function AIFeaturesScreen() {
  const insets = useSafeAreaInsets();
  const prefs = useAiStore((s) => s.prefs);

  useEffect(() => {
    void useAiStore.getState().hydrate().then(() => useAiStore.getState().sync());
  }, []);

  const save = (p: Partial<AiPreferences>) => {
    useAiStore.getState().update(p).catch(() => Alert.alert("Couldn't save", "Check your connection and try again."));
  };

  return (
    <Screen edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.lg }}>
        <SettingsHeader title="AI Features" subtitle="Control how Teezer uses AI to personalize and assist your experience." />

        <Section title="RECOMMENDATIONS">
          <ToggleRow icon="sparkles-outline" title="Personalized recommendations" desc="Use AI to tailor your For You feed"
            value={prefs.ai_recommendations} onValueChange={(v) => save({ ai_recommendations: v })} />
          <ToggleRow icon="search-outline" title="AI-powered search" desc="Smarter, more relevant search results"
            value={prefs.ai_search} onValueChange={(v) => save({ ai_search: v })} />
        </Section>

        <Section title="CONTENT">
          <ToggleRow icon="pricetag-outline" title="AI content labels" desc="Show badges on AI-generated content"
            value={prefs.ai_labels} onValueChange={(v) => save({ ai_labels: v })} />
          <ToggleRow icon="chatbox-ellipses-outline" title="Automatic captions" desc="Generate captions for videos automatically"
            value={prefs.ai_captions} onValueChange={(v) => save({ ai_captions: v })} />
          <ToggleRow icon="bulb-outline" title="Smart reply suggestions" desc="Suggested replies in comments and messages"
            value={prefs.ai_reply_suggestions} onValueChange={(v) => save({ ai_reply_suggestions: v })} />
        </Section>

        <Section title="DATA & PRIVACY" footer="Turning this off means your activity won't be used to train Teezer's AI models.">
          <ToggleRow icon="megaphone-outline" title="Personalized ads" desc="Use your activity to show more relevant ads"
            value={prefs.personalized_ads} onValueChange={(v) => save({ personalized_ads: v })} />
          <ToggleRow icon="school-outline" title="Help improve AI" desc="Allow your activity to help train Teezer's AI"
            value={prefs.data_for_training} onValueChange={(v) => save({ data_for_training: v })} />
        </Section>
      </ScrollView>
    </Screen>
  );
}
