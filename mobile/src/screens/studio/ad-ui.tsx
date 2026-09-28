import React from "react";
import { Alert, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ChevronLeft, ChevronRight, HelpCircle, type LucideIcon } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

/* ────────────────────────────────────────────────────────────────────────────
 * Teezer Ads - shared UI kit for the four Advertising pages (Ad Account,
 * Billing, Payment History, Promotional Credits). Matches the approved
 * screenshots: a centred back+help header, soft light-pink gradient hero cards,
 * elevated white cards, key/value + icon rows, stat tiles and status badges.
 * Every colour comes from the semantic tokens so light/dark parity is automatic.
 * ──────────────────────────────────────────────────────────────────────────── */

/* ── Formatters ──────────────────────────────────────────────────────────── */

export function fmtUsd(n: number): string {
  const neg = n < 0;
  const [int, dec] = Math.abs(n).toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}$${grouped}.${dec}`;
}

/** Signed amount for transaction rows: "+$500.00" / "-$120.50". */
export function fmtSignedUsd(n: number): string {
  return `${n >= 0 ? "+" : "-"}${fmtUsd(Math.abs(n))}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtDate(epoch: number): string {
  const d = new Date(epoch);
  return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}, ${d.getFullYear()}`;
}

/* ── Header (back · centred title · help) ─────────────────────────────────── */

export function AdHeader({ title, help }: { title: string; help?: string }) {
  const navigation = useNavigation<any>();
  return (
    <View style={s.header}>
      <Pressable hitSlop={12} onPress={() => navigation.goBack()} style={s.headerSide}>
        <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
      </Pressable>
      <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
      <Pressable
        hitSlop={12}
        onPress={() => Alert.alert(title, help ?? "More info about this page is coming soon.")}
        style={[s.headerSide, s.headerRight]}
      >
        <HelpCircle size={22} color={colors.textMuted} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

/* ── Cards ────────────────────────────────────────────────────────────────── */

/** Soft light-pink gradient hero card (balance / account summary). */
export function HeroCard({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <LinearGradient
      colors={["#FFE1EA", "#FFF3F6"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[s.hero, style]}
    >
      {children}
    </LinearGradient>
  );
}

/** Elevated white card that groups rows. */
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

/** Section title above/inside a card, with an optional right-side action ("Edit"). */
export function CardTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={s.cardTitleRow}>
      <Text style={s.cardTitle}>{title}</Text>
      {action ? (
        <Pressable hitSlop={8} onPress={onAction}>
          <Text style={s.cardAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Divider() {
  return <View style={s.divider} />;
}

/* ── Rows ─────────────────────────────────────────────────────────────────── */

/** Plain key/value row: label left, value right (value can be a custom node). */
export function KV({ label, value, valueNode }: { label: string; value?: string; valueNode?: React.ReactNode }) {
  return (
    <View style={s.kv}>
      <Text style={s.kvLabel}>{label}</Text>
      {valueNode ?? <Text style={s.kvValue} numberOfLines={1}>{value}</Text>}
    </View>
  );
}

/** Icon chip + title (+ optional subtitle) + optional right value / chevron. */
export function IconRow({
  icon: Icon, iconColor = colors.brand, iconBg = colors.brandTint, title, subtitle, value, right, onPress, chevron,
}: {
  icon: LucideIcon; iconColor?: string; iconBg?: string; title: string; subtitle?: string;
  value?: string; right?: React.ReactNode; onPress?: () => void; chevron?: boolean;
}) {
  const body = (
    <>
      <View style={[s.iconChip, { backgroundColor: iconBg }]}>
        <Icon size={18} color={iconColor} strokeWidth={2.1} />
      </View>
      <View style={s.rowText}>
        <Text style={s.rowTitle}>{title}</Text>
        {subtitle ? <Text style={s.rowSub}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={s.rowValue} numberOfLines={1}>{value}</Text> : null}
      {right}
      {chevron ? <ChevronRight size={18} color={colors.textFaint} style={{ marginLeft: 2 }} /> : null}
    </>
  );
  if (onPress) {
    return (
      <Pressable style={({ pressed }) => [s.row, pressed && s.rowPressed]} onPress={onPress}>{body}</Pressable>
    );
  }
  return <View style={s.row}>{body}</View>;
}

/** Icon chip + labelled value (muted label on top, bold value below) + right slot. */
export function LabeledRow({
  icon: Icon, iconColor = colors.brand, iconBg = colors.brandTint, label, value, valueNode, right, onPress, chevron,
}: {
  icon: LucideIcon; iconColor?: string; iconBg?: string; label: string;
  value?: string; valueNode?: React.ReactNode; right?: React.ReactNode; onPress?: () => void; chevron?: boolean;
}) {
  const body = (
    <>
      <View style={[s.iconChip, { backgroundColor: iconBg }]}>
        <Icon size={18} color={iconColor} strokeWidth={2.1} />
      </View>
      <View style={s.rowText}>
        <Text style={s.rowSubTop}>{label}</Text>
        {valueNode ?? <Text style={s.rowValueMain}>{value || "-"}</Text>}
      </View>
      {right}
      {chevron ? <ChevronRight size={18} color={colors.textFaint} style={{ marginLeft: 2 }} /> : null}
    </>
  );
  if (onPress) return <Pressable style={({ pressed }) => [s.row, pressed && s.rowPressed]} onPress={onPress}>{body}</Pressable>;
  return <View style={s.row}>{body}</View>;
}

/* ── Badges + tiles ───────────────────────────────────────────────────────── */

type Tone = "success" | "warning" | "info" | "muted" | "brand";
const TONE: Record<Tone, { fg: string; bg: string }> = {
  success: { fg: "#0f7a3d", bg: "#e7f7ee" },
  warning: { fg: "#b45309", bg: "#fef3e2" },
  info: { fg: "#1d4ed8", bg: "#e8effe" },
  muted: { fg: colors.textMuted, bg: colors.bgMuted },
  brand: { fg: colors.brand, bg: colors.brandTint },
};

export function Badge({ label, tone = "muted" }: { label: string; tone?: Tone }) {
  const t = TONE[tone];
  return (
    <View style={[s.badge, { backgroundColor: t.bg }]}>
      <Text style={[s.badgeText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

/** White bordered stat tile (label · big value · optional sub-line). */
export function StatTile({ label, value, sub, subNode, style }: {
  label: string; value: string; sub?: string; subNode?: React.ReactNode; style?: ViewStyle;
}) {
  return (
    <View style={[s.tile, style]}>
      <Text style={s.tileLabel}>{label}</Text>
      <Text style={s.tileValue}>{value}</Text>
      {subNode ?? (sub ? <Text style={s.tileSub}>{sub}</Text> : null)}
    </View>
  );
}

/** Small info callout with a coloured left icon (e.g. the blue "About …" cards). */
export function InfoCallout({ icon: Icon, title, body, tone = "info" }: {
  icon: LucideIcon; title: string; body: string; tone?: Tone;
}) {
  const t = TONE[tone];
  return (
    <View style={[s.callout, { backgroundColor: t.bg }]}>
      <Icon size={18} color={t.fg} strokeWidth={2.1} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={[s.calloutTitle, { color: t.fg }]}>{title}</Text>
        <Text style={s.calloutBody}>{body}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", height: 52,
    paddingHorizontal: spacing.md,
  },
  headerSide: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerRight: { alignItems: "flex-end" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },

  hero: { borderRadius: 20, padding: spacing.lg, marginHorizontal: spacing.lg, marginTop: spacing.sm },

  card: {
    backgroundColor: colors.card, borderRadius: 18, marginHorizontal: spacing.lg, marginTop: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.xs,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2,
  },
  cardTitleRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: spacing.md, paddingBottom: spacing.xs,
  },
  cardTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  cardAction: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.brand },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },

  kv: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.md, gap: spacing.md },
  kvLabel: { fontSize: font.sm, color: colors.textMuted, fontWeight: font.weightMedium },
  kvValue: { fontSize: font.sm, color: colors.text, fontWeight: font.weightBold, flexShrink: 1, textAlign: "right" },

  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  rowPressed: { opacity: 0.6 },
  iconChip: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1 },
  rowTitle: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text },
  rowSub: { marginTop: 1, fontSize: font.xs, lineHeight: 16, color: colors.textMuted },
  rowValue: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.text, maxWidth: 150, textAlign: "right" },
  rowSubTop: { fontSize: font.xs, color: colors.textMuted, fontWeight: font.weightMedium },
  rowValueMain: { marginTop: 2, fontSize: font.md, fontWeight: font.weightBold, color: colors.text },

  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  badgeText: { fontSize: font.xs, fontWeight: font.weightHeavy },

  tile: {
    flex: 1, backgroundColor: colors.card, borderRadius: 16, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 1,
  },
  tileLabel: { fontSize: font.xs, color: colors.textMuted, fontWeight: font.weightBold },
  tileValue: { marginTop: 6, fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text },
  tileSub: { marginTop: 4, fontSize: font.xs, color: colors.textFaint, fontWeight: font.weightMedium },

  callout: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", borderRadius: 14, padding: spacing.md, marginHorizontal: spacing.lg, marginTop: spacing.md },
  calloutTitle: { fontSize: font.sm, fontWeight: font.weightHeavy },
  calloutBody: { marginTop: 3, fontSize: font.xs, lineHeight: 18, color: colors.textSecondary },
});

/** Shared row-grid style used by pages that place two tiles side by side. */
export const adRowGrid: ViewStyle = { flexDirection: "row", gap: spacing.md, marginHorizontal: spacing.lg, marginTop: spacing.md };
