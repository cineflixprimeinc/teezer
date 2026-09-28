import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import {
  Bell, CalendarClock, ChevronRight, Circle, Eye, Hand, MicOff, Radio, Waves,
  type LucideIcon,
} from "lucide-react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { colors } from "@/constants/colors";
import { font, spacing } from "@/constants/theme";
import { SPACE_LIGHT } from "./space-style";
import { Switch } from "./SpacesFilterSheet";
import { spacesPrefsApi, type SpacesPreferences } from "@/api/spaces.api";

/**
 * "Spaces settings" - the sheet behind the header's gear.
 *
 * Every row is a real field on the account (users.spaces_preferences), read on
 * open and PATCHed on tap. Writes are optimistic: a switch that waits for a
 * round trip feels broken, so the cache flips first and rolls back if the
 * request fails.
 *
 * Value rows cycle their options rather than opening a second picker - there
 * are three choices at most, and a sheet on top of a sheet to pick one of three
 * is more chrome than choice.
 */

type ToggleKey = {
  [K in keyof SpacesPreferences]: SpacesPreferences[K] extends boolean ? K : never
}[keyof SpacesPreferences];

type Row =
  | { kind: "toggle"; key: ToggleKey; icon: LucideIcon; label: string; sub: string }
  | {
      kind: "value";
      key: "allow_invites_from" | "default_audio_quality";
      icon: LucideIcon;
      label: string;
      sub: string;
      options: { id: string; label: string }[];
    };

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "NOTIFICATIONS",
    rows: [
      { kind: "toggle", key: "notify_live_from_following", icon: Radio, label: "Spaces starting", sub: "When someone you follow opens a room" },
      { kind: "toggle", key: "notify_scheduled_reminders", icon: CalendarClock, label: "Scheduled reminders", sub: "Before a room you said you'd join starts" },
      {
        kind: "value", key: "allow_invites_from", icon: Bell, label: "Who can notify me", sub: "Who can invite you into a Space",
        options: [
          { id: "everyone", label: "Everyone" },
          { id: "following", label: "People I follow" },
          { id: "no_one", label: "No one" },
        ],
      },
    ],
  },
  {
    title: "AUDIO AND PLAYBACK",
    rows: [
      {
        kind: "value", key: "default_audio_quality", icon: Waves, label: "Audio quality", sub: "Applies to rooms you join and host",
        options: [
          { id: "standard", label: "Standard" },
          { id: "high", label: "High" },
          { id: "ultra", label: "Studio" },
        ],
      },
      { kind: "toggle", key: "join_muted", icon: MicOff, label: "Join muted", sub: "Your mic stays off until you unmute" },
      { kind: "toggle", key: "record_by_default", icon: Circle, label: "Record my spaces", sub: "Rooms you start are captured for replay" },
    ],
  },
  {
    title: "PRIVACY",
    rows: [
      { kind: "toggle", key: "notify_speaker_invites", icon: Hand, label: "Allow speak requests", sub: "Listeners can ask for the mic in your rooms" },
      { kind: "toggle", key: "show_listening_activity", icon: Eye, label: "Show me in the listener list", sub: "Turn off to listen without appearing" },
    ],
  },
];

export function SpacesSettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const qc = useQueryClient();

  const { data: prefs, isLoading } = useQuery({
    queryKey: ["spaces-prefs"],
    queryFn: spacesPrefsApi.get,
    // Only fetched once the sheet is actually opened.
    enabled: visible,
    staleTime: 5 * 60_000,
  });

  const save = useMutation({
    mutationFn: (patch: Partial<SpacesPreferences>) => spacesPrefsApi.update(patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ["spaces-prefs"] });
      const prev = qc.getQueryData<SpacesPreferences>(["spaces-prefs"]);
      if (prev) qc.setQueryData<SpacesPreferences>(["spaces-prefs"], { ...prev, ...patch });
      return { prev };
    },
    onError: (_e, _patch, ctx) => {
      // Put the switch back where the server still has it.
      if (ctx?.prev) qc.setQueryData(["spaces-prefs"], ctx.prev);
    },
    onSuccess: (fresh) => qc.setQueryData(["spaces-prefs"], fresh),
  });

  const cycle = (row: Extract<Row, { kind: "value" }>) => {
    if (!prefs) return;
    const i = row.options.findIndex((o) => o.id === prefs[row.key]);
    const next = row.options[(i + 1) % row.options.length].id;
    save.mutate({ [row.key]: next } as Partial<SpacesPreferences>);
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      maxHeightRatio={0.82}
      header={
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Spaces settings</Text>
          <Text style={styles.headerSub}>Controls how spaces behave for your account</Text>
        </View>
      }
    >
      {isLoading || !prefs ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        GROUPS.map((g) => (
          <View key={g.title}>
            <Text style={styles.groupLabel}>{g.title}</Text>
            <View style={styles.group}>
              {g.rows.map((row) => {
                const Icon = row.icon;
                const isToggle = row.kind === "toggle";
                const value = isToggle
                  ? null
                  : row.options.find((o) => o.id === prefs[row.key])?.label ?? "";

                return (
                  <Pressable
                    key={row.key}
                    style={styles.row}
                    onPress={() =>
                      isToggle
                        ? save.mutate({ [row.key]: !prefs[row.key] } as Partial<SpacesPreferences>)
                        : cycle(row)
                    }
                    accessibilityRole={isToggle ? "switch" : "button"}
                    accessibilityState={isToggle ? { checked: prefs[row.key] } : undefined}
                    accessibilityLabel={row.label}
                  >
                    <View style={styles.rowIcon}>
                      <Icon size={16} color={SPACE_LIGHT.text} strokeWidth={2} />
                    </View>
                    <View style={styles.rowText}>
                      <Text style={styles.rowLabel} numberOfLines={1}>{row.label}</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>{row.sub}</Text>
                    </View>
                    {isToggle ? (
                      <Switch on={prefs[row.key]} />
                    ) : (
                      <View style={styles.valueWrap}>
                        <Text style={styles.value}>{value}</Text>
                        <ChevronRight size={14} color={SPACE_LIGHT.chevron} strokeWidth={2.2} />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 6 },
  headerTitle: { fontSize: 17, fontWeight: font.weightHeavy, color: SPACE_LIGHT.text, letterSpacing: -0.3 },
  headerSub: { marginTop: 2, fontSize: 12.5, color: SPACE_LIGHT.dim },

  loading: { paddingVertical: spacing.xxl, alignItems: "center" },

  groupLabel: {
    paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8,
    fontSize: 11.5, fontWeight: font.weightHeavy, color: SPACE_LIGHT.label, letterSpacing: 0.7,
  },
  group: { marginHorizontal: 14, borderRadius: 14, backgroundColor: SPACE_LIGHT.group, paddingVertical: 3 },
  row: { flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 12, paddingVertical: 11 },
  rowIcon: {
    width: 32, height: 32, borderRadius: 9, backgroundColor: colors.white,
    alignItems: "center", justifyContent: "center",
  },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 14, fontWeight: font.weightBold, color: SPACE_LIGHT.text, letterSpacing: -0.1 },
  rowSub: { fontSize: 11.5, color: SPACE_LIGHT.dim, marginTop: 2 },
  valueWrap: { flexDirection: "row", alignItems: "center", gap: 4 },
  value: { fontSize: 12.5, fontWeight: font.weightBold, color: SPACE_LIGHT.dim },
});
