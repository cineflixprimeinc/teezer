import { useState, type ReactNode } from "react";
import {
  ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView,
  StyleSheet, Switch, Text, View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3, Calendar, ChevronDown, ChevronLeft, ChevronRight, Copy, Layers,
  MapPin, Megaphone, MoreHorizontal, MousePointerClick, Pencil, Target, Users, Wallet, FileText,
} from "lucide-react-native";
import { promotionApi, type Promotion, type RangeStat } from "@/api/promotion.api";
import { apiErrorMessage } from "@/api/client";
import { colors } from "@/constants/colors";
import { font } from "@/constants/theme";

/* ── money / number formatting (self-contained) ───────────────────────────── */
const CUR: Record<string, string> = { USD: "$", INR: "₹", NPR: "Rs ", EUR: "€", GBP: "£", AED: "AED ", PKR: "Rs ", BDT: "৳ " };
const sym = (c = "USD") => CUR[c] ?? `${c} `;
const money = (v: number, c = "USD", d = 2) => {
  const [i, dec] = (Number.isFinite(v) ? v : 0).toFixed(d).split(".");
  return `${sym(c)}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${dec !== undefined ? "." + dec : ""}`;
};
const moneyC = (cents: number, c = "USD") => money((cents || 0) / 100, c);
const costC = (cents: number, c = "USD") => { const v = (cents || 0) / 100; return money(v, c, v > 0 && v < 1 ? 4 : 2); };
const compact = (n: number) =>
  n >= 1_000_000 ? (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M"
  : n >= 1_000 ? (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K" : String(n || 0);

const STATUS: Record<string, { label: string; color: string; tint: string }> = {
  Active:          { label: "Active",        color: "#16a34a", tint: "#e7f8ee" },
  Off:             { label: "Off",           color: "#6b7280", tint: "#f1f2f4" },
  Completed:       { label: "Completed",     color: "#2563eb", tint: "#e8f0fe" },
  "In review":     { label: "In review",     color: "#d97706", tint: "#fef3c7" },
  Rejected:        { label: "Rejected",      color: "#dc2626", tint: "#fde8e8" },
  "Needs changes": { label: "Needs changes", color: "#f97316", tint: "#fff1e6" },
};

// Keep these identical to the wizard's PLACEMENTS labels (CreateCampaignWizard) so
// the placement name the advertiser picked never appears to "change" after publishing.
const PLACEMENT_LABEL: Record<string, string> = {
  in_feed: "In-Feed Videos", profile_top: "Profile Top", hashtag: "Hashtag Page",
  search: "Search Results", explore: "Explore Page", inbox: "Inbox (Messages)",
};

const CTA_LABEL: Record<string, string> = {
  learn_more: "Learn More", shop_now: "Shop Now", sign_up: "Sign Up", download: "Download",
  watch_more: "Watch More", book_now: "Book Now", contact_us: "Contact Us", get_offer: "Get Offer",
  visit_website: "Visit Website", send_message: "Send Message", order_now: "Order Now",
  subscribe: "Subscribe", none: "No button",
};

type Range = "last_30" | "max" | "today";

export function AdDetailModal({ promotionId, currency, onClose, onEdit, onDuplicate, onMore }: {
  promotionId: number | null;
  currency: string;
  onClose: () => void;
  onEdit: (p: Promotion) => void;
  onDuplicate: (p: Promotion) => void;
  onMore: (p: Promotion) => void;
}) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [range, setRange] = useState<Range>("max");
  const [expanded, setExpanded] = useState(false);

  const detailQ = useQuery({
    queryKey: ["studio-ad-detail", promotionId],
    queryFn: () => promotionApi.detail(promotionId as number),
    enabled: promotionId != null,
  });

  const toggleM = useMutation({
    mutationFn: (active: boolean) => promotionApi.toggle(promotionId as number, active),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["studio-ad-detail", promotionId] });
      qc.invalidateQueries({ queryKey: ["studio-ads-overview"] });
    },
    onError: (e) => Alert.alert("Couldn't update", apiErrorMessage(e, "Please try again.")),
  });

  const d = detailQ.data;
  const p = d?.promotion;
  const cur = d?.currency ?? currency;
  const on = p?.status === "active";
  const st = STATUS[d?.delivery ?? ""] ?? STATUS.Off;
  const stat: RangeStat | undefined = d?.stats[range];

  /* Only the rows the advertiser actually set. */
  const rows = buildRows(d);

  return (
    <Modal visible={promotionId != null} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={[s.root, { paddingTop: insets.top }]}>
        {/* Header - kept minimal: back · title · overflow. Status + on/off live in
            their own control card below so nothing is crammed into the top bar. */}
        <View style={s.header}>
          <Pressable hitSlop={10} onPress={onClose} style={s.hIconBtn}><ChevronLeft size={22} color={colors.text} strokeWidth={2} /></Pressable>
          <Text style={s.hTitle}>Ad Details</Text>
          {!!d && <View style={[s.statusPill, { backgroundColor: st.tint }]}><Text style={[s.statusText, { color: st.color }]}>{st.label}</Text></View>}
          <View style={{ flex: 1 }} />
          {!!p && (
            <Pressable hitSlop={10} onPress={() => onMore(p)} style={s.hMoreBtn}><MoreHorizontal size={20} color={colors.text} /></Pressable>
          )}
        </View>

        {detailQ.isLoading || !d || !p ? (
          <View style={s.center}><ActivityIndicator color={colors.brand} /></View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
            {/* Hero */}
            <View style={s.hero}>
              {p.video?.thumbnail_url
                ? <Image source={{ uri: p.video.thumbnail_url }} style={s.heroThumb} />
                : <View style={[s.heroThumb, s.heroThumbEmpty]}><Megaphone size={20} color={colors.textFaint} /></View>}
              <View style={{ flex: 1 }}>
                <View style={s.heroTitleRow}>
                  <Text style={s.heroTitle} numberOfLines={1}>Promotion #{p.id}</Text>
                  <Pressable hitSlop={8} onPress={() => onEdit(p)}><Pencil size={14} color={colors.textMuted} /></Pressable>
                </View>
                {!!d.cam_id && (
                  <Pressable style={s.idRow} onPress={() => { Clipboard.setStringAsync(d.cam_id!); Alert.alert("Copied", d.cam_id!); }}>
                    <Text style={s.idText}>ID: {d.cam_id}</Text><Copy size={12} color={colors.textFaint} />
                  </Pressable>
                )}
                <View style={s.heroMeta}>
                  <View style={[s.dot, { backgroundColor: st.color }]} />
                  <Text style={s.heroMetaText}>{st.label}</Text>
                  <Text style={s.heroSep}>·</Text>
                  <Text style={s.heroMetaText}>{d.objective_label}</Text>
                </View>
              </View>
            </View>

            {/* On/Off control - only for approved ads (active/paused). Its own card so
                the toggle has room to breathe instead of being squeezed into the header. */}
            {!!d.can_toggle && (
              <View style={s.controlCard}>
                <View style={[s.controlDot, { backgroundColor: on ? colors.success : colors.textFaint }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.controlTitle}>{on ? "Campaign is on" : "Campaign is off"}</Text>
                  <Text style={s.controlSub}>
                    {on ? "Your ad is delivering to your audience." : "Turn on to deliver. Turn off to pause it anytime."}
                  </Text>
                </View>
                {toggleM.isPending
                  ? <ActivityIndicator color={colors.brand} style={{ marginRight: 6 }} />
                  : (
                    <Switch
                      value={on}
                      onValueChange={(v) => toggleM.mutate(v)}
                      trackColor={{ false: "#e5e7eb", true: colors.brand }}
                      thumbColor="#ffffff"
                      ios_backgroundColor="#e5e7eb"
                    />
                  )}
              </View>
            )}

            {/* Edit / Duplicate */}
            <View style={s.actionRow}>
              <Pressable style={s.actionBtn} onPress={() => onEdit(p)}><Pencil size={15} color={colors.text} /><Text style={s.actionBtnText}>Edit</Text></Pressable>
              <Pressable style={s.actionBtn} onPress={() => onDuplicate(p)}><Copy size={15} color={colors.text} /><Text style={s.actionBtnText}>Duplicate</Text></Pressable>
            </View>

            {/* Setup details - only what the user set */}
            <View style={s.card}>
              {(expanded ? rows : rows.slice(0, 4)).map((r, i, arr) => (
                <View key={r.key}>
                  <View style={s.detailRow}>
                    <View style={[s.detailIcon, { backgroundColor: r.tint }]}>{r.icon}</View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.detailLabel}>{r.label}</Text>
                      {r.lines.map((ln, k) => <Text key={k} style={s.detailValue}>{ln}</Text>)}
                    </View>
                    <ChevronRight size={16} color={colors.textFaint} />
                  </View>
                  {i < arr.length - 1 && <View style={s.rowDiv} />}
                </View>
              ))}
              {rows.length > 4 && (
                <Pressable style={s.showMore} onPress={() => setExpanded((v) => !v)}>
                  <ChevronDown size={16} color={colors.textMuted} style={expanded ? { transform: [{ rotate: "180deg" }] } : undefined} />
                  <Text style={s.showMoreText}>{expanded ? "Show less" : "Show more"}</Text>
                </Pressable>
              )}
            </View>

            {/* Results */}
            <View style={s.card}>
              <View style={s.cardHead}>
                <Text style={s.cardTitle}>Results</Text>
                <Pressable style={s.linkRow} onPress={() => onMore(p)}>
                  <Text style={s.link}>View Performance</Text><BarChart3 size={13} color={colors.brand} />
                </Pressable>
              </View>

              <View style={s.segment}>
                {(["last_30", "max", "today"] as Range[]).map((rk) => (
                  <Pressable key={rk} style={[s.segBtn, range === rk && s.segBtnActive]} onPress={() => setRange(rk)}>
                    <Text style={[s.segText, range === rk && s.segTextActive]}>{rk === "last_30" ? "Last 30 days" : rk === "max" ? "Maximum" : "Today"}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={s.metricsRow}>
                <Metric value={compact(stat?.result_count ?? 0)} label={stat?.result_label ?? "Results"} />
                <View style={s.mDiv} />
                <Metric value={costC(stat?.cost_per_result_cents ?? 0, cur)} label={`Cost per ${(stat?.result_label ?? "result").replace(/s$/, "")}`} />
                <View style={s.mDiv} />
                <Metric value={moneyC(stat?.spent_cents ?? 0, cur)} label="Amount spent" />
              </View>

              <Pressable style={s.budgetLine} onPress={() => onEdit(p)}>
                <Text style={s.budgetText}>{moneyC(d.daily_budget_cents, cur)} daily budget</Text>
                <Pencil size={12} color={colors.brand} />
              </Pressable>

              <View style={s.rowDiv} />
              <View style={s.reachRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.reachValue}>{compact(stat?.reach ?? 0)}</Text>
                  <Text style={s.reachLabel}>Reach</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.reachValue}>{compact(stat?.impressions ?? 0)}</Text>
                  <Text style={s.reachLabel}>Impressions</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.reachValue}>{compact(d.engagement ?? 0)}</Text>
                  <Text style={s.reachLabel}>Engagement</Text>
                </View>
              </View>
            </View>

            {/* Ad Set */}
            <View style={s.card}>
              <Text style={s.cardTitle}>Ad Set</Text>
              <View style={[s.adSetRow, { marginTop: 10 }]}>
                <View style={[s.dot, { backgroundColor: on ? colors.success : colors.textFaint }]} />
                <Text style={s.adSetStatus}>{on ? "Campaign on" : "Campaign off"}</Text>
              </View>
              <View style={[s.adSetRow, { marginTop: 8 }]}>
                <Target size={13} color={colors.brand} strokeWidth={2.4} />
                <Text style={s.adSetGoal}>Goal: {d.objective_label}</Text>
              </View>
              <Text style={s.adSetTitle} numberOfLines={1}>Post: “{p.video?.title || p.video?.caption || `Video #${p.video_id}`}”</Text>
              {(p.start_date || p.end_date) && (
                <Text style={s.adSetSub}>{fmtDate(p.start_date)} – {p.end_date ? fmtDate(p.end_date) : "Continuous"}</Text>
              )}
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <View style={s.metric}>
      <Text style={s.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
      <Text style={s.metricLabel} numberOfLines={2}>{label}</Text>
    </View>
  );
}

/* Builds only the detail rows the advertiser actually set. */
type Row = { key: string; label: string; lines: string[]; icon: ReactNode; tint: string };
function buildRows(d?: import("@/api/promotion.api").PromotionDetail): Row[] {
  if (!d) return [];
  const p = d.promotion;
  const out: Row[] = [];

  // Audience - only the facets that were set.
  const aud: string[] = [];
  const loc = [p.city || p.region, p.country].filter(Boolean).join(", ");
  if (loc) aud.push(loc);
  const gender = p.gender && p.gender !== "all" ? (p.gender === "male" ? "Men" : "Women") : "Everyone";
  aud.push(`${gender}${p.age_range ? `, ages ${p.age_range}` : ""}`);
  if (p.interests && p.interests.length) aud.push(p.interests.join(", "));
  out.push({ key: "audience", label: "Audience", lines: aud, tint: "#ffe4ec", icon: <Users size={17} color={colors.brand} /> });

  // Placements - only if the advertiser chose them.
  if (p.placements && p.placements.length) {
    out.push({ key: "placements", label: "Placements", lines: [p.placements.map((x) => PLACEMENT_LABEL[x] ?? x).join(", ")], tint: "#ede9fe", icon: <Layers size={17} color="#7c3aed" /> });
  }

  // Post
  const postTitle = p.video?.title || p.video?.caption;
  if (postTitle) out.push({ key: "post", label: "Post", lines: [`Post: “${postTitle}”`], tint: "#fde8ef", icon: <FileText size={17} color="#db2777" /> });

  // Budget (always set). If the advertiser entered a non-USD currency, show what
  // they set alongside the USD amount the ad actually spends in.
  const budgetLines = [`${moneyC(d.daily_budget_cents, d.currency)} per day`, `${moneyC(d.total_budget_cents, d.currency)} total`];
  if (d.original_currency && d.original_daily_budget_cents != null) {
    budgetLines.push(`You set ${moneyC(d.original_daily_budget_cents, d.original_currency)}/day (${d.original_currency})`);
  }
  out.push({ key: "budget", label: "Budget", lines: budgetLines, tint: "#fff1d6", icon: <Wallet size={17} color="#f59e0b" /> });

  // Schedule - only if dates set.
  if (p.start_date || p.end_date) {
    out.push({ key: "schedule", label: "Schedule", lines: [`${fmtDate(p.start_date)} – ${p.end_date ? fmtDate(p.end_date) : "Continuous"}`], tint: "#dcfce7", icon: <Calendar size={17} color="#16a34a" /> });
  }

  // Ad name / headline - only if set.
  const adName = p.headline || p.display_name;
  if (adName) out.push({ key: "adname", label: "Ad name", lines: [adName], tint: "#dbeafe", icon: <Target size={17} color="#2563eb" /> });

  // Call to action - the button label shown on the sponsored card ("none" = no button).
  if (p.cta_type && p.cta_type !== "none") out.push({ key: "cta", label: "Call to action", lines: [CTA_LABEL[p.cta_type] ?? p.cta_type], tint: "#e0e7ff", icon: <MousePointerClick size={17} color="#4f46e5" /> });

  // Destination - only if a CTA link was set.
  if (p.destination_url) out.push({ key: "dest", label: "Destination", lines: [p.destination_url], tint: "#e0f2fe", icon: <MapPin size={17} color="#0284c7" /> });

  return out;
}

function fmtDate(v?: string | null): string {
  if (!v) return "-";
  const dt = new Date(v);
  if (isNaN(dt.getTime())) return v;
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgMuted },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  hIconBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  hMoreBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.bgMuted },
  hTitle: { fontSize: 17, fontWeight: font.weightBold, color: colors.text },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: font.weightBold },
  togglePill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.bgMuted, borderRadius: 999, paddingLeft: 10, paddingRight: 4, paddingVertical: 3 },
  toggleLabel: { fontSize: 11.5, fontWeight: font.weightBold },

  hero: { flexDirection: "row", gap: 12, padding: 16, backgroundColor: colors.bg },
  heroThumb: { width: 68, height: 92, borderRadius: 10, backgroundColor: "#000" },
  heroThumbEmpty: { alignItems: "center", justifyContent: "center", backgroundColor: colors.bgMuted },
  heroTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  heroTitle: { fontSize: 17, fontWeight: font.weightBold, color: colors.text, flexShrink: 1 },
  idRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  idText: { fontSize: 12, color: colors.textMuted },
  heroMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  heroMetaText: { fontSize: 12.5, color: colors.textMuted, fontWeight: font.weightMedium },
  heroSep: { color: colors.textFaint },
  dot: { width: 7, height: 7, borderRadius: 4 },

  actionRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingBottom: 14, backgroundColor: colors.bg },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, height: 42, borderRadius: 10, borderWidth: 1, borderColor: colors.borderStrong },
  actionBtnText: { fontSize: 14, fontWeight: font.weightBold, color: colors.text },

  controlCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginHorizontal: 12, marginTop: 12, padding: 16,
    backgroundColor: colors.bg, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
  },
  controlDot: { width: 9, height: 9, borderRadius: 5 },
  controlTitle: { fontSize: 14.5, fontWeight: font.weightBold, color: colors.text },
  controlSub: { marginTop: 2, fontSize: 12, color: colors.textMuted, lineHeight: 16 },

  card: { backgroundColor: colors.bg, borderRadius: 14, marginHorizontal: 12, marginTop: 12, padding: 16 },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: font.weightBold, color: colors.text },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  link: { fontSize: 12.5, fontWeight: font.weightBold, color: colors.brand },

  detailRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  detailIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  detailLabel: { fontSize: 14.5, fontWeight: font.weightBold, color: colors.text },
  detailValue: { fontSize: 12.5, color: colors.textMuted, marginTop: 2, lineHeight: 17 },
  rowDiv: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  showMore: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingTop: 12 },
  showMoreText: { fontSize: 13, fontWeight: font.weightMedium, color: colors.textMuted },

  segment: { flexDirection: "row", backgroundColor: colors.bgMuted, borderRadius: 10, padding: 3, marginBottom: 16 },
  segBtn: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 8 },
  segBtnActive: { backgroundColor: colors.brandTint },
  segText: { fontSize: 12.5, fontWeight: font.weightMedium, color: colors.textMuted },
  segTextActive: { color: colors.brand, fontWeight: font.weightBold },

  metricsRow: { flexDirection: "row", alignItems: "flex-start" },
  metric: { flex: 1 },
  metricValue: { fontSize: 20, fontWeight: font.weightBold, color: colors.text },
  metricLabel: { fontSize: 11.5, color: colors.textMuted, marginTop: 3, flexDirection: "row", alignItems: "center" },
  mDiv: { width: StyleSheet.hairlineWidth, alignSelf: "stretch", backgroundColor: colors.border, marginHorizontal: 12 },

  budgetLine: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6, marginTop: 12 },
  budgetText: { fontSize: 12.5, fontWeight: font.weightBold, color: colors.brand },

  reachRow: { flexDirection: "row", marginTop: 14 },
  reachValue: { fontSize: 18, fontWeight: font.weightBold, color: colors.text },
  reachLabel: { fontSize: 11.5, color: colors.textMuted, marginTop: 3 },

  adSetRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  adSetStatus: { fontSize: 12.5, color: colors.textMuted, fontWeight: font.weightMedium },
  adSetGoal: { fontSize: 12.5, color: colors.brand, fontWeight: font.weightBold },
  adSetTitle: { fontSize: 14, fontWeight: font.weightBold, color: colors.text, marginTop: 8 },
  adSetSub: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
});
