"use client";

/**
 * Reelsoo Studio - Analytics.
 *
 * Composition only: fetch once, hand each section its slice. Every number rendered
 * here comes from the ClickHouse-backed /studio/analytics/dashboard endpoint.
 *
 * Where a metric has no data source, the API returns an empty list and the section
 * renders an empty state that says WHY (see Top Cities). Nothing on this page is
 * placeholder or sample data - a chart that looks real but isn't is worse than a
 * blank one, because the creator will make decisions on it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";

import { useAuthStore } from "@/store/auth.store";
import {
  studioAnalyticsApi, countryName,
  type DashboardData, type DashboardFilters,
} from "@/services/studio-analytics.service";
import { StudioSidebarWrapper } from "../studio-sidebar-wrapper";
import { StudioTopbarShared, type DateRange } from "../studio-topbar-shared";
import { Card, ErrorState, Skeleton } from "./primitives";
import { FilterBar } from "./filter-bar";
import {
  AudienceRow_, EngagementStrip, FollowerAnalytics, InsightsCard, KpiRow,
  MainCharts, Monetization, TopAudioCard, TopVideosTable, TrendingVideosCard,
} from "./sections";

/* ── Skeleton ───────────────────────────────────────────────────────────────── */

/**
 * Mirrors the real layout's grid so the page doesn't reflow when data lands. A
 * skeleton that doesn't match the thing it replaces just moves the jank later.
 */
function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-16 w-full" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
        {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-[132px]" />)}
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[340px]" />)}
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        <Skeleton className="h-[260px] xl:col-span-2" />
        <Skeleton className="h-[260px]" />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[230px]" />)}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[140px]" />)}
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        <Skeleton className="h-[300px] xl:col-span-2" />
        <Skeleton className="h-[300px]" />
      </div>
    </div>
  );
}

/* ── Export ─────────────────────────────────────────────────────────────────── */

/**
 * Export the current view as CSV, client-side from the payload we already hold.
 *
 * No round-trip: the data is already on screen, and asking the server to regenerate
 * it would risk exporting something subtly different from what the creator is
 * looking at.
 */
function toCsv(d: DashboardData): string {
  const rows: (string[])[] = [
    ["Teezer Studio - Analytics"],
    ["Period", `${d.period.start} to ${d.period.end}`],
    ["Compared with", `${d.previous_period.start} to ${d.previous_period.end}`],
    [],
    ["Metric", "Value", "Change vs previous"],
  ];

  for (const [key, m] of Object.entries(d.summary)) {
    rows.push([
      key.replace(/_/g, " "),
      String(m.value),
      // Never export "+100%" for a zero baseline - the CSV outlives the tooltip that
      // would have explained it.
      m.growth.comparable ? `${m.growth.up ? "+" : "-"}${m.growth.pct}%` : "n/a (no prior period)",
    ]);
  }

  rows.push([], ["Views by day"], ["Date", "Views"]);
  for (const p of d.charts.views_over_time) rows.push([p.date, String(p.value)]);

  rows.push([], ["Top countries"], ["Country", "Views", "Share"]);
  for (const c of d.audience.countries) rows.push([countryName(c.name), String(c.count), `${c.pct}%`]);

  rows.push([], ["Top videos"], ["Title", "Views", "Watch hours", "Completion %", "Likes", "Comments", "Shares", "Revenue"]);
  for (const v of d.top_videos) {
    rows.push([
      v.title, String(v.views), String(v.watch_time_hours), String(v.completion),
      String(v.likes), String(v.comments), String(v.shares), String(v.revenue),
    ]);
  }

  // Quote every field and escape embedded quotes. Video titles routinely contain
  // commas, emoji and quotation marks, and a single unescaped one silently shifts
  // every subsequent column in the creator's spreadsheet.
  return rows
    .map(r => r.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

function downloadCsv(data: DashboardData) {
  const blob = new Blob([toCsv(data)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `teezer-analytics-${data.period.start}-to-${data.period.end}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Page ───────────────────────────────────────────────────────────────────── */

/** Presets, as day counts - used to seed the topbar's date picker from `filters`. */
const PRESET_DAYS: Record<string, number> = { today: 1, "7": 7, "28": 28, "90": 90 };

export function StudioAnalyticsPage() {
  const router = useRouter();
  const { isAuthenticated, authReady } = useAuthStore();

  const [filters, setFilters]   = useState<DashboardFilters>({ period: "28" });
  const [collapsed, setCollapsed] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (authReady && !isAuthenticated) router.replace("/");
  }, [authReady, isAuthenticated, router]);

  // A custom range is only fetchable once BOTH ends exist. Without this the page fires
  // period=custom with no dates, which the API rejects (they are required_if) - a 422
  // that used to blank the entire dashboard.
  const rangeReady =
    filters.period !== "custom" || Boolean(filters.start_date && filters.end_date);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    // Every filter is in the key, so any change refetches from ClickHouse rather than
    // being sliced in the browser. That is the point of an OLAP store: the server can
    // answer the re-filtered question in milliseconds.
    queryKey: ["studio", "analytics", "dashboard", filters],
    queryFn: () => studioAnalyticsApi.dashboard(filters),
    enabled: isAuthenticated && rangeReady,
    // Matches the server's 5-minute cache; refetching sooner would only ever return
    // the same cached payload.
    staleTime: 5 * 60 * 1000,
    // Keep the previous view on screen while a new range loads, so switching period
    // doesn't blank the whole page.
    placeholderData: prev => prev,

    // Refresh on the server's cache boundary, and ONLY while the tab is actually in
    // front of the creator. refetchIntervalInBackground defaults to false, so a
    // dashboard left open in a background tab costs nothing; a visible one costs 12
    // requests an hour, each served from the API's own 5-minute cache. Neither
    // ClickHouse nor the browser does real work on a tick where nothing changed.
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,

    // Never retry a 4xx. The old `retry: 1` re-sent every rejected request once, so a
    // malformed filter produced two identical 422s a second apart instead of one - and
    // no amount of retrying will make a request the server considers invalid succeed.
    retry: (failureCount, err) => {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status && status >= 400 && status < 500) return false;
      return failureCount < 1;
    },
  });

  // Show the full-page error ONLY when there is nothing to show. If a refresh fails
  // while good data is already on screen, that data is still true for the range it was
  // fetched for - throwing it away to display an error box helps nobody.
  const hardError = isError && !data;
  const staleError = isError && Boolean(data);
  const errorStatus = (error as { response?: { status?: number } })?.response?.status;

  /**
   * The topbar owns the date-range picker (it is the "Jun 12 – Jul 9" control in the
   * top-right of every Studio page). Rather than ship a second, competing date
   * picker in the filter bar, we drive the SAME `filters` state from both: the
   * presets below, and the topbar picker here.
   *
   * Derived from `filters` rather than held separately - two sources of truth for
   * the same range is how the header ends up disagreeing with the chart under it.
   */
  const dateRange: DateRange = useMemo(() => {
    if (filters.period === "custom" && filters.start_date && filters.end_date) {
      return { start: new Date(filters.start_date), end: new Date(filters.end_date) };
    }
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (PRESET_DAYS[filters.period] ?? 28) + 1);
    return { start, end };
  }, [filters]);

  const onDateRangeChange = useCallback((r: DateRange) => {
    // Format from the LOCAL date parts, not toISOString().
    //
    // toISOString() converts to UTC first. The picker builds its start as local
    // midnight, and for anyone east of Greenwich local midnight is the PREVIOUS day in
    // UTC - so in Kathmandu (UTC+5:45) picking "last 7 days" silently asked the server
    // for a window starting a day early.
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    setFilters(f => ({ ...f, period: "custom", start_date: iso(r.start), end_date: iso(r.end) }));
  }, []);

  const handleExport = useCallback(() => {
    if (!data) return;
    setExporting(true);
    try {
      downloadCsv(data);
    } finally {
      setExporting(false);
    }
  }, [data]);

  if (!authReady || !isAuthenticated) return null;

  return (
    // The Studio shell. There is no (studio) route-group layout - every Studio page
    // renders its own sidebar + topbar, and this page originally did not, which is
    // why it appeared with no navigation.
    //
    // h-screen + overflow-hidden here, with `overflow-y-auto` on the body below, is
    // also what makes the page SCROLL: the shell pins to the viewport and the content
    // column is the scroll container. Without it the body had nowhere to scroll.
    <div className="flex h-screen overflow-hidden bg-[#f8f9fb]">
      <StudioSidebarWrapper
        collapsed={collapsed}
        onToggle={() => setCollapsed(o => !o)}
        activeHref="/studio/analytics"
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <StudioTopbarShared
          title="Analytics"
          subtitle="Track your content performance, audience insights and engagement."
          dateRange={dateRange}
          onDateRangeChange={onDateRangeChange}
          isDateFilterActive={filters.period === "custom"}
          onClearDateFilter={() => setFilters({ period: "28" })}
        />

        {/* The scroll container. */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          <div className="mx-auto flex max-w-[1440px] flex-col gap-3 p-6">
            {hardError ? (
              <Card><ErrorState onRetry={() => refetch()} /></Card>
            ) : (
              <>
                <FilterBar
                  filters={filters}
                  onChange={setFilters}
                  onExport={handleExport}
                  exporting={exporting}
                />

                {staleError && (
                  // A failed refresh, with good data still on screen. Say so in a strip
                  // rather than replacing the page: the numbers below are still true
                  // for the range they were fetched for.
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
                    <TriangleAlert className="size-4 shrink-0" strokeWidth={2} />
                    <span>
                      {errorStatus === 422
                        ? "That date range wasn't accepted, so the figures below are from the last range that loaded."
                        : "Couldn't refresh just now. The figures below are from the last successful load."}
                    </span>
                    <button
                      onClick={() => refetch()}
                      className="ml-auto shrink-0 rounded-full border border-amber-300 px-2.5 py-1 text-[11.5px] font-semibold transition hover:bg-amber-100"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {isLoading || !data ? (
                  <DashboardSkeleton />
                ) : (
                  <div
                    className={[
                      "flex flex-col gap-3 transition-opacity duration-200",
                      // Dim while refetching rather than swapping in a skeleton - the
                      // numbers on screen are still true for the range they were
                      // fetched for.
                      isFetching ? "opacity-60" : "opacity-100",
                    ].join(" ")}
                  >
                    <InsightsCard insights={data.insights} />

                    <KpiRow data={data} />

                    <MainCharts data={data} />

                    {/* Best Time to Post + Traffic Sources, then Countries / Cities / Devices. */}
                    <AudienceRow_ data={data} />

                    {/* Full width, so all six cards get an equal, legible column. */}
                    <EngagementStrip engagement={data.engagement} />

                    <div className="grid gap-3 xl:grid-cols-3">
                      <TopVideosTable videos={data.top_videos} />
                      <div className="flex flex-col gap-3">
                        <TopAudioCard tracks={data.top_audio} />
                        <TrendingVideosCard videos={data.trending_videos} />
                      </div>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-3">
                      <FollowerAnalytics followers={data.followers} />
                      <Monetization m={data.monetization} />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default StudioAnalyticsPage;
