import { useEffect, useState } from "react";
import { Alert, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Screen } from "@/components/Screen";
import { SettingsHeader, Section, NavRow, ToggleRow, SelectRow, OptionSheet, type SettingsOption } from "@/components/settings/SettingsKit";
import { useWellbeingStore } from "@/store/app-prefs.store";
import type { WellbeingPreferences } from "@/api/prefs.api";
import { spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

const LIMIT_OPTS: SettingsOption[] = [
  { value: "0", label: "Off" },
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
  { value: "120", label: "2 hours" },
  { value: "180", label: "3 hours" },
  { value: "240", label: "4 hours" },
];
const INTERVAL_OPTS: SettingsOption[] = [
  { value: "15", label: "Every 15 minutes" },
  { value: "30", label: "Every 30 minutes" },
  { value: "45", label: "Every 45 minutes" },
  { value: "60", label: "Every hour" },
];
const START_OPTS: SettingsOption[] = ["21:00", "21:30", "22:00", "22:30", "23:00", "23:30", "00:00"].map((t) => ({ value: t, label: t }));
const END_OPTS: SettingsOption[] = ["06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00"].map((t) => ({ value: t, label: t }));

export function DigitalWellbeingScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const prefs = useWellbeingStore((s) => s.prefs);
  const [picker, setPicker] = useState<"limit" | "interval" | "start" | "end" | null>(null);

  useEffect(() => {
    void useWellbeingStore.getState().hydrate().then(() => useWellbeingStore.getState().sync());
  }, []);

  const save = (p: Partial<WellbeingPreferences>) => {
    useWellbeingStore.getState().update(p).catch(() => Alert.alert("Couldn't save", "Check your connection and try again."));
  };

  return (
    <Screen edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.lg }}>
        <SettingsHeader title="Digital Wellbeing" subtitle="Balance your time with screen-time limits and bedtime reminders." />

        <Section title="OVERVIEW">
          <NavRow icon="bar-chart-outline" title="Screen Time" desc="Usage, trends, limits, bedtime and focus" onPress={() => navigation.navigate("ScreenTime")} />
        </Section>

        <Section title="SCREEN TIME">
          <SelectRow icon="hourglass-outline" title="Daily limit" desc="Get reminded when you reach your limit"
            value={LIMIT_OPTS.find((o) => o.value === String(prefs.daily_limit_minutes))?.label ?? "Off"} onPress={() => setPicker("limit")} />
          <ToggleRow icon="alarm-outline" title="Break reminders" desc="Nudge me to take a break while scrolling"
            value={prefs.break_reminders} onValueChange={(v) => save({ break_reminders: v })} />
          {prefs.break_reminders && (
            <SelectRow icon="time-outline" title="Remind me" desc="How often to show a break reminder"
              value={INTERVAL_OPTS.find((o) => o.value === String(prefs.break_interval_minutes))?.label} onPress={() => setPicker("interval")} />
          )}
        </Section>

        <Section title="SLEEP" footer="Bedtime mode dims reminders and can mute notifications during your chosen hours.">
          <ToggleRow icon="moon-outline" title="Bedtime mode" desc="Wind down during your sleep hours"
            value={prefs.bedtime_enabled} onValueChange={(v) => save({ bedtime_enabled: v })} />
          {prefs.bedtime_enabled && (
            <SelectRow icon="bed-outline" title="Start" desc="When bedtime mode begins"
              value={prefs.bedtime_start} onPress={() => setPicker("start")} />
          )}
          {prefs.bedtime_enabled && (
            <SelectRow icon="sunny-outline" title="End" desc="When bedtime mode ends"
              value={prefs.bedtime_end} onPress={() => setPicker("end")} />
          )}
          {prefs.bedtime_enabled && (
            <ToggleRow icon="notifications-off-outline" title="Mute notifications at bedtime" desc="Silence pushes during your sleep hours"
              value={prefs.restful_notifications} onValueChange={(v) => save({ restful_notifications: v })} />
          )}
        </Section>
      </ScrollView>

      <OptionSheet visible={picker === "limit"} title="Daily limit" options={LIMIT_OPTS} selected={String(prefs.daily_limit_minutes)}
        onSelect={(v) => save({ daily_limit_minutes: Number(v) })} onClose={() => setPicker(null)} />
      <OptionSheet visible={picker === "interval"} title="Break reminder" options={INTERVAL_OPTS} selected={String(prefs.break_interval_minutes)}
        onSelect={(v) => save({ break_interval_minutes: Number(v) })} onClose={() => setPicker(null)} />
      <OptionSheet visible={picker === "start"} title="Bedtime start" options={START_OPTS} selected={prefs.bedtime_start}
        onSelect={(v) => save({ bedtime_start: v })} onClose={() => setPicker(null)} />
      <OptionSheet visible={picker === "end"} title="Bedtime end" options={END_OPTS} selected={prefs.bedtime_end}
        onSelect={(v) => save({ bedtime_end: v })} onClose={() => setPicker(null)} />
    </Screen>
  );
}
