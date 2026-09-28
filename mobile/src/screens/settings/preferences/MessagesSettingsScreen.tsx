import { useEffect, useState } from "react";
import { Alert, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "@/components/Screen";
import { SettingsHeader, Section, ToggleRow, SelectRow, OptionSheet, type SettingsOption } from "@/components/settings/SettingsKit";
import { useMessagesPrefStore } from "@/store/app-prefs.store";
import type { MessagesPreferences } from "@/api/prefs.api";
import { spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

const WHO_OPTS: SettingsOption[] = [
  { value: "everyone", label: "Everyone" },
  { value: "followers", label: "Followers" },
  { value: "friends", label: "Friends", desc: "People you follow who follow you back" },
  { value: "no_one", label: "No one" },
];
const GROUP_OPTS: SettingsOption[] = [
  { value: "everyone", label: "Everyone" },
  { value: "friends", label: "Friends" },
  { value: "no_one", label: "No one" },
];

export function MessagesSettingsScreen() {
  const insets = useSafeAreaInsets();
  const prefs = useMessagesPrefStore((s) => s.prefs);
  const [picker, setPicker] = useState<"who" | "group" | null>(null);

  useEffect(() => {
    void useMessagesPrefStore.getState().hydrate().then(() => useMessagesPrefStore.getState().sync());
  }, []);

  const save = (p: Partial<MessagesPreferences>) => {
    useMessagesPrefStore.getState().update(p).catch(() => Alert.alert("Couldn't save", "Check your connection and try again."));
  };

  return (
    <Screen edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.lg }}>
        <SettingsHeader title="Messages" subtitle="Control who can reach you and how chats behave." />

        <Section title="WHO CAN CONTACT YOU">
          <SelectRow icon="chatbubble-ellipses-outline" title="Who can message you" desc="Direct messages you receive"
            value={WHO_OPTS.find((o) => o.value === prefs.who_can_message)?.label} onPress={() => setPicker("who")} />
          <SelectRow icon="people-outline" title="Group chat invites" desc="Who can add you to group chats"
            value={GROUP_OPTS.find((o) => o.value === prefs.group_invites)?.label} onPress={() => setPicker("group")} />
          <ToggleRow icon="filter-outline" title="Filter message requests" desc="Route messages from people you don't follow to a separate requests inbox"
            value={prefs.message_requests} onValueChange={(v) => save({ message_requests: v })} />
        </Section>

        <Section title="IN CHAT">
          <ToggleRow icon="checkmark-done-outline" title="Read receipts" desc="Let people know when you've seen their messages"
            value={prefs.read_receipts} onValueChange={(v) => save({ read_receipts: v })} />
          <ToggleRow icon="ellipsis-horizontal-outline" title="Typing indicators" desc="Show others when you're typing"
            value={prefs.typing_indicators} onValueChange={(v) => save({ typing_indicators: v })} />
          <ToggleRow icon="download-outline" title="Auto-download media" desc="Automatically save photos and videos sent to you"
            value={prefs.media_autodownload} onValueChange={(v) => save({ media_autodownload: v })} />
        </Section>
      </ScrollView>

      <OptionSheet visible={picker === "who"} title="Who can message you" options={WHO_OPTS} selected={prefs.who_can_message}
        onSelect={(v) => save({ who_can_message: v as MessagesPreferences["who_can_message"] })} onClose={() => setPicker(null)} />
      <OptionSheet visible={picker === "group"} title="Group chat invites" options={GROUP_OPTS} selected={prefs.group_invites}
        onSelect={(v) => save({ group_invites: v as MessagesPreferences["group_invites"] })} onClose={() => setPicker(null)} />
    </Screen>
  );
}
