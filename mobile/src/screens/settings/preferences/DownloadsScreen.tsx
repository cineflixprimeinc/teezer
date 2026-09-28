import { useEffect, useState } from "react";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "@/components/Screen";
import { SettingsHeader, Section, ToggleRow, SelectRow, OptionSheet, type SettingsOption } from "@/components/settings/SettingsKit";
import { useDownloadsStore, type DownloadQuality } from "@/store/downloads.store";
import { spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

const QUALITY_OPTS: SettingsOption[] = [
  { value: "auto", label: "Auto" },
  { value: "480", label: "480p", desc: "Smaller file size" },
  { value: "720", label: "720p", desc: "HD" },
  { value: "1080", label: "1080p", desc: "Full HD" },
];

export function DownloadsScreen() {
  const insets = useSafeAreaInsets();
  const prefs = useDownloadsStore((s) => s.prefs);
  const set = useDownloadsStore((s) => s.set);
  const [picker, setPicker] = useState(false);

  useEffect(() => { void useDownloadsStore.getState().hydrate(); }, []);

  return (
    <Screen edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.lg }}>
        <SettingsHeader title="Downloads" subtitle="Save videos to watch offline and control how they download." />

        <Section title="DOWNLOADS" footer="You have no downloaded videos yet. Videos you download are available offline and appear here.">
          <SelectRow icon="film-outline" title="Download Quality" desc="Higher quality uses more storage"
            value={QUALITY_OPTS.find((o) => o.value === prefs.quality)?.label} onPress={() => setPicker(true)} />
        </Section>

        <Section title="PREFERENCES">
          <ToggleRow icon="wifi-outline" title="Wi-Fi Only" desc="Only download when connected to Wi-Fi"
            value={prefs.wifi_only} onValueChange={(v) => set({ wifi_only: v })} />
          <ToggleRow icon="flash-outline" title="Smart Downloads" desc="Automatically download recommended videos on Wi-Fi"
            value={prefs.smart_downloads} onValueChange={(v) => set({ smart_downloads: v })} />
        </Section>
      </ScrollView>

      <OptionSheet visible={picker} title="Download Quality" options={QUALITY_OPTS} selected={prefs.quality}
        onSelect={(v) => set({ quality: v as DownloadQuality })} onClose={() => setPicker(false)} />
    </Screen>
  );
}
