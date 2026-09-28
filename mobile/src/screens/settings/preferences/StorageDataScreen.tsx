import { useEffect, useState } from "react";
import { Alert, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Screen } from "@/components/Screen";
import { SettingsHeader, Section, ToggleRow, SelectRow, NavRow, OptionSheet, type SettingsOption } from "@/components/settings/SettingsKit";
import { usePrefsStore } from "@/store/prefs.store";
import type { ContentPreferences, VideoQuality } from "@/api/prefs.api";
import { spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

const QUALITY_OPTS: SettingsOption[] = [
  { value: "auto", label: "Auto", desc: "Adjust to your connection" },
  { value: "360", label: "360p", desc: "Lowest data use" },
  { value: "480", label: "480p" },
  { value: "720", label: "720p", desc: "HD" },
  { value: "1080", label: "1080p", desc: "Full HD - highest data use" },
];

export function StorageDataScreen() {
  const insets = useSafeAreaInsets();
  const prefs = usePrefsStore((s) => s.prefs);
  const [picker, setPicker] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => { void usePrefsStore.getState().sync(); }, []);

  const save = (p: Partial<ContentPreferences>) => {
    usePrefsStore.getState().update(p).catch(() => Alert.alert("Couldn't save", "Check your connection and try again."));
  };

  const clearCache = () => {
    Alert.alert(
      "Clear cache",
      "Frees up space by removing cached images and thumbnails. Your downloads and account data are not affected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear", style: "destructive", onPress: async () => {
            setClearing(true);
            try {
              await Image.clearDiskCache();
              await Image.clearMemoryCache();
              Alert.alert("Cache cleared", "Cached media has been removed.");
            } catch {
              Alert.alert("Error", "Couldn't clear the cache. Please try again.");
            } finally {
              setClearing(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Screen edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.lg }}>
        <SettingsHeader title="Storage & Data" subtitle="Manage cached media and how much data Teezer uses." />

        <Section title="STORAGE">
          <NavRow icon="trash-outline" title={clearing ? "Clearing…" : "Clear Cache"} desc="Remove cached images and video thumbnails" onPress={clearCache} />
        </Section>

        <Section title="DATA USAGE" footer="Data Saver lowers video quality on cellular so you use less data.">
          <ToggleRow icon="cellular-outline" title="Data Saver" desc="Reduce data use on mobile networks"
            value={prefs.data_saver_mode} onValueChange={(v) => save({ data_saver_mode: v })} />
          <SelectRow icon="videocam-outline" title="Default Video Quality" desc="Preferred playback quality"
            value={QUALITY_OPTS.find((o) => o.value === prefs.default_quality)?.label} onPress={() => setPicker(true)} />
        </Section>
      </ScrollView>

      <OptionSheet visible={picker} title="Default Video Quality" options={QUALITY_OPTS} selected={prefs.default_quality}
        onSelect={(v) => save({ default_quality: v as VideoQuality })} onClose={() => setPicker(false)} />
    </Screen>
  );
}
