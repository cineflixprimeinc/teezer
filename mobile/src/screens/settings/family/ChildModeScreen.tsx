import { useEffect, useState } from "react";
import { Alert, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "@/components/Screen";
import { SettingsHeader, Section, ToggleRow, SelectRow, NavRow, OptionSheet, type SettingsOption } from "@/components/settings/SettingsKit";
import { ParentPinModal, type PinMode } from "./ParentPinModal";
import { useFamilyStore } from "@/store/app-prefs.store";
import type { FamilyPreferences } from "@/api/prefs.api";
import { spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

const AGE_OPTS: SettingsOption[] = [
  { value: "under_7", label: "Under 7", desc: "Youngest - strictest limits" },
  { value: "8_12", label: "8–12" },
  { value: "13_15", label: "13–15" },
  { value: "16_17", label: "16–17", desc: "Oldest - lightest limits" },
];
const LIMIT_OPTS: SettingsOption[] = [
  { value: "0", label: "No limit" },
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
  { value: "90", label: "1.5 hours" },
  { value: "120", label: "2 hours" },
  { value: "180", label: "3 hours" },
];
const START_OPTS: SettingsOption[] = ["19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00"].map((t) => ({ value: t, label: t }));
const END_OPTS: SettingsOption[] = ["06:00", "06:30", "07:00", "07:30", "08:00"].map((t) => ({ value: t, label: t }));

export function ChildModeScreen() {
  const insets = useSafeAreaInsets();
  const prefs = useFamilyStore((s) => s.prefs);
  const [picker, setPicker] = useState<"age" | "limit" | "start" | "end" | null>(null);
  const [pin, setPin] = useState<{ mode: PinMode; onOk: () => void } | null>(null);

  useEffect(() => {
    void useFamilyStore.getState().hydrate().then(() => useFamilyStore.getState().sync());
  }, []);

  const save = (p: Partial<FamilyPreferences>) => {
    useFamilyStore.getState().update(p).catch(() => Alert.alert("Couldn't save", "Check your connection and try again."));
  };

  // Child Mode is gated by the parent PIN: you must set one before enabling it,
  // and you must enter it to turn it back off.
  const toggleChildMode = (v: boolean) => {
    if (v) {
      if (!prefs.pin_set) {
        setPin({ mode: "set", onOk: async () => { await useFamilyStore.getState().sync(); save({ child_mode_enabled: true }); } });
      } else {
        save({ child_mode_enabled: true });
      }
    } else if (prefs.pin_set) {
      setPin({ mode: "verify", onOk: () => save({ child_mode_enabled: false }) });
    } else {
      save({ child_mode_enabled: false });
    }
  };

  const label = (opts: SettingsOption[], v: string) => opts.find((o) => o.value === v)?.label;

  return (
    <Screen edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.lg }}>
        <SettingsHeader title="Child Mode" subtitle="A safer, limited experience for younger users - protected by a parent PIN." />

        <Section title="CHILD MODE" footer={prefs.pin_set ? undefined : "Set a parent PIN to turn on Child Mode. You'll need it to turn Child Mode off."}>
          <ToggleRow icon="happy-outline" title="Enable Child Mode" desc="Apply age-appropriate limits and content filters"
            value={prefs.child_mode_enabled} onValueChange={toggleChildMode} />
          <SelectRow icon="people-outline" title="Child Age Group" desc="Tailors limits and filtering to their age"
            value={label(AGE_OPTS, prefs.child_age_group)} onPress={() => setPicker("age")} />
          <NavRow icon="keypad-outline" title={prefs.pin_set ? "Change Parent PIN" : "Set Parent PIN"} desc="A 4–6 digit code that protects these settings"
            onPress={() => setPin({ mode: prefs.pin_set ? "change" : "set", onOk: () => { void useFamilyStore.getState().sync(); } })} />
        </Section>

        <Section title="SCREEN TIME">
          <SelectRow icon="hourglass-outline" title="Daily Screen Time" desc="Cap how long they can watch each day"
            value={label(LIMIT_OPTS, String(prefs.daily_screen_time_minutes)) ?? "No limit"} onPress={() => setPicker("limit")} />
          <ToggleRow icon="alarm-outline" title="Take Break Reminder" desc="Prompt regular breaks while watching"
            value={prefs.break_reminders} onValueChange={(v) => save({ break_reminders: v })} />
        </Section>

        <Section title="BEDTIME" footer="During bedtime hours the app locks until the parent PIN is entered.">
          <ToggleRow icon="moon-outline" title="Bedtime Schedule" desc="Limit access during sleep hours"
            value={prefs.bedtime_enabled} onValueChange={(v) => save({ bedtime_enabled: v })} />
          {prefs.bedtime_enabled && (
            <SelectRow icon="bed-outline" title="Start" desc="When bedtime begins"
              value={prefs.bedtime_start} onPress={() => setPicker("start")} />
          )}
          {prefs.bedtime_enabled && (
            <SelectRow icon="sunny-outline" title="End" desc="When bedtime ends"
              value={prefs.bedtime_end} onPress={() => setPicker("end")} />
          )}
        </Section>
      </ScrollView>

      <OptionSheet visible={picker === "age"} title="Child Age Group" options={AGE_OPTS} selected={prefs.child_age_group}
        onSelect={(v) => save({ child_age_group: v as FamilyPreferences["child_age_group"] })} onClose={() => setPicker(null)} />
      <OptionSheet visible={picker === "limit"} title="Daily Screen Time" options={LIMIT_OPTS} selected={String(prefs.daily_screen_time_minutes)}
        onSelect={(v) => save({ daily_screen_time_minutes: Number(v) })} onClose={() => setPicker(null)} />
      <OptionSheet visible={picker === "start"} title="Bedtime start" options={START_OPTS} selected={prefs.bedtime_start}
        onSelect={(v) => save({ bedtime_start: v })} onClose={() => setPicker(null)} />
      <OptionSheet visible={picker === "end"} title="Bedtime end" options={END_OPTS} selected={prefs.bedtime_end}
        onSelect={(v) => save({ bedtime_end: v })} onClose={() => setPicker(null)} />

      <ParentPinModal
        visible={!!pin}
        mode={pin?.mode ?? "verify"}
        onClose={() => setPin(null)}
        onSuccess={() => { const cb = pin?.onOk; setPin(null); cb?.(); }}
      />
    </Screen>
  );
}
