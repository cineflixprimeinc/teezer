"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Trash2, MoreVertical,
  Play, TrendingUp, Globe, Save, RefreshCw,
  Search, Clock, X, RotateCcw, BookmarkPlus, Share2, EyeOff,
  Radio, Zap, CircleDot, LayoutList, Grid2X2, LayoutGrid,
  RotateCw, Loader2, Check,
} from "lucide-react";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { Toggle, NiceSelect } from "@/features/settings/settings-ui";
import { cn } from "@/lib/utils";
import {
  watchHistoryService,
  type HistoryItem,
  type HistoryTab,
  type ContinueWatchingItem,
  type WatchSummary,
  type WatchedCreator,
} from "@/services/watchHistory.service";
import { friendService } from "@/services/friend.service";
import { useAuthStore } from "@/store/auth.store";
import { toast } from "sonner";

const BRAND = "#fd4605";

/* ── Tab definitions with icons ─────────────────────────────────────────── */
const TABS = [
  { id: "All"     as const, label: "All",     Icon: LayoutGrid  },
  { id: "Videos"  as const, label: "Videos",  Icon: Play        },
  { id: "Live"    as const, label: "Live",    Icon: Radio       },
  { id: "Reels"   as const, label: "Reels",   Icon: Zap         },
  { id: "Stories" as const, label: "Stories", Icon: CircleDot   },
];
type Tab      = HistoryTab;
type ViewMode = "list" | "grid2" | "grid3";

const SORT_OPTS = ["Recently Watched", "Most Viewed", "Oldest First"];

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function fmtDuration(secs: number): string {
  if (!secs) return "";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

function fmtRelative(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60)     return `${s}s ago`;
  if (s < 3600)   return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)  return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ── Gradient pool for items without a thumbnail ──────────────────────────── */
const GRADS = [
  "from-[#0ea5e9] to-[#0369a1]",
  "from-[#f97316] to-[#b45309]",
  "from-[#7c3aed] to-[#4338ca]",
  "from-[#0d9488] to-[#0369a1]",
  "from-[#ec4899] to-[#8b5cf6]",
  "from-[#16a34a] to-[#0d9488]",
  "from-[#be185d] to-[#9333ea]",
];
function pickGrad(seed: number | string): string {
  const n = typeof seed === "number" ? seed : seed.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return GRADS[Math.abs(n) % GRADS.length];
}

/* ── Portrait thumbnail (list view) ─────────────────────────────────────── */
function PortraitThumb({
  thumbnailUrl, durationSecs, seed,
}: {
  thumbnailUrl?: string | null;
  durationSecs: number;
  seed: number;
}) {
  const grad = pickGrad(seed);
  return (
    <div
      className={cn(
        "relative flex-shrink-0 overflow-hidden rounded-[10px]",
        !thumbnailUrl && cn("bg-gradient-to-br", grad),
      )}
      style={{ width: 64, height: 100 }}
    >
      {thumbnailUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm shadow">
          <Play className="h-4 w-4 fill-white text-white" />
        </div>
      </div>
      {durationSecs > 0 && (
        <span className="absolute bottom-1 left-1 rounded-[4px] bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white">
          {fmtDuration(durationSecs)}
        </span>
      )}
    </div>
  );
}

/* ── Portrait grid card ──────────────────────────────────────────────────── */
function GridCard({
  item, onRemove, openMenu, setOpenMenu,
}: {
  item: HistoryItem;
  onRemove: () => void;
  openMenu: number | null;
  setOpenMenu: (id: number | null) => void;
}) {
  const grad = pickGrad(item.video_id);
  return (
    <div className="group relative overflow-hidden rounded-[16px] bg-white shadow-sm border border-[#f0f1f5] transition hover:shadow-md">
      <div
        className={cn("relative w-full overflow-hidden", !item.thumbnail_url && cn("bg-gradient-to-br", grad))}
        style={{ aspectRatio: "9/16" }}
      >
        {item.thumbnail_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumbnail_url} alt={item.title} className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm shadow-lg">
            <Play className="h-6 w-6 fill-white text-white" />
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
        {item.duration_secs > 0 && (
          <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-white">
            {fmtDuration(item.duration_secs)}
          </span>
        )}
        <span className="absolute bottom-2 right-2 rounded-md bg-black/50 px-1.5 py-0.5 text-[8px] font-bold text-[#fd4605]">
          {fmtRelative(item.watched_at)}
        </span>
        <div className="absolute right-1.5 top-1.5 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === item.id ? null : item.id); }}
              className="grid h-7 w-7 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
            {openMenu === item.id && (
              <div className="absolute right-0 top-[calc(100%+4px)] z-[100] w-[160px] overflow-hidden rounded-[12px] border border-[#e8eaf0] bg-white shadow-lg">
                {[
                  { label: "Watch Again",      Icon: RotateCcw,    iconBg: "bg-[#eff6ff]",  iconColor: "text-[#3b82f6]" },
                  { label: "Save to Playlist", Icon: BookmarkPlus, iconBg: "bg-[#f0fdf4]",  iconColor: "text-[#16a34a]" },
                  { label: "Share",            Icon: Share2,       iconBg: "bg-[#f5f3ff]",  iconColor: "text-[#7c3aed]" },
                  { label: "Not Interested",   Icon: EyeOff,       iconBg: "bg-[#fff3ec]",  iconColor: "text-[#fd4605]" },
                ].map(({ label, Icon, iconBg, iconColor }) => (
                  <button
                    key={label}
                    onClick={() => setOpenMenu(null)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11.5px] font-semibold text-[#374151] hover:bg-[#f8fafc]"
                  >
                    <span className={cn("flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[6px]", iconBg)}>
                      <Icon className={cn("h-3 w-3", iconColor)} />
                    </span>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="grid h-7 w-7 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="px-2.5 py-2">
        <p className="line-clamp-2 text-[11.5px] font-bold leading-snug text-[#111827]">{item.title}</p>
        <div className="mt-1 flex items-center gap-1">
          <span className="truncate text-[10px] font-semibold text-[#6b7280]">{item.creator}</span>
          {item.verified && <VerifiedBadge size={12} className="flex-shrink-0" />}
        </div>
        <p className="mt-0.5 text-[10px] text-[#9ca3af]">{fmtViews(item.views_count)} views</p>
      </div>
    </div>
  );
}

/* ── Continue Watching small card ───────────────────────────────────────── */
function SmallThumb({
  title, progress, remaining, thumbnailUrl, onPlay,
}: {
  title: string;
  progress: number;
  remaining: string;
  thumbnailUrl?: string | null;
  onPlay?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className="flex w-full items-start gap-3 text-left transition hover:opacity-90"
    >
      <div className="relative flex-shrink-0 overflow-hidden rounded-[8px]" style={{ width: 56, height: 88 }}>
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-[#fd4605] to-[#b83203]" />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <Play className="h-4 w-4 fill-white text-white" />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[12px] font-semibold leading-snug text-[#111827]">{title}</p>
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[#f0f1f5]">
          <div className="h-full rounded-full" style={{ width: `${progress}%`, background: BRAND }} />
        </div>
        <p className="mt-1 text-[10px] text-[#9ca3af]">{progress}% · {remaining}</p>
      </div>
    </button>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function WatchHistoryPage() {
  const [activeTab,  setActiveTab]  = useState<Tab>("All");
  const [sort,       setSort]       = useState("Recently Watched");
  const [items,      setItems]      = useState<HistoryItem[]>([]);
  const [listLoading,setListLoading]= useState(true);
  const [viewMode,   setViewMode]   = useState<ViewMode>("list");
  const [openMenu,   setOpenMenu]   = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Settings state - local (pending) until saved
  const [saveWatch,    setSaveWatch]    = useState(true);
  const [saveSearch,   setSaveSearch]   = useState(true);
  const [autoDelete,   setAutoDelete]   = useState("Never");
  const [settingsSaved,setSettingsSaved]= useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // Sidebar real data
  const isAuth = useAuthStore((s) => s.isAuthenticated);
  const router = useRouter();

  const [continueWatching, setContinueWatching] = useState<ContinueWatchingItem[]>([]);
  const [watchSummary,     setWatchSummary]     = useState<WatchSummary | null>(null);
  const [watchedCreators,  setWatchedCreators]  = useState<WatchedCreator[]>([]);
  const [sidebarLoading,   setSidebarLoading]   = useState(false);

  const loadMainList = useCallback(async () => {
    if (!isAuth) { setListLoading(false); return; }
    setListLoading(true);
    try {
      const res = await watchHistoryService.list(1, 50);
      setItems(res.data);
    } catch { setItems([]); } finally { setListLoading(false); }
  }, [isAuth]);

  const loadSidebar = useCallback(async () => {
    if (!isAuth) return;
    setSidebarLoading(true);
    try {
      const [summary, continueW, creators, settings] = await Promise.all([
        watchHistoryService.summary(),
        watchHistoryService.continueWatching(),
        watchHistoryService.creators(),
        watchHistoryService.getSettings(),
      ]);
      setWatchSummary(summary);
      setContinueWatching(continueW);
      setWatchedCreators(creators);
      setSaveWatch(settings.save_watch_history);
    } catch { /* silent */ } finally { setSidebarLoading(false); }
  }, [isAuth]);

  useEffect(() => { loadMainList(); }, [loadMainList]);
  useEffect(() => { loadSidebar(); }, [loadSidebar]);

  async function handleSaveSettings() {
    setSavingSettings(true);
    try {
      await watchHistoryService.updateSettings({ save_watch_history: saveWatch });
      setSettingsSaved(true);
      toast.success("Settings saved.");
      setTimeout(() => setSettingsSaved(false), 2000);
    } catch { toast.error("Failed to save settings."); } finally { setSavingSettings(false); }
  }

  async function handleFollowCreator(creatorId: number, username: string, currentlyFollowing: boolean) {
    setWatchedCreators((prev) =>
      prev.map((c) => c.id === creatorId ? { ...c, is_following: !currentlyFollowing } : c),
    );
    try {
      if (currentlyFollowing) await friendService.unfollow(username);
      else await friendService.follow(username);
    } catch {
      setWatchedCreators((prev) =>
        prev.map((c) => c.id === creatorId ? { ...c, is_following: currentlyFollowing } : c),
      );
    }
  }

  // Filter + sort
  const filtered = activeTab === "All" ? items : items.filter((v) => v.type === activeTab);

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "Most Viewed")  return b.views_count - a.views_count;
    if (sort === "Oldest First") return Date.parse(a.watched_at) - Date.parse(b.watched_at);
    return Date.parse(b.watched_at) - Date.parse(a.watched_at); // Recently Watched
  });

  function removeItem(id: number) {
    setItems((p) => p.filter((v) => v.id !== id));
    if (isAuth) watchHistoryService.removeVideo(
      items.find((v) => v.id === id)?.video_id ?? 0,
    ).catch(() => {});
  }

  async function clearAll() {
    setItems([]);
    setContinueWatching([]);
    setWatchSummary((prev) => prev
      ? { ...prev, total_watched_today: "0m", videos_watched_today: 0, live_replays_watched: 0 }
      : null,
    );
    if (isAuth) { try { await watchHistoryService.clearAll(); toast.success("History cleared."); } catch {} }
  }

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    Promise.all([loadMainList(), loadSidebar()]).finally(() => setRefreshing(false));
  }, [loadMainList, loadSidebar]);

  const VIEW_MODES: { mode: ViewMode; Icon: React.ElementType; label: string }[] = [
    { mode: "list",  Icon: LayoutList, label: "List"  },
    { mode: "grid2", Icon: Grid2X2,    label: "2-col" },
    { mode: "grid3", Icon: LayoutGrid, label: "3-col" },
  ];

  return (
    <div className="flex min-h-full">

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 p-6">

        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-extrabold text-[#111827]">Watch History</h1>
            <p className="mt-0.5 text-[13px] text-[#9ca3af]">
              Videos and live content you&apos;ve watched on Teezer.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-[#9ca3af]">
            <Clock className="h-4 w-4" />
            <span className="font-semibold text-[#374151]">{items.length} videos</span>
          </div>
        </div>

        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {/* Filter tabs with icons + counts */}
          <div className="flex items-center gap-1 rounded-[14px] border border-[#f0f1f5] bg-[#fafbfc] p-1">
            {TABS.map(({ id, label, Icon }) => {
              const active = activeTab === id;
              const count  = id === "All" ? items.length : items.filter((v) => v.type === id).length;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[12px] font-semibold transition-all",
                    active ? "bg-white text-[#fd4605] shadow-sm" : "text-[#6b7280] hover:text-[#374151]",
                  )}
                >
                  <Icon className={cn("h-3.5 w-3.5", active && "text-[#fd4605]")} />
                  {label}
                  <span className={cn(
                    "ml-0.5 rounded-full px-1.5 py-0 text-[10px] font-bold leading-5",
                    active ? "bg-[#fce7ec] text-[#fd4605]" : "bg-[#f0f1f5] text-[#9ca3af]",
                  )}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            title="Refresh history"
            className={cn(
              "grid h-9 w-9 flex-shrink-0 place-items-center rounded-[10px] border border-[#f0f1f5] bg-white text-[#6b7280] transition hover:border-[#fd4605] hover:text-[#fd4605]",
              refreshing && "border-[#fd4605] text-[#fd4605]",
            )}
          >
            <RotateCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </button>

          <div className="flex-1" />

          <NiceSelect value={sort} onChange={setSort} options={SORT_OPTS} />

          {/* View mode switcher */}
          <div className="flex overflow-hidden rounded-[10px] border border-[#f0f1f5] bg-[#fafbfc]">
            {VIEW_MODES.map(({ mode, Icon, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                title={label}
                className={cn(
                  "grid h-9 w-9 place-items-center transition",
                  viewMode === mode ? "bg-[#fd4605] text-white" : "text-[#9ca3af] hover:bg-white hover:text-[#374151]",
                  mode !== "list" && "border-l border-[#f0f1f5]",
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>

          <button
            onClick={clearAll}
            className="flex items-center gap-1.5 rounded-[10px] border border-[#fecdd3] bg-white px-3 py-2 text-[12px] font-bold text-[#fd4605] transition hover:bg-[#fff1f3]"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear All
          </button>
        </div>

        {/* Content */}
        {listLoading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-[#fd4605]" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#f0f1f5] bg-white py-20 text-center shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f8f9fb]">
              <Clock className="h-8 w-8 text-[#d1d5db]" />
            </div>
            <p className="text-[15px] font-bold text-[#374151]">No history to show</p>
            <p className="text-[13px] text-[#9ca3af]">
              {activeTab === "All" ? "Videos you watch will appear here." : `No ${activeTab} watched yet.`}
            </p>
            <button
              onClick={handleRefresh}
              className="mt-1 flex items-center gap-1.5 rounded-full border border-[#fecdd3] px-4 py-1.5 text-[12px] font-bold text-[#fd4605] hover:bg-[#fff1f3] transition"
            >
              <RotateCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>

        ) : viewMode === "list" ? (
          <div className="overflow-hidden rounded-2xl border border-[#f0f1f5] bg-white shadow-sm">
            {sorted.map((v, i) => (
              <div
                key={`${v.id}-${refreshKey}`}
                className="group relative flex items-center gap-4 px-4 py-3 transition-colors hover:bg-[#fafbfc]"
                style={{ borderBottom: i < sorted.length - 1 ? "1px solid #f0f1f5" : "none" }}
              >
                <PortraitThumb thumbnailUrl={v.thumbnail_url} durationSecs={v.duration_secs} seed={v.video_id} />

                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[13.5px] font-bold leading-snug text-[#111827]">{v.title}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-[12px] font-semibold text-[#374151]">{v.creator}</span>
                    {v.verified && <VerifiedBadge size={14} className="flex-shrink-0" />}
                  </div>
                  <p className="mt-0.5 text-[11px] text-[#9ca3af]">
                    {fmtViews(v.views_count)} views
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold" style={{ color: BRAND }}>
                    Watched {fmtRelative(v.watched_at)}
                  </p>
                </div>

                <div className="flex flex-shrink-0 items-center gap-1.5">
                  <div className="relative">
                    <button
                      onClick={() => setOpenMenu(openMenu === v.id ? null : v.id)}
                      className="grid h-8 w-8 place-items-center rounded-full text-[#9ca3af] transition hover:bg-[#f0f1f5] hover:text-[#374151]"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                    {openMenu === v.id && (
                      <div className="absolute right-0 top-[calc(100%+4px)] z-[100] w-[180px] overflow-hidden rounded-[12px] border border-[#e8eaf0] bg-white shadow-lg">
                        {[
                          { label: "Watch Again",      Icon: RotateCcw,    iconBg: "bg-[#eff6ff]", iconColor: "text-[#3b82f6]" },
                          { label: "Save to Playlist", Icon: BookmarkPlus, iconBg: "bg-[#f0fdf4]", iconColor: "text-[#16a34a]" },
                          { label: "Share",            Icon: Share2,       iconBg: "bg-[#f5f3ff]", iconColor: "text-[#7c3aed]" },
                          { label: "Not Interested",   Icon: EyeOff,       iconBg: "bg-[#fff3ec]", iconColor: "text-[#fd4605]" },
                        ].map(({ label, Icon, iconBg, iconColor }) => (
                          <button
                            key={label}
                            onClick={() => setOpenMenu(null)}
                            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[12.5px] font-semibold text-[#374151] hover:bg-[#f8fafc]"
                          >
                            <span className={cn("flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-[7px]", iconBg)}>
                              <Icon className={cn("h-[13px] w-[13px]", iconColor)} />
                            </span>
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => removeItem(v.id)}
                    className="grid h-8 w-8 place-items-center rounded-[10px] border border-[#f0f1f5] bg-[#f4f5f7] text-[#6b7280] transition hover:border-[#fecdd3] hover:bg-[#fff3ec] hover:text-[#fd4605]"
                  >
                    <Trash2 className="h-[15px] w-[15px]" />
                  </button>
                </div>
              </div>
            ))}
          </div>

        ) : (
          <div className={cn(
            "grid gap-4",
            viewMode === "grid2"
              ? "grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              : "grid-cols-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
          )}>
            {sorted.map((v) => (
              <GridCard
                key={`${v.id}-${refreshKey}`}
                item={v}
                onRemove={() => removeItem(v.id)}
                openMenu={openMenu}
                setOpenMenu={setOpenMenu}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Right sidebar ─────────────────────────────────────────────────── */}
      <aside className="w-[280px] flex-shrink-0 border-l border-[#f0f1f5] bg-[#fafbfc] p-4">
        <div className="flex flex-col gap-4">

          {/* Continue Watching - max 4 */}
          <div className="rounded-2xl border border-[#f0f1f5] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13px] font-extrabold text-[#111827]">Continue Watching</p>
              {continueWatching.length > 0 && (
                <button
                  onClick={() => router.push("/settings/history")}
                  className="text-[11px] font-bold transition hover:underline"
                  style={{ color: BRAND }}
                >
                  View all
                </button>
              )}
            </div>
            {sidebarLoading ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-[#fd4605]" /></div>
            ) : continueWatching.length === 0 ? (
              <p className="py-2 text-center text-[11px] text-[#9ca3af]">No videos to continue watching.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {continueWatching.slice(0, 4).map((c) => (
                  <SmallThumb
                    key={c.video_id}
                    title={c.title}
                    progress={c.progress}
                    remaining={c.remaining}
                    thumbnailUrl={c.thumbnail_url}
                    onPlay={() => router.push(`/videos/${c.video_id}?t=${c.resume_at}`)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Watch Summary */}
          <div className="rounded-2xl border border-[#f0f1f5] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13px] font-extrabold text-[#111827]">Watch Summary</p>
              <TrendingUp className="h-4 w-4 text-[#9ca3af]" />
            </div>
            {sidebarLoading ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-[#fd4605]" /></div>
            ) : (
              <div className="flex flex-col gap-2">
                {([
                  { label: "Total Watched Today", value: watchSummary?.total_watched_today  ?? "0m"           },
                  { label: "Videos Watched",       value: String(watchSummary?.videos_watched_today ?? 0)     },
                  { label: "Live Replays",          value: String(watchSummary?.live_replays_watched  ?? 0)    },
                ] as const).map((r) => (
                  <div key={r.label} className="flex items-center justify-between border-b border-[#f0f1f5] pb-2 last:border-0 last:pb-0">
                    <span className="text-[12px] text-[#6b7280]">{r.label}</span>
                    <span className="text-[13px] font-extrabold text-[#111827]">{r.value}</span>
                  </div>
                ))}
                <div className="mt-1 flex items-center justify-between rounded-[10px] bg-[#fff1f3] px-3 py-2">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-[#9ca3af]">Top Category</p>
                    <p className="text-[14px] font-extrabold" style={{ color: BRAND }}>
                      {watchSummary?.top_category ?? "No data yet"}
                    </p>
                  </div>
                  <Globe className="h-8 w-8 text-[#fecdd3]" />
                </div>
              </div>
            )}
          </div>

          {/* Watched Creators */}
          <div className="rounded-2xl border border-[#f0f1f5] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13px] font-extrabold text-[#111827]">Watched Creators</p>
              {watchedCreators.length > 0 && (
                <button className="text-[11px] font-bold transition hover:underline" style={{ color: BRAND }}>View all</button>
              )}
            </div>
            {sidebarLoading ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-[#fd4605]" /></div>
            ) : watchedCreators.length === 0 ? (
              <p className="py-2 text-center text-[11px] text-[#9ca3af]">No watched creators yet.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {watchedCreators.slice(0, 5).map((c) => (
                  <div key={c.id} className="flex items-center gap-3">
                    {c.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.avatar} alt={c.name} className="h-9 w-9 flex-shrink-0 rounded-full object-cover" />
                    ) : (
                      <div
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
                        style={{ background: "linear-gradient(135deg,#fd4605,#b83203)" }}
                      >
                        {(c.name ?? c.username)[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="truncate text-[12px] font-bold text-[#111827]">{c.name}</span>
                        {c.is_verified && <VerifiedBadge size={14} className="flex-shrink-0" />}
                      </div>
                      <p className="text-[10px] text-[#9ca3af]">@{c.username}</p>
                    </div>
                    <button
                      onClick={() => handleFollowCreator(c.id, c.username, c.is_following)}
                      className="flex-shrink-0 rounded-full border px-3 py-1 text-[11px] font-bold transition-all"
                      style={c.is_following
                        ? { background: BRAND, borderColor: BRAND, color: "#fff" }
                        : { background: "#fff", borderColor: "#e8eaf0", color: "#374151" }}
                    >
                      {c.is_following ? "Following" : "Follow"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* History Settings */}
          <div className="rounded-2xl border border-[#f0f1f5] bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-[#f0f1f5] px-4 py-3">
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: BRAND }}>⚙</span>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">History Settings</p>
            </div>

            <div className="flex items-center justify-between border-b border-[#f0f1f5] px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#f0fdf4]">
                  <Save className="h-3.5 w-3.5 text-[#16a34a]" />
                </span>
                <div>
                  <p className="text-[12px] font-semibold text-[#111827]">Save Watch History</p>
                  <p className="text-[10px] text-[#9ca3af]">Track videos you watch</p>
                </div>
              </div>
              <Toggle on={saveWatch} onChange={setSaveWatch} />
            </div>

            <div className="flex items-center justify-between border-b border-[#f0f1f5] px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#eff6ff]">
                  <Search className="h-3.5 w-3.5 text-[#3b82f6]" />
                </span>
                <div>
                  <p className="text-[12px] font-semibold text-[#111827]">Save Search History</p>
                  <p className="text-[10px] text-[#9ca3af]">Remember recent searches</p>
                </div>
              </div>
              <Toggle on={saveSearch} onChange={setSaveSearch} />
            </div>

            <div className="flex items-center justify-between border-b border-[#f0f1f5] px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#fffbeb]">
                  <RefreshCw className="h-3.5 w-3.5 text-[#f59e0b]" />
                </span>
                <div>
                  <p className="text-[12px] font-semibold text-[#111827]">Auto-delete</p>
                  <p className="text-[10px] text-[#9ca3af]">Remove old history</p>
                </div>
              </div>
              <NiceSelect
                value={autoDelete}
                onChange={setAutoDelete}
                options={["Never", "1 week", "1 month", "2 months", "3 months", "18 months", "36 months"]}
              />
            </div>

            {!saveWatch && (
              <div className="mx-4 mb-0 mt-1 rounded-[8px] bg-[#fffbeb] px-3 py-2 text-[10px] text-[#92400e]">
                Watch history is paused - new videos won&apos;t be saved.
              </div>
            )}

            {/* Save button */}
            <div className="px-4 py-3">
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-[10px] py-2.5 text-[12px] font-bold transition disabled:opacity-60",
                  settingsSaved
                    ? "bg-[#f0fdf4] text-[#16a34a] border border-[#bbf7d0]"
                    : "bg-[#fd4605] text-white hover:bg-[#e03e04]",
                )}
              >
                {savingSettings ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
                ) : settingsSaved ? (
                  <><Check className="h-3.5 w-3.5" /> Saved!</>
                ) : (
                  <><Save className="h-3.5 w-3.5" /> Save Settings</>
                )}
              </button>
            </div>

            <div className="flex gap-2 px-4 pb-3">
              <button
                onClick={clearAll}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-[#fecdd3] bg-[#fff5f5] py-2 text-[11px] font-bold text-[#dc2626] transition hover:bg-[#fee2e2]"
              >
                <Trash2 className="h-3 w-3" /> Clear Watch
              </button>
              <button className="flex flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-[#e8eaf0] bg-white py-2 text-[11px] font-bold text-[#374151] transition hover:bg-[#f8fafc]">
                <X className="h-3 w-3" /> Clear Search
              </button>
            </div>
          </div>

        </div>
      </aside>
    </div>
  );
}
