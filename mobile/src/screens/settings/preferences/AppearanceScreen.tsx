import { useEffect, useState } from "react";
import { Alert, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "@/components/Screen";
import { SettingsHeader, Section, ToggleRow, SelectRow, OptionSheet, type SettingsOption } from "@/components/settings/SettingsKit";
import { useAppearanceStore } from "@/store/app-prefs.store";
import type { AppearancePreferences } from "@/api/prefs.api";
import { spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

const THEME_OPTS: SettingsOption[] = [
  { value: "system", label: "System", desc: "Match your device appearance" },
  { value: "light", label: "Light", desc: "Always use the light theme" },
  { value: "dark", label: "Dark", desc: "Always use the dark theme" },
];
const ICON_OPTS: SettingsOption[] = [
  { value: "default", label: "Default" },
  { value: "midnight", label: "Midnight" },
  { value: "retro", label: "Retro" },
];

export function AppearanceScreen() {
  const insets = useSafeAreaInsets();
  const prefs = useAppearanceStore((s) => s.prefs);
  const [picker, setPicker] = useState<"theme" | "icon" | null>(null);

  useEffect(() => {
    void useAppearanceStore.getState().hydrate().then(() => useAppearanceStore.getState().sync());
  }, []);

  const save = (p: Partial<AppearancePreferences>) => {
    useAppearanceStore.getState().update(p).catch(() => Alert.alert("Couldn't save", "Check your connection and try again."));
  };
  const label = (opts: SettingsOption[], v: string) => opts.find((o) => o.value === v)?.label;

  return (
    <Screen edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.lg }}>
        <SettingsHeader title="Appearance" subtitle="Theme, app icon and how content is displayed." />

        <Section title="THEME" footer="Dark theme is rolling out gradually - your choice is saved and applies as more screens adopt it.">
          <SelectRow icon="contrast-outline" title="Theme" desc="Light, dark or match your device"
            value={label(THEME_OPTS, prefs.theme)} onPress={() => setPicker("theme")} />
        </Section>

        <Section title="DISPLAY">
          <SelectRow icon="apps-outline" title="App Icon" desc="Choose your home-screen icon"
            value={label(ICON_OPTS, prefs.app_icon)} onPress={() => setPicker("icon")} />
          <ToggleRow icon="text-outline" title="Bold Text" desc="Use heavier text weights across the app"
            value={prefs.bold_text} onValueChange={(v) => save({ bold_text: v })} />
          <ToggleRow icon="globe-outline" title="In-App Browser" desc="Open links inside Teezer instead of your browser"
            value={prefs.in_app_browser} onValueChange={(v) => save({ in_app_browser: v })} />
        </Section>
      </ScrollView>

      <OptionSheet visible={picker === "theme"} title="Theme" options={THEME_OPTS} selected={prefs.theme}
        onSelect={(v) => save({ theme: v as AppearancePreferences["theme"] })} onClose={() => setPicker(null)} />
      <OptionSheet visible={picker === "icon"} title="App Icon" options={ICON_OPTS} selected={prefs.app_icon}
        onSelect={(v) => save({ app_icon: v as AppearancePreferences["app_icon"] })} onClose={() => setPicker(null)} />
    </Screen>
  );
}
