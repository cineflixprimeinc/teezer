import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ChevronLeft } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useShallow } from "zustand/react/shallow";
import { Screen } from "@/components/Screen";
import { BottomSheet } from "@/components/BottomSheet";
import { OptionSheet, type SettingsOption } from "@/components/settings/SettingsKit";
import { ProgressRing } from "@/components/screen-time/ProgressRing";
import { useScreenTimeStore, localDate } from "@/store/screen-time.store";
import type { ScreenTimeLimits } from "@/api/screen-time.api";
import { colors } from "@/constants/colors";
import { font, spacing, radius, TAB_BAR_HEIGHT } from "@/constants/theme";

type Ion = keyof typeof Ionicons.glyphMap;
type Period = "today" | "yesterday" | "week" | "month";

/* ── formatting ─────────────────────────────────────────────────────────── */
/** "2h 18m" / "18m" - minutes zero-padded when hours are present. */
function fmtHM(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}
/** "21h" / "48m" / "2h 5m" - drops the minutes when they're zero. */
function fmtCompact(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}
/** "22:00" → "10:00 PM". */
function to12h(hhmm: string): string {
  const [rawH, rawM] = hhmm.split(":").map(Number);
  const h = ((rawH % 24) + 24) % 24;
  const ap = h < 12 ? "AM" : "PM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(rawM ?? 0).padStart(2, "0")} ${ap}`;
}

const ACTIVITY_LABEL: Record<string, string> = {
  videos: "Videos", live: "Live", audio: "Audio Rooms", messages: "Messages",
  profile: "Profile", upload: "Uploading", search: "Search",
  notifications: "Notifications", settings: "Settings", other: "Other",
};

/* ── picker options ─────────────────────────────────────────────────────── */
const GOAL_OPTS: SettingsOption[] = [
  { value: "60", label: "1 Hour" }, { value: "120", label: "2 Hours" }, { value: "180", label: "3 Hours" },
  { value: "240", label: "4 Hours" }, { value: "300", label: "5 Hours" }, { value: "360", label: "6 Hours" },
];
const LIMIT_OPTS: SettingsOption[] = [
  { value: "0", label: "Off", desc: "No daily cap" },
  { value: "30", label: "30 Minutes" }, { value: "45", label: "45 Minutes" }, { value: "60", label: "1 Hour" },
  { value: "120", label: "2 Hours" }, { value: "180", label: "3 Hours" }, { value: "240", label: "4 Hours" }, { value: "300", label: "5 Hours" },
];
const BREAK_OPTS: SettingsOption[] = [
  { value: "0", label: "Off", desc: "No break reminders" },
  { value: "15", label: "Every 15 Minutes" }, { value: "30", label: "Every 30 Minutes" }, { value: "45", label: "Every 45 Minutes" },
  { value: "60", label: "Every 60 Minutes" }, { value: "90", label: "Every 90 Minutes" }, { value: "120", label: "Every 120 Minutes" },
];
const BEDTIME_OPTS: SettingsOption[] = [
  { value: "off", label: "Off", desc: "No bedtime pause" },
  { value: "22:00|07:00", label: "10:00 PM – 7:00 AM" },
  { value: "22:30|06:30", label: "10:30 PM – 6:30 AM" },
  { value: "23:00|06:00", label: "11:00 PM – 6:00 AM" },
  { value: "23:00|07:00", label: "11:00 PM – 7:00 AM" },
  { value: "00:00|08:00", label: "12:00 AM – 8:00 AM" },
  { value: "21:00|06:00", label: "9:00 PM – 6:00 AM" },
];
const RANGE_OPTS: SettingsOption[] = [
  { value: "7", label: "7 Days" }, { value: "30", label: "30 Days" }, { value: "90", label: "90 Days" },
];

const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Today" }, { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This Week" }, { key: "month", label: "This Month" },
];

export function ScreenTimeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  // Scoped selector: only the fields this screen renders. Excludes enforcement
  // runtime (limitReached/continueUntil/breakDue) and date/loaded, which live
  // elsewhere (e.g. ScreenTimeGate) and would otherwise force a re-render here
  // on every unrelated store update. addSecond() still fires ~once/sec while
  // foregrounded, updating todaySeconds/breakdown - that's an intentional,
  // narrow re-render for the live "today" counter, not a whole-store one.
  const st = useScreenTimeStore(useShallow((s) => ({
    todaySeconds: s.todaySeconds,
    breakdown: s.breakdown,
    longestSessionSeconds: s.longestSessionSeconds,
    history: s.history,
    limits: s.limits,
    summary: s.summary,
  })));
  const [picker, setPicker] = useState<null | "goal" | "limit" | "break" | "bedtime" | "range">(null);
  const [period, setPeriod] = useState<Period>("today");
  const [range, setRange] = useState<7 | 30 | 90>(7);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => { void useScreenTimeStore.getState().loadServer(); }, []);

  const setLimit = (patch: Partial<ScreenTimeLimits>) => useScreenTimeStore.getState().setLimits(patch);
  const optLabel = (opts: SettingsOption[], v: string) => opts.find((o) => o.value === v)?.label;

  /* ── daily series for the overview chart ── */
  const series = useMemo(() => {
    const out: { date: string; seconds: number }[] = [];
    const today = localDate();
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = localDate(d);
      out.push({ date: ds, seconds: ds === today ? st.todaySeconds : (st.history[ds] ?? 0) });
    }
    return out;
  }, [range, st.todaySeconds, st.history]);

  /* ── period totals + prior-period comparisons ── */
  const secsForDaysAgo = useMemo(() => {
    const today = localDate();
    return (i: number) => {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = localDate(d);
      return ds === today ? st.todaySeconds : (st.history[ds] ?? 0);
    };
  }, [st.todaySeconds, st.history]);

  const sumDays = (from: number, to: number) => {
    let s = 0; for (let i = from; i <= to; i++) s += secsForDaysAgo(i); return s;
  };

  const weekSecs = st.summary?.week_seconds ?? sumDays(0, 6);
  const monthSecs = st.summary?.month_seconds ?? sumDays(0, 29);
  const avgSecs = st.summary?.avg_daily_seconds ?? Math.round(sumDays(0, 6) / 7);
  const longest = Math.max(st.summary?.longest_session_seconds ?? 0, st.longestSessionSeconds);
  const yesterdaySecs = st.summary?.yesterday_seconds ?? secsForDaysAgo(1);

  const goalSecs = st.limits.goal_minutes * 60;

  const view = useMemo(() => {
    switch (period) {
      case "yesterday":
        return { value: secsForDaysAgo(1), prev: secsForDaysAgo(2), goal: goalSecs, heading: "Yesterday's Screen Time", goalNoun: "daily goal", prevNoun: "the day before" };
      case "week":
        return { value: weekSecs, prev: sumDays(7, 13), goal: goalSecs * 7, heading: "This Week's Screen Time", goalNoun: "weekly goal", prevNoun: "last week" };
      case "month":
        return { value: monthSecs, prev: sumDays(30, 59), goal: goalSecs * 30, heading: "This Month's Screen Time", goalNoun: "monthly goal", prevNoun: "last month" };
      default:
        return { value: st.todaySeconds, prev: yesterdaySecs, goal: goalSecs, heading: "Today's Screen Time", goalNoun: "daily goal", prevNoun: "yesterday" };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, st.todaySeconds, weekSecs, monthSecs, goalSecs, yesterdaySecs, st.history]);

  const pct = view.goal > 0 ? view.value / view.goal : 0;
  const remaining = Math.max(0, view.goal - view.value);
  const diff = view.value - view.prev;

  /* ── stat tiles ── */
  const activeDays = series.filter((s) => s.seconds > 0);
  const mostActive = activeDays.slice().sort((a, b) => b.seconds - a.seconds)[0];
  const leastActive = activeDays.slice().sort((a, b) => a.seconds - b.seconds)[0];
  const fullDay = (ds: string) => new Date(ds + "T00:00:00").toLocaleDateString(undefined, { weekday: "long" });
  const shortDay = (ds: string) => new Date(ds + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" });

  const limitBaseMin = st.limits.daily_limit_enabled ? st.limits.daily_limit_minutes : st.limits.goal_minutes;
  const weeklyLimitTotal = limitBaseMin * 7 * 60;
  const weeklyLimitUsed = Math.min(weekSecs, weeklyLimitTotal);

  const favActivity = (Object.keys(st.breakdown) as (keyof typeof st.breakdown)[])
    .sort((a, b) => (st.breakdown[b] ?? 0) - (st.breakdown[a] ?? 0))[0];

  /* ── insight (always today vs yesterday) ── */
  const insightDiff = st.todaySeconds - yesterdaySecs;
  const insightPct = yesterdaySecs > 0
    ? Math.round(Math.abs(insightDiff) / yesterdaySecs * 100)
    : (st.todaySeconds > 0 ? 100 : 0);
  const insightText = insightDiff === 0
    ? "Your usage is exactly the same as yesterday."
    : `You spent ${insightPct}% ${insightDiff > 0 ? "more" : "less"} time on Teezer than yesterday.`;

  const infoAlert = () => Alert.alert(
    "About Screen Time",
    "Screen Time tracks only your active time inside Teezer - never your device. Set a daily goal, limits, break reminders and a bedtime window to build healthier habits.",
  );

  return (
    <Screen edges={["top"]} bg={colors.bgMuted}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => navigation.goBack()} style={styles.circleBtn}>
          <ChevronLeft size={20} color={colors.brand} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headerTitle}>Screen Time</Text>
        <Pressable hitSlop={8} onPress={infoAlert} style={styles.circleBtn}>
          <Ionicons name="information-circle-outline" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.xl }}
      >
        <Text style={styles.subtitle}>
          Track your <Text style={{ color: colors.brand, fontWeight: font.weightBold }}>Teezer</Text> activity and build healthier habits.
        </Text>

        {/* ── TODAY CARD ── */}
        <LinearGradient colors={["#fff1f4", "#ffe6ec"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.todayCard}>
          <View style={styles.todayCols}>
            {/* left */}
            <View style={styles.todayLeft}>
              <Text style={styles.todayLabel}>{view.heading}</Text>
              <Text style={styles.todayBig}>{fmtHM(view.value)}</Text>
              <View style={styles.deltaRow}>
                <Ionicons
                  name={diff >= 0 ? "arrow-up" : "arrow-down"}
                  size={13}
                  color={diff > 0 ? colors.brand : diff < 0 ? colors.success : colors.textMuted}
                />
                <Text style={[styles.deltaText, { color: diff > 0 ? colors.brand : diff < 0 ? colors.success : colors.textMuted }]}>
                  {fmtCompact(Math.abs(diff))} from {view.prevNoun}
                </Text>
              </View>
              <Pressable style={styles.goalPill} onPress={() => setPicker("goal")}>
                <Text style={styles.goalPillText}>Daily Goal: {fmtHM(goalSecs)}</Text>
                <Ionicons name="pencil" size={12} color={colors.brand} />
              </Pressable>
            </View>

            {/* ring */}
            <ProgressRing progress={pct} size={128} stroke={13} from="#ff5d7a" to="#fe2c55" track="rgba(254,44,85,0.14)">
              <Text style={styles.ringPct}>{Math.round(pct * 100)}%</Text>
              <Text style={styles.ringNoun}>of {view.goalNoun}</Text>
            </ProgressRing>
          </View>

          <View style={styles.todayFooter}>
            <View style={styles.footStat}>
              <Text style={styles.footLabel}>Remaining</Text>
              <Text style={styles.footValue}>{fmtCompact(remaining)}</Text>
              <Ionicons name="time-outline" size={14} color={colors.brand} style={{ marginTop: 2 }} />
            </View>
            <View style={styles.footStat}>
              <Text style={styles.footLabel}>Longest Session</Text>
              <Text style={styles.footValue}>{fmtCompact(longest)}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ── PERIOD TABS ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
          {PERIODS.map((p) => {
            const on = period === p.key;
            return (
              <Pressable key={p.key} onPress={() => setPeriod(p.key)} style={[styles.tab, on && styles.tabOn]}>
                <Text style={[styles.tabText, on && styles.tabTextOn]}>{p.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── OVERVIEW CHART ── */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Screen Time Overview</Text>
            <Pressable style={styles.dropdown} onPress={() => setPicker("range")}>
              <Text style={styles.dropdownText}>{range} Days</Text>
              <Ionicons name="chevron-down" size={13} color={colors.textMuted} />
            </Pressable>
          </View>
          <Chart series={series} range={range} selected={selectedDay} onSelect={setSelectedDay} shortDay={shortDay} />
        </View>

        {/* ── STAT TILES ── */}
        <View style={styles.tiles}>
          <StatTile icon="time-outline" color={colors.brand} tint="#ffe9ee" label="Daily Average" value={fmtHM(avgSecs)} />
          <StatTile icon="flame" color="#f97316" tint="#fff0e3" label="Most Active Day" value={mostActive ? fullDay(mostActive.date) : "-"} />
          <StatTile icon="trending-up" color="#8b5cf6" tint="#efe9ff" label="Weekly Average" value={fmtHM(weekSecs)} />
          <StatTile icon="hourglass-outline" color="#10b981" tint="#e3f7ef" label="Weekly Limit" value={`${fmtCompact(weeklyLimitUsed)} / ${fmtCompact(weeklyLimitTotal)}`} />
        </View>

        {/* ── FEATURE ROWS ── */}
        <View style={styles.card}>
          <FeatureRow
            icon="time" color="#3b82f6" title="Daily Limit" desc="Set a daily time limit for using Teezer"
            value={st.limits.daily_limit_enabled ? fmtHM(st.limits.daily_limit_minutes * 60) : "Off"}
            onPress={() => setPicker("limit")}
          />
          <Divider />
          <FeatureRow
            icon="cafe" color="#f97316" title="Take a Break" desc="Remind me to take a break"
            value={st.limits.break_enabled ? `Every ${st.limits.break_interval_minutes}m` : "Off"}
            onPress={() => setPicker("break")}
          />
          <Divider />
          <FeatureRow
            icon="moon" color="#8b5cf6" title="Bedtime" desc="Pause Teezer during bedtime"
            value={st.limits.bedtime_enabled ? `${to12h(st.limits.bedtime_start)} – ${to12h(st.limits.bedtime_end)}` : "Off"}
            onPress={() => setPicker("bedtime")}
          />
          <Divider />
          <FeatureRow
            icon="scan" color="#10b981" title="Focus Mode" desc="Hide distractions and enjoy mindful scrolling"
            toggle={st.limits.focus_disable_infinite_scroll}
            onToggle={(v) => setLimit({
              focus_disable_infinite_scroll: v,
              focus_disable_autoplay: v,
              focus_hide_recommended: v,
              focus_hide_notifications: v,
            })}
          />
        </View>

        {/* ── INSIGHT BANNER ── */}
        <LinearGradient colors={["#fff1f4", "#ffe6ec"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.insight}>
          <View style={styles.insightMedal}>
            <Ionicons name="ribbon" size={26} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.insightEyebrow}>Your Insight</Text>
            <Text style={styles.insightText}>{insightText}</Text>
            <Text style={styles.insightSub}>Keep it up! Small steps lead to big changes.</Text>
          </View>
        </LinearGradient>
        <Pressable style={styles.reportBtn} onPress={() => setReportOpen(true)}>
          <Text style={styles.reportBtnText}>View Weekly Report</Text>
        </Pressable>
      </ScrollView>

      {/* ── pickers ── */}
      <OptionSheet visible={picker === "goal"} title="Daily Goal" options={GOAL_OPTS} selected={String(st.limits.goal_minutes)}
        onSelect={(v) => setLimit({ goal_minutes: Number(v) })} onClose={() => setPicker(null)} />
      <OptionSheet visible={picker === "limit"} title="Daily Limit" options={LIMIT_OPTS}
        selected={st.limits.daily_limit_enabled ? String(st.limits.daily_limit_minutes) : "0"}
        onSelect={(v) => v === "0" ? setLimit({ daily_limit_enabled: false }) : setLimit({ daily_limit_enabled: true, daily_limit_minutes: Number(v) })}
        onClose={() => setPicker(null)} />
      <OptionSheet visible={picker === "break"} title="Take a Break" options={BREAK_OPTS}
        selected={st.limits.break_enabled ? String(st.limits.break_interval_minutes) : "0"}
        onSelect={(v) => v === "0" ? setLimit({ break_enabled: false }) : setLimit({ break_enabled: true, break_interval_minutes: Number(v) })}
        onClose={() => setPicker(null)} />
      <OptionSheet visible={picker === "bedtime"} title="Bedtime" options={BEDTIME_OPTS}
        selected={st.limits.bedtime_enabled ? `${st.limits.bedtime_start}|${st.limits.bedtime_end}` : "off"}
        onSelect={(v) => {
          if (v === "off") { setLimit({ bedtime_enabled: false }); return; }
          const [s, e] = v.split("|");
          setLimit({ bedtime_enabled: true, bedtime_start: s, bedtime_end: e });
        }}
        onClose={() => setPicker(null)} />
      <OptionSheet visible={picker === "range"} title="Chart Range" options={RANGE_OPTS} selected={String(range)}
        onSelect={(v) => { setRange(Number(v) as 7 | 30 | 90); setSelectedDay(null); }} onClose={() => setPicker(null)} />

      {/* ── weekly report sheet ── */}
      <BottomSheet visible={reportOpen} onClose={() => setReportOpen(false)} scrollable={false}>
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
          <Text style={styles.sheetTitle}>Weekly Report</Text>
          <ReportRow label="Average Daily Usage" value={fmtHM(avgSecs)} />
          <ReportRow label="Most Active Day" value={mostActive ? `${fullDay(mostActive.date)} · ${fmtCompact(mostActive.seconds)}` : "-"} />
          <ReportRow label="Least Active Day" value={leastActive ? `${fullDay(leastActive.date)} · ${fmtCompact(leastActive.seconds)}` : "-"} />
          <ReportRow label="Longest Session" value={fmtCompact(longest)} />
          <ReportRow label="Favorite Activity" value={favActivity ? ACTIVITY_LABEL[favActivity] ?? "-" : "-"} />
          <ReportRow label="Weekly Total" value={fmtHM(weekSecs)} last />
        </View>
      </BottomSheet>
    </Screen>
  );
}

/* ── Overview bar chart ─────────────────────────────────────────────────── */
function Chart({
  series, range, selected, onSelect, shortDay,
}: {
  series: { date: string; seconds: number }[];
  range: number;
  selected: number | null;
  onSelect: (i: number | null) => void;
  shortDay: (ds: string) => string;
}) {
  const CHART_H = 150;
  const maxSec = Math.max(1, ...series.map((s) => s.seconds));
  const topHours = Math.max(1, Math.ceil(maxSec / 3600));
  const step = topHours > 4 ? Math.ceil(topHours / 4) : 1;
  const marks: number[] = [];
  for (let h = 0; h <= topHours; h += step) marks.push(h);
  if (marks[marks.length - 1] !== topHours) marks.push(topHours);
  const topMark = marks[marks.length - 1];
  const niceMax = topMark * 3600;

  // Default the tooltip to the peak day so the chart opens like the mockup.
  const peakIdx = series.reduce((best, s, i) => (s.seconds > series[best].seconds ? i : best), 0);
  const active = selected ?? peakIdx;
  const axisLabel = (h: number) => (h === 0 ? "0m" : `${h}h`);

  return (
    <View style={{ marginTop: spacing.md }}>
      <View style={{ flexDirection: "row" }}>
        {/* y-axis */}
        <View style={{ width: 30, height: CHART_H }}>
          {marks.map((h) => (
            <Text key={h} style={[styles.axisLabel, { top: CHART_H - (h / topMark) * CHART_H - 7 }]}>{axisLabel(h)}</Text>
          ))}
        </View>
        {/* plot area */}
        <View style={{ flex: 1, height: CHART_H }}>
          {marks.map((h) => (
            <View key={h} style={[styles.gridline, { top: CHART_H - (h / topMark) * CHART_H }]} />
          ))}
          <View style={styles.barsRow}>
            {series.map((d, i) => {
              const h = Math.max(3, (d.seconds / niceMax) * CHART_H);
              const on = active === i && d.seconds > 0;
              return (
                <Pressable key={d.date} style={styles.barCol} onPress={() => onSelect(selected === i ? null : i)}>
                  {on && (
                    <View style={styles.tooltip}>
                      <Text style={styles.tooltipText}>{fmtHM(d.seconds)}</Text>
                      <View style={styles.tooltipArrow} />
                    </View>
                  )}
                  <LinearGradient
                    colors={on ? ["#ff5d7a", "#fe2c55"] : ["#ffb3c2", "#ff89a0"]}
                    style={[styles.bar, { height: h, width: range > 14 ? "70%" : 20 }]}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
      {/* x-axis labels (only when few enough to read) */}
      {range <= 14 && (
        <View style={styles.xAxis}>
          {series.map((d) => (
            <Text key={d.date} style={styles.xLabel}>{shortDay(d.date)}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

/* ── small pieces ───────────────────────────────────────────────────────── */
function StatTile({ icon, color, tint, label, value }: { icon: Ion; color: string; tint: string; label: string; value: string }) {
  return (
    <View style={styles.tile}>
      <View style={[styles.tileIcon, { backgroundColor: tint }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.tileLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

function FeatureRow({
  icon, color, title, desc, value, onPress, toggle, onToggle,
}: {
  icon: Ion; color: string; title: string; desc: string;
  value?: string; onPress?: () => void; toggle?: boolean; onToggle?: (v: boolean) => void;
}) {
  const body = (
    <>
      <View style={[styles.frIcon, { backgroundColor: color }]}>
        <Ionicons name={icon} size={20} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.frTitle}>{title}</Text>
        <Text style={styles.frDesc}>{desc}</Text>
      </View>
      {onToggle ? (
        <Switch value={!!toggle} onValueChange={onToggle} trackColor={{ false: colors.borderStrong, true: colors.brand }} thumbColor={colors.white} />
      ) : (
        <View style={styles.frRight}>
          <Text style={styles.frValue} numberOfLines={1}>{value}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </View>
      )}
    </>
  );
  if (onPress) {
    return <Pressable style={({ pressed }) => [styles.frRow, pressed && { opacity: 0.6 }]} onPress={onPress}>{body}</Pressable>;
  }
  return <View style={styles.frRow}>{body}</View>;
}

function Divider() { return <View style={styles.frDivider} />; }

function ReportRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.repRow, !last && styles.repDivider]}>
      <Text style={styles.repLabel}>{label}</Text>
      <Text style={styles.repValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, height: 52,
  },
  circleBtn: {
    width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.white,
  },
  headerTitle: { fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text },
  subtitle: { paddingHorizontal: spacing.lg, marginTop: spacing.xs, marginBottom: spacing.md, fontSize: font.md, lineHeight: 22, color: colors.textMuted },

  /* today card */
  todayCard: { marginHorizontal: spacing.lg, borderRadius: radius.xl, padding: spacing.lg },
  todayCols: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  todayLeft: { flex: 1 },
  todayLabel: { fontSize: font.sm, color: colors.textMuted, fontWeight: font.weightMedium },
  todayBig: { marginTop: 2, fontSize: 34, fontWeight: font.weightHeavy, color: colors.text, letterSpacing: -0.5 },
  deltaRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  deltaText: { fontSize: font.sm, fontWeight: font.weightMedium },
  goalPill: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: spacing.md,
    backgroundColor: "rgba(255,255,255,0.7)", borderRadius: radius.pill, paddingHorizontal: spacing.md, height: 32,
  },
  goalPillText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.brand },
  ringPct: { fontSize: 26, fontWeight: font.weightHeavy, color: colors.brand },
  ringNoun: { marginTop: 1, fontSize: 10, color: colors.textMuted, textAlign: "center" },

  todayFooter: { flexDirection: "row", marginTop: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(254,44,85,0.15)", paddingTop: spacing.md },
  footStat: { flex: 1, alignItems: "center" },
  footLabel: { fontSize: font.xs, color: colors.textMuted },
  footValue: { marginTop: 2, fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.brand },

  /* period tabs */
  tabsRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingVertical: spacing.md },
  tab: { paddingHorizontal: spacing.lg, height: 38, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  tabOn: { backgroundColor: colors.brandTint, borderColor: colors.brandTint },
  tabText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.textSecondary },
  tabTextOn: { color: colors.brand },

  /* generic card */
  card: {
    marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: colors.white, borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: spacing.lg,
  },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  dropdown: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm, paddingHorizontal: spacing.md, height: 34 },
  dropdownText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.textSecondary },

  /* chart */
  axisLabel: { position: "absolute", right: 6, fontSize: 10, color: colors.textFaint },
  gridline: { position: "absolute", left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  barsRow: { flexDirection: "row", alignItems: "flex-end", height: "100%" },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%" },
  bar: { maxWidth: 24, borderRadius: 7 },
  tooltip: { position: "absolute", bottom: "100%", marginBottom: 6, alignItems: "center" },
  tooltipText: { backgroundColor: colors.brand, color: "#fff", fontSize: font.xs, fontWeight: font.weightBold, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm, overflow: "hidden" },
  tooltipArrow: { width: 0, height: 0, borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 6, borderStyle: "solid", backgroundColor: "transparent", borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: colors.brand, marginTop: -1 },
  xAxis: { flexDirection: "row", marginTop: spacing.sm, paddingLeft: 30 },
  xLabel: { flex: 1, textAlign: "center", fontSize: 11, color: colors.textMuted, fontWeight: font.weightMedium },

  /* stat tiles */
  tiles: { flexDirection: "row", paddingHorizontal: spacing.lg - 3, marginTop: spacing.md },
  tile: { flex: 1, marginHorizontal: 3, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingVertical: spacing.md, paddingHorizontal: 6, alignItems: "center" },
  tileIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  tileLabel: { fontSize: 10, color: colors.textMuted, textAlign: "center", marginBottom: 3 },
  tileValue: { fontSize: font.sm, fontWeight: font.weightHeavy, color: colors.text, textAlign: "center" },

  /* feature rows */
  frRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  frIcon: { width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  frTitle: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text },
  frDesc: { marginTop: 2, fontSize: font.sm, lineHeight: 18, color: colors.textMuted },
  frRight: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: 150 },
  frValue: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.textSecondary, flexShrink: 1 },
  frDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 40 + spacing.md },

  /* insight */
  insight: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginHorizontal: spacing.lg, marginTop: spacing.lg, borderRadius: radius.lg, padding: spacing.lg },
  insightMedal: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  insightEyebrow: { fontSize: font.sm, fontWeight: font.weightHeavy, color: colors.brand, marginBottom: 3 },
  insightText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.text, lineHeight: 20 },
  insightSub: { marginTop: 3, fontSize: font.xs, color: colors.textMuted },
  reportBtn: { marginHorizontal: spacing.lg, marginTop: spacing.md, height: 48, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  reportBtnText: { fontSize: font.md, fontWeight: font.weightHeavy, color: "#fff" },

  /* report sheet */
  sheetTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text, paddingTop: spacing.xs, paddingBottom: spacing.sm },
  repRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.md },
  repDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  repLabel: { fontSize: font.sm, color: colors.textMuted },
  repValue: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.text },
});
