import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { BottomSheet } from "@/components/BottomSheet";
import { profileApi, PrivacySettings, ProfileViewPrivacy } from "@/api/profile.api";
import { apiErrorMessage } from "@/api/client";
import { useAuthStore } from "@/store/auth.store";
import { colors } from "@/constants/colors";
import { font, radius, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

const WEB = "https://teezer.live";

type Ion = keyof typeof Ionicons.glyphMap;
type Mci = keyof typeof MaterialCommunityIcons.glyphMap;

/* ── Audience options (value + label + desc) - mirror the website's set ── */
type AllPrivacy = "everyone" | "friends" | "followers" | "no_one" | "only_me";
const OPT: Record<AllPrivacy, { label: string; desc: string; ion?: Ion; mci?: Mci }> = {
  everyone:  { label: "Everyone",  desc: "All Teezer users",        ion: "globe-outline" },
  friends:   { label: "Friends",   desc: "Mutual followers only",    mci: "account-check-outline" },
  followers: { label: "Followers", desc: "People who follow you",    ion: "people-outline" },
  no_one:    { label: "No one",    desc: "Only you can see/do this", mci: "account-remove-outline" },
  only_me:   { label: "Only me",   desc: "Completely private",       ion: "lock-closed-outline" },
};
const SET_ALL4:    AllPrivacy[] = ["everyone", "friends", "followers", "no_one"];
const SET_COMMENT: AllPrivacy[] = ["everyone", "followers", "no_one"];
const SET_DUET:    AllPrivacy[] = ["everyone", "friends", "no_one"];
const SET_MSG:     AllPrivacy[] = ["everyone", "friends", "followers", "no_one"];
const SET_LIKED:   AllPrivacy[] = ["everyone", "only_me"];

type AudienceKey = "message_privacy" | "who_can_comment" | "who_can_tag" | "who_can_duet" | "who_can_download" | "who_can_see_liked";
type BoolKey = "is_private" | "active_status" | "profile_discovery" | "show_to_search_engines" | "stories_allow_resharing" | "comment_filter";

/** 3-way "who can see that you viewed their profile". */
const PVIEW: { value: ProfileViewPrivacy; ion: Ion; label: string; desc: string }[] = [
  { value: "everyone",  ion: "globe-outline",  label: "Everyone",       desc: "Anyone whose profile you view can see you" },
  { value: "followers", ion: "people-outline", label: "Followers only", desc: "Only your followers can see that you viewed them" },
  { value: "private",   ion: "eye-off-outline", label: "Private Mode",  desc: "Hidden - and you can't see who viewed you either" },
];

type Editor =
  | { kind: "audience"; key: AudienceKey; title: string; desc: string; options: AllPrivacy[] }
  | { kind: "bool"; key: BoolKey; title: string; desc: string }
  | { kind: "pview"; title: string; desc: string };

/**
 * Privacy & Safety - clean monochrome list matching the app design. Every row
 * opens its control (audience picker or on/off) in a bottom sheet. Backed by the
 * SAME endpoint as the website (GET/PATCH /profile/privacy), so choices match the web.
 */
export function PrivacySafetyScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const authUser = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const query = useQuery({ queryKey: ["privacySettings"], queryFn: profileApi.getPrivacy });
  const [s, setS] = useState<PrivacySettings | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);

  useEffect(() => { if (query.data) setS(query.data); }, [query.data]);

  const open = (url: string) => Linking.openURL(url).catch(() => {});
  const soon = (t: string) => Alert.alert(t, "Coming soon.");

  async function save(patch: Partial<PrivacySettings>) {
    const key = Object.keys(patch)[0];
    setSaving(key);
    setS((cur) => (cur ? { ...cur, ...patch } : cur));
    try {
      const updated = await profileApi.updatePrivacy(patch); // returns the full, fresh settings
      setS(updated);
      if ("is_private" in patch && authUser) setUser({ ...authUser, is_private: updated.is_private });
    } catch (e) {
      if (query.data) setS(query.data); // revert
      Alert.alert("Couldn't save", apiErrorMessage(e, "Please try again."));
    } finally {
      setSaving(null);
    }
  }

  const audience = (key: AudienceKey, title: string, desc: string, options: AllPrivacy[]): Editor => ({ kind: "audience", key, title, desc, options });
  const boolean = (key: BoolKey, title: string, desc: string): Editor => ({ kind: "bool", key, title, desc });

  const SECTIONS: { title: string; rows: Row[] }[] = [
    {
      title: "ACCOUNT PRIVACY",
      rows: [
        { ion: "lock-closed-outline", title: "Account Privacy", desc: "Control who can see your content", settingKey: "is_private", onPress: () => setEditor(boolean("is_private", "Account Privacy", "Only approved followers can see your content")) },
        { ion: "eye-outline", title: "Active Status", desc: "Show when you were last active", settingKey: "active_status", onPress: () => setEditor(boolean("active_status", "Active Status", "Show when you were last active")) },
        { mci: "account-search-outline", title: "Profile Discovery", desc: "Allow others to find your account", settingKey: "profile_discovery", onPress: () => setEditor(boolean("profile_discovery", "Profile Discovery", "Allow others to find your account")) },
        { ion: "eye-outline", title: "Profile Views", desc: "Who can see that you viewed their profile", settingKey: "profile_view_privacy", onPress: () => setEditor({ kind: "pview", title: "Profile Views", desc: "Choose who can see that you viewed their profile. Private Mode also hides who viewed you." }) },
        { ion: "globe-outline", title: "Search Engine Visibility", desc: "Manage your profile visibility", settingKey: "show_to_search_engines", onPress: () => setEditor(boolean("show_to_search_engines", "Search Engine Visibility", "Let search engines index your profile")) },
        { ion: "repeat-outline", title: "Story Resharing", desc: "Allow others to share my Stories", settingKey: "stories_allow_resharing", onPress: () => setEditor(boolean("stories_allow_resharing", "Story Resharing", "People can repost your public Stories to their own Stories")) },
      ],
    },
    {
      title: "INTERACTION PRIVACY",
      rows: [
        { ion: "chatbubble-outline", title: "Messages", desc: "Control who can message you", settingKey: "message_privacy", onPress: () => setEditor(audience("message_privacy", "Messages", "Who can message you", SET_MSG)) },
        { ion: "chatbubbles-outline", title: "Comments", desc: "Control who can comment", settingKey: "who_can_comment", onPress: () => setEditor(audience("who_can_comment", "Comments", "Who can comment", SET_COMMENT)) },
        { ion: "at-outline", title: "Tags & Mentions", desc: "Control who can tag or mention you", settingKey: "who_can_tag", onPress: () => setEditor(audience("who_can_tag", "Tags & Mentions", "Who can tag or mention you", SET_ALL4)) },
        { ion: "cut-outline", title: "Duet / Stitch", desc: "Control who can duet or stitch", settingKey: "who_can_duet", onPress: () => setEditor(audience("who_can_duet", "Duet / Stitch", "Who can duet or stitch", SET_DUET)) },
        { ion: "download-outline", title: "Downloads", desc: "Control who can download your videos", settingKey: "who_can_download", onPress: () => setEditor(audience("who_can_download", "Downloads", "Who can download your videos", SET_DUET)) },
        { ion: "heart-outline", title: "Likes", desc: "Control who can see liked videos", settingKey: "who_can_see_liked", onPress: () => setEditor(audience("who_can_see_liked", "Likes", "Who can see your liked videos", SET_LIKED)) },
      ],
    },
    {
      title: "SAFETY TOOLS",
      rows: [
        { ion: "ban-outline", title: "Blocked Accounts", desc: "Manage accounts you've blocked", onPress: () => open(`${WEB}/settings/blocked`) },
        { ion: "notifications-off-outline", title: "Muted Accounts", desc: "Manage accounts you've muted", onPress: () => open(`${WEB}/settings/muted`) },
        { ion: "shield-outline", title: "Hidden Words", desc: "Filter words and phrases", onPress: () => open(`${WEB}/settings/hidden-words`) },
        { ion: "funnel-outline", title: "Comment Filter", desc: "Filter offensive or spam comments", settingKey: "comment_filter", onPress: () => setEditor(boolean("comment_filter", "Comment Filter", "Auto-filter offensive and spam comments")) },
      ],
    },
    {
      title: "REPORTS",
      rows: [
        { ion: "flag-outline", title: "Report History", desc: "View reports you've submitted", onPress: () => open(`${WEB}/settings/reports`) },
        { ion: "shield-checkmark-outline", title: "Safety Center", desc: "Tips and tools to stay safe", onPress: () => soon("Safety Center") },
        { ion: "warning-outline", title: "Appeal Restrictions", desc: "Appeal content or account restrictions", onPress: () => soon("Appeal Restrictions") },
      ],
    },
  ];

  return (
    <Screen edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable hitSlop={12} onPress={() => navigation.goBack()} style={styles.back}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.xl }}>
        <Text style={styles.title}>Privacy & Safety</Text>
        <Text style={styles.subtitle}>Manage your privacy, interactions and experience on Teezer.</Text>

        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionLabel}>{section.title}</Text>
            <View style={styles.card}>
              {section.rows.map((r, i) => (
                <Pressable
                  key={r.title}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  onPress={r.onPress}
                >
                  <View style={styles.iconCircle}>
                    {r.ion ? <Ionicons name={r.ion} size={20} color={colors.text} /> : r.mci ? <MaterialCommunityIcons name={r.mci} size={20} color={colors.text} /> : null}
                  </View>
                  <View style={[styles.rowBody, i < section.rows.length - 1 && styles.rowDivider]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{r.title}</Text>
                      <Text style={styles.rowDesc} numberOfLines={1}>{r.desc}</Text>
                    </View>
                    {r.settingKey && saving === r.settingKey ? (
                      <ActivityIndicator size="small" color={colors.textFaint} style={{ marginRight: 2 }} />
                    ) : (
                      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Editor sheet - audience picker or on/off */}
      <BottomSheet visible={!!editor} onClose={() => setEditor(null)} scrollable={false}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
            <Text style={styles.sheetTitle}>{editor?.title}</Text>
            <Text style={styles.sheetDesc}>{editor?.desc}</Text>

            {editor?.kind === "audience" &&
              editor.options.map((v) => {
                const o = OPT[v];
                const active = !!s && s[editor.key] === v;
                return (
                  <OptionRow
                    key={v}
                    ion={o.ion} mci={o.mci} label={o.label} desc={o.desc} active={active}
                    onPress={() => { void save({ [editor.key]: v } as Partial<PrivacySettings>); setEditor(null); }}
                  />
                );
              })}

            {editor?.kind === "bool" &&
              ([true, false] as const).map((v) => {
                const active = !!s && s[editor.key] === v;
                return (
                  <OptionRow
                    key={String(v)}
                    ion={v ? "checkmark-circle-outline" : "close-circle-outline"}
                    label={v ? "On" : "Off"}
                    desc={v ? "Enabled" : "Disabled"}
                    active={active}
                    onPress={() => { void save({ [editor.key]: v } as Partial<PrivacySettings>); setEditor(null); }}
                  />
                );
              })}

            {editor?.kind === "pview" &&
              PVIEW.map((o) => {
                const active = !!s && s.profile_view_privacy === o.value;
                return (
                  <OptionRow
                    key={o.value}
                    ion={o.ion} label={o.label} desc={o.desc} active={active}
                    onPress={() => { void save({ profile_view_privacy: o.value }); setEditor(null); }}
                  />
                );
              })}
        </View>
      </BottomSheet>
    </Screen>
  );
}

interface Row { ion?: Ion; mci?: Mci; title: string; desc: string; onPress: () => void; settingKey?: string }

function OptionRow({
  ion, mci, label, desc, active, onPress,
}: { ion?: Ion; mci?: Mci; label: string; desc: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.optRow, pressed && styles.rowPressed]} onPress={onPress}>
      <View style={styles.iconCircle}>
        {ion ? <Ionicons name={ion} size={19} color={active ? colors.brand : colors.text} /> : mci ? <MaterialCommunityIcons name={mci} size={19} color={active ? colors.brand : colors.text} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.optLabel, active && { color: colors.brand }]}>{label}</Text>
        <Text style={styles.optDesc}>{desc}</Text>
      </View>
      {active && <View style={styles.check}><Ionicons name="checkmark" size={14} color={colors.white} /></View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: { height: 44, justifyContent: "center", paddingHorizontal: spacing.lg },
  back: { width: 40, height: 40, justifyContent: "center" },

  title: { fontSize: 30, fontWeight: font.weightHeavy, color: colors.text, marginTop: spacing.xs },
  subtitle: { marginTop: spacing.xs, fontSize: font.md, color: colors.textMuted, lineHeight: 22, maxWidth: 320 },

  section: { marginTop: spacing.xl },
  sectionLabel: { marginBottom: spacing.sm, marginLeft: spacing.xs, fontSize: font.xs, fontWeight: font.weightBold, color: colors.textMuted, letterSpacing: 1 },

  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.white, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingLeft: spacing.lg },
  rowPressed: { backgroundColor: colors.bgMuted },
  rowBody: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 14, paddingRight: spacing.lg },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  iconCircle: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  rowDesc: { marginTop: 2, fontSize: font.sm, color: colors.textMuted },

  sheet: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  sheetTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  sheetDesc: { marginTop: 2, marginBottom: spacing.sm, fontSize: font.sm, color: colors.textMuted },
  optRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10 },
  optLabel: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text },
  optDesc: { marginTop: 1, fontSize: font.xs, color: colors.textMuted },
  check: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
});
