import { useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, LinearGradient as SvgGradient, Polygon, Stop } from "react-native-svg";
import {
  BadgeCheck, BarChart2, Check, ChevronRight, CircleDollarSign, Lightbulb, Lock, Music4,
  MessageCircle, Radio, Rocket, ScrollText, ShieldCheck, Sparkles, TriangleAlert, Trophy,
  Users, Wallet, type LucideIcon,
} from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/Skeleton";
import { CreatorRulesSheet } from "./CreatorRulesSheet";
import { BecomeCreatorSheet } from "./BecomeCreatorSheet";
import { creatorApi, type CreatorLevelPage } from "@/api/creator.api";
import { studioApi } from "@/api/studio.api";
import { useAuthStore } from "@/store/auth.store";
import { canAccess, type StudioAccessCtx } from "@/utils/studio-access";
import { colors } from "@/constants/colors";
import { font, radius, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";
import { formatCompact } from "@/utils/format";

/** The sections StudioScreen can switch to - a tool tile either jumps to one of
 *  these, opens a sheet, or is honestly labelled as not built yet. */
export type ToolTarget = "content" | "analytics" | "monetization" | "verification" | "wallet" | "comments" | "music" | "ads";

type Tool = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Which Studio section this tile switches to. */
  target?: ToolTarget;
  /** Navigates to a standalone screen (its own page) instead of a section. */
  screen?: "IdeaHub";
  /** Opens a sheet instead of switching section. */
  sheet?: "rules" | "become";
  /** Gate key from STUDIO_RULES - the tile shows a lock and its level when barred. */
  feature?: string;
  soon?: boolean;
};

const TOOLS: Tool[] = [
  { key: "level", label: "Creator Level", icon: ShieldCheck, sheet: "rules" },
  { key: "analytics", label: "Analytics", icon: BarChart2, target: "analytics" },
  { key: "audience", label: "Audience", icon: Users, target: "analytics" },
  { key: "monetization", label: "Monetization", icon: CircleDollarSign, target: "monetization" },
  { key: "wallet", label: "Wallet & Coins", icon: Wallet, target: "wallet" },
  { key: "verification", label: "Verification", icon: BadgeCheck, target: "verification" },
  // Not gated: the website leaves the comments page itself at minRole "any".
  // Only the ADVANCED comment tools sit behind `advanced_comments` (level 3).
  { key: "comments", label: "Comments", icon: MessageCircle, target: "comments" },
  { key: "promote", label: "Promote", icon: Rocket, target: "ads" },
  { key: "live", label: "Live Tools", icon: Radio, soon: true },
  { key: "music", label: "Music Library", icon: Music4, target: "music" },
  { key: "ideas", label: "Ideas Hub", icon: Lightbulb, screen: "IdeaHub" },
  { key: "rules", label: "Creator Rules", icon: ScrollText, sheet: "rules" },
];

/** Level hexagon, matching the profile CreatorLevelCard badge but sized for a
 *  hero card and rimmed in gold. */
function LevelHex({ level, size = 62 }: { level: number; size?: number }) {
  const h = size * 1.11;
  return (
    <View style={{ width: size, height: h, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={h} viewBox="0 0 54 60">
        <Defs>
          <SvgGradient id="toolsHex" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#ffffff" stopOpacity="0.35" />
            <Stop offset="1" stopColor="#ffffff" stopOpacity="0.12" />
          </SvgGradient>
        </Defs>
        <Polygon points="27,2 50,15 50,45 27,58 4,45 4,15" fill="url(#toolsHex)" stroke="#f5b50a" strokeWidth={3} />
      </Svg>
      <View style={styles.hexContent} pointerEvents="none">
        <Ionicons name="star" size={13} color={colors.white} />
        <Text style={styles.hexNum}>{level}</Text>
      </View>
    </View>
  );
}

/** Teezer Studio → Creator Tools.
 *
 *  The hub for everything the website groups under Creator Tools: your level and
 *  score, the requirements for the next level, what each level unlocks, the rule
 *  book, and - if you are not a creator yet - the ten-point application. Rules
 *  and thresholds come from the same endpoints the website reads, so the two
 *  can't drift. */
export function StudioToolsSection({ onNavigate }: { onNavigate: (target: ToolTarget) => void }) {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [becomeOpen, setBecomeOpen] = useState(false);

  const permQ = useQuery({
    queryKey: ["studio-permissions"],
    queryFn: studioApi.permissions,
    staleTime: 60_000,
  });
  const eligibilityQ = useQuery({
    queryKey: ["creator-eligibility"],
    queryFn: creatorApi.eligibility,
    staleTime: 60_000,
  });

  const isCreator = eligibilityQ.data?.is_creator ?? permQ.data?.isCreator ?? false;

  // Levels only exist for creators - the endpoint would create a progress row
  // for a non-creator, so don't call it until they are one.
  const levelQ = useQuery({
    queryKey: ["creator-level-page"],
    queryFn: creatorApi.levelPage,
    staleTime: 60_000,
    enabled: isCreator,
  });

  const level = levelQ.data;
  const ctx: StudioAccessCtx = {
    isCreator,
    creatorLevel: level?.level_number ?? permQ.data?.creatorLevel ?? -1,
    monetizationApproved: permQ.data?.monetizationApproved ?? false,
    hasActiveViolation: permQ.data?.hasActiveViolation ?? false,
    payoutInfoCompleted: permQ.data?.payoutInfoCompleted ?? false,
    applicationStatus: permQ.data?.applicationStatus ?? "none",
    isAdmin: user?.role === "admin",
  };

  const loading = permQ.isLoading || eligibilityQ.isLoading || (isCreator && levelQ.isLoading);
  const refreshing =
    (eligibilityQ.isFetching && !eligibilityQ.isLoading) || (levelQ.isFetching && !levelQ.isLoading);

  const refetchAll = () => {
    permQ.refetch();
    eligibilityQ.refetch();
    if (isCreator) levelQ.refetch();
  };

  const onTool = (t: Tool) => {
    if (t.sheet === "rules") return setRulesOpen(true);
    if (t.sheet === "become") return setBecomeOpen(true);
    if (t.screen) return navigation.navigate(t.screen);
    if (t.soon) return Alert.alert(t.label, "Coming soon.");
    if (t.feature && !canAccess(ctx, t.feature)) return;
    if (t.target) onNavigate(t.target);
  };

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetchAll} tintColor={colors.brand} />}
      >
        {loading ? (
          <>
            <Skeleton height={150} radius={20} />
            <Skeleton height={190} radius={20} />
            <Skeleton height={220} radius={20} />
          </>
        ) : (
          <>
            {isCreator && level ? (
              <LevelHero level={level} onRules={() => setRulesOpen(true)} />
            ) : (
              <BecomeHero
                done={eligibilityQ.data?.completed_count ?? 0}
                total={eligibilityQ.data?.total_count ?? 10}
                eligible={!!eligibilityQ.data?.is_eligible}
                onPress={() => setBecomeOpen(true)}
              />
            )}

            {!!level?.has_violation && (
              <View style={styles.violationCard}>
                <TriangleAlert size={17} color="#dc2626" strokeWidth={2.4} />
                <Text style={styles.violationText}>
                  An active violation is freezing your level advancement. Resolve it to start progressing again.
                </Text>
              </View>
            )}

            {isCreator && level && <ScoreCard level={level} />}
            {isCreator && level && <NextLevelCard level={level} />}

            <ToolsGrid
              tools={
                isCreator
                  ? TOOLS
                  : [
                      { key: "become", label: "Become a Creator", icon: Sparkles, sheet: "become" } as Tool,
                      // Monetization is meaningless before you're a creator - the
                      // level gate would only ever render it locked.
                      ...TOOLS.filter((t) => t.key !== "monetization"),
                    ]
              }
              ctx={ctx}
              onTool={onTool}
            />

            {isCreator && level && <PerksCard level={level} />}

            <RulesRow onRules={() => setRulesOpen(true)} />

            {/* Community feedback board - lives at the bottom of Creator Tools. */}
            <IdeaHubRow onPress={() => navigation.navigate("IdeaHub")} />
          </>
        )}
      </ScrollView>

      <CreatorRulesSheet visible={rulesOpen} onClose={() => setRulesOpen(false)} level={level} />
      <BecomeCreatorSheet
        visible={becomeOpen}
        onClose={() => setBecomeOpen(false)}
        data={eligibilityQ.data}
        onApplied={() => {
          setBecomeOpen(false);
          refetchAll();
        }}
      />
    </>
  );
}

/* ── Hero: already a creator ──────────────────────────────────────────────── */
function LevelHero({ level, onRules }: { level: CreatorLevelPage; onRules: () => void }) {
  const score1000 = Math.round((level.creator_score / (level.creator_score_max || 5)) * 1000);
  const xpPct =
    level.xp.required > 0 ? Math.min(100, Math.round((level.xp.current / level.xp.required) * 100)) : 100;

  return (
    <LinearGradient
      colors={["#c91f78", "#7c3aed", "#1d4ed8"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      <View style={styles.heroTop}>
        <LevelHex level={level.level_number} />
        <View style={{ flex: 1 }}>
          <Text style={styles.heroEyebrow}>Level {level.level_number}</Text>
          <Text style={styles.heroTitle}>{level.level_name}</Text>
          <Pressable onPress={onRules} style={styles.heroLink} hitSlop={6}>
            <Text style={styles.heroLinkText}>Creator rules</Text>
            <ChevronRight size={12} color="rgba(255,255,255,0.9)" strokeWidth={2.6} />
          </Pressable>
        </View>
        <View style={styles.scorePill}>
          <Trophy size={13} color="#f5b50a" strokeWidth={2.6} />
          <Text style={styles.scorePillValue}>{score1000}</Text>
          <Text style={styles.scorePillMax}>/1000</Text>
        </View>
      </View>

      <View style={styles.heroXp}>
        <View style={styles.heroXpHead}>
          <Text style={styles.heroXpLabel}>
            {level.next_level ? `Next: ${level.next_level.name}` : "Top level reached"}
          </Text>
          <Text style={styles.heroXpValue}>
            {level.xp.current.toLocaleString()} / {level.xp.required.toLocaleString()} XP
          </Text>
        </View>
        <View style={styles.heroTrack}>
          <View style={[styles.heroFill, { width: `${xpPct}%` }]} />
        </View>
      </View>
    </LinearGradient>
  );
}

/* ── Hero: not a creator yet ──────────────────────────────────────────────── */
function BecomeHero({
  done,
  total,
  eligible,
  onPress,
}: {
  done: number;
  total: number;
  eligible: boolean;
  onPress: () => void;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <LinearGradient
      colors={[colors.brand, "#f97316"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      <View style={styles.heroTop}>
        <View style={styles.heroIcon}>
          <Sparkles size={24} color={colors.white} strokeWidth={2.4} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroEyebrow}>{eligible ? "You're ready" : "Not a creator yet"}</Text>
          <Text style={styles.heroTitle}>Become a Creator</Text>
          <Text style={styles.heroSub}>{done} of {total} requirements met</Text>
        </View>
      </View>

      <View style={styles.heroXp}>
        <View style={styles.heroTrack}>
          <View style={[styles.heroFill, { width: `${pct}%` }]} />
        </View>
      </View>

      <Pressable style={styles.heroBtn} onPress={onPress}>
        <Text style={styles.heroBtnText}>{eligible ? "Apply now" : "View requirements"}</Text>
        <ChevronRight size={15} color={colors.brand} strokeWidth={2.8} />
      </Pressable>
    </LinearGradient>
  );
}

/* ── Creator Score breakdown ──────────────────────────────────────────────── */
function ScoreCard({ level }: { level: CreatorLevelPage }) {
  const max = level.creator_score_max || 5;
  const score1000 = Math.round((level.creator_score / max) * 1000);

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Trophy size={16} color={colors.brand} strokeWidth={2.4} />
        <Text style={styles.cardTitle}>Creator Score</Text>
        <Text style={styles.cardHeadRight}>{score1000} / 1000</Text>
      </View>

      <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
        {level.score_breakdown.map((s) => {
          const pct = Math.min(100, Math.round((s.value / max) * 100));
          return (
            <View key={s.label}>
              <View style={styles.scoreRowHead}>
                <Text style={styles.scoreLabel}>{s.label}</Text>
                <Text style={styles.scoreWeight}>{s.pct}%</Text>
                <Text style={styles.scoreValue}>{s.value.toFixed(1)}</Text>
              </View>
              <View style={styles.miniTrack}>
                <View style={[styles.miniFill, { width: `${pct}%` }]} />
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.statsRow}>
        <Stat label="Videos" value={formatCompact(level.stats.public_videos)} />
        <Stat label="Views" value={formatCompact(level.stats.total_views)} />
        <Stat label="Followers" value={formatCompact(level.stats.followers)} />
        <Stat label="Watch mins" value={formatCompact(level.stats.watch_minutes)} />
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/* ── Requirements for the next level ──────────────────────────────────────── */
function NextLevelCard({ level }: { level: CreatorLevelPage }) {
  if (!level.next_level || level.requirements.length === 0) {
    return (
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Trophy size={16} color="#f5b50a" strokeWidth={2.4} />
          <Text style={styles.cardTitle}>Top level</Text>
        </View>
        <Text style={styles.para}>
          You are at the highest level. Partner status is granted by manual review.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Sparkles size={16} color="#7c3aed" strokeWidth={2.4} />
        <Text style={styles.cardTitle}>Level {level.next_level.number} · {level.next_level.name}</Text>
        <Text style={styles.cardHeadRight}>
          {level.completed_count}/{level.total_requirements}
        </Text>
      </View>

      <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
        {level.requirements.map((r) => {
          const pct =
            r.type === "bool"
              ? r.passed
                ? 100
                : 0
              : r.required > 0
                ? Math.min(100, Math.round((r.current / r.required) * 100))
                : 100;
          return (
            <View key={r.key}>
              <View style={styles.reqHead}>
                <View style={[styles.reqDot, r.passed && styles.reqDotOk]}>
                  {r.passed && <Check size={10} color={colors.white} strokeWidth={3.4} />}
                </View>
                <Text style={[styles.reqLabel, r.passed && styles.reqLabelOk]} numberOfLines={1}>
                  {r.label}
                </Text>
                <Text style={[styles.reqValue, r.passed && { color: "#16a34a" }]}>{r.display}</Text>
              </View>
              <View style={styles.miniTrack}>
                <View
                  style={[styles.miniFill, { width: `${pct}%` }, r.passed && { backgroundColor: "#16a34a" }]}
                />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/* ── Tool tiles ───────────────────────────────────────────────────────────── */
function ToolsGrid({
  tools,
  ctx,
  onTool,
}: {
  tools: Tool[];
  ctx: StudioAccessCtx;
  onTool: (t: Tool) => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={[styles.cardTitle, { marginBottom: spacing.md }]}>Creator Tools</Text>
      <View style={styles.grid}>
        {tools.map((t) => {
          const locked = !!t.feature && !canAccess(ctx, t.feature);
          const Icon = t.icon;
          return (
            <Pressable
              key={t.key}
              style={({ pressed }) => [styles.tile, pressed && { opacity: 0.65 }]}
              onPress={() => onTool(t)}
            >
              {locked && (
                <View style={styles.tileLock}>
                  <Lock size={9} color={colors.white} strokeWidth={3} />
                </View>
              )}
              {t.soon && !locked && <View style={styles.tileSoonDot} />}
              <Icon
                size={22}
                color={locked ? colors.textFaint : colors.brand}
                strokeWidth={2.2}
              />
              <Text style={[styles.tileLabel, locked && { color: colors.textFaint }]} numberOfLines={2}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.gridNote}>
        Locked tools unlock as you level up. A dot means we're still building it.
      </Text>
    </View>
  );
}

/* ── Perks ────────────────────────────────────────────────────────────────── */
function PerksCard({ level }: { level: CreatorLevelPage }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Check size={16} color="#16a34a" strokeWidth={3} />
        <Text style={styles.cardTitle}>What you have</Text>
      </View>
      <View style={styles.perkWrap}>
        {level.current_level_perks.map((p) => (
          <View key={p} style={styles.perkChip}>
            <Check size={11} color="#16a34a" strokeWidth={3.2} />
            <Text style={styles.perkChipText}>{p}</Text>
          </View>
        ))}
      </View>

      {level.next_level_perks.length > 0 && (
        <>
          <View style={styles.divider} />
          <View style={styles.cardHead}>
            <Lock size={14} color={colors.textFaint} strokeWidth={2.6} />
            <Text style={[styles.cardTitle, { color: colors.textMuted }]}>
              Unlocks at Level {level.next_level?.number}
            </Text>
          </View>
          <View style={styles.perkWrap}>
            {level.next_level_perks.map((p) => (
              <View key={p} style={[styles.perkChip, styles.perkChipLocked]}>
                <Lock size={10} color={colors.textFaint} strokeWidth={2.8} />
                <Text style={[styles.perkChipText, { color: colors.textMuted }]}>{p}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

/* ── Idea Hub entry ───────────────────────────────────────────────────────── */
function IdeaHubRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => pressed && { opacity: 0.9 }} onPress={onPress}>
      <LinearGradient
        colors={["#ff4d6d", "#ff7a4d"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.ideaHubCard}
      >
        <View style={styles.ideaHubIcon}>
          <Lightbulb size={20} color={colors.white} strokeWidth={2.4} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.ideaHubTitleRow}>
            <Text style={styles.ideaHubTitle}>Idea Hub</Text>
            <View style={styles.newPill}>
              <Text style={styles.newPillText}>NEW</Text>
            </View>
          </View>
          <Text style={styles.ideaHubSub}>Share ideas, upvote features and help shape Teezer</Text>
        </View>
        <ChevronRight size={20} color={colors.white} strokeWidth={2.6} />
      </LinearGradient>
    </Pressable>
  );
}

/* ── Rule book row ────────────────────────────────────────────────────────── */
function RulesRow({ onRules }: { onRules: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.card, styles.rulesRow, pressed && { opacity: 0.7 }]} onPress={onRules}>
      <View style={styles.rulesIcon}>
        <ScrollText size={18} color={colors.brand} strokeWidth={2.4} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rulesTitle}>Creator Rules</Text>
        <Text style={styles.rulesSub}>Levels, scoring, earnings split and the violation policy</Text>
      </View>
      <ChevronRight size={18} color={colors.textFaint} strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, paddingBottom: TAB_BAR_HEIGHT + spacing.xxl, gap: spacing.lg },

  /* Hero */
  hero: {
    borderRadius: 20,
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  heroIcon: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  hexContent: { position: "absolute", alignItems: "center", justifyContent: "center" },
  hexNum: { color: colors.white, fontSize: 16, fontWeight: font.weightHeavy, marginTop: -2 },
  heroEyebrow: {
    fontSize: 10.5, fontWeight: font.weightHeavy, color: "rgba(255,255,255,0.75)",
    textTransform: "uppercase", letterSpacing: 0.8,
  },
  heroTitle: { marginTop: 2, fontSize: 20, fontWeight: font.weightHeavy, color: colors.white },
  heroSub: { marginTop: 2, fontSize: 12, color: "rgba(255,255,255,0.85)", fontWeight: font.weightMedium },
  heroLink: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 4 },
  heroLinkText: { fontSize: 11.5, color: "rgba(255,255,255,0.9)", fontWeight: font.weightBold },

  scorePill: {
    flexDirection: "row", alignItems: "baseline", gap: 3, alignSelf: "flex-start",
    backgroundColor: "rgba(0,0,0,0.22)", borderRadius: radius.pill,
    paddingHorizontal: 9, paddingVertical: 5,
  },
  scorePillValue: { fontSize: 14, fontWeight: font.weightHeavy, color: colors.white },
  scorePillMax: { fontSize: 9.5, color: "rgba(255,255,255,0.7)", fontWeight: font.weightMedium },

  heroXp: { gap: 6 },
  heroXpHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroXpLabel: { fontSize: 11.5, color: "rgba(255,255,255,0.85)", fontWeight: font.weightBold },
  heroXpValue: { fontSize: 11, color: "rgba(255,255,255,0.75)", fontWeight: font.weightMedium },
  heroTrack: { height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.25)", overflow: "hidden" },
  heroFill: { height: "100%", borderRadius: 4, backgroundColor: colors.white },

  heroBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
    height: 42, borderRadius: radius.lg, backgroundColor: colors.white,
  },
  heroBtnText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.brand },

  /* Violation banner */
  violationCard: {
    flexDirection: "row", alignItems: "flex-start", gap: spacing.sm,
    backgroundColor: "#fef2f2", borderColor: "#fecaca", borderWidth: 1,
    borderRadius: radius.lg, padding: spacing.md,
  },
  violationText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: "#991b1b", fontWeight: font.weightMedium },

  /* Cards */
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: spacing.lg,
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: spacing.sm },
  cardTitle: { flex: 1, fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  cardHeadRight: { fontSize: 12, fontWeight: font.weightBold, color: colors.textMuted },
  para: { fontSize: 13, lineHeight: 19, color: colors.textMuted },

  /* Score */
  scoreRowHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 5 },
  scoreLabel: { flex: 1, fontSize: 12.5, color: colors.textSecondary, fontWeight: font.weightMedium },
  scoreWeight: { fontSize: 10.5, color: colors.textFaint, fontWeight: font.weightBold },
  scoreValue: { fontSize: 12, color: colors.text, fontWeight: font.weightBold, minWidth: 26, textAlign: "right" },
  miniTrack: { height: 6, borderRadius: 3, backgroundColor: "#f0f1f5", overflow: "hidden" },
  miniFill: { height: "100%", borderRadius: 3, backgroundColor: colors.brand },

  statsRow: {
    flexDirection: "row", marginTop: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  stat: { flex: 1, alignItems: "center" },
  statValue: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  statLabel: { marginTop: 1, fontSize: 10.5, color: colors.textFaint, fontWeight: font.weightMedium },

  /* Requirements */
  reqHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 5 },
  reqDot: {
    width: 15, height: 15, borderRadius: 8, backgroundColor: "#f0f1f5",
    alignItems: "center", justifyContent: "center",
  },
  reqDotOk: { backgroundColor: "#16a34a" },
  reqLabel: { flex: 1, fontSize: 12.5, color: colors.textMuted, fontWeight: font.weightMedium },
  reqLabelOk: { color: colors.textSecondary },
  reqValue: { fontSize: 11.5, fontWeight: font.weightBold, color: colors.textFaint },

  /* Tiles */
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tile: {
    width: "31.5%", flexGrow: 1, alignItems: "center", justifyContent: "center", gap: 7,
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
    paddingVertical: spacing.md, paddingHorizontal: 4,
  },
  tileLock: {
    position: "absolute", top: 6, right: 6,
    width: 16, height: 16, borderRadius: 8, backgroundColor: colors.textFaint,
    alignItems: "center", justifyContent: "center",
  },
  tileSoonDot: {
    position: "absolute", top: 8, right: 8,
    width: 6, height: 6, borderRadius: 3, backgroundColor: colors.warning,
  },
  tileLabel: {
    fontSize: 10.5, lineHeight: 14, fontWeight: font.weightMedium,
    color: colors.textSecondary, textAlign: "center",
  },
  gridNote: { marginTop: spacing.md, fontSize: 10.5, color: colors.textFaint, textAlign: "center" },

  /* Perks */
  perkWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  perkChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#f0fdf4", borderWidth: 1, borderColor: "#bbf7d0",
    borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 5,
  },
  perkChipLocked: { backgroundColor: colors.bgMuted, borderColor: colors.borderStrong },
  perkChipText: { fontSize: 11.5, color: colors.textSecondary, fontWeight: font.weightMedium },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },

  /* Idea Hub entry banner */
  ideaHubCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    borderRadius: 20, padding: spacing.lg,
    shadowColor: colors.brand, shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4,
  },
  ideaHubIcon: {
    width: 44, height: 44, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center", justifyContent: "center",
  },
  ideaHubTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  ideaHubTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.white },
  newPill: { backgroundColor: "rgba(255,255,255,0.25)", borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  newPillText: { fontSize: 9, fontWeight: font.weightBold, color: colors.white, letterSpacing: 0.5 },
  ideaHubSub: { marginTop: 2, fontSize: 11.5, color: "rgba(255,255,255,0.9)", fontWeight: font.weightMedium, lineHeight: 16 },

  /* Rules row */
  rulesRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rulesIcon: {
    width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.brandTint,
    alignItems: "center", justifyContent: "center",
  },
  rulesTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  rulesSub: { marginTop: 2, fontSize: 11.5, color: colors.textMuted, lineHeight: 16 },
});
