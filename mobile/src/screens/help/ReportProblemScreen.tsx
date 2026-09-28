import { useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { ChevronLeft } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as MailComposer from "expo-mail-composer";
import Constants from "expo-constants";
import { Screen } from "@/components/Screen";
import { useAuthStore } from "@/store/auth.store";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

const SUPPORT_EMAIL = "support@teezer.live";
const MAX_CHARS = 500;
const MAX_SHOTS = 4;
type Ion = keyof typeof Ionicons.glyphMap;

interface Issue { key: string; icon: Ion; title: string; desc: string; }
const ISSUES: Issue[] = [
  { key: "performance", icon: "speedometer-outline", title: "App Performance", desc: "Crashes, freezes, or slow performance" },
  { key: "upload", icon: "cloud-upload-outline", title: "Upload Issue", desc: "Problem while uploading videos" },
  { key: "editing", icon: "cut-outline", title: "Editing Issue", desc: "Problem while editing your video" },
  { key: "account", icon: "person-outline", title: "Account Issue", desc: "Login, profile, or account related issues" },
  { key: "notifications", icon: "notifications-outline", title: "Notifications", desc: "Issues with notifications" },
  { key: "other", icon: "ellipsis-horizontal-circle-outline", title: "Other", desc: "Something else not listed above" },
];

/**
 * Report a Problem - opened from the three-dot menu › Report a Problem.
 * Pick an issue category, describe it (500-char limit), attach up to four
 * screenshots, and submit. Submitting composes a support email to
 * support@reelsoo.com with the category, description, device/app info and
 * the screenshots attached (falls back to a mailto link if no mail app).
 */
export function ReportProblemScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const me = useAuthStore((s) => s.user);

  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  const [shots, setShots] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const issue = ISSUES.find((i) => i.key === selected);
  const canSubmit = !!selected && detail.trim().length > 0 && !sending;

  const addScreenshots = async () => {
    if (shots.length >= MAX_SHOTS) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to attach screenshots.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: MAX_SHOTS - shots.length,
    });
    if (!res.canceled) {
      setShots((prev) => [...prev, ...res.assets.map((a) => a.uri)].slice(0, MAX_SHOTS));
    }
  };

  const removeShot = (uri: string) => setShots((prev) => prev.filter((u) => u !== uri));

  const submit = async () => {
    if (!canSubmit || !issue) return;
    setSending(true);

    const version = (Constants.expoConfig as { version?: string } | null)?.version ?? "1.0.0";
    const subject = `[Report a Problem] ${issue.title}`;
    const bodyLines = [
      `Issue category: ${issue.title}`,
      "",
      "Description:",
      detail.trim(),
      "",
      "-----",
      `From: ${me ? `@${me.username} (id ${me.id})` : "Guest"}`,
      `Platform: ${Platform.OS} ${Platform.Version}`,
      `App version: ${version}`,
      `Screenshots attached: ${shots.length}`,
    ];
    const body = bodyLines.join("\n");

    try {
      const available = await MailComposer.isAvailableAsync();
      if (available) {
        const result = await MailComposer.composeAsync({
          recipients: [SUPPORT_EMAIL],
          subject,
          body,
          attachments: shots,
        });
        setSending(false);
        if (result.status === "sent") {
          done();
        } else if (result.status === "cancelled") {
          // user backed out - leave the form as-is
        } else {
          done();
        }
        return;
      }
    } catch {
      /* fall through to mailto */
    }

    // No mail app configured → open a mailto link (screenshots can't attach).
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setSending(false);
    Linking.openURL(url)
      .then(() => done())
      .catch(() => Alert.alert("Couldn't open mail", `Please email us at ${SUPPORT_EMAIL}.`));
  };

  const done = () => {
    Alert.alert("Report sent", "Thanks for letting us know. Our team will look into it and reply within 24-48 hours.", [
      { text: "OK", onPress: () => navigation.goBack() },
    ]);
  };

  return (
    <Screen edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={styles.back}>
          <ChevronLeft size={24} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headerTitle}>Report a Problem</Text>
        <View style={styles.back} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        {/* Illustration + intro */}
        <View style={styles.intro}>
          <View style={styles.bubbleWrap}>
            <View style={styles.bubble}>
              <Text style={styles.bubbleMark}>!</Text>
              <View style={styles.bubbleTail} />
            </View>
            <View style={[styles.spark, { top: -4, right: 2, transform: [{ rotate: "20deg" }] }]} />
            <View style={[styles.spark, { top: 6, right: -8, transform: [{ rotate: "70deg" }] }]} />
            <View style={[styles.spark, { top: 20, right: -10, transform: [{ rotate: "110deg" }] }]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.introTitle}>We&apos;re here to help!</Text>
            <Text style={styles.introSub}>Let us know what&apos;s going on and we&apos;ll do our best to fix it.</Text>
          </View>
        </View>

        {/* Issue categories */}
        <Text style={styles.sectionLabel}>What&apos;s the issue about?</Text>
        <View style={styles.list}>
          {ISSUES.map((it) => {
            const on = selected === it.key;
            return (
              <Pressable key={it.key} style={[styles.card, on && styles.cardActive]} onPress={() => setSelected(it.key)}>
                <View style={[styles.cardIcon, on && styles.cardIconActive]}>
                  <Ionicons name={it.icon} size={22} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{it.title}</Text>
                  <Text style={styles.cardDesc}>{it.desc}</Text>
                </View>
                {on ? (
                  <Ionicons name="checkmark-circle" size={22} color={colors.brand} />
                ) : (
                  <Ionicons name="chevron-forward" size={20} color={colors.brand} />
                )}
              </Pressable>
            );
          })}
        </View>

        {/* Tell us more */}
        <Text style={styles.sectionLabel}>Tell us more</Text>
        <View style={styles.textareaWrap}>
          <TextInput
            value={detail}
            onChangeText={(t) => setDetail(t.slice(0, MAX_CHARS))}
            placeholder="Please describe your issue in detail..."
            placeholderTextColor={colors.textMuted}
            multiline
            style={styles.textarea}
            textAlignVertical="top"
          />
          <Text style={styles.counter}>{detail.length}/{MAX_CHARS}</Text>
        </View>

        {/* Screenshots */}
        <Pressable style={styles.attachRow} onPress={addScreenshots}>
          <View style={styles.attachIcon}>
            <Ionicons name="attach" size={22} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.attachTitle}>Add Screenshots (Optional)</Text>
            <Text style={styles.attachDesc}>You can add up to {MAX_SHOTS} screenshots</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.brand} />
        </Pressable>

        {shots.length > 0 && (
          <View style={styles.thumbs}>
            {shots.map((uri) => (
              <View key={uri} style={styles.thumbWrap}>
                <Image source={uri} style={styles.thumb} contentFit="cover" />
                <Pressable style={styles.thumbX} onPress={() => removeShot(uri)} hitSlop={6}>
                  <Ionicons name="close" size={13} color={colors.white} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Submit */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Pressable style={[styles.submitBtn, !canSubmit && styles.submitDisabled]} onPress={submit} disabled={!canSubmit}>
          {sending ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Ionicons name="paper-plane" size={18} color={colors.white} />
              <Text style={styles.submitText}>Submit Report</Text>
            </>
          )}
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, height: 56 },
  back: { width: 40, height: 40, justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text },

  intro: { flexDirection: "row", alignItems: "center", gap: spacing.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl },
  bubbleWrap: { width: 90, height: 90, alignItems: "center", justifyContent: "center" },
  bubble: {
    width: 76, height: 68, borderRadius: 34, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
    shadowColor: colors.brand, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  bubbleMark: { color: colors.white, fontSize: 40, fontWeight: font.weightHeavy, lineHeight: 46 },
  bubbleTail: { position: "absolute", bottom: -6, left: 20, width: 20, height: 20, backgroundColor: colors.brand, borderBottomLeftRadius: 12, transform: [{ rotate: "20deg" }] },
  spark: { position: "absolute", width: 10, height: 3, borderRadius: 2, backgroundColor: "#f97316" },
  introTitle: { fontSize: font.xxl, fontWeight: font.weightHeavy, color: colors.text },
  introSub: { fontSize: font.md, color: colors.textMuted, marginTop: 6, lineHeight: 22 },

  sectionLabel: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text, paddingHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.md },

  list: { paddingHorizontal: spacing.lg, gap: spacing.md },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.card, padding: spacing.md },
  cardActive: { borderColor: colors.brand, backgroundColor: colors.brandTint },
  cardIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center" },
  cardIconActive: { backgroundColor: colors.white },
  cardTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  cardDesc: { fontSize: font.sm, color: colors.textMuted, marginTop: 2 },

  textareaWrap: { marginHorizontal: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.card, padding: spacing.md, minHeight: 130 },
  textarea: { flex: 1, fontSize: font.md, color: colors.text, minHeight: 90, padding: 0 },
  counter: { alignSelf: "flex-end", fontSize: font.xs, color: colors.textMuted, marginTop: spacing.xs },

  attachRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginHorizontal: spacing.lg, marginTop: spacing.lg },
  attachIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center" },
  attachTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  attachDesc: { fontSize: font.sm, color: colors.textMuted, marginTop: 2 },

  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  thumbWrap: { width: 72, height: 72 },
  thumb: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.bgMuted },
  thumbX: { position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.text, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.bg },

  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bg },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brand, borderRadius: radius.pill, height: 54 },
  submitDisabled: { opacity: 0.45 },
  submitText: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.white },
});
