import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from "react-native-svg";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Globe, Info, RotateCw, ScrollText } from "lucide-react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { Avatar } from "@/components/Avatar";
import { Skeleton } from "@/components/Skeleton";
import { studioApi } from "@/api/studio.api";
import { giftApi } from "@/api/gift.api";
import { monetizationProgramsApi, type ProgramRequirement, type ProgramStatus } from "@/api/monetization-programs.api";
import {
  uiFor, holdingYouBack,
  type ProgrammeKey, type ProgSetting, type StatSpec,
} from "./studio-programmes";
import { useStudioSettingsStore } from "@/store/studio-settings.store";
import { REQUIREMENT_FIX as BLOCKER_FIX } from "./requirement-fix";
import { openPolicy } from "@/store/policy.store";
import { sd, sr } from "./studio-design";
import { font, spacing } from "@/constants/theme";
import { formatCompact } from "@/utils/format";
import { coins, pct, usd } from "@/utils/money";
import type { StudioStackParamList } from "@/navigation/StudioStack";

/**
 * One programme's page - the Claude Design prototype's `progOpen` panel.
 *
 * Two tabs, as the prototype now draws it:
 *
 *  - Overview: the dark hero with a three-cell stat strip, Settings, "How you
 *    get paid", what it unlocks, Recent activity and a footnote.
 *  - Requirements: the completion ring, one card per requirement with its own
 *    progress bar, anything blocking, and the re-check / policy actions.
 *
 * Eligibility is measured per programme against live metrics - there are no
 * creator levels, no XP and no score anywhere in this screen. Every number in
 * the Requirements tab comes from an endpoint; nothing is asserted without one,
 * which is why a metric that has not loaded reads as 0 rather than as met.
 */

const AMBER = "#B4720E";
const AMBER_WASH = "#FDF3E2";
const CHEVRON = "#C7C2CE";
const DANGER_INK = "#B02334";
const DANGER_SUB = "#C4626E";
const DANGER_WASH = "#FDECEE";
/* The spec's own green: #2BC48A for fills and tokens, #1F7A5A for text on
   white, #EAF6F0 as the tint. `sd.up` is a shade darker and is left alone so
   the rest of Studio does not shift. */
const MET = "#2BC48A";
const MET_INK = "#1F7A5A";
const TOKEN_OFF = "#F1EFF3";
/** Deterministic avatar colours, so the same supporter keeps the same swatch. */
const INITIAL_BG = ["#F42B5B", "#1F9D6B", "#2FA0F0", "#B4720E", "#7C3AED", "#4A4653"];

/* Shared with every other money surface - see utils/money. */
const money = usd;

/** "3d" / "2h" / "just now" - the compact stamp the activity rows use. */
function ago(iso?: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  if (mins < 43200) return `${Math.round(mins / 1440)}d`;
  return `${Math.round(mins / 43200)}mo`;
}

/** The completion ring. RN has no conic-gradient, so it is an SVG arc. */
function Ring({ pct, color }: { pct: number; color: string }) {
  const r = 26.5;
  const c = 2 * Math.PI * r;
  const shown = Math.max(0, Math.min(100, pct));
  return (
    <View style={styles.ring}>
      <Svg width={60} height={60}>
        <Circle cx={30} cy={30} r={r} stroke={sd.fill} strokeWidth={7} fill="none" />
        <Circle
          cx={30} cy={30} r={r} stroke={color} strokeWidth={7} fill="none"
          strokeDasharray={`${c}`} strokeDashoffset={c * (1 - shown / 100)}
          strokeLinecap="round" transform="rotate(-90 30 30)"
        />
      </Svg>
      <View style={styles.ringInner}>
        <Text style={styles.ringText}>{Math.round(shown)}%</Text>
      </View>
    </View>
  );
}

export function StudioProgrammeScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<StudioStackParamList, "StudioProgramme">>();
  const prog: ProgrammeKey = route.params?.key ?? "gifts";
  const [tab, setTab] = useState<"overview" | "reqs">("overview");

  /* One request. The server owns the programme list, its requirements and
     whether each one is met - so the phone and the website cannot disagree. */
  const programsQ = useQuery({
    queryKey: ["monetization-programs"],
    queryFn: monetizationProgramsApi.list,
    staleTime: 60_000,
  });

  const isGifts = prog === "gifts";
  const moneyQ = useQuery({
    queryKey: ["studio-monetization", "28d"],
    queryFn: () => studioApi.monetizationOverview("28d"),
    staleTime: 60_000,
    enabled: isGifts,
  });
  const giftsQ = useQuery({
    queryKey: ["gift-history", "received"],
    queryFn: () => giftApi.history("received", 1, 20),
    staleTime: 60_000,
    enabled: isGifts,
  });

  const server = programsQ.data?.programs.find((x) => x.key === prog);
  const ui = uiFor(prog);

  const reqs: ProgramRequirement[] = server?.requirements ?? [];
  const state: ProgramStatus = server?.status ?? "locked";
  const metCount = server?.met_count ?? 0;
  const overallPct = server?.percent ?? 0;
  const blockers = reqs.filter((r) => !r.met && !r.counted);
  const metricsLoading = programsQ.isLoading || !server;
  const title = server?.label ?? "Programme";

  const pay = moneyQ.data?.payouts;
  const received = giftsQ.data?.items ?? [];

  /** One strip cell. A figure with no source shows "--" rather than a number
   *  nobody measured. */
  function statValue(spec: StatSpec): string {
    const followers = reqs.find((r) => r.key === "followers");
    switch (spec.from) {
      case "earned":    return money(pay?.lifetime_earnings ?? 0);
      case "available": return money(pay?.available_balance ?? 0);
      case "giftCount": return formatCompact(received.length);
      case "senders":   return formatCompact(new Set(received.map((g) => g.user?.id).filter(Boolean)).size);
      case "views30":   return formatCompact(reqs.find((r) => r.key === "views30")?.current ?? 0);
      case "zeroMoney": return money(0);
      case "followersOfTarget":
        return followers
          ? `${formatCompact(followers.current)} / ${formatCompact(followers.target ?? 0)}`
          : "--";
      default:          return "--";
    }
  }
  const stats = ui.stats.map((sp) => ({ value: statValue(sp), label: sp.label }));

  function settingValue(key: string): string | undefined {
    switch (key) {
      case "payout":   return pay?.payment_method ? `${pay.payment_method.provider}` : "Not set";
      // The admin sets both of these. Quoting a fixed 100 / 30 told creators
      // the wrong cash value and the wrong fee the moment either changed, so
      // an unknown value shows as a dash rather than a confident guess.
      case "rate":     return pay?.coin_usd_rate == null ? "--" : `${coins(pay.coin_usd_rate)} coins = $1`;
      case "cut":      return pay?.commission_rate == null ? "--" : `${pct(pay.commission_rate)}% on payout`;
      case "identity": return reqs.find((r) => r.key === "identity")?.met ? "Verified" : "Not verified";
      case "cat":      return "Not set";
      default:         return undefined;
    }
  }

  function refetchAll() {
    programsQ.refetch();
  }

  /** Re-check reports what it found - a spinner that stops says nothing. */
  async function recheck() {
    const r = await programsQ.refetch();
    const p = r.data?.programs.find((x) => x.key === prog);
    if (!p) return;
    Alert.alert(
      p.met_count === p.total_count ? "All requirements met" : "Still in progress",
      `${p.met_count} of ${p.total_count} requirements met.`,
    );
  }

  /* The five states the server decides. `eligible` and `coming_soon` share the
     amber chip because both mean "not you - us": the creator has done nothing
     wrong in either case. */
  const amber = state === "eligible" || state === "coming_soon";
  const chipStyle = state === "active" ? styles.chipOn : amber ? styles.chipWait : styles.chipOff;
  const chipTextStyle = state === "active" ? styles.chipTextOn : amber ? styles.chipTextWait : styles.chipTextOff;
  const chipLabel =
    state === "active" ? "ACTIVE"
    : state === "eligible" ? "ELIGIBLE"
    : state === "coming_soon" ? "COMING SOON"
    : state === "disabled" ? "UNAVAILABLE"
    : "LOCKED";
  const subtitle = ui.subtitle;

  const HeroIcon = ui.icon;
  const ringColor = overallPct >= 100 ? MET : sd.accent;
  const unmet = reqs.filter((r) => !r.met);

  /* "Notify me when eligible" / "Join the waitlist" - real now (see
   * ProgramWaitlistSignup), not just a tab-switch in disguise. Any creator
   * may join regardless of `state`: the whole point of a waitlist is for
   * someone not yet eligible, or a programme not yet open, to ask to be
   * told when that changes. */
  const alreadyWaitlisted = !!server?.waitlisted;
  const canJoinWaitlist = !!server?.waitlist_enabled && !alreadyWaitlisted;
  const waitlistMutation = useMutation({
    mutationFn: () => monetizationProgramsApi.joinWaitlist(prog),
    onSuccess: () => {
      programsQ.refetch();
      Alert.alert("You're on the list", "We'll notify you when this programme opens.");
    },
    onError: () => Alert.alert("Something went wrong", "Please try again."),
  });

  return (
    <Screen edges={["top"]} bg={sd.page}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Pressable hitSlop={8} style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ChevronLeft size={19} color={sd.text} strokeWidth={2.2} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        </View>
        <View style={[styles.chip, chipStyle]}>
          <Text style={[styles.chipText, chipTextStyle]}>{chipLabel}</Text>
        </View>
      </View>

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <View style={styles.tabRow}>
        {([["overview", "Overview"], ["reqs", "Requirements"]] as const).map(([k, label]) => {
          const on = tab === k;
          return (
            <Pressable key={k} style={[styles.tab, on ? styles.tabOn : styles.tabOff]} onPress={() => setTab(k)}>
              <Text style={[styles.tabText, on ? styles.tabTextOn : styles.tabTextOff]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {tab === "overview" ? (
          <>
            {/* ── Hero ────────────────────────────────────────────── */}
            <View style={styles.hero}>
              <Svg width={210} height={210} style={styles.glow} pointerEvents="none">
                <Defs>
                  <RadialGradient id="progGlow" cx="50%" cy="50%" r="50%">
                    <Stop offset="0" stopColor={sd.accent} stopOpacity={0.3} />
                    <Stop offset="0.66" stopColor={sd.accent} stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Circle cx={105} cy={105} r={105} fill="url(#progGlow)" />
              </Svg>

              <View style={styles.heroIcon}>
                <HeroIcon size={20} color="#FFFFFF" strokeWidth={2} />
              </View>
              <Text style={styles.blurb}>
                {/* Admin Panel -> ... -> Overview -> App Intro Pitch overrides
                    this hero paragraph, same as the dedicated intro screens -
                    plain text, so it just renders as one part below (the
                    *highlight* markup is this file's own hardcoded copy's
                    convention, not something an admin types). */}
                {(server?.hero_description || ui.blurb).split(/(\*[^*]+\*)/).map((part, i) =>
                  part.startsWith("*") && part.endsWith("*")
                    ? <Text key={i} style={styles.blurbHi}>{part.slice(1, -1)}</Text>
                    : <Text key={i}>{part}</Text>,
                )}
              </Text>

              <View style={styles.strip}>
                {stats.map((s, i) => (
                  <View key={s.label} style={[styles.stripCell, i > 0 && styles.stripDivider]}>
                    {metricsLoading ? (
                      <Skeleton width={44} height={14} radius={4} />
                    ) : (
                      <Text style={styles.stripValue} numberOfLines={1}>{s.value}</Text>
                    )}
                    <Text style={styles.stripLabel} numberOfLines={1}>{s.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* ── Settings ────────────────────────────────────────── */}
            <Text style={styles.sectionLabel}>SETTINGS</Text>
            <View style={styles.listCard}>
              {ui.settings.map((r, i) => (
                <SettingRow
                  key={r.key}
                  row={r}
                  value={r.kind === "value" ? (settingValue(r.key) ?? r.value) : undefined}
                  last={i === ui.settings.length - 1}
                  onOpen={() => r.kind === "value" && r.go && navigation.navigate(r.go)}
                />
              ))}
            </View>

            {/* ── How you get paid ────────────────────────────────── */}
            <Text style={styles.sectionLabel}>HOW YOU GET PAID</Text>
            <View style={[styles.panel, { gap: 13 }]}>
              {ui.rules.map((text, i) => (
                <View key={text} style={styles.ruleRow}>
                  <View style={styles.ruleNum}><Text style={styles.ruleNumText}>{i + 1}</Text></View>
                  <Text style={styles.ruleText}>{text}</Text>
                </View>
              ))}
            </View>

            {/* ── What it unlocks ─────────────────────────────────── */}
            <Text style={styles.sectionLabel}>WHAT IT UNLOCKS</Text>
            <View style={[styles.panel, { gap: 11 }]}>
              {(server?.unlocks ?? []).map((u) => (
                <View key={u} style={styles.unlockRow}>
                  <View style={[styles.tick, state === "active" ? styles.tickOn : styles.tickOff]}>
                    <Check size={10} color={state === "active" ? "#FFFFFF" : sd.faint} strokeWidth={3.2} />
                  </View>
                  <Text style={styles.unlockText}>{u}</Text>
                </View>
              ))}
            </View>

            {/* ── Recent activity - real gifts, or nothing at all ─── */}
            {isGifts && received.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>RECENT ACTIVITY</Text>
                <View style={styles.listCard}>
                  {received.slice(0, 6).map((g, i) => {
                    const who = g.user?.name || g.user?.username || "Someone";
                    const bg = INITIAL_BG[(g.user?.id ?? i) % INITIAL_BG.length];
                    const last = i === Math.min(6, received.length) - 1;
                    return (
                      <View key={g.id} style={[styles.row, last && { borderBottomWidth: 0 }]}>
                        {g.user?.avatar ? (
                          <Avatar uri={g.user.avatar} style={styles.actAvatar} />
                        ) : (
                          <View style={[styles.actAvatar, { backgroundColor: bg }]}>
                            <Text style={styles.actInitial}>{who.charAt(0).toUpperCase()}</Text>
                          </View>
                        )}
                        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                          <Text style={styles.rowLabel} numberOfLines={1}>{who}</Text>
                          <Text style={styles.rowSub} numberOfLines={1}>sent {g.gift_name}</Text>
                        </View>
                        <View style={{ alignItems: "flex-end", gap: 2 }}>
                          <Text style={styles.actAmount} numberOfLines={1}>
                            +{formatCompact(g.net_coins)} coins
                          </Text>
                          <Text style={styles.actWhen} numberOfLines={1}>{ago(g.created_at)}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            <View style={styles.footnote}>
              <Info size={14} color={sd.faint} strokeWidth={1.9} style={{ marginTop: 1 }} />
              <Text style={styles.footnoteText}>
                Requirements are set by Teezer and re-checked against your account.
              </Text>
            </View>
          </>
        ) : (
          <>
            {/* ── Completion ring ─────────────────────────────────── */}
            <View style={styles.ringCard}>
              <Ring pct={overallPct} color={ringColor} />
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Text style={styles.ringLabel} numberOfLines={1}>
                  {metricsLoading ? "Checking your account…" : `${metCount} of ${reqs.length} requirements met`}
                </Text>
                <Text style={styles.ringGap}>
                  {metricsLoading
                    ? "Reading your followers, views, videos and watch time."
                    : overallPct >= 100
                      ? server?.mode === "coming_soon"
                        ? "You qualify. This programme is not open on Teezer yet."
                        : "You qualify and this programme is open."
                      : `${reqs.filter((r) => !r.met).map((r) => r.label).join(", ")} still to go.`}
                </Text>
              </View>
            </View>

            {/* ── Requirements ────────────────────────────────────── */}
            <Text style={styles.sectionLabel}>REQUIREMENTS</Text>
            <View style={{ gap: 10 }}>
              {reqs.map((r) => (
<ReqCard key={r.key} r={r} loading={metricsLoading} />
              ))}
            </View>

            {/* ── Blockers ────────────────────────────────────────── */}
            {!metricsLoading && blockers.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>NEEDS YOUR ATTENTION</Text>
                <View style={{ gap: 9 }}>
                  {blockers.map((b, bi) => {
                    return (
                      <View key={`${b.key}-${bi}`} style={styles.blocker}>
                        <View style={styles.blockerIcon}>
                          <Info size={16} color={DANGER_INK} strokeWidth={2.1} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                          <Text style={styles.blockerLabel} numberOfLines={1}>{b.label}</Text>
                          <Text style={styles.blockerSub} numberOfLines={1}>{"Required before this programme can open"}</Text>
                        </View>
                        {(() => {
                          const fix = BLOCKER_FIX[b.key];
                          if (!fix) return null;
                          return (
                            <Pressable
                              style={styles.blockerBtn}
                              onPress={() => {
                                if (fix.settings) navigation.navigate("SettingsShell", { screen: fix.settings });
                                else if (fix.nav) navigation.navigate(fix.nav);
                                else if (fix.note) Alert.alert(b.label, fix.note);
                              }}
                            >
                              <Text style={styles.blockerBtnText}>{fix.label}</Text>
                            </Pressable>
                          );
                        })()}
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {/* ── Where it runs ───────────────────────────────────── */}
            {!!server?.availability && (
              <>
                <Text style={styles.sectionLabel}>AVAILABLE IN</Text>
                <View style={styles.panel}>
                  <View style={styles.availRow}>
                    <View style={styles.rowIcon}>
                      <Globe size={16} color={sd.text} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text style={styles.rowLabel}>
                        {server.availability.worldwide
                          ? "Worldwide"
                          : `${server.availability.countries.length} ${server.availability.countries.length === 1 ? "country" : "countries"}`}
                      </Text>
                      <Text style={styles.rowSub}>
                        {server.availability.worldwide
                          ? "No regional restriction on this programme"
                          : "This programme runs in these regions only"}
                      </Text>
                    </View>
                  </View>

                  {/* Named, not coded: a creator asking "is this available
                      here" deserves a country, not an ISO pair. */}
                  {!server.availability.worldwide && (
                    <View style={styles.countryWrap}>
                      {server.availability.countries.map((c) => (
                        <View key={c.code} style={styles.countryChip}>
                          <Text style={styles.countryChipText}>{c.name}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </>
            )}

            {/* ── Actions ─────────────────────────────────────────── */}
            <View style={styles.actionRow}>
              <Pressable style={styles.action} onPress={recheck}>
                <RotateCw size={15} color={sd.text} strokeWidth={2} />
                <Text style={styles.actionText}>Re-check status</Text>
              </Pressable>
              <Pressable style={styles.action} onPress={() => setTab("overview")}>
                <ScrollText size={15} color={sd.text} strokeWidth={2} />
                <Text style={styles.actionText}>Full policy</Text>
              </Pressable>
            </View>

            <View style={styles.footnote}>
              <Info size={14} color={sd.faint} strokeWidth={1.9} style={{ marginTop: 1 }} />
              <Text style={styles.footnoteText}>
                Requirements are re-checked every 24 hours. Once all of them are green the
                programme unlocks automatically.
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* ── Footer CTA ──────────────────────────────────────────────── */}
      <View style={styles.footer}>
        <Pressable
          disabled={alreadyWaitlisted}
          style={[styles.cta, (ui.cta.muted || alreadyWaitlisted) && styles.ctaMuted]}
          onPress={() => {
            if (alreadyWaitlisted) return;
            if (canJoinWaitlist) return waitlistMutation.mutate();
            if (isGifts && state === "active") return navigation.navigate("Withdraw");
            setTab("reqs");
            refetchAll();
          }}
        >
          <Text style={[styles.ctaText, (ui.cta.muted || alreadyWaitlisted) && styles.ctaTextMuted]}>
            {alreadyWaitlisted ? "You're on the List" : server?.cta_label || ui.cta.label}
          </Text>
        </Pressable>
        <Text style={styles.ctaNote}>
          {alreadyWaitlisted
            ? "We'll notify you the moment this programme opens."
            : ui.cta.note || (unmet.length > 0 ? holdingYouBack(unmet) : "")}
        </Text>
        <Text style={styles.agreeNote}>
          By continuing, you agree to Teezer's{" "}
          <Text style={styles.agreeLink} onPress={() => openPolicy("terms")}>Terms of Service</Text> and{" "}
          <Text style={styles.agreeLink} onPress={() => openPolicy("privacy")}>Privacy Policy</Text>.
        </Text>
      </View>

    </Screen>
  );
}

/**
 * A Settings row. Toggles persist to the local Studio settings store - there is
 * no /studio/monetization/settings endpoint yet, so a switch that forgot itself
 * on reload would be worse than none.
 */
function SettingRow({
  row, value, last, onOpen,
}: {
  row: ProgSetting; value?: string; last: boolean; onOpen: () => void;
}) {
  const toggles = useStudioSettingsStore((st) => st.prefs.programToggles);
  const update = useStudioSettingsStore((st) => st.update);
  const Icon = row.icon;
  const on = row.kind === "toggle" ? toggles[row.key] ?? row.on : false;

  return (
    <Pressable
      disabled={row.kind === "toggle"}
      onPress={onOpen}
      style={[styles.row, last && { borderBottomWidth: 0 }]}
    >
      <View style={styles.rowIcon}>
        <Icon size={16} color={sd.text} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={styles.rowLabel} numberOfLines={1}>{row.label}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>{row.sub}</Text>
      </View>

      {row.kind === "toggle" ? (
        <Switch
          value={on}
          onValueChange={(v) => update({ programToggles: { ...toggles, [row.key]: v } })}
          trackColor={{ false: sd.divider, true: sd.ink }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={sd.divider}
        />
      ) : (
        <View style={styles.rowRight}>
          <Text style={styles.rowValue} numberOfLines={1}>{value ?? row.value}</Text>
          <ChevronRight size={14} color={CHEVRON} strokeWidth={2.2} />
        </View>
      )}
    </Pressable>
  );
}

/** One requirement: token, label, value, its progress bar and an action. */
function ReqCard({ r, loading }: { r: ProgramRequirement; loading: boolean }) {
  const value = r.counted
    ? `${formatCompact(r.current)} / ${formatCompact(r.target ?? 0)}`
    : r.met ? "Verified" : "Not yet";

  return (
    <View style={styles.reqCard}>
      <View style={styles.reqHead}>
        <View style={[styles.reqToken, r.met ? styles.reqTokenOn : styles.reqTokenOff]}>
          {r.met
            ? <Check size={13} color="#FFFFFF" strokeWidth={3.2} />
            : <AlertTriangle size={12} color={sd.faint} strokeWidth={2.4} />}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={styles.reqLabel} numberOfLines={1}>{r.label}</Text>
          <Text style={styles.reqSub} numberOfLines={1}>{r.counted ? "Progress toward the target" : "Required"}</Text>
        </View>
        {loading
          ? <Skeleton width={54} height={12} radius={4} />
          : <Text style={[styles.reqValue, r.met && { color: MET_INK }]} numberOfLines={1}>{value}</Text>}
      </View>
      <View style={styles.reqTrack}>
        <View style={[styles.reqFill, { width: `${Math.max(r.met ? 100 : 4, r.pct)}%`, backgroundColor: r.met ? MET : sd.accent }]} />
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingTop: spacing.xs, paddingBottom: 10,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: sr.pill, backgroundColor: sd.fill,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 16.5, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -0.33 },
  subtitle: { fontSize: 11.5, color: sd.muted },

  chip: { borderRadius: sr.pill, paddingHorizontal: 9, paddingVertical: 4 },
  chipOn: { backgroundColor: sd.upWash },
  chipOff: { backgroundColor: sd.fill },
  chipWait: { backgroundColor: AMBER_WASH },
  chipText: { fontSize: 10.5, fontWeight: font.weightHeavy, letterSpacing: 0.3 },
  chipTextOn: { color: sd.up },
  chipTextOff: { color: sd.muted },
  chipTextWait: { color: AMBER },

  /* Tabs */
  tabRow: { flexDirection: "row", gap: 6, paddingHorizontal: 18, paddingTop: 4, paddingBottom: 10 },
  tab: { flex: 1, alignItems: "center", borderRadius: sr.pill, paddingVertical: 11 },
  tabOn: { backgroundColor: sd.ink },
  tabOff: { backgroundColor: sd.fill },
  tabText: { fontSize: 12.5, fontWeight: font.weightHeavy },
  tabTextOn: { color: "#FFFFFF" },
  tabTextOff: { color: sd.muted },

  scroll: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 28 },

  /* Hero */
  hero: { borderRadius: 22, backgroundColor: sd.ink, padding: 18, gap: 14, overflow: "hidden" },
  glow: { position: "absolute", top: -90, right: -60 },
  heroIcon: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  blurb: { fontSize: 13, color: "rgba(255,255,255,0.62)", lineHeight: 20 },
  /** The screens set the second half of the hero line in warm amber. */
  blurbHi: { color: "#E8B87A" },
  strip: { flexDirection: "row", borderRadius: 14, backgroundColor: "rgba(255,255,255,0.07)", overflow: "hidden" },
  stripCell: { flex: 1, alignItems: "center", gap: 3, paddingVertical: 12, paddingHorizontal: 6 },
  stripDivider: { borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.07)" },
  stripValue: { fontSize: 14, fontWeight: font.weightHeavy, color: "#FFFFFF", letterSpacing: -0.28 },
  stripLabel: { fontSize: 9.5, color: "rgba(255,255,255,0.45)" },

  /* Sections */
  sectionLabel: {
    fontSize: 12, fontWeight: font.weightBold, color: sd.muted,
    letterSpacing: 0.72, paddingTop: 24, paddingBottom: 10,
  },
  listCard: { borderWidth: 1, borderColor: sd.line, borderRadius: sr.panel, paddingHorizontal: 16, paddingVertical: 2 },
  panel: { borderWidth: 1, borderColor: sd.line, borderRadius: sr.panel, padding: 16 },

  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: sd.fillSoft,
  },
  rowIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: sd.fill, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 13.5, fontWeight: font.weightBold, color: sd.text, letterSpacing: -0.14 },
  rowSub: { fontSize: 11.5, color: sd.muted },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 5 },
  rowValue: { fontSize: 12, fontWeight: font.weightBold, color: sd.muted, maxWidth: 130 },

  /* Rules */
  ruleRow: { flexDirection: "row", alignItems: "flex-start", gap: 11 },
  ruleNum: { width: 20, height: 20, borderRadius: 10, backgroundColor: sd.fill, alignItems: "center", justifyContent: "center" },
  ruleNumText: { fontSize: 10, fontWeight: font.weightHeavy, color: sd.muted },
  ruleText: { flex: 1, minWidth: 0, fontSize: 12.5, color: sd.slate, lineHeight: 18.75 },

  /* Unlocks */
  unlockRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  tick: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  tickOn: { backgroundColor: sd.up },
  tickOff: { backgroundColor: sd.fill },
  unlockText: { flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: font.weightMedium, color: sd.slate },

  /* Activity */
  actAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  actInitial: { fontSize: 13, fontWeight: font.weightHeavy, color: "#FFFFFF", fontStyle: "italic" },
  actAmount: { fontSize: 13, fontWeight: font.weightHeavy, color: "#1F7A5A" },
  actWhen: { fontSize: 10, color: sd.faint },

  /* Requirements tab */
  ringCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderWidth: 1, borderColor: sd.line, borderRadius: 22, padding: 18,
  },
  ring: { width: 60, height: 60, alignItems: "center", justifyContent: "center" },
  ringInner: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  ringText: { fontSize: 13, fontWeight: font.weightHeavy, color: sd.text },
  ringLabel: { fontSize: 14.5, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -0.29 },
  ringGap: { fontSize: 11.5, color: sd.muted, lineHeight: 16.7 },

  reqCard: { borderWidth: 1, borderColor: sd.line, borderRadius: 18, padding: 14, gap: 10 },
  reqHead: { flexDirection: "row", alignItems: "center", gap: 11 },
  reqToken: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  reqTokenOn: { backgroundColor: MET },
  reqTokenOff: { backgroundColor: TOKEN_OFF },
  reqTokenNum: { fontSize: 12, fontWeight: font.weightHeavy, color: sd.faint },
  reqLabel: { fontSize: 13.5, fontWeight: font.weightBold, color: sd.text, letterSpacing: -0.14 },
  reqSub: { fontSize: 11.5, color: sd.muted },
  reqValue: { fontSize: 11.5, fontWeight: font.weightHeavy, color: sd.muted },
  /* Indented to clear the 26pt token, so the bar starts under the label. */
  reqTrack: { height: 6, borderRadius: sr.pill, backgroundColor: sd.fill, overflow: "hidden", marginLeft: 37 },
  reqFill: { height: "100%", borderRadius: sr.pill },

  /* Availability */
  availRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  countryWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingTop: 12 },
  countryChip: { borderRadius: sr.pill, backgroundColor: sd.fill, paddingHorizontal: 10, paddingVertical: 5 },
  countryChipText: { fontSize: 11.5, fontWeight: font.weightMedium, color: sd.slate },

  /* Blockers */
  blocker: { flexDirection: "row", alignItems: "center", gap: 11, borderRadius: 18, backgroundColor: DANGER_WASH, padding: 14 },
  blockerIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  blockerLabel: { fontSize: 13, fontWeight: font.weightBold, color: DANGER_INK },
  blockerSub: { fontSize: 11.5, color: DANGER_SUB },
  blockerBtn: { borderRadius: sr.pill, backgroundColor: sd.down, paddingHorizontal: 14, paddingVertical: 8 },
  blockerBtnText: { fontSize: 11.5, fontWeight: font.weightBold, color: "#FFFFFF" },

  /* Actions */
  actionRow: { flexDirection: "row", gap: 8, paddingTop: 20 },
  action: {
    flex: 1, height: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
    borderRadius: sr.pill, borderWidth: 1, borderColor: sd.line, backgroundColor: sd.page,
  },
  actionText: { fontSize: 12.5, fontWeight: font.weightBold, color: sd.text },

  /* Footnote + footer */
  footnote: { flexDirection: "row", alignItems: "flex-start", gap: 9, paddingTop: 18 },
  footnoteText: { flex: 1, minWidth: 0, fontSize: 11.5, color: sd.muted, lineHeight: 17.25 },

  footer: {
    paddingHorizontal: 18, paddingTop: 12, paddingBottom: 26, gap: 9,
    borderTopWidth: 1, borderTopColor: sd.divider, backgroundColor: sd.page,
  },
  cta: { height: 52, borderRadius: sr.pill, backgroundColor: sd.ink, alignItems: "center", justifyContent: "center" },
  ctaMuted: { backgroundColor: sd.fill },
  ctaText: { fontSize: 14, fontWeight: font.weightHeavy, color: "#FFFFFF", letterSpacing: -0.14 },
  ctaTextMuted: { color: sd.faint },
  ctaNote: { fontSize: 11.5, color: sd.muted, textAlign: "center" },
  agreeNote: { marginTop: 6, fontSize: 10.5, color: sd.faint, textAlign: "center", lineHeight: 14 },
  agreeLink: { fontSize: 10.5, color: sd.muted, fontWeight: font.weightBold },
});
