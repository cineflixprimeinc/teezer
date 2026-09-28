import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ChevronLeft } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "@/components/Screen";
import { profileApi, NotificationPrefs } from "@/api/profile.api";
import { colors } from "@/constants/colors";
import { font, spacing } from "@/constants/theme";

type Ion = keyof typeof Ionicons.glyphMap;

interface RowDef {
  key: keyof NotificationPrefs;
  icon: Ion;
  title: string;
  desc: string;
}

/* Sections + rows mirror the website's /settings/notifications exactly. */
const SECTIONS: { title: string; rows: RowDef[] }[] = [
  {
    title: "PUSH NOTIFICATIONS",
    rows: [
      { key: "push_likes", icon: "heart-outline", title: "Likes", desc: "When someone likes your video" },
      { key: "push_comments", icon: "chatbubble-ellipses-outline", title: "Comments", desc: "When someone comments on your video" },
      { key: "push_followers", icon: "person-add-outline", title: "New Followers", desc: "When someone follows your account" },
      { key: "push_mentions", icon: "at-outline", title: "Mentions & Tags", desc: "When someone mentions or tags you" },
      { key: "push_messages", icon: "mail-outline", title: "Messages", desc: "When you receive a direct message" },
      { key: "push_live", icon: "radio-outline", title: "Live Notifications", desc: "When creators you follow go live" },
      { key: "push_following", icon: "play-outline", title: "Videos From Following", desc: "New videos from accounts you follow" },
      { key: "push_creator", icon: "star-outline", title: "Creator Updates", desc: "Updates from verified creators" },
    ],
  },
  {
    title: "EMAIL NOTIFICATIONS",
    rows: [
      { key: "email_security", icon: "shield-checkmark-outline", title: "Security Alerts", desc: "Unusual login attempts and changes" },
      { key: "email_account", icon: "notifications-outline", title: "Account Updates", desc: "Important changes to your account" },
      { key: "email_promo", icon: "newspaper-outline", title: "Promotional Emails", desc: "Special offers and feature announcements" },
      { key: "email_news", icon: "star-outline", title: "Creator News", desc: "News and tips for creators" },
    ],
  },
  {
    title: "SMS NOTIFICATIONS",
    rows: [
      { key: "sms_otp", icon: "call-outline", title: "Login OTP", desc: "One-time password for login verification" },
      { key: "sms_security", icon: "lock-closed-outline", title: "Security Alerts", desc: "Critical security alerts via SMS" },
      { key: "sms_updates", icon: "notifications-outline", title: "Important Account Updates", desc: "Critical account changes via SMS" },
    ],
  },
];

/**
 * Notification preferences - mirrors the website's /settings/notifications
 * rules (same GET/PATCH /profile/notifications, same push/email/SMS toggles,
 * same dirty-state Reset / Save flow) in the app's light settings design
 * (same look as Account Settings).
 */
export function NotificationSettingsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [original, setOriginal] = useState<NotificationPrefs | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    profileApi.getNotificationPrefs()
      .then((data) => { setPrefs(data); setOriginal(data); })
      .catch(() => Alert.alert("Notifications", "Couldn't load your preferences. Please try again."));
  }, []);

  const isDirty = !!prefs && !!original && JSON.stringify(prefs) !== JSON.stringify(original);

  const toggle = (key: keyof NotificationPrefs) => (v: boolean) =>
    setPrefs((p) => (p ? { ...p, [key]: v } : p));

  const save = () => {
    if (!prefs) return;
    setSaving(true);
    profileApi.updateNotificationPrefs(prefs)
      .then((updated) => { setPrefs(updated); setOriginal(updated); })
      .catch(() => Alert.alert("Notifications", "Could not save. Please try again."))
      .finally(() => setSaving(false));
  };

  return (
    <Screen edges={["top"]}>
      {!prefs ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} size="large" /></View>
      ) : (
        <>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: spacing.xl }}
          >
            {/* Heading - same treatment as Account Settings */}
            <View style={styles.titleRow}>
              <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={styles.back}>
                <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
              </Pressable>
              <Text style={styles.title}>Notifications</Text>
            </View>
            <Text style={styles.subtitle}>Manage alerts and updates for your account.</Text>

            {SECTIONS.map((section) => (
              <View key={section.title} style={styles.section}>
                <Text style={styles.sectionLabel}>{section.title}</Text>
                <View style={styles.list}>
                  {section.rows.map((row, i) => (
                    <View key={row.key}>
                      <View style={styles.row}>
                        <View style={styles.iconCircle}>
                          <Ionicons name={row.icon} size={20} color={colors.text} />
                        </View>
                        <View style={styles.rowText}>
                          <Text style={styles.rowTitle}>{row.title}</Text>
                          <Text style={styles.rowDesc}>{row.desc}</Text>
                        </View>
                        <Switch
                          value={prefs[row.key]}
                          onValueChange={toggle(row.key)}
                          trackColor={{ false: colors.borderStrong, true: colors.brand }}
                          thumbColor={colors.white}
                        />
                      </View>
                      {i < section.rows.length - 1 && <View style={styles.divider} />}
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Bottom bar - Reset / unsaved hint / Save (website behaviour). */}
          <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
            <Pressable
              style={[styles.resetBtn, (!isDirty || saving) && styles.btnDisabled]}
              disabled={!isDirty || saving}
              onPress={() => setPrefs(original)}
            >
              <Text style={styles.resetText}>Reset</Text>
            </Pressable>
            {isDirty && !saving && <Text style={styles.dirtyHint}>Unsaved changes</Text>}
            <Pressable
              style={[styles.saveBtn, (!isDirty || saving) && styles.btnDisabled]}
              disabled={!isDirty || saving}
              onPress={save}
            >
              {saving ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.saveText}>Save Changes</Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, height: 56 },
  back: { width: 30, height: 40, justifyContent: "center" },
  title: { fontSize: font.xxl, fontWeight: font.weightHeavy, color: colors.text },
  subtitle: { paddingHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.md, fontSize: font.lg, lineHeight: 26, color: colors.textMuted },

  section: { marginTop: spacing.lg },
  sectionLabel: { paddingHorizontal: spacing.lg, marginBottom: spacing.xs, fontSize: font.xs, fontWeight: font.weightBold, color: colors.textFaint, letterSpacing: 0.6 },
  list: { paddingHorizontal: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  iconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1 },
  rowTitle: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text },
  rowDesc: { marginTop: 2, fontSize: font.sm, lineHeight: 19, color: colors.textMuted },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 44 + spacing.md },

  actionBar: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bg,
  },
  resetBtn: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 10, paddingHorizontal: spacing.lg, height: 42, alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
  resetText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.textSecondary },
  dirtyHint: { flex: 1, textAlign: "right", fontSize: font.xs, color: colors.textMuted, fontWeight: font.weightMedium },
  saveBtn: { alignItems: "center", justifyContent: "center", backgroundColor: colors.brand, borderRadius: 10, paddingHorizontal: spacing.xl, height: 42, minWidth: 140, marginLeft: "auto" },
  saveText: { fontSize: font.sm, fontWeight: font.weightHeavy, color: colors.white },
  btnDisabled: { opacity: 0.4 },
});
