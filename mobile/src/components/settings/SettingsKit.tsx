import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ChevronLeft } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { BottomSheet } from "@/components/BottomSheet";
import { colors } from "@/constants/colors";
import { font, spacing } from "@/constants/theme";

/**
 * Shared settings UI kit - the single source of truth for the Teezer settings
 * design language (heading, section labels, icon-circle rows, dividers, toggles,
 * selects). Every settings screen composes these so spacing, typography, rounded
 * corners and dividers stay identical, and all colours come from the semantic
 * `colors` tokens so light/dark parity is automatic.
 */

type Ion = keyof typeof Ionicons.glyphMap;

/** Back arrow + page title + optional subtitle - matches Account/Accessibility. */
export function SettingsHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const navigation = useNavigation<any>();
  return (
    <>
      <View style={s.titleRow}>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={s.back}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={s.title}>{title}</Text>
      </View>
      {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
    </>
  );
}

/** A labelled group; injects hairline dividers between its rows automatically. */
export function Section({ title, footer, children }: { title?: string; footer?: string; children: React.ReactNode }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={s.section}>
      {title ? <Text style={s.sectionLabel}>{title}</Text> : null}
      <View style={s.list}>
        {items.map((child, i) => (
          <View key={i}>
            {child}
            {i < items.length - 1 && <View style={s.divider} />}
          </View>
        ))}
      </View>
      {footer ? <Text style={s.footer}>{footer}</Text> : null}
    </View>
  );
}

function RowShell({ icon, iconNode, title, desc, right, onPress, danger }: {
  icon?: Ion; iconNode?: React.ReactNode; title: string; desc?: string;
  right?: React.ReactNode; onPress?: () => void; danger?: boolean;
}) {
  const body = (
    <>
      <View style={s.iconCircle}>
        {iconNode ?? (icon ? <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.text} /> : null)}
      </View>
      <View style={s.rowText}>
        <Text style={[s.rowTitle, danger && { color: colors.danger }]}>{title}</Text>
        {desc ? <Text style={s.rowDesc}>{desc}</Text> : null}
      </View>
      {right}
    </>
  );
  if (onPress) {
    return (
      <Pressable style={({ pressed }) => [s.row, pressed && s.rowPressed]} onPress={onPress}>
        {body}
      </Pressable>
    );
  }
  return <View style={s.row}>{body}</View>;
}

/** Tappable row with a forward chevron (navigates to another page). */
export function NavRow(props: { icon?: Ion; iconNode?: React.ReactNode; title: string; desc?: string; onPress: () => void; danger?: boolean }) {
  return <RowShell {...props} right={<Ionicons name="chevron-forward" size={18} color={colors.textFaint} />} />;
}

/** Row with a brand Switch on the right. */
export function ToggleRow({ value, onValueChange, disabled, ...rest }: {
  icon?: Ion; iconNode?: React.ReactNode; title: string; desc?: string;
  value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <RowShell
      {...rest}
      right={
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          trackColor={{ false: colors.borderStrong, true: colors.brand }}
          thumbColor={colors.white}
        />
      }
    />
  );
}

/** Row with a bordered value pill + down chevron (opens a picker). */
export function SelectRow({ value, onPress, ...rest }: {
  icon?: Ion; iconNode?: React.ReactNode; title: string; desc?: string; value?: string; onPress: () => void;
}) {
  return (
    <RowShell
      {...rest}
      onPress={onPress}
      right={
        <View style={s.valueBtn}>
          <Text style={s.valueText} numberOfLines={1}>{value}</Text>
          <Ionicons name="chevron-down" size={13} color={colors.textMuted} />
        </View>
      }
    />
  );
}

/** Centered loading state for data-backed pages. */
export function SettingsLoading() {
  return (
    <View style={s.center}>
      <ActivityIndicator color={colors.brand} />
    </View>
  );
}

/** Centered empty / info state (icon chip + title + description). */
export function SettingsEmpty({ icon, title, desc }: { icon: Ion; title: string; desc?: string }) {
  return (
    <View style={s.center}>
      <View style={s.emptyIcon}>
        <Ionicons name={icon} size={30} color={colors.brand} />
      </View>
      <Text style={s.emptyTitle}>{title}</Text>
      {desc ? <Text style={s.emptyDesc}>{desc}</Text> : null}
    </View>
  );
}

export interface SettingsOption { value: string; label: string; desc?: string }

/** Bottom-sheet single-select picker paired with SelectRow. */
export function OptionSheet({ visible, title, options, selected, onSelect, onClose }: {
  visible: boolean; title: string; options: SettingsOption[]; selected: string;
  onSelect: (v: string) => void; onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} scrollable={false}>
      <View style={{ paddingBottom: spacing.lg }}>
        <Text style={s.sheetTitle}>{title}</Text>
        {options.map((opt) => {
          const active = opt.value === selected;
          return (
            <Pressable
              key={opt.value}
              style={({ pressed }) => [s.sheetRow, pressed && { backgroundColor: colors.bgMuted }]}
              onPress={() => { onSelect(opt.value); onClose(); }}
            >
              <View style={{ flex: 1 }}>
                <Text style={[s.sheetLabel, active && { color: colors.brand }]}>{opt.label}</Text>
                {!!opt.desc && <Text style={s.sheetDesc}>{opt.desc}</Text>}
              </View>
              {active && <Ionicons name="checkmark" size={18} color={colors.brand} />}
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, height: 56 },
  back: { width: 30, height: 40, justifyContent: "center" },
  title: { fontSize: font.xxl, fontWeight: font.weightHeavy, color: colors.text },
  subtitle: { paddingHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.md, fontSize: font.lg, lineHeight: 26, color: colors.textMuted },

  section: { marginTop: spacing.lg },
  sectionLabel: { paddingHorizontal: spacing.lg, marginBottom: spacing.xs, fontSize: font.xs, fontWeight: font.weightBold, color: colors.textFaint, letterSpacing: 0.6 },
  list: { paddingHorizontal: spacing.lg },
  footer: { paddingHorizontal: spacing.lg, marginTop: spacing.sm, fontSize: font.xs, lineHeight: 18, color: colors.textFaint },

  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  rowPressed: { backgroundColor: colors.bgMuted, borderRadius: 12 },
  iconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1 },
  rowTitle: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text },
  rowDesc: { marginTop: 2, fontSize: font.sm, lineHeight: 19, color: colors.textMuted },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 44 + spacing.md },

  valueBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 10, paddingHorizontal: spacing.sm, height: 34, maxWidth: 170, backgroundColor: colors.white },
  valueText: { fontSize: font.xs, fontWeight: font.weightBold, color: colors.textSecondary, flexShrink: 1 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
  emptyTitle: { fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text, textAlign: "center" },
  emptyDesc: { marginTop: spacing.sm, fontSize: font.sm, lineHeight: 20, color: colors.textMuted, textAlign: "center", maxWidth: 300 },

  sheetTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text, paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.sm },
  sheetRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  sheetLabel: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text },
  sheetDesc: { fontSize: font.xs, color: colors.textFaint, marginTop: 1 },
});
