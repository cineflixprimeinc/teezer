import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Check, Lock, Sparkles, TriangleAlert, Trophy, ListChecks } from "lucide-react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { DonutChart } from "./charts/DonutChart";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";
import {
  BENEFIT_BANDS,
  CREATOR_LEVELS,
  CREATOR_THRESHOLDS,
  FEATURE_UNLOCKS,
  GENERAL_RULES,
  SCORE_WEIGHTS,
  UPLOAD_LIMITS,
  VIOLATION_POLICY,
  XP_RATES,
} from "@/constants/creator-rules";
import type { CreatorLevelPage } from "@/api/creator.api";
import { useMoneyRules } from "@/hooks/useMoneyRules";
import { coins, pct, usd } from "@/utils/money";

/**
 * Render a money rule, or a dash while it is still loading.
 *
 * These figures used to be constants in the app bundle - 30% / 70%, 100 coins,
 * a $50 payout floor and a $10 coin-wallet floor. They are admin settings, and
 * this sheet is the page a creator reads to find out what Teezer charges them,
 * so a stale copy here is worse than a moment of nothing.
 */
function ruleValue(v: number | null, render: (v: number) => string): string {
  return v === null ? "--" : render(v);
}

type Tab = "overview" | "eligibility" | "levels" | "benefits" | "violations";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "eligibility", label: "Eligibility" },
  { key: "levels", label: "Level Rules" },
  { key: "benefits", label: "Benefits" },
  { key: "violations", label: "Violations" },
];

/** The website's Creator Rules modal, as a sheet. Same five tabs, same copy,
 *  and - where the user has a level - the same "you are here" markers.
 *  Defaults to Level Rules, which is the tab the website opens on. */
export function CreatorRulesSheet({
  visible,
  onClose,
  level,
}: {
  visible: boolean;
  onClose: () => void;
  level?: CreatorLevelPage | null;
}) {
  const [tab, setTab] = useState<Tab>("levels");

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      height={0.9}
      scrollable={false}
      dragArea="header"
      header={
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Creator Rules</Text>
              <Text style={styles.headerSub}>How levels, scoring and payouts actually work</Text>
            </View>
            <Pressable hitSlop={10} onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={19} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
            {TABS.map((t) => {
              const active = t.key === tab;
              return (
                <Pressable key={t.key} onPress={() => setTab(t.key)} style={styles.tab}>
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
                  <View style={[styles.tabRule, active && styles.tabRuleActive]} />
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      }
    >
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {tab === "overview" && <OverviewTab level={level} />}
        {tab === "eligibility" && <EligibilityTab />}
        {tab === "levels" && <LevelsTab level={level} />}
        {tab === "benefits" && <BenefitsTab />}
        {tab === "violations" && <ViolationsTab />}
      </ScrollView>
    </BottomSheet>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */
function OverviewTab({ level }: { level?: CreatorLevelPage | null }) {
  // The score is stored 0–5 but always presented out of 1,000, matching the web.
  const score1000 = level ? Math.round((level.creator_score / (level.creator_score_max || 5)) * 1000) : null;
  const slices = SCORE_WEIGHTS.map((w) => ({ value: w.pct, color: w.color }));

  return (
    <>
      <Section icon={Sparkles} title="How progression works">
        <Text style={styles.para}>
          Creator levels run from 0 to 10. Every level lists its own requirements, and you advance the moment
          you meet all of them - there is no application and no waiting period, except at Level 10, which is
          granted by manual review.
        </Text>
      </Section>

      <Section icon={Trophy} title="Creator Score">
        <View style={styles.scoreRow}>
          <View style={styles.donutWrap}>
            <DonutChart slices={slices} />
            <View style={styles.donutCenter} pointerEvents="none">
              <Text style={styles.donutValue}>{score1000 ?? "-"}</Text>
              <Text style={styles.donutMax}>/ 1000</Text>
            </View>
          </View>
          <View style={{ flex: 1, gap: spacing.sm }}>
            {SCORE_WEIGHTS.map((w) => (
              <View key={w.label} style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: w.color }]} />
                <Text style={styles.legendLabel} numberOfLines={1}>{w.label}</Text>
                <Text style={styles.legendPct}>{w.pct}%</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          {SCORE_WEIGHTS.map((w) => (
            <View key={w.label} style={styles.howRow}>
              <View style={[styles.howBar, { backgroundColor: w.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.howTitle}>{w.label}</Text>
                <Text style={styles.howText}>{w.how}</Text>
              </View>
            </View>
          ))}
        </View>
      </Section>

      <Section icon={Sparkles} title="Earning XP">
        <View style={styles.pillGrid}>
          {XP_RATES.map((x) => (
            <View key={x.label} style={styles.xpPill}>
              <Text style={styles.xpPillRate}>{x.rate}</Text>
              <Text style={styles.xpPillLabel}>{x.label}</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section icon={ListChecks} title="General rules">
        {GENERAL_RULES.map((r) => (
          <View key={r} style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>{r}</Text>
          </View>
        ))}
      </Section>
    </>
  );
}

/* ── Eligibility ──────────────────────────────────────────────────────────── */
function EligibilityTab() {
  const t = CREATOR_THRESHOLDS;
  const items = [
    "Email or phone verified",
    "Profile photo added",
    "Bio and category completed",
    `Account age: at least ${t.minAgeDays} days`,
    `At least ${t.minVideos} public videos uploaded`,
    `Minimum ${t.minViews.toLocaleString()} total views`,
    `Minimum ${t.minFollowers.toLocaleString()} followers`,
    "Latest uploads passed content check",
    "No active policy violations",
    "Creator Terms accepted",
  ];

  return (
    <>
      <Section icon={ListChecks} title="Becoming a Creator">
        <Text style={styles.para}>
          All ten requirements must pass. When they do, approval is automatic - there is no review queue.
        </Text>
        <View style={{ marginTop: spacing.md, gap: 2 }}>
          {items.map((label, i) => (
            <View key={label} style={styles.checkRow}>
              <View style={styles.checkNum}>
                <Text style={styles.checkNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.checkLabel}>{label}</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section icon={Sparkles} title="What changes when you're approved">
        <View style={styles.compareRow}>
          <View style={styles.compareCol}>
            <Text style={styles.compareHead}>Everyone</Text>
            <Text style={styles.compareBig}>{UPLOAD_LIMITS.user.size}</Text>
            <Text style={styles.compareSub}>up to {UPLOAD_LIMITS.user.duration}</Text>
          </View>
          <Ionicons name="arrow-forward" size={16} color={colors.textFaint} />
          <View style={[styles.compareCol, styles.compareColActive]}>
            <Text style={[styles.compareHead, { color: colors.brand }]}>Creator</Text>
            <Text style={[styles.compareBig, { color: colors.brand }]}>{UPLOAD_LIMITS.creator.size}</Text>
            <Text style={styles.compareSub}>up to {UPLOAD_LIMITS.creator.duration}</Text>
          </View>
        </View>
        <Text style={[styles.para, { marginTop: spacing.md }]}>
          You also get the creator badge, the content manager, basic analytics and your level progress.
        </Text>
      </Section>
    </>
  );
}

/* ── Level Rules - the website's "Creator Levels Progression" ─────────────── */
function LevelsTab({ level }: { level?: CreatorLevelPage | null }) {
  // Expanded by default on the level you're working toward, since that's the one
  // you opened this tab to read.
  const [open, setOpen] = useState<number | null>(level?.next_level?.number ?? null);

  // -1 when the API hasn't answered (not a creator): every level then reads as
  // locked, which is the truth - the table is still fully readable.
  const at = level?.level_number ?? -1;

  return (
    <>
      <Section icon={Trophy} title="Creator Levels Progression">
        <Text style={[styles.para, { marginBottom: spacing.md }]}>
          Eleven levels, 0 to 10. Tap one to see everything it asks for and everything it gives back.
          You advance the moment you meet every requirement - Level 10 alone is by manual review.
        </Text>

        <View style={{ gap: 6 }}>
          {CREATOR_LEVELS.map((d) => {
            const current = at === d.n;
            const unlocked = at > d.n;
            const next = level?.next_level?.number === d.n;
            const expanded = open === d.n;

            return (
              <View key={d.n} style={[styles.levelCard, current && styles.levelRowCurrent]}>
                <Pressable
                  style={styles.levelRow}
                  onPress={() => setOpen(expanded ? null : d.n)}
                >
                  <View
                    style={[
                      styles.levelNum,
                      current && { backgroundColor: colors.brand },
                      unlocked && { backgroundColor: "#dcfce7" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.levelNumText,
                        current && { color: colors.white },
                        unlocked && { color: "#16a34a" },
                      ]}
                    >
                      {d.n}
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={[styles.levelName, current && { color: colors.brand }]}>{d.name}</Text>
                    <Text style={styles.levelReq} numberOfLines={1}>{d.shortReq}</Text>
                  </View>

                  {current ? (
                    <Chip text="Current" bg={colors.brandTint} fg={colors.brand} />
                  ) : next ? (
                    <Chip text="Next" bg="#f5f3ff" fg="#7c3aed" />
                  ) : unlocked ? (
                    <Check size={16} color="#16a34a" strokeWidth={3} />
                  ) : (
                    <Lock size={13} color={colors.textFaint} strokeWidth={2.4} />
                  )}

                  <Ionicons
                    name={expanded ? "chevron-up" : "chevron-down"}
                    size={14}
                    color={colors.textFaint}
                  />
                </Pressable>

                {expanded && (
                  <View style={styles.levelBody}>
                    {d.xp > 0 && (
                      <View style={styles.xpRow}>
                        <Sparkles size={12} color="#7c3aed" strokeWidth={2.6} />
                        <Text style={styles.xpText}>{d.xp.toLocaleString()} XP</Text>
                      </View>
                    )}

                    <Text style={styles.levelSubhead}>Requirements</Text>
                    {d.reqs.map((r) => (
                      <View key={r} style={styles.levelItem}>
                        <View style={[styles.levelDot, unlocked && { backgroundColor: "#16a34a" }]} />
                        <Text style={styles.levelItemText}>{r}</Text>
                      </View>
                    ))}

                    <Text style={[styles.levelSubhead, { marginTop: spacing.sm }]}>Unlocks</Text>
                    <View style={styles.perkWrap}>
                      {d.perks.map((p) => (
                        <View key={p} style={styles.perkPill}>
                          <Text style={styles.perkPillText}>{p}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </Section>

      <Section icon={Lock} title="What unlocks at each level">
        <View style={{ gap: 2 }}>
          {FEATURE_UNLOCKS.map((f) => {
            const have = (level?.level_number ?? -1) >= f.level;
            return (
              <View key={f.feature} style={styles.unlockRow}>
                <View style={[styles.unlockLevel, have && { backgroundColor: "#dcfce7" }]}>
                  <Text style={[styles.unlockLevelText, have && { color: "#16a34a" }]}>L{f.level}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.unlockLabel}>{f.label}</Text>
                  {!!f.note && <Text style={styles.unlockNote}>{f.note}</Text>}
                </View>
                {have ? (
                  <Check size={15} color="#16a34a" strokeWidth={3} />
                ) : (
                  <Lock size={13} color={colors.textFaint} strokeWidth={2.4} />
                )}
              </View>
            );
          })}
        </View>
      </Section>
    </>
  );
}

/* ── Benefits ─────────────────────────────────────────────────────────────── */
function BenefitsTab() {
  const rules = useMoneyRules();
  return (
    <>
      {BENEFIT_BANDS.map((b) => (
        <View key={b.range} style={[styles.card, { borderLeftWidth: 3, borderLeftColor: b.color }]}>
          <Text style={[styles.bandRange, { color: b.color }]}>{b.range}</Text>
          <Text style={styles.bandTitle}>{b.title}</Text>
          <View style={{ marginTop: spacing.sm, gap: 6 }}>
            {b.items.map((i) => (
              <View key={i} style={styles.perkRow}>
                <Check size={14} color={b.color} strokeWidth={3} />
                <Text style={styles.perkText}>{i}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}

      <Section icon={Trophy} title="How earnings are split">
        <View style={styles.splitRow}>
          <View style={[styles.splitBox, { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" }]}>
            <Text style={[styles.splitPct, { color: "#16a34a" }]}>{ruleValue(rules.creatorSharePct, (v) => `${pct(v)}%`)}</Text>
            <Text style={styles.splitLabel}>You keep</Text>
          </View>
          <View style={[styles.splitBox, { backgroundColor: colors.bgMuted, borderColor: colors.borderStrong }]}>
            <Text style={[styles.splitPct, { color: colors.textSecondary }]}>{ruleValue(rules.commissionPct, (v) => `${pct(v)}%`)}</Text>
            <Text style={styles.splitLabel}>Platform fee</Text>
          </View>
        </View>
        <View style={{ marginTop: spacing.md, gap: 6 }}>
          <FactRow label="Coin conversion" value={ruleValue(rules.coinsPerUsd, (v) => `${coins(v)} coins = $1`)} />
          <FactRow label="Minimum payout" value={ruleValue(rules.minWithdrawUsd, (v) => usd(v))} />
        </View>
      </Section>
    </>
  );
}

/* ── Violations ───────────────────────────────────────────────────────────── */
function ViolationsTab() {
  return (
    <>
      <View style={[styles.card, { backgroundColor: "#fffbeb", borderColor: "#fde68a" }]}>
        <View style={styles.warnHead}>
          <TriangleAlert size={17} color="#d97706" strokeWidth={2.4} />
          <Text style={styles.warnTitle}>Three strikes</Text>
        </View>
        <Text style={[styles.para, { color: "#92400e" }]}>
          Violations stack. While one is active your level advancement is frozen, no matter how well the rest
          of your stats are tracking.
        </Text>
      </View>

      {VIOLATION_POLICY.map((v) => (
        <View key={v.strike} style={styles.card}>
          <View style={styles.strikeHead}>
            <View style={[styles.strikeBadge, { backgroundColor: v.color }]}>
              <Text style={styles.strikeBadgeText}>{v.strike}</Text>
            </View>
            <Text style={[styles.strikeTitle, { color: v.color }]}>{v.title}</Text>
          </View>
          <Text style={styles.para}>{v.detail}</Text>
        </View>
      ))}
    </>
  );
}

/* ── Small shared pieces ──────────────────────────────────────────────────── */
function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: any;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.sectionHead}>
        <Icon size={16} color={colors.brand} strokeWidth={2.4} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Chip({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.chipText, { color: fg }]}>{text}</Text>
    </View>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.factRow}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: spacing.sm },
  headerTop: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  headerTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  headerSub: { marginTop: 2, fontSize: font.xs, color: colors.textMuted, fontWeight: font.weightMedium },
  closeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },

  tabRow: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  tab: { alignItems: "center" },
  tabText: { fontSize: 13, fontWeight: font.weightMedium, color: colors.textMuted, paddingBottom: spacing.sm },
  tabTextActive: { color: colors.brand, fontWeight: font.weightBold },
  tabRule: { height: 2, alignSelf: "stretch", borderRadius: 1, backgroundColor: "transparent" },
  tabRuleActive: { backgroundColor: colors.brand },

  body: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },

  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: spacing.sm },
  sectionTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },

  para: { fontSize: 13, lineHeight: 20, color: colors.textMuted, fontWeight: font.weightRegular },

  /* Score donut */
  scoreRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  donutWrap: { width: 116, height: 116, alignItems: "center", justifyContent: "center" },
  donutCenter: { position: "absolute", alignItems: "center" },
  donutValue: { fontSize: 20, fontWeight: font.weightHeavy, color: colors.text },
  donutMax: { fontSize: 10, color: colors.textFaint, fontWeight: font.weightMedium },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { flex: 1, fontSize: 12, color: colors.textSecondary, fontWeight: font.weightMedium },
  legendPct: { fontSize: 12, color: colors.text, fontWeight: font.weightBold },

  howRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  howBar: { width: 3, alignSelf: "stretch", borderRadius: 2 },
  howTitle: { fontSize: 12.5, fontWeight: font.weightBold, color: colors.text },
  howText: { marginTop: 1, fontSize: 11.5, lineHeight: 16, color: colors.textMuted },

  /* XP */
  pillGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  xpPill: {
    flexGrow: 1, minWidth: "46%", borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.bgMuted,
  },
  xpPillRate: { fontSize: 13, fontWeight: font.weightHeavy, color: colors.brand },
  xpPillLabel: { marginTop: 1, fontSize: 11, color: colors.textMuted, fontWeight: font.weightMedium },

  bulletRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", paddingVertical: 4 },
  bulletDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.brand, marginTop: 7 },
  bulletText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.textMuted },

  /* Eligibility */
  checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 7 },
  checkNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },
  checkNumText: { fontSize: 11, fontWeight: font.weightBold, color: colors.textMuted },
  checkLabel: { flex: 1, fontSize: 13, color: colors.textSecondary, fontWeight: font.weightMedium },

  compareRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  compareCol: {
    flex: 1, alignItems: "center", paddingVertical: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.bgMuted,
  },
  compareColActive: { borderColor: "#fecdd3", backgroundColor: colors.brandTint },
  compareHead: { fontSize: 10.5, fontWeight: font.weightHeavy, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.6 },
  compareBig: { marginTop: 4, fontSize: 19, fontWeight: font.weightHeavy, color: colors.text },
  compareSub: { fontSize: 11, color: colors.textMuted, fontWeight: font.weightMedium },

  /* Levels */
  levelCard: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  levelRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
  },
  levelRowCurrent: { borderColor: "#fecdd3", backgroundColor: colors.brandTint },
  levelBody: {
    paddingHorizontal: spacing.md, paddingBottom: spacing.md, paddingTop: 2,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  xpRow: {
    flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start",
    backgroundColor: "#f5f3ff", borderRadius: radius.pill,
    paddingHorizontal: 8, paddingVertical: 3, marginTop: spacing.sm,
  },
  xpText: { fontSize: 11, fontWeight: font.weightHeavy, color: "#7c3aed" },
  levelSubhead: {
    marginTop: spacing.sm, marginBottom: 4,
    fontSize: 10, fontWeight: font.weightHeavy, color: colors.textFaint,
    textTransform: "uppercase", letterSpacing: 0.6,
  },
  levelItem: { flexDirection: "row", alignItems: "flex-start", gap: 7, paddingVertical: 2.5 },
  levelDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.textFaint, marginTop: 6 },
  levelItemText: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  perkWrap: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  perkPill: {
    backgroundColor: colors.bgMuted, borderWidth: 1, borderColor: colors.borderStrong,
    borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3,
  },
  perkPillText: { fontSize: 10.5, color: colors.textMuted, fontWeight: font.weightMedium },
  levelNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },
  levelNumText: { fontSize: 12, fontWeight: font.weightHeavy, color: colors.textMuted },
  levelName: { fontSize: 13, fontWeight: font.weightBold, color: colors.text },
  levelReq: { marginTop: 1, fontSize: 11, color: colors.textMuted },

  chip: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 10, fontWeight: font.weightHeavy, textTransform: "uppercase", letterSpacing: 0.4 },

  unlockRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 8 },
  unlockLevel: { width: 30, height: 22, borderRadius: 6, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },
  unlockLevelText: { fontSize: 10.5, fontWeight: font.weightHeavy, color: colors.textMuted },
  unlockLabel: { fontSize: 12.5, fontWeight: font.weightMedium, color: colors.textSecondary },
  unlockNote: { marginTop: 1, fontSize: 10.5, color: colors.textFaint },

  /* Benefits */
  bandRange: { fontSize: 10.5, fontWeight: font.weightHeavy, textTransform: "uppercase", letterSpacing: 0.6 },
  bandTitle: { marginTop: 2, fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  perkRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  perkText: { flex: 1, fontSize: 12.5, color: colors.textSecondary, fontWeight: font.weightMedium },

  splitRow: { flexDirection: "row", gap: spacing.sm },
  splitBox: { flex: 1, alignItems: "center", paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  splitPct: { fontSize: 22, fontWeight: font.weightHeavy },
  splitLabel: { marginTop: 2, fontSize: 11, color: colors.textMuted, fontWeight: font.weightMedium },

  factRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  factLabel: { fontSize: 12.5, color: colors.textMuted, fontWeight: font.weightMedium },
  factValue: { fontSize: 12.5, color: colors.text, fontWeight: font.weightBold },

  /* Violations */
  warnHead: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 6 },
  warnTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: "#92400e" },
  strikeHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: 6 },
  strikeBadge: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  strikeBadgeText: { color: colors.white, fontSize: 12, fontWeight: font.weightHeavy },
  strikeTitle: { fontSize: font.md, fontWeight: font.weightHeavy },
});
