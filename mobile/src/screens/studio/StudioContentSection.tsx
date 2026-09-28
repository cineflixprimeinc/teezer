import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import {
  ListFilter, Search, Film, MoreHorizontal, Play, Heart, MessageCircle,
  Globe, Pencil, Clock, Lock, EyeOff, Ban, Flag, Upload as UploadIcon, Plus, BarChart2,
  Calendar, ChevronLeft, ChevronRight, Trash2, Info,
  type LucideIcon,
} from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BottomSheet } from "@/components/BottomSheet";
import { Skeleton } from "@/components/Skeleton";
import { studioApi, type ContentSort, type ContentStatus } from "@/api/studio.api";
import { creatorApi } from "@/api/creator.api";
import { usePostViewer } from "@/store/post-viewer.store";
import { sd, sr } from "./studio-design";
import { font, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";
import { formatCompact, formatDuration } from "@/utils/format";
import type { Video } from "@/types";

type StatusTab = "all" | ContentStatus;
/** Same five filters the section has always had. "Posted" is the design's word
 *  for the `published` status - the value sent to the API is unchanged. */
const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "published", label: "Posted" },
  { key: "draft", label: "Drafts" },
  { key: "scheduled", label: "Scheduled" },
  { key: "private", label: "Private" },
];

const SORTS: { value: ContentSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "most_viewed", label: "Most viewed" },
  { value: "most_liked", label: "Most liked" },
];

// One list page at a time, not an ever-growing infinite-scroll feed - a
// creator with hundreds of posts would otherwise keep every one of them
// mounted and rendered at once. `/studio/content` already paginates
// (min 5, max 50 per page); this is deliberately on the small side.
const PER_PAGE = 12;

/** The status pill beside each card's "Posted X ago" line. Reads the post's
 *  real `status` - the app has no friends-only visibility, so nothing here is
 *  inferred. Colours/icons match the studio prototype's own two-tone wash
 *  pills (public=green, draft=amber, scheduled=blue); private/unlisted/removed
 *  aren't in the prototype, so they borrow the closest existing `sd` tokens. */
const STATUS_BADGE: Record<string, { label: string; bg: string; fg: string; icon: LucideIcon }> = {
  published: { label: "PUBLIC", bg: "#EAF6F0", fg: "#1F7A5A", icon: Globe },
  draft: { label: "DRAFT", bg: "#FFF6E5", fg: "#8A6A2F", icon: Pencil },
  scheduled: { label: "SCHEDULED", bg: "#EAF3FD", fg: "#2F7AB8", icon: Clock },
  private: { label: "PRIVATE", bg: sd.fill, fg: sd.slate, icon: Lock },
  unlisted: { label: "UNLISTED", bg: sd.fill, fg: sd.slate, icon: EyeOff },
  removed: { label: "REMOVED", bg: sd.downWash, fg: sd.down, icon: Ban },
};

/** The kebab's "Privacy" section - the same three visibility states the
 *  status pill already renders (public/private/unlisted), just offered as
 *  a real, tappable choice instead of a read-only label. */
const PRIVACY_OPTIONS: { value: ContentStatus; label: string; Icon: LucideIcon }[] = [
  { value: "published", label: "Public", Icon: Globe },
  { value: "private", label: "Private", Icon: Lock },
  { value: "unlisted", label: "Unlisted", Icon: EyeOff },
];

/**
 * Creators had no visibility into transcode state anywhere in the app - only
 * this "still working" / "something went wrong" pill, shown over the
 * thumbnail while hls_status is queued/processing/failed. Nothing shown for
 * ready (the normal, done state), unavailable (non-video content - nothing
 * to process), or null (pre-pipeline rows). VideoResource already sends
 * hls_status on every item; this is a read-only surface, no new endpoint.
 */
function processingLabel(hlsStatus: Video["hls_status"]): string | null {
  switch (hlsStatus) {
    case "queued":
    case "processing":
      return "Processing…";
    case "failed":
      return "Processing failed";
    default:
      return null;
  }
}

function useDebounced<T>(value: T, ms = 400): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** "Posted 2 days ago" / "Saved 3 hours ago" - relative, for everything except
 *  a scheduled post's own go-out time (see formatScheduled below). */
function ago(iso?: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  const abs = Math.abs(mins);
  const unit =
    abs < 60 ? [abs, "minute"] :
    abs < 1440 ? [Math.round(abs / 60), "hour"] :
    abs < 10080 ? [Math.round(abs / 1440), "day"] :
    abs < 43200 ? [Math.round(abs / 10080), "week"] :
    abs < 525600 ? [Math.round(abs / 43200), "month"] :
    [Math.round(abs / 525600), "year"];
  const n = Math.max(1, unit[0] as number);
  const word = `${n} ${unit[1]}${n === 1 ? "" : "s"}`;
  return mins >= 0 ? `${word} ago` : `in ${word}`;
}

/** "5 Aug, 8:00 PM" - a scheduled post is dated by the absolute time it goes
 *  out, not a relative offset (the design's own wording for this row). */
function formatScheduled(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date}, ${time}`;
}

/* ── Calendar helpers ── */
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}
function fmtShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** The per-card action row, status-driven. Publish / Post now / Make public
 *  are the exact same real mutation (PATCH .../status → published) - only the
 *  label and icon change to match what the design calls that action for each
 *  status. Edit / Insight / Promote / Reschedule have no screen behind them
 *  yet anywhere in Studio, so they stay the same "coming soon" stub the old
 *  kebab menu already used - nothing new is being promised here. */
function buildActions(
  status: string,
  h: { onPublish: () => void; comingSoon: (what: string) => void; onInsights: () => void; onEdit: () => void },
): { label: string; Icon: LucideIcon; onPress: () => void; solid?: boolean; accent?: boolean }[] {
  const edit = { label: "Edit", Icon: Pencil, onPress: h.onEdit };
  switch (status) {
    case "published":
      return [
        edit,
        { label: "Insight", Icon: BarChart2, onPress: h.onInsights },
        { label: "Promote", Icon: Flag, onPress: () => h.comingSoon("Promote"), accent: true },
      ];
    case "draft":
      return [edit, { label: "Publish", Icon: UploadIcon, onPress: h.onPublish, solid: true }];
    case "scheduled":
      return [
        edit,
        { label: "Reschedule", Icon: Clock, onPress: () => h.comingSoon("Reschedule") },
        { label: "Post now", Icon: Play, onPress: h.onPublish, solid: true },
      ];
    case "private":
    case "unlisted":
      return [edit, { label: "Make public", Icon: Globe, onPress: h.onPublish, solid: true }];
    default:
      return [edit];
  }
}

/* ── One card: thumb + status pill, stats (published only), action row ── */
function ContentRow({ video, onPress, onMenu, onPublish, onInsights, onEdit, comingSoon }: {
  video: Video;
  onPress: () => void;
  onMenu: () => void;
  onPublish: () => void;
  onInsights: () => void;
  onEdit: () => void;
  comingSoon: (what: string) => void;
}) {
  const status = video.status ?? "published";
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.published;
  const BadgeIcon = badge.icon;
  const scheduled = status === "scheduled" && !!video.scheduled_at;
  const when = scheduled
    ? `Scheduled ${formatScheduled(video.scheduled_at)}`
    : status === "published"
      ? `Posted ${ago(video.created_at)}`
      : `Saved ${ago(video.created_at)}`;
  const processing = processingLabel(video.hls_status);
  const actions = buildActions(status, { onPublish, comingSoon, onInsights, onEdit });

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Pressable style={styles.thumbWrap} onPress={onPress}>
          {video.thumbnail_url ? (
            <Image source={video.thumbnail_url} style={styles.thumb} contentFit="cover" transition={150} />
          ) : (
            <View style={[styles.thumb, styles.thumbFallback]}>
              <Film size={18} color={sd.faint} />
            </View>
          )}
          {!!video.duration && (
            <LinearGradient
              colors={["transparent", "rgba(10,9,12,0.75)"]}
              style={styles.thumbGradient}
              pointerEvents="none"
            >
              <Play size={9} color="#FFFFFF" fill="#FFFFFF" strokeWidth={0} />
              <Text style={styles.thumbDuration}>{formatDuration(video.duration)}</Text>
            </LinearGradient>
          )}
          {processing && (
            <View style={styles.processingOverlay} pointerEvents="none">
              {video.hls_status !== "failed" && <ActivityIndicator color="#FFFFFF" size="small" />}
              <Text style={styles.processingText}>{processing}</Text>
            </View>
          )}
        </Pressable>

        <View style={styles.cardBody}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.caption} numberOfLines={1}>
              {video.title || video.caption || "Untitled"}
            </Text>
            <Pressable hitSlop={10} style={styles.kebab} onPress={onMenu}>
              <MoreHorizontal size={16} color={sd.muted} strokeWidth={2.4} />
            </Pressable>
          </View>
          <View style={styles.statusRow}>
            <View style={[styles.statusPill, { backgroundColor: badge.bg }]}>
              <BadgeIcon size={11} color={badge.fg} strokeWidth={2.2} />
              <Text style={[styles.statusPillText, { color: badge.fg }]}>{badge.label}</Text>
            </View>
            <Text style={styles.when} numberOfLines={1}>{when}</Text>
          </View>
        </View>
      </View>

      {status === "published" && (
        <View style={styles.statsStrip}>
          <Stat icon={Play} value={formatCompact(video.views_count)} label="Views" />
          <Stat icon={Heart} value={formatCompact(video.likes_count)} label="Likes" divider />
          <Stat icon={MessageCircle} value={formatCompact(video.comments_count)} label="Comments" divider />
        </View>
      )}

      <View style={styles.actionRow}>
        {actions.map((a) => (
          <Pressable
            key={a.label}
            style={[styles.actionBtn, a.solid && styles.actionBtnSolid, a.accent && styles.actionBtnAccent]}
            onPress={a.onPress}
          >
            <a.Icon size={13} color={a.solid ? "#FFFFFF" : a.accent ? sd.accent : sd.slate} strokeWidth={2.1} />
            <Text style={[styles.actionText, a.solid && styles.actionTextSolid, a.accent && styles.actionTextAccent]}>
              {a.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Stat({ icon: Icon, value, label, divider }: { icon: LucideIcon; value: string; label: string; divider?: boolean }) {
  return (
    <View style={[styles.stat, divider && styles.statDivider]}>
      <View style={styles.statTop}>
        <Icon size={13} color={sd.muted} strokeWidth={2} />
        <Text style={styles.statValue}>{value}</Text>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function HeroStat({ value, label, divider }: { value: string; label: string; divider?: boolean }) {
  return (
    <View style={[styles.heroStat, divider && styles.heroStatDivider]}>
      <Text style={styles.heroStatValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.heroStatLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** Which page numbers to actually render, so a creator with hundreds of pages
 *  doesn't turn the pagination row itself into hundreds of pressables -
 *  first two, last two, and a window around the current page, with "…" gaps
 *  standing in for what's skipped. */
function pageWindow(current: number, last: number): (number | "…")[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
  const keep = new Set<number>([1, 2, last - 1, last, current - 1, current, current + 1]);
  const nums = [...keep].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const n of nums) {
    if (prev && n - prev > 1) out.push("…");
    out.push(n);
    prev = n;
  }
  return out;
}

function Pagination({ page, lastPage, onChange }: { page: number; lastPage: number; onChange: (p: number) => void }) {
  if (lastPage <= 1) return null;
  return (
    <View style={styles.pagination}>
      <Pressable disabled={page <= 1} hitSlop={8} onPress={() => onChange(page - 1)} style={[styles.pageArrow, page <= 1 && styles.pageArrowOff]}>
        <ChevronLeft size={16} color={page <= 1 ? sd.faint : sd.text} strokeWidth={2.2} />
      </Pressable>
      {pageWindow(page, lastPage).map((p, i) =>
        p === "…" ? (
          <Text key={`gap-${i}`} style={styles.pageGap}>…</Text>
        ) : (
          <Pressable key={p} style={[styles.pageNum, p === page && styles.pageNumOn]} onPress={() => onChange(p)}>
            <Text style={[styles.pageNumText, p === page && styles.pageNumTextOn]}>{p}</Text>
          </Pressable>
        ),
      )}
      <Pressable disabled={page >= lastPage} hitSlop={8} onPress={() => onChange(page + 1)} style={[styles.pageArrow, page >= lastPage && styles.pageArrowOff]}>
        <ChevronRight size={16} color={page >= lastPage ? sd.faint : sd.text} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

/** The calendar/date-range filter, opened from the header's calendar button.
 *  First tap sets the start day, second sets the end (tapping before the
 *  current start restarts the range); Apply sends both as `start_date`/
 *  `end_date` to /studio/content, which already supports filtering by the
 *  post's real published date - no backend change needed. */
function DateFilterSheet({ visible, onClose, startDate, endDate, onApply }: {
  visible: boolean;
  onClose: () => void;
  startDate: string | null;
  endDate: string | null;
  onApply: (start: string | null, end: string | null) => void;
}) {
  const { width: winWidth } = useWindowDimensions();
  // A fixed pixel size for each day cell, not a percentage width paired
  // with aspectRatio - that combination is what was rendering the
  // selected day as a stretched pill instead of a circle. Weekday header
  // cells use the exact same size so the two rows line up column for
  // column. Clamped to a sane minimum so a transient 0/negative window
  // width (e.g. mid-rotation) can never hand a native view a negative
  // dimension.
  const cell = Math.max(28, Math.floor((winWidth - spacing.lg * 2) / 7));

  const today = new Date();
  const todayIso = isoDate(today.getFullYear(), today.getMonth(), today.getDate());

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [start, setStart] = useState<string | null>(startDate);
  const [end, setEnd] = useState<string | null>(endDate);

  // Re-sync to whatever's currently applied every time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setStart(startDate);
    setEnd(endDate);
    const anchor = startDate ? new Date(`${startDate}T00:00:00`) : today;
    setViewYear(anchor.getFullYear());
    setViewMonth(anchor.getMonth());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function tapDay(day: number) {
    const iso = isoDate(viewYear, viewMonth, day);
    if (!start || end || iso < start) {
      setStart(iso);
      setEnd(null);
    } else {
      setEnd(iso);
    }
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); } else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); } else setViewMonth((m) => m + 1);
  }

  const dim = daysInMonth(viewYear, viewMonth);
  const lead = new Date(viewYear, viewMonth, 1).getDay();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];
  // Padded to a constant 6 rows (42 cells) regardless of how many a given
  // month actually needs (4-6). Otherwise the grid's own rendered height
  // changes on every Prev/Next tap, which - since this sheet uses the
  // default "auto" height - re-measures the whole sheet on every single
  // month change. That re-measurement rebuilds BottomSheet's swipe-to-
  // dismiss gesture (memoised on the measured height) right in the middle
  // of the tap that triggered it, which is what was crashing month
  // navigation. A constant cell count means the grid's height genuinely
  // never changes, so Prev/Next never touches the gesture at all.
  while (cells.length < 42) cells.push(null);

  return (
    // scrollable=false because the calendar grid is a fixed size, not a
    // list - but that means there's no managed ScrollView for the sheet's
    // own swipe-to-dismiss to coordinate against (see BottomSheet's own
    // `dragArea` doc comment). Left at the default "sheet", the pan
    // gesture wraps the whole body and intercepts every tap inside it -
    // day cells, Apply, Clear - as a potential drag before a Pressable
    // ever sees it, which is what was crashing/freezing date selection.
    // dragArea="header" (same fix DatePickerModal already uses for the
    // same reason) scopes the drag-to-dismiss gesture to the grabber/title
    // only, leaving the calendar's own touches to its own Pressables.
    <BottomSheet visible={visible} onClose={onClose} scrollable={false} dragArea="header" header={<Text style={styles.sheetTitle}>Filter by date published</Text>}>
      <View style={styles.calWrap}>
        <Text style={styles.calRangeLabel} numberOfLines={1}>
          {start && end ? `${fmtShort(start)} – ${fmtShort(end)}` : start ? `${fmtShort(start)} – select an end date` : "Select a start date"}
        </Text>

        <View style={styles.calNavRow}>
          <Pressable hitSlop={8} onPress={prevMonth} style={styles.calNavBtn}><ChevronLeft size={17} color={sd.text} strokeWidth={2.2} /></Pressable>
          <Text style={styles.calMonthLabel}>{MONTHS[viewMonth]} {viewYear}</Text>
          <Pressable hitSlop={8} onPress={nextMonth} style={styles.calNavBtn}><ChevronRight size={17} color={sd.text} strokeWidth={2.2} /></Pressable>
        </View>

        <View style={styles.calWeekRow}>
          {WEEKDAYS.map((w, i) => <Text key={i} style={[styles.calWeekday, { width: cell }]}>{w}</Text>)}
        </View>

        <View style={styles.calGrid}>
          {cells.map((day, i) => {
            if (day === null) return <View key={`b-${i}`} style={{ width: cell, height: cell }} />;
            const iso = isoDate(viewYear, viewMonth, day);
            const isStart = iso === start;
            const isEnd = iso === end;
            const inRange = !!start && !!end && iso > start && iso < end;
            const isToday = iso === todayIso;
            const isFuture = iso > todayIso;
            return (
              <Pressable
                key={iso}
                disabled={isFuture}
                onPress={() => tapDay(day)}
                style={[
                  styles.calCell,
                  { width: cell, height: cell },
                  inRange && styles.calCellInRange,
                  (isStart || isEnd) && [styles.calCellEdge, { borderRadius: cell / 2 }],
                ]}
              >
                <Text
                  style={[
                    styles.calCellText,
                    isFuture && styles.calCellTextOff,
                    isToday && !isStart && !isEnd && styles.calCellTextToday,
                    (isStart || isEnd) && styles.calCellTextEdge,
                  ]}
                >
                  {day}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Short, plain-language explainer for what tapping the grid does -
            sits in what used to be dead space between the grid and the
            action buttons. */}
        <View style={styles.calInfoRow}>
          <Info size={13} color={sd.muted} strokeWidth={2} />
          <Text style={styles.calInfoText}>
            Tap a date to filter by that day, or tap a second date to select a range.
          </Text>
        </View>

        <View style={styles.calActions}>
          <Pressable style={styles.calClearBtn} onPress={() => { setStart(null); setEnd(null); }}>
            <Text style={styles.calClearText}>Clear</Text>
          </Pressable>
          <Pressable
            disabled={!start}
            style={[styles.calApplyBtn, !start && styles.calApplyBtnOff]}
            onPress={() => onApply(start, end ?? start)}
          >
            <Text style={styles.calApplyText}>Apply</Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}

/** Teezer Studio → Content - the creator's library: total views, search,
 *  status filter, sort, date filter, and per-video actions. Every figure
 *  comes from the API (`GET /studio/content`'s `meta.counts`, the 7-day
 *  overview for the hero strip, and /studio/creator-level-page's lifetime
 *  `total_views`), never a placeholder. Loads one page of posts at a time -
 *  not an infinite feed - to keep a large library from mounting hundreds of
 *  cards at once. */
export function StudioContentSection() {
  const navigation = useNavigation<any>();
  const qc = useQueryClient();
  const listRef = useRef<FlatList<Video>>(null);

  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput, 400);
  const [status, setStatus] = useState<StatusTab>("all");
  const [sort, setSort] = useState<ContentSort>("newest");
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  // The kebab's popup - which video it's open for, or null when closed.
  const [menuFor, setMenuFor] = useState<Video | null>(null);

  // Any filter change starts back at page 1 - the old page number would
  // otherwise point at a different slice of a now-different result set.
  useEffect(() => { setPage(1); }, [status, sort, search, startDate, endDate]);

  const query = useQuery({
    queryKey: ["studio-content", status, sort, search, startDate, endDate, page],
    queryFn: () =>
      studioApi.content({
        status: status === "all" ? undefined : status,
        sort,
        search: search.trim() || undefined,
        page,
        per_page: PER_PAGE,
        start_date: startDate ?? undefined,
        end_date: endDate ?? undefined,
      }),
  });

  /* The hero's Views·7d and Shares·7d. Same key and period the Dashboard uses,
     so switching tabs reads the cache rather than refetching. */
  const overviewQ = useQuery({
    queryKey: ["studio-overview", 7],
    queryFn: () => studioApi.overview(7),
    staleTime: 60_000,
  });

  /* The hero's lifetime "Total views across all posts" - same key
     StudioToolsSection already queries, so this costs no extra request there. */
  const levelQ = useQuery({
    queryKey: ["creator-level-page"],
    queryFn: creatorApi.levelPage,
    staleTime: 60_000,
  });

  const del = useMutation({
    mutationFn: (id: number) => studioApi.deleteContent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["studio-content"] });
      qc.invalidateQueries({ queryKey: ["studio-overview"] });
    },
    onError: () => Alert.alert("Delete failed", "The video couldn't be deleted. Please try again."),
  });

  const setStatusMut = useMutation({
    mutationFn: ({ id, next }: { id: number; next: ContentStatus }) => studioApi.updateContentStatus(id, next),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["studio-content"] }),
    onError: () => Alert.alert("Update failed", "The video's status couldn't be changed. Please try again."),
  });

  const videos = query.data?.data ?? [];
  const meta = query.data?.meta;
  // counts come back on every page of /studio/content - they describe the whole
  // library, not the current filter, which is exactly what the chips want.
  const counts = meta?.counts;
  const sortLabel = SORTS.find((s) => s.value === sort)?.label ?? "Newest";
  const comingSoon = (what: string) => Alert.alert(what, "Coming soon.");
  const dateFilterActive = !!startDate;

  const countFor = (key: StatusTab): number | null => {
    if (!counts) return null;
    return key === "all" ? counts.total : (counts[key as keyof typeof counts] ?? 0);
  };

  // Opens the tapped card's own video/photo in the app, via the real,
  // already-shipped single-reel viewer (the same layer LocationFeedScreen's
  // grid and every /video/{id} deep link already open through) - NOT
  // navigation.navigate("VideoPlayer"), which this used to call. That name
  // was never registered as a route anywhere in the app (no such screen
  // exists, nothing ever consumed usePlayerStore's playlist either), so
  // every tap threw a real navigation error instead of opening the post.
  const openVideo = (index: number) => {
    const v = videos[index];
    if (v) usePostViewer.getState().showVideo(v.id);
  };

  const confirmDelete = (v: Video) =>
    Alert.alert(
      "Delete video?",
      `"${v.title || v.caption || "Untitled"}" will be removed. This can't be undone.`,
      [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => del.mutate(v.id) }],
    );

  const goToPage = (p: number) => {
    setPage(p);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const header = (
    <View>
      {/* Hero - lifetime views, Upload, and the 7-day Published/Views/Shares strip. */}
      <View style={styles.hero}>
        {/* Stands in for the prototype's radial glow - RN has no radial
            gradient, so the accent is washed in from the top-right corner. */}
        <LinearGradient
          colors={["rgba(244,43,91,0.28)", "rgba(244,43,91,0)"]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0.15, y: 0.75 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.heroTop}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.heroLabel} numberOfLines={1}>Total views across all posts</Text>
            <Text style={styles.heroValue} numberOfLines={1}>
              {levelQ.data ? formatCompact(levelQ.data.stats.total_views) : "—"}
            </Text>
          </View>
          <Pressable style={styles.heroUploadBtn} onPress={() => navigation.navigate("PostCamera")}>
            <Plus size={15} color="#FFFFFF" strokeWidth={2.6} />
            <Text style={styles.heroUploadText}>Upload</Text>
          </Pressable>
        </View>
        <View style={styles.heroStats}>
          <HeroStat value={counts ? formatCompact(counts.published) : "-"} label="Published" />
          <HeroStat value={overviewQ.data ? formatCompact(overviewQ.data.summary.views.value) : "-"} label="Views · 7d" divider />
          <HeroStat value={overviewQ.data ? formatCompact(overviewQ.data.summary.shares.value) : "-"} label="Shares · 7d" divider />
        </View>
      </View>

      {/* Search pill, with sort inside it on the right. */}
      <View style={styles.searchPill}>
        <Search size={16} color={sd.muted} strokeWidth={2} />
        <TextInput
          style={styles.searchInput}
          value={searchInput}
          onChangeText={setSearchInput}
          placeholder="Search captions and sounds"
          placeholderTextColor={sd.muted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        <Pressable hitSlop={8} style={styles.sortBtn} onPress={() => setSortSheetOpen(true)}>
          <ListFilter size={13} color={sd.text} strokeWidth={2.2} />
          <Text style={styles.sortText} numberOfLines={1}>{sortLabel}</Text>
        </Pressable>
      </View>

      {/* Status chips + the date filter. The chips are the status filter, the
          calendar button is the date filter - both apply directly to
          /studio/content, no separate filter sheet. */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {STATUS_TABS.map((t) => {
            const on = status === t.key;
            const n = countFor(t.key);
            return (
              <Pressable key={t.key} style={[styles.chip, on && styles.chipOn]} onPress={() => setStatus(t.key)}>
                <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>{t.label}</Text>
                {n !== null && n > 0 && (
                  <View style={[styles.chipCountBubble, on && styles.chipCountBubbleOn]}>
                    <Text style={[styles.chipCountText, on && styles.chipCountTextOn]}>{n}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={dateFilterActive ? "Change date filter" : "Filter by date published"}
          style={[styles.layoutBtn, dateFilterActive && styles.layoutBtnOn]}
          onPress={() => setDateFilterOpen(true)}
        >
          <Calendar size={16} color={dateFilterActive ? "#FFFFFF" : sd.text} strokeWidth={2.1} />
        </Pressable>
      </View>

      {dateFilterActive && (
        // Two SIBLING Pressables, not one nested inside the other - nesting
        // touchables is never correct in RN (the outer one can swallow taps
        // meant for the inner one).
        <View style={styles.dateChip}>
          <Pressable style={styles.dateChipTap} onPress={() => setDateFilterOpen(true)}>
            <Calendar size={11} color={sd.accent} strokeWidth={2.2} />
            <Text style={styles.dateChipText} numberOfLines={1}>
              {endDate && endDate !== startDate ? `${fmtShort(startDate!)} – ${fmtShort(endDate)}` : fmtShort(startDate!)}
            </Text>
          </Pressable>
          <Pressable hitSlop={8} onPress={() => { setStartDate(null); setEndDate(null); }}>
            <Text style={styles.dateChipClear}>✕</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  return (
    <>
      <FlatList
        ref={listRef}
        data={query.isLoading ? [] : videos}
        keyExtractor={(v) => String(v.id)}
        ListHeaderComponent={header}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => query.refetch()}
            tintColor={sd.accent}
            colors={[sd.accent]}
          />
        }
        ListEmptyComponent={
          query.isLoading ? (
            <View style={{ gap: 10, paddingTop: 14 }}>
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={172} radius={sr.panel} />)}
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIcon}><Film size={26} color={sd.faint} strokeWidth={1.9} /></View>
              <Text style={styles.emptyTitle}>
                {search ? "No matches" : dateFilterActive ? "Nothing in that range" : status === "all" ? "No content yet" : `No ${STATUS_TABS.find((t) => t.key === status)?.label.toLowerCase()}`}
              </Text>
              <Text style={styles.emptySub}>
                {search ? `Nothing found for "${search}".` : dateFilterActive ? "Try a different date range." : "Videos you post will show up here."}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          !query.isLoading && videos.length > 0 && meta ? (
            <View style={styles.footer}>
              <Text style={styles.footerCount}>
                Showing {meta.from ?? 0}-{meta.to ?? 0} of {meta.total}
              </Text>
              <Pagination page={meta.current_page} lastPage={meta.last_page} onChange={goToPage} />
            </View>
          ) : null
        }
        renderItem={({ item, index }) => (
          <ContentRow
            video={item}
            onPress={() => openVideo(index)}
            onMenu={() => setMenuFor(item)}
            onPublish={() => setStatusMut.mutate({ id: item.id, next: "published" })}
            onInsights={() => navigation.navigate("PostInsights", { id: item.id })}
            onEdit={() => navigation.navigate("PostCamera", { editVideoId: item.id })}
            comingSoon={comingSoon}
          />
        )}
      />

      <BottomSheet visible={sortSheetOpen} onClose={() => setSortSheetOpen(false)} scrollable={false}>
        <View style={styles.sheet}>
          {SORTS.map((sOpt) => (
            <Pressable key={sOpt.value} style={[styles.sheetOption, sort === sOpt.value && styles.sheetOptionActive]} onPress={() => { setSort(sOpt.value); setSortSheetOpen(false); }}>
              <Text style={[styles.sheetOptionText, sort === sOpt.value && styles.sheetOptionTextActive]}>{sOpt.label}</Text>
              {sort === sOpt.value && <Ionicons name="checkmark" size={18} color={sd.accent} />}
            </Pressable>
          ))}
        </View>
      </BottomSheet>

      <DateFilterSheet
        visible={dateFilterOpen}
        onClose={() => setDateFilterOpen(false)}
        startDate={startDate}
        endDate={endDate}
        onApply={(s, e) => { setStartDate(s); setEndDate(e); setDateFilterOpen(false); }}
      />

      {/* Kebab popup - change privacy (published/private/unlisted posts
          only - draft/scheduled/removed aren't a "privacy" choice) and
          delete. Real, same setStatusMut/del mutations the per-card action
          row and old Alert-based menu already used. */}
      <BottomSheet visible={!!menuFor} onClose={() => setMenuFor(null)} scrollable={false}>
        {menuFor && (
          <View style={styles.menuWrap}>
            <Text style={styles.menuTitle} numberOfLines={1}>{menuFor.title || menuFor.caption || "Video"}</Text>

            {["published", "private", "unlisted"].includes(menuFor.status ?? "published") && (
              <>
                <Text style={styles.menuSectionLabel}>Privacy</Text>
                {PRIVACY_OPTIONS.map((opt) => {
                  const current = menuFor.status ?? "published";
                  const active = opt.value === current;
                  return (
                    <Pressable
                      key={opt.value}
                      style={styles.menuRow}
                      onPress={() => { setStatusMut.mutate({ id: menuFor.id, next: opt.value }); setMenuFor(null); }}
                    >
                      <opt.Icon size={17} color={sd.slate} strokeWidth={2} />
                      <Text style={styles.menuRowText}>{opt.label}</Text>
                      {active && <Ionicons name="checkmark" size={18} color={sd.accent} />}
                    </Pressable>
                  );
                })}
              </>
            )}

            <Text style={styles.menuSectionLabel}>Manage</Text>
            <Pressable
              style={styles.menuRow}
              onPress={() => { const v = menuFor; setMenuFor(null); confirmDelete(v); }}
            >
              <Trash2 size={17} color={sd.down} strokeWidth={2} />
              <Text style={[styles.menuRowText, { color: sd.down }]}>Delete</Text>
            </Pressable>
          </View>
        )}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: 18, paddingTop: spacing.lg, paddingBottom: TAB_BAR_HEIGHT + spacing.xxl },

  /* Hero */
  hero: { borderRadius: sr.hero, backgroundColor: sd.ink, padding: 16, gap: 15, overflow: "hidden" },
  heroTop: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  heroLabel: { fontSize: 11.5, fontWeight: font.weightBold, color: "rgba(255,255,255,0.5)" },
  heroValue: { marginTop: 5, fontSize: 36, fontWeight: font.weightHeavy, color: "#FFFFFF", letterSpacing: -1.8, lineHeight: 38 },
  heroUploadBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, height: 38, paddingHorizontal: 15,
    borderRadius: sr.pill, backgroundColor: sd.accent,
    shadowColor: sd.accent, shadowOpacity: 0.34, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 4,
  },
  heroUploadText: { fontSize: 13, fontWeight: font.weightHeavy, color: "#FFFFFF" },
  heroStats: { flexDirection: "row", borderRadius: sr.tile, backgroundColor: "rgba(255,255,255,0.07)", overflow: "hidden" },
  heroStat: { flex: 1, minWidth: 0, alignItems: "center", gap: 3, paddingVertical: 12, paddingHorizontal: 4 },
  heroStatDivider: { borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.09)" },
  heroStatValue: { fontSize: 15, fontWeight: font.weightHeavy, color: "#FFFFFF", letterSpacing: -0.4 },
  heroStatLabel: { fontSize: 9.5, fontWeight: font.weightBold, color: "rgba(255,255,255,0.45)" },

  /* Search + sort */
  searchPill: {
    flexDirection: "row", alignItems: "center", gap: 9,
    height: 44, marginTop: 14, paddingLeft: 14, paddingRight: 6, borderRadius: sr.tile, backgroundColor: sd.fill,
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 13.5, color: sd.text, padding: 0 },
  sortBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: sd.page, borderRadius: sr.chip - 2, paddingHorizontal: 12, paddingVertical: 8,
  },
  sortText: { fontSize: 11.5, fontWeight: font.weightBold, color: sd.text },

  /* Chips + date filter */
  filterRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  chipRow: { gap: 6, paddingRight: 2 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    height: 34, paddingHorizontal: 15, borderRadius: sr.pill, backgroundColor: "#F1EFF3",
  },
  chipOn: { backgroundColor: sd.ink },
  chipText: { fontSize: 12.5, fontWeight: font.weightBold, color: sd.slate },
  chipTextOn: { color: "#FFFFFF" },
  chipCountBubble: {
    minWidth: 18, height: 18, borderRadius: sr.pill, backgroundColor: sd.page,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 5,
  },
  chipCountBubbleOn: { backgroundColor: "rgba(255,255,255,0.2)" },
  chipCountText: { fontSize: 10, fontWeight: font.weightHeavy, color: sd.muted },
  chipCountTextOn: { color: "#FFFFFF" },
  layoutBtn: {
    width: 34, height: 34, borderRadius: sr.chip, borderWidth: 1, borderColor: sd.line,
    alignItems: "center", justifyContent: "center",
  },
  layoutBtnOn: { backgroundColor: sd.accent, borderColor: sd.accent },

  dateChip: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    marginTop: 9, backgroundColor: "#FDECF1", borderRadius: sr.pill, paddingHorizontal: 11, paddingVertical: 6,
  },
  dateChipTap: { flexDirection: "row", alignItems: "center", gap: 6 },
  dateChipText: { fontSize: 11.5, fontWeight: font.weightBold, color: sd.accent },
  dateChipClear: { fontSize: 11, fontWeight: font.weightHeavy, color: sd.accent, paddingLeft: 2 },

  /* Card */
  card: { borderRadius: sr.panel, backgroundColor: sd.fillSoft, padding: 12, gap: 12, marginBottom: 10 },
  cardTop: { flexDirection: "row", gap: 12 },
  thumbWrap: { width: 60, height: 80, borderRadius: sr.chip, overflow: "hidden", backgroundColor: sd.thumbA },
  thumb: { width: "100%", height: "100%" },
  thumbFallback: { alignItems: "center", justifyContent: "center", backgroundColor: sd.thumbB },
  thumbGradient: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingTop: 14, paddingBottom: 5, paddingHorizontal: 6,
  },
  thumbDuration: { color: "#FFFFFF", fontSize: 9.5, fontWeight: font.weightBold },
  processingOverlay: {
    ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", gap: 4,
    backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 8,
  },
  processingText: { color: "#FFFFFF", fontSize: 9.5, fontWeight: font.weightBold, textAlign: "center", paddingHorizontal: 6 },

  cardBody: { flex: 1, minWidth: 0, gap: 7, justifyContent: "center" },
  cardTitleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  caption: { flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: font.weightBold, color: sd.text, letterSpacing: -0.2, lineHeight: 18 },
  kebab: { width: 26, height: 22, alignItems: "center", justifyContent: "flex-end" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  statusPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: sr.pill,
  },
  statusPillText: { fontSize: 10, fontWeight: font.weightHeavy, letterSpacing: 0.4 },
  when: { flexShrink: 1, fontSize: 11, color: sd.faint },

  /* Stats strip (published cards only) */
  statsStrip: { flexDirection: "row", borderRadius: sr.chip, backgroundColor: sd.page, overflow: "hidden" },
  stat: { flex: 1, minWidth: 0, alignItems: "center", gap: 3, paddingVertical: 11, paddingHorizontal: 4 },
  statDivider: { borderLeftWidth: 1, borderLeftColor: sd.divider },
  statTop: { flexDirection: "row", alignItems: "center", gap: 4 },
  statValue: { fontSize: 13, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -0.3 },
  statLabel: { fontSize: 9.5, fontWeight: font.weightBold, color: sd.muted },

  /* Action row */
  actionRow: { flexDirection: "row", gap: 7 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
    borderRadius: sr.chip - 1, paddingVertical: 9, backgroundColor: sd.page,
  },
  actionBtnSolid: { backgroundColor: sd.ink },
  actionBtnAccent: { backgroundColor: "#FDECF1" },
  actionText: { fontSize: 11.5, fontWeight: font.weightBold, color: sd.slate },
  actionTextSolid: { color: "#FFFFFF" },
  actionTextAccent: { color: sd.accent },

  emptyWrap: { alignItems: "center", paddingTop: 48, paddingHorizontal: spacing.xl, gap: 5 },
  emptyIcon: { width: 62, height: 62, borderRadius: 31, backgroundColor: sd.fill, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  emptyTitle: { fontSize: 15, fontWeight: font.weightHeavy, color: sd.text, textAlign: "center" },
  emptySub: { fontSize: 13, color: sd.muted, textAlign: "center", lineHeight: 18 },

  sheet: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.xs },
  sheetOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.md, paddingHorizontal: spacing.sm, borderRadius: sr.chip },
  sheetOptionActive: { backgroundColor: "#FDECF1" },
  sheetOptionText: { fontSize: font.md, color: sd.text, fontWeight: font.weightMedium },
  sheetOptionTextActive: { color: sd.accent, fontWeight: font.weightBold },
  sheetTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: sd.text, textAlign: "center", marginVertical: spacing.md },

  /* Kebab popup */
  menuWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  menuTitle: { fontSize: 14, fontWeight: font.weightHeavy, color: sd.text, marginBottom: 6 },
  menuSectionLabel: { fontSize: 11, fontWeight: font.weightHeavy, color: sd.muted, letterSpacing: 0.5, textTransform: "uppercase", marginTop: 14, marginBottom: 4 },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, paddingHorizontal: spacing.sm, borderRadius: sr.chip },
  menuRowText: { flex: 1, minWidth: 0, fontSize: font.md, fontWeight: font.weightMedium, color: sd.text },

  /* Pagination footer */
  footer: { alignItems: "center", gap: 12, paddingTop: 22 },
  footerCount: { fontSize: 11.5, color: sd.muted },
  pagination: { flexDirection: "row", alignItems: "center", gap: 5 },
  pageArrow: { width: 30, height: 30, borderRadius: sr.chip, borderWidth: 1, borderColor: sd.line, alignItems: "center", justifyContent: "center" },
  pageArrowOff: { opacity: 0.4 },
  pageNum: { minWidth: 30, height: 30, borderRadius: sr.chip, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  pageNumOn: { backgroundColor: sd.ink },
  pageNumText: { fontSize: 12.5, fontWeight: font.weightBold, color: sd.slate },
  pageNumTextOn: { color: "#FFFFFF" },
  pageGap: { fontSize: 12.5, fontWeight: font.weightBold, color: sd.faint, paddingHorizontal: 2 },

  /* Date filter calendar */
  calWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: 14 },
  calRangeLabel: { textAlign: "center", fontSize: 12.5, fontWeight: font.weightBold, color: sd.slate },
  calNavRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  calNavBtn: { width: 32, height: 32, borderRadius: sr.chip, backgroundColor: sd.fill, alignItems: "center", justifyContent: "center" },
  calMonthLabel: { fontSize: 14.5, fontWeight: font.weightHeavy, color: sd.text },
  calWeekRow: { flexDirection: "row", justifyContent: "center" },
  // Both rows use an explicit pixel `width`/`height` passed inline (see the
  // `cell` calculation above), not a percentage - that's what guarantees
  // day cells are actually square, so the selected-day circle below renders
  // as a circle instead of a stretched pill.
  calWeekday: { textAlign: "center", fontSize: 11, fontWeight: font.weightBold, color: sd.muted },
  calGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center" },
  calCell: { alignItems: "center", justifyContent: "center" },
  calCellInRange: { backgroundColor: "#FDECF1" },
  calCellEdge: { backgroundColor: sd.accent },
  calCellText: { fontSize: 13, fontWeight: font.weightMedium, color: sd.text },
  calCellTextOff: { color: sd.faint },
  calCellTextToday: { color: sd.accent, fontWeight: font.weightHeavy },
  calCellTextEdge: { color: "#FFFFFF", fontWeight: font.weightHeavy },
  calInfoRow: { flexDirection: "row", alignItems: "flex-start", gap: 7, paddingHorizontal: 2 },
  calInfoText: { flex: 1, fontSize: 11.5, color: sd.muted, lineHeight: 16 },
  calActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  calClearBtn: { flex: 1, alignItems: "center", justifyContent: "center", height: 46, borderRadius: sr.pill, borderWidth: 1, borderColor: sd.line },
  calClearText: { fontSize: 13.5, fontWeight: font.weightBold, color: sd.slate },
  calApplyBtn: { flex: 1, alignItems: "center", justifyContent: "center", height: 46, borderRadius: sr.pill, backgroundColor: sd.accent },
  calApplyBtnOff: { opacity: 0.4 },
  calApplyText: { fontSize: 13.5, fontWeight: font.weightHeavy, color: "#FFFFFF" },
});
