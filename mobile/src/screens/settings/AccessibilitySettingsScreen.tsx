import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ChevronLeft } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "@/components/Screen";
import { BottomSheet } from "@/components/BottomSheet";
import { useA11yStore } from "@/store/a11y.store";
import type { AccessibilityPreferences } from "@/api/prefs.api";
import { colors } from "@/constants/colors";
import { font, spacing } from "@/constants/theme";

type Ion = keyof typeof Ionicons.glyphMap;

interface Opt { value: string; label: string; desc?: string }

/* Same option sets as the website's Accessibility Settings page. */
const TEXT_SIZE_OPTS: Opt[] = [
  { value: "small", label: "Small", desc: "Compact - fits more content" },
  { value: "medium", label: "Medium", desc: "Default comfortable reading size" },
  { value: "large", label: "Large", desc: "Easier to read at a distance" },
  { value: "xlarge", label: "Extra Large", desc: "Maximum readability" },
];
const POINTER_OPTS: Opt[] = [
  { value: "default", label: "Default", desc: "Standard pointer size" },
  { value: "large", label: "Large", desc: "Easier to see on screen" },
  { value: "xlarge", label: "Extra Large", desc: "Maximum pointer size" },
];
const CAPTION_OPTS: Opt[] = [
  { value: "default", label: "Default", desc: "Standard white text, dark background" },
  { value: "large_text", label: "Large Text", desc: "Bigger caption text" },
  { value: "high_contrast", label: "High Contrast", desc: "Bold white on black" },
  { value: "yellow_black", label: "Yellow on Black", desc: "High-visibility captions" },
];

/* ── Simple option picker sheet ── */
function OptionSheet({ visible, title, options, selected, onSelect, onClose }: {
  visible: boolean; title: string; options: Opt[]; selected: string;
  onSelect: (v: string) => void; onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} scrollable={false}>
      <View style={{ paddingBottom: spacing.lg }}>
        <Text style={styles.sheetTitle}>{title}</Text>
        {options.map((opt) => {
          const active = opt.value === selected;
          return (
            <Pressable
              key={opt.value}
              style={({ pressed }) => [styles.sheetRow, pressed && { backgroundColor: colors.bgMuted }]}
              onPress={() => { onSelect(opt.value); onClose(); }}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetLabel, active && { color: colors.brand }]}>{opt.label}</Text>
                {!!opt.desc && <Text style={styles.sheetDesc}>{opt.desc}</Text>}
              </View>
              {active && <Ionicons name="checkmark" size={18} color={colors.brand} />}
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

/* ── One settings row (Account Settings style) ── */
function Row({ icon, title, desc, right, last }: {
  icon: Ion; title: string; desc: string; right: React.ReactNode; last?: boolean;
}) {
  return (
    <View>
      <View style={styles.row}>
        <View style={styles.iconCircle}>
          <Ionicons name={icon} size={20} color={colors.text} />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>{title}</Text>
          <Text style={styles.rowDesc}>{desc}</Text>
        </View>
        {right}
      </View>
      {!last && <View style={styles.divider} />}
    </View>
  );
}

/**
 * Accessibility Settings - the same 12 settings and rules as the website's
 * /settings/accessibility page (shared GET/PATCH /profile/accessibility, so
 * changes follow the account across app and web), described in app terms and
 * presented in the app's light settings design. In the app, Reduce Motion
 * and Autoplay Videos take effect immediately in the feed.
 */
export function AccessibilitySettingsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const stored = useA11yStore((s) => s.prefs);
  const original = useMemo(() => stored, [stored]);
  const [prefs, setPrefs] = useState<AccessibilityPreferences>(stored);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<"text" | "pointer" | "caption" | null>(null);

  const isDirty = JSON.stringify(prefs) !== JSON.stringify(original);
  const dirtyRef = useRef(isDirty);
  useEffect(() => { dirtyRef.current = isDirty; }, [isDirty]);
  useEffect(() => { void useA11yStore.getState().sync(); }, []);
  useEffect(() => { if (!dirtyRef.current) setPrefs(stored); }, [stored]);

  const set = <K extends keyof AccessibilityPreferences>(key: K) => (v: AccessibilityPreferences[K]) =>
    setPrefs((p) => ({ ...p, [key]: v }));

  const save = () => {
    setSaving(true);
    useA11yStore.getState().update(prefs)
      .catch(() => Alert.alert("Accessibility", "Could not save. Please try again."))
      .finally(() => setSaving(false));
  };

  const brandSwitch = (value: boolean, onChange: (v: boolean) => void) => (
    <Switch value={value} onValueChange={onChange} trackColor={{ false: colors.borderStrong, true: colors.brand }} thumbColor={colors.white} />
  );
  const valueBtn = (label: string | undefined, onPress: () => void) => (
    <Pressable style={styles.valueBtn} onPress={onPress}>
      <Text style={styles.valueText} numberOfLines={1}>{label}</Text>
      <Ionicons name="chevron-down" size={13} color={colors.textMuted} />
    </Pressable>
  );

  return (
    <Screen edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xl }}>
        {/* Heading - same treatment as Account Settings */}
        <View style={styles.titleRow}>
          <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={styles.back}>
            <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
          </Pressable>
          <Text style={styles.title}>Accessibility Settings</Text>
        </View>
        <Text style={styles.subtitle}>Adjust display, motion, captions and assistive options in the app.</Text>

        {/* ── Display & vision ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DISPLAY & VISION</Text>
          <View style={styles.list}>
            <Row icon="text-outline" title="Larger Text" desc="Increase text size across the app"
              right={brandSwitch(prefs.larger_text, set("larger_text"))} />
            <Row icon="resize-outline" title="Text Size" desc="Choose your preferred reading size"
              right={valueBtn(TEXT_SIZE_OPTS.find((o) => o.value === prefs.text_size)?.label, () => setPicker("text"))} />
            <Row icon="contrast-outline" title="High Contrast Mode" desc="Boost contrast for easier reading"
              right={brandSwitch(prefs.high_contrast, set("high_contrast"))} />
            <Row icon="eye-outline" title="Reduce Transparency" desc="Reduce blur and see-through effects" last
              right={brandSwitch(prefs.reduce_transparency, set("reduce_transparency"))} />
          </View>
        </View>

        {/* ── Motion & interaction ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>MOTION & INTERACTION</Text>
          <View style={styles.list}>
            <Row icon="pulse-outline" title="Reduce Motion" desc="Minimize animations and effects in the app"
              right={brandSwitch(prefs.reduce_motion, set("reduce_motion"))} />
            <Row icon="play-outline" title="Autoplay Videos" desc="Play feed videos automatically - off means tap to play"
              right={brandSwitch(prefs.autoplay_videos, set("autoplay_videos"))} />
            <Row icon="navigate-outline" title="Pointer Size" desc="Pointer size when using a connected mouse or trackpad" last
              right={valueBtn(POINTER_OPTS.find((o) => o.value === prefs.pointer_size)?.label, () => setPicker("pointer"))} />
          </View>
        </View>

        {/* ── Captions & audio ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>CAPTIONS & AUDIO</Text>
          <View style={styles.list}>
            <Row icon="chatbox-ellipses-outline" title="Captions Always On" desc="Show captions on videos by default"
              right={brandSwitch(prefs.captions_always_on, set("captions_always_on"))} />
            <Row icon="text-outline" title="Caption Style" desc="Choose how captions appear on screen"
              right={valueBtn(CAPTION_OPTS.find((o) => o.value === prefs.caption_style)?.label, () => setPicker("caption"))} />
            <Row icon="volume-high-outline" title="Audio Descriptions" desc="Play narrated descriptions when available" last
              right={brandSwitch(prefs.audio_descriptions, set("audio_descriptions"))} />
          </View>
        </View>

        {/* ── Assistive technology ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ASSISTIVE TECHNOLOGY</Text>
          <View style={styles.list}>
            <Row icon="keypad-outline" title="Keyboard Navigation" desc="Navigate with a connected external keyboard"
              right={brandSwitch(prefs.keyboard_navigation, set("keyboard_navigation"))} />
            <Row icon="accessibility-outline" title="Screen Reader Friendly Labels" desc="Extra labels for TalkBack and VoiceOver" last
              right={brandSwitch(prefs.screen_reader, set("screen_reader"))} />
          </View>
          <Text style={styles.wcagNote}>
            Teezer follows WCAG 2.1 AA guidelines. If you need additional accessibility support, contact us at
            support@teezer.live.
          </Text>
        </View>
      </ScrollView>

      {/* Bottom bar - same Reset / Save rules as the website. */}
      <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Pressable style={[styles.resetBtn, (!isDirty || saving) && styles.btnDisabled]} disabled={!isDirty || saving} onPress={() => setPrefs(original)}>
          <Text style={styles.resetText}>Reset</Text>
        </Pressable>
        {isDirty && !saving && <Text style={styles.dirtyHint}>Unsaved changes</Text>}
        <Pressable style={[styles.saveBtn, (!isDirty || saving) && styles.btnDisabled]} disabled={!isDirty || saving} onPress={save}>
          {saving ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Text style={styles.saveText}>Save Changes</Text>
          )}
        </Pressable>
      </View>

      {/* Pickers */}
      <OptionSheet visible={picker === "text"} title="Text Size" options={TEXT_SIZE_OPTS}
        selected={prefs.text_size} onSelect={(v) => set("text_size")(v as AccessibilityPreferences["text_size"])} onClose={() => setPicker(null)} />
      <OptionSheet visible={picker === "pointer"} title="Pointer Size" options={POINTER_OPTS}
        selected={prefs.pointer_size} onSelect={(v) => set("pointer_size")(v as AccessibilityPreferences["pointer_size"])} onClose={() => setPicker(null)} />
      <OptionSheet visible={picker === "caption"} title="Caption Style" options={CAPTION_OPTS}
        selected={prefs.caption_style} onSelect={(v) => set("caption_style")(v as AccessibilityPreferences["caption_style"])} onClose={() => setPicker(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  wcagNote: { paddingHorizontal: spacing.lg, marginTop: spacing.md, fontSize: font.xs, lineHeight: 18, color: colors.textFaint },

  valueBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 10, paddingHorizontal: spacing.sm, height: 34, maxWidth: 150, backgroundColor: colors.white },
  valueText: { fontSize: font.xs, fontWeight: font.weightBold, color: colors.textSecondary, flexShrink: 1 },

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

  sheetTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text, paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.sm },
  sheetRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  sheetLabel: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text },
  sheetDesc: { fontSize: font.xs, color: colors.textFaint, marginTop: 1 },
});
