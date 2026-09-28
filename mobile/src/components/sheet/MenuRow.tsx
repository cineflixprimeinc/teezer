import type { ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Skeleton } from "@/components/Skeleton";
import { colors } from "@/constants/colors";
import { font, spacing } from "@/constants/theme";

type Ion = keyof typeof Ionicons.glyphMap;

interface MenuRowProps {
  /** An Ionicons name (existing usage everywhere), or a custom icon element
   *  (e.g. a user-supplied Svg) for the rare row that isn't in that set. */
  icon: Ion | ReactNode;
  title: string;
  subtitle?: string;
  /** Right-aligned value text (e.g. "Auto (1080p)", "Normal", "Nepal"). */
  value?: string;
  arrow?: boolean;
  /** Renders a Switch on the right; onToggle receives the next value. */
  toggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (next: boolean) => void;
  onPress?: () => void;
  disabled?: boolean;
  /** Replaces the right accessory with a spinner (in-flight state). */
  loading?: boolean;
  /** Brand-pink icon + title (active/selected rows). */
  active?: boolean;
  destructive?: boolean;
}

/**
 * One sheet menu row - icon · title/subtitle · value/arrow/switch/spinner.
 * Ripple on Android, muted press highlight on iOS, full a11y annotations.
 */
export function MenuRow({
  icon, title, subtitle, value, arrow, toggle, toggleValue, onToggle,
  onPress, disabled, loading, active, destructive,
}: MenuRowProps) {
  const tint = destructive ? colors.danger : active ? colors.brand : colors.text;
  const handlePress = () => {
    if (disabled || loading) return;
    if (toggle) onToggle?.(!toggleValue);
    else onPress?.();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading || (!onPress && !toggle)}
      android_ripple={{ color: "rgba(17,24,39,0.06)" }}
      style={({ pressed }) => [
        styles.row,
        pressed && Platform.OS === "ios" && styles.rowPressed,
        disabled && styles.rowDisabled,
      ]}
      accessibilityRole={toggle ? "switch" : "button"}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      accessibilityValue={value ? { text: value } : toggle ? { text: toggleValue ? "on" : "off" } : undefined}
      accessibilityState={{ disabled: !!disabled, checked: toggle ? !!toggleValue : undefined, busy: !!loading }}
    >
      {typeof icon === "string" ? (
        <Ionicons name={icon as Ion} size={22} color={tint} style={styles.icon} />
      ) : (
        // React 19.2's ReactNode type widened to include `symbol`, which a
        // View's children can't actually render - `icon` is never really a
        // bare symbol at runtime (Ion, the string-keyed case, is handled
        // above), so this narrows the type back rather than the value.
        <View style={styles.customIcon}>{icon as Exclude<ReactNode, symbol>}</View>
      )}
      <View style={styles.textCol}>
        <Text style={[styles.title, { color: tint }]} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={colors.textMuted} />
      ) : toggle ? (
        <Switch
          value={!!toggleValue}
          onValueChange={(v) => { if (!disabled) onToggle?.(v); }}
          disabled={disabled}
          trackColor={{ true: colors.brand, false: "#d1d5db" }}
          thumbColor={colors.white}
        />
      ) : (
        <>
          {!!value && <Text style={styles.value} numberOfLines={1}>{value}</Text>}
          {arrow && <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />}
        </>
      )}
    </Pressable>
  );
}

/** Hairline divider between menu groups (TikTok-style, no section titles). */
export function MenuDivider() {
  return <View style={styles.divider} />;
}

/** Loading placeholder matching MenuRow's geometry. */
export function MenuRowSkeleton({ toggle }: { toggle?: boolean }) {
  return (
    <View style={styles.row} accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
      <Skeleton width={22} height={22} radius={11} style={styles.icon} />
      <View style={styles.textCol}>
        <Skeleton width={140} height={15} radius={4} />
      </View>
      {toggle ? <Skeleton width={44} height={26} radius={13} /> : <Skeleton width={64} height={13} radius={4} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center",
    minHeight: 52, paddingHorizontal: spacing.lg, paddingVertical: 8, gap: spacing.md,
  },
  rowPressed: { backgroundColor: colors.bgMuted },
  rowDisabled: { opacity: 0.45 },
  icon: { width: 26, textAlign: "center" },
  customIcon: { width: 26, alignItems: "center" },
  textCol: { flex: 1 },
  title: { fontSize: font.md, fontWeight: font.weightMedium, color: colors.text },
  subtitle: { marginTop: 2, fontSize: font.sm, color: colors.textMuted },
  value: { fontSize: font.sm, color: colors.textMuted, marginRight: 2, maxWidth: 150 },
  divider: {
    height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong,
    marginVertical: 6, marginHorizontal: spacing.lg,
  },
});
