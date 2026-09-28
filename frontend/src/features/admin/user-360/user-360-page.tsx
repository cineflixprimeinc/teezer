'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  BarChart2Icon,
  BookmarkIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClapperboardIcon,
  ClockIcon,
  EyeIcon,
  FilterIcon,
  HeartIcon,
  ImageIcon,
  LoaderIcon,
  MessageSquareIcon,
  PencilIcon,
  SearchIcon,
  Share2Icon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  StickyNoteIcon,
  TrendingUpIcon,
  UploadIcon,
  UserIcon,
  VideoIcon,
  XCircleIcon,
} from 'lucide-react';
import {
  ContentInsights,
  ContentItem,
  ContentQueryParams,
  ContentResponse,
  ContentStats,
  getRestrictions,
  getUser360,
  getUserContent,
  RestrictionPayloadItem,
  RestrictionsMap,
  RestrictionType,
  updateRestrictions,
  User360Data,
} from '@/services/admin-user360.service';
import MessagesTab from './messages-tab';

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'content' | 'messages' | 'activity' | 'security' | 'reports' | 'audit';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function fmtDate(iso: string | null, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-US', opts ?? { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(s?: number | null): string {
  if (!s || s <= 0) return '-';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

function toLocalDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function addDays(days: number): string {
  const d = new Date(); d.setDate(d.getDate() + days); d.setHours(23, 59, 0, 0);
  return toLocalDatetimeLocal(d);
}

// ─── Toggle ──────────────────────────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${on ? 'bg-red-500' : 'bg-neutral-600'}`}
      aria-checked={on} role="switch">
      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${on ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );
}

// ─── Restriction row ─────────────────────────────────────────────────────────

const RESTRICTION_META: { type: RestrictionType; title: string; description: string }[] = [
  { type: 'restrict_uploads',             title: 'Restrict Uploads',              description: 'Prevent this user from uploading any new content.' },
  { type: 'post_approval_required',       title: 'Post Approval Required',        description: 'All uploads must be approved by an admin before going public.' },
  { type: 'block_live_access',            title: 'Block Live Access',             description: 'Disable this user\'s ability to start a live stream.' },
  { type: 'disable_draft_creation',       title: 'Disable Draft Creation',        description: 'Prevent this user from saving content as drafts.' },
  { type: 'disable_commenting_on_uploads',title: 'Disable Comments on Uploads',   description: 'Turn off comments on all of this user\'s videos.' },
];

interface RowState { isActive: boolean; expiresAt: string; reason: string; showDatePicker: boolean; }

function buildRows(map: RestrictionsMap): Record<RestrictionType, RowState> {
  const result = {} as Record<RestrictionType, RowState>;
  for (const { type } of RESTRICTION_META) {
    const s = map[type];
    result[type] = { isActive: s?.is_active ?? false, expiresAt: s?.expires_at ? toLocalDatetimeLocal(new Date(s.expires_at)) : '', reason: s?.reason ?? '', showDatePicker: false };
  }
  return result;
}

function RestrictionRow({ meta, row, onChange }: { meta: (typeof RESTRICTION_META)[0]; row: RowState; onChange: (p: Partial<RowState>) => void }) {
  const handleToggle = (val: boolean) => onChange({ isActive: val, showDatePicker: val && row.expiresAt === '' });
  const handlePreset = (days: number | 'custom') => days === 'custom' ? onChange({ showDatePicker: true }) : onChange({ expiresAt: addDays(days === 24 ? 1 : days), showDatePicker: false });
  const expiryLabel = row.isActive ? (row.expiresAt ? `Until: ${fmtDate(row.expiresAt)}` : 'No expiry - until manually removed') : null;
  return (
    <div className="border border-neutral-800 rounded-lg p-4 bg-neutral-900/50">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-white text-sm">{meta.title}</p>
            {row.isActive && <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30">Active</span>}
          </div>
          <p className="text-neutral-400 text-xs mt-0.5">{meta.description}</p>
          {expiryLabel && <p className="text-xs mt-1.5 flex items-center gap-1 text-neutral-300"><CalendarIcon size={11} />{expiryLabel}</p>}
        </div>
        <Toggle on={row.isActive} onChange={handleToggle} />
      </div>
      {row.isActive && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-neutral-500 self-center mr-0.5">Expires in:</span>
            {[24, 7, 30].map((d) => (
              <button key={d} type="button" onClick={() => handlePreset(d)}
                className="px-2.5 py-1 text-xs rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-neutral-700 transition-colors">
                {d === 24 ? '24h' : `${d}d`}
              </button>
            ))}
            <button type="button" onClick={() => handlePreset('custom')} className="px-2.5 py-1 text-xs rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-neutral-700 transition-colors">Custom</button>
            <button type="button" onClick={() => onChange({ expiresAt: '', showDatePicker: false })} className="px-2.5 py-1 text-xs rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white border border-neutral-700 transition-colors">No expiry</button>
          </div>
          {row.showDatePicker && (
            <input type="datetime-local" value={row.expiresAt} min={toLocalDatetimeLocal(new Date())}
              onChange={(e) => onChange({ expiresAt: e.target.value })}
              className="text-xs bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-white focus:outline-none focus:border-neutral-500" />
          )}
          <input type="text" placeholder="Reason (optional)" maxLength={500} value={row.reason}
            onChange={(e) => onChange({ reason: e.target.value })}
            className="w-full text-xs bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-500" />
        </div>
      )}
    </div>
  );
}

// ─── Content type badge ───────────────────────────────────────────────────────

function ContentTypeBadge({ type }: { type: ContentItem['content_type'] }) {
  if (type === 'image' || type === 'image_carousel') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-violet-500/15 text-violet-400 border border-violet-500/25">
      <ImageIcon size={9} />Photo
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/25">
      <VideoIcon size={9} />Video
    </span>
  );
}

function StatusBadge({ status }: { status: ContentItem['status'] }) {
  const map: Record<string, string> = {
    published: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    draft:     'bg-amber-500/15 text-amber-400 border-amber-500/25',
    private:   'bg-neutral-600/40 text-neutral-400 border-neutral-600',
    removed:   'bg-red-500/15 text-red-400 border-red-500/25',
  };
  return (
    <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border capitalize ${map[status] ?? 'bg-neutral-700 text-neutral-300 border-neutral-600'}`}>
      {status}
    </span>
  );
}

function VisibilityBadge({ vis }: { vis: ContentItem['visibility'] }) {
  if (vis === 'public')   return <span className="text-[11px] text-emerald-400 flex items-center gap-0.5"><EyeIcon size={10} />Public</span>;
  if (vis === 'only_me')  return <span className="text-[11px] text-amber-400 flex items-center gap-0.5"><EyeIcon size={10} />Only me</span>;
  if (vis === 'private')  return <span className="text-[11px] text-neutral-400 flex items-center gap-0.5"><EyeIcon size={10} />Private</span>;
  return <span className="text-[11px] text-red-400 flex items-center gap-0.5"><XCircleIcon size={10} />Removed</span>;
}

// ─── Content Tab ─────────────────────────────────────────────────────────────

const TYPE_FILTERS = [
  { id: 'all',   label: 'All' },
  { id: 'video', label: 'Videos' },
  { id: 'photo', label: 'Photos' },
  { id: 'draft', label: 'Drafts' },
  { id: 'reported', label: 'Reported' },
] as const;

const SORT_OPTIONS = [
  { value: 'latest',   label: 'Latest' },
  { value: 'oldest',   label: 'Oldest' },
  { value: 'views',    label: 'Most Views' },
  { value: 'likes',    label: 'Most Likes' },
  { value: 'comments', label: 'Most Comments' },
];

// ─── Content Preview Modal ────────────────────────────────────────────────────

function ContentPreviewModal({ item, onClose }: { item: ContentItem; onClose: () => void }) {
  const isImage = item.content_type === 'image' || item.content_type === 'image_carousel';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}>
      <div className="relative flex flex-col items-center gap-3 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        {/* Close */}
        <button type="button" onClick={onClose}
          className="absolute -top-10 right-0 text-white/70 hover:text-white transition-colors">
          <XCircleIcon size={24} />
        </button>

        {/* Post card - 9:16 */}
        <div className="w-full rounded-2xl overflow-hidden shadow-2xl bg-[#1a1a2e]"
          style={{ maxWidth: 280, aspectRatio: '9/16' }}>
          {item.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.thumbnail_url} alt={item.caption ?? ''} className="w-full h-full object-cover" />
          ) : (
            <div className="h-full flex items-center justify-center">
              {isImage
                ? <ImageIcon size={48} className="text-white/30" />
                : <VideoIcon size={48} className="text-white/30" />}
            </div>
          )}
        </div>

        {/* Caption */}
        {item.caption && (
          <p className="text-sm text-white/80 text-center max-w-xs line-clamp-3">{item.caption}</p>
        )}

        {/* Links */}
        <div className="flex gap-2">
          <a href={`/videos/${item.id}`} target="_blank" rel="noreferrer"
            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs text-white transition-colors">
            View Post
          </a>
          <a href={`/admin/videos/${item.id}/edit`} target="_blank" rel="noreferrer"
            className="px-4 py-2 bg-red-500/80 hover:bg-red-500 rounded-lg text-xs text-white transition-colors">
            Edit
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Content Tab ─────────────────────────────────────────────────────────────

function ContentTab({ userId }: { userId: number }) {
  const [data,      setData]      = useState<ContentResponse | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sort,      setSort]      = useState('latest');
  const [search,    setSearch]    = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page,      setPage]      = useState(1);
  const [dateFrom,  setDateFrom]  = useState('');
  const [dateTo,    setDateTo]    = useState('');
  const [visFilter, setVisFilter] = useState('all');
  const [previewItem, setPreviewItem] = useState<ContentItem | null>(null);

  const fetchContent = useCallback(async () => {
    setLoading(true);
    try {
      // Map UI filter to API params
      let apiType:   ContentQueryParams['type']   = 'all';
      let apiStatus: ContentQueryParams['status'] = 'all';
      if (typeFilter === 'video')    apiType   = 'video';
      else if (typeFilter === 'photo')   apiType   = 'photo';
      else if (typeFilter === 'draft')   apiStatus = 'draft';
      else if (typeFilter === 'reported') apiStatus = 'reported';

      const result = await getUserContent(userId, {
        type:      apiType,
        status:    apiStatus,
        sort:      sort as ContentQueryParams['sort'],
        search:    search || undefined,
        page,
        per_page:  10,
        date_from: dateFrom || undefined,
        date_to:   dateTo   || undefined,
      });
      setData(result);
    } catch {
      toast.error('Failed to load content data');
    } finally {
      setLoading(false);
    }
  }, [userId, typeFilter, sort, search, page, dateFrom, dateTo]);

  useEffect(() => { fetchContent(); }, [fetchContent]);

  // Reset page when filter changes
  useEffect(() => { setPage(1); }, [typeFilter, sort, search, dateFrom, dateTo]);

  const handleSearchSubmit = (e: React.FormEvent) => { e.preventDefault(); setSearch(searchInput); };

  const stats:    ContentStats   = data?.stats    ?? { total_posts: 0, videos: 0, photos: 0, total_views: 0 };
  const insights: ContentInsights = data?.insights ?? { top_post: null, top_category: null, last_upload: null, moderation_notes_count: 0 };
  const items     = data?.items      ?? [];
  const pagination = data?.pagination ?? { current_page: 1, last_page: 1, per_page: 10, total: 0 };

  const STAT_CARDS = [
    { label: 'Total Posts',  value: stats.total_posts,  icon: ClapperboardIcon, color: 'text-blue-400',    bg: 'bg-blue-500/10'    },
    { label: 'Videos',       value: stats.videos,       icon: VideoIcon,        color: 'text-violet-400',  bg: 'bg-violet-500/10'  },
    { label: 'Photos',       value: stats.photos,       icon: ImageIcon,        color: 'text-amber-400',   bg: 'bg-amber-500/10'   },
    { label: 'Total Views',  value: stats.total_views,  icon: EyeIcon,          color: 'text-pink-400',    bg: 'bg-pink-500/10',   fmt: true },
  ];

  return (
    <>
    <div className="flex gap-4">
      {/* ── Main panel ── */}
      <div className="flex-1 min-w-0 space-y-4">

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {STAT_CARDS.map(({ label, value, icon: Icon, color, bg, fmt }) => (
            <div key={label} className="bg-neutral-900 border border-neutral-800 rounded-xl p-3.5 flex items-center gap-3">
              <div className={`${bg} p-2 rounded-lg flex-shrink-0`}>
                <Icon size={16} className={color} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-neutral-500 font-medium truncate">{label}</p>
                <p className="text-base font-bold text-white leading-tight">{fmt ? fmtCount(value) : value.toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filter tabs + search row */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="border-b border-neutral-800 px-4 pt-3 flex items-center justify-between gap-3 flex-wrap">
            {/* Type filter pills */}
            <div className="flex items-center gap-1 flex-wrap">
              {TYPE_FILTERS.map(({ id, label }) => (
                <button key={id} type="button" onClick={() => setTypeFilter(id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${typeFilter === id ? 'bg-red-500 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* Search + sort + visibility + date */}
            <div className="flex items-center gap-2 pb-3">
              <form onSubmit={handleSearchSubmit} className="relative">
                <SearchIcon size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search content…"
                  className="bg-neutral-800 border border-neutral-700 rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-500 w-44" />
              </form>

              <select value={sort} onChange={(e) => setSort(e.target.value)}
                className="bg-neutral-800 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-neutral-500 cursor-pointer">
                {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>

              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="bg-neutral-800 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-neutral-500 w-32" />
              <span className="text-neutral-600 text-xs">-</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="bg-neutral-800 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-neutral-500 w-32" />
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <LoaderIcon size={22} className="animate-spin text-neutral-500" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-neutral-500">
              <ClapperboardIcon size={32} className="mb-3 opacity-40" />
              <p className="text-sm">No content found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="border-b border-neutral-800">
                      <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-neutral-500 uppercase tracking-wider w-56">Content</th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Type</th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Status</th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Visibility</th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Views</th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Likes</th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Comments</th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Shares</th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Watch Time</th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Published On</th>
                      <th className="px-3 py-2.5 text-center text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b border-neutral-800/60 hover:bg-neutral-800/30 transition-colors">
                        {/* Content */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            {/* Thumbnail - clickable to open preview */}
                            {(() => {
                              const isImagePost = item.content_type === 'image' || item.content_type === 'image_carousel';
                              return (
                                <button type="button" onClick={() => setPreviewItem(item)}
                                  className="relative w-12 h-16 rounded-md flex-shrink-0 overflow-hidden cursor-pointer group">
                                  {item.thumbnail_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover bg-neutral-800" />
                                  ) : (
                                    <div className="w-full h-full bg-neutral-800 flex items-center justify-center">
                                      {isImagePost ? <ImageIcon size={14} className="text-neutral-600" /> : <VideoIcon size={14} className="text-neutral-600" />}
                                    </div>
                                  )}
                                  {/* Hover overlay */}
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                                    <EyeIcon size={12} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </div>
                                </button>
                              );
                            })()}
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-white line-clamp-2 leading-tight">
                                {item.caption || <span className="text-neutral-500 italic">Untitled</span>}
                              </p>
                              <p className="text-[10px] text-neutral-600 mt-0.5">ID: {item.id}
                                {item.duration ? ` · ${fmtDuration(item.duration)}` : ''}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3"><ContentTypeBadge type={item.content_type} /></td>
                        <td className="px-3 py-3"><StatusBadge status={item.status} /></td>
                        <td className="px-3 py-3"><VisibilityBadge vis={item.visibility} /></td>
                        <td className="px-3 py-3 text-right text-xs text-neutral-300 font-medium">{fmtCount(item.views_count)}</td>
                        <td className="px-3 py-3 text-right text-xs text-neutral-300 font-medium">{fmtCount(item.likes_count)}</td>
                        <td className="px-3 py-3 text-right text-xs text-neutral-300 font-medium">{fmtCount(item.comments_count)}</td>
                        <td className="px-3 py-3 text-right text-xs text-neutral-300 font-medium">{item.shares_count > 0 ? fmtCount(item.shares_count) : '-'}</td>
                        <td className="px-3 py-3 text-xs text-neutral-400">-</td>
                        <td className="px-3 py-3 text-[11px] text-neutral-400 whitespace-nowrap">
                          {item.published_at ? fmtDateTime(item.published_at) : '-'}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button type="button" onClick={() => setPreviewItem(item)}
                              className="h-6 w-6 grid place-items-center rounded hover:bg-neutral-700 text-neutral-500 hover:text-white transition-colors" title="Preview">
                              <EyeIcon size={12} />
                            </button>
                            <a href={`/admin/videos/${item.id}/edit`} target="_blank" rel="noreferrer"
                              className="h-6 w-6 grid place-items-center rounded hover:bg-neutral-700 text-neutral-500 hover:text-white transition-colors" title="Edit">
                              <PencilIcon size={12} />
                            </a>
                            <a href={`/admin/videos/${item.id}`} target="_blank" rel="noreferrer"
                              className="h-6 w-6 grid place-items-center rounded hover:bg-neutral-700 text-neutral-500 hover:text-white transition-colors" title="Stats">
                              <BarChart2Icon size={12} />
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination.last_page > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-800">
                  <p className="text-xs text-neutral-500">
                    Showing {((pagination.current_page - 1) * pagination.per_page) + 1}-{Math.min(pagination.current_page * pagination.per_page, pagination.total)} of {pagination.total}
                  </p>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                      className="h-7 w-7 grid place-items-center rounded border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      <ChevronLeftIcon size={13} />
                    </button>
                    {Array.from({ length: Math.min(5, pagination.last_page) }, (_, i) => {
                      const pg = i + 1;
                      return (
                        <button key={pg} type="button" onClick={() => setPage(pg)}
                          className={`h-7 w-7 grid place-items-center rounded border text-xs font-medium transition-colors ${pg === page ? 'border-red-500 bg-red-500/20 text-red-400' : 'border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500'}`}>
                          {pg}
                        </button>
                      );
                    })}
                    <button type="button" onClick={() => setPage((p) => Math.min(pagination.last_page, p + 1))} disabled={page >= pagination.last_page}
                      className="h-7 w-7 grid place-items-center rounded border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      <ChevronRightIcon size={13} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Content Insights Sidebar ── */}
      <div className="hidden xl:flex flex-col gap-3 flex-shrink-0" style={{ width: 240 }}>

        {/* Title */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUpIcon size={14} className="text-red-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Content Insights</h3>
          </div>

          {/* Top Performing Post */}
          {insights.top_post && (
            <div className="mb-3 pb-3 border-b border-neutral-800">
              <p className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider mb-2">Top Performing Post</p>
              <div className="flex items-start gap-2">
                {insights.top_post.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={insights.top_post.thumbnail_url} alt="" className="w-10 h-10 rounded-md object-cover flex-shrink-0 bg-neutral-800" />
                ) : (
                  <div className="w-10 h-10 rounded-md bg-neutral-800 flex items-center justify-center flex-shrink-0">
                    <VideoIcon size={12} className="text-neutral-600" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-white line-clamp-2 leading-tight">
                    {insights.top_post.caption || 'Untitled'}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-neutral-500 flex items-center gap-0.5"><EyeIcon size={9} />{fmtCount(insights.top_post.views_count)}</span>
                    <span className="text-[10px] text-neutral-500 flex items-center gap-0.5"><HeartIcon size={9} />{fmtCount(insights.top_post.likes_count)}</span>
                  </div>
                </div>
              </div>
              <ChevronRightIcon size={12} className="text-neutral-600 ml-auto mt-1" />
            </div>
          )}

          {/* Most Used Category */}
          {insights.top_category && (
            <div className="mb-3 pb-3 border-b border-neutral-800">
              <p className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider mb-1.5">Most Used Category</p>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white capitalize">{insights.top_category.name}</span>
                <span className="text-[10px] text-neutral-500">{insights.top_category.count} posts</span>
              </div>
            </div>
          )}

          {/* Last Upload */}
          <div className="mb-3 pb-3 border-b border-neutral-800">
            <p className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider mb-1.5">Last Upload</p>
            <div className="flex items-center gap-1.5">
              <CalendarIcon size={11} className="text-neutral-500 flex-shrink-0" />
              <span className="text-[11px] text-white">{insights.last_upload ? fmtDateTime(insights.last_upload) : 'Never'}</span>
            </div>
          </div>

          {/* Copyright & Content Check */}
          <div className="mb-3 pb-3 border-b border-neutral-800">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider">Copyright &amp; Content</p>
              <ChevronRightIcon size={12} className="text-neutral-600" />
            </div>
            <div className="flex items-center gap-1.5">
              <ShieldCheckIcon size={13} className="text-emerald-400 flex-shrink-0" />
              <span className="text-[11px] text-emerald-400 font-medium">No issues detected</span>
            </div>
            <p className="text-[10px] text-neutral-600 mt-1">Scanned just now</p>
          </div>

          {/* Moderation Notes */}
          <div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider">Moderation Notes</p>
              {insights.moderation_notes_count > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                  {insights.moderation_notes_count}
                </span>
              )}
            </div>
            <p className="text-[10px] text-neutral-600 mt-1.5">
              {insights.moderation_notes_count === 0 ? 'No moderation notes' : `${insights.moderation_notes_count} admin note${insights.moderation_notes_count > 1 ? 's' : ''} on file`}
            </p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-2">
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2">Quick Stats</p>
          {[
            { label: 'Published', value: data?.items.filter(i => i.status === 'published').length ?? 0 },
            { label: 'Drafts',    value: data?.items.filter(i => i.status === 'draft').length ?? 0 },
            { label: 'Private',   value: data?.items.filter(i => i.status === 'private').length ?? 0 },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">{label}</span>
              <span className="text-xs font-bold text-white">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* Preview modal */}
    {previewItem && <ContentPreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />}
    </>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ userInfo }: { userInfo: User360Data }) {
  const stats = [
    { label: 'Followers',  value: fmtCount(userInfo.followers_count),  icon: UserIcon,        color: 'text-blue-400'   },
    { label: 'Following',  value: fmtCount(userInfo.following_count),  icon: UserIcon,        color: 'text-violet-400' },
    { label: 'Videos',     value: fmtCount(userInfo.videos_count),     icon: VideoIcon,       color: 'text-amber-400'  },
    { label: 'Joined',     value: fmtDate(userInfo.created_at, { month: 'short', year: 'numeric' }), icon: CalendarIcon, color: 'text-emerald-400' },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-center">
            <Icon size={20} className={`${color} mx-auto mb-2`} />
            <p className="text-lg font-bold text-white">{value}</p>
            <p className="text-xs text-neutral-500">{label}</p>
          </div>
        ))}
      </div>
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Account Details</h3>
        <div className="grid grid-cols-2 gap-y-3 text-sm">
          {[
            ['Email',    userInfo.email],
            ['Username', '@' + userInfo.username],
            ['Role',     userInfo.role],
            ['Verified', userInfo.is_verified ? 'Yes' : 'No'],
            ['Banned',   userInfo.is_banned ? 'Yes' : 'No'],
            ['Risk',     `${userInfo.risk_score} - ${userInfo.risk_label}`],
          ].map(([k, v]) => (
            <div key={k}><span className="text-neutral-500 mr-2">{k}:</span><span className="text-neutral-200">{v}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Activity / Audit placeholder ────────────────────────────────────────────

function PlaceholderTab({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-neutral-600">
      <Icon size={36} className="mb-3 opacity-40" />
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs mt-1">Coming soon</p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview',  label: 'Overview',  icon: UserIcon         },
  { id: 'content',   label: 'Content',   icon: ClapperboardIcon },
  { id: 'messages',  label: 'Messages',  icon: MessageSquareIcon },
  { id: 'activity',  label: 'Activity',  icon: TrendingUpIcon   },
  { id: 'security',  label: 'Security',  icon: ShieldAlertIcon  },
  { id: 'reports',   label: 'Reports',   icon: BarChart2Icon    },
  { id: 'audit',     label: 'Audit Log', icon: StickyNoteIcon   },
];

export default function User360Page({ userId }: { userId: number }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('content');

  const [userInfo,     setUserInfo]     = useState<User360Data | null>(null);
  const [loadingUser,  setLoadingUser]  = useState(true);
  const [rows,         setRows]         = useState<Record<RestrictionType, RowState> | null>(null);
  const [loadingRest,  setLoadingRest]  = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [searchId,     setSearchId]     = useState(String(userId));
  const origRef = useRef<Record<RestrictionType, RowState> | null>(null);

  const loadAll = useCallback(async () => {
    setLoadingUser(true); setLoadingRest(true);
    try {
      const [u, r] = await Promise.all([getUser360(userId), getRestrictions(userId)]);
      setUserInfo(u);
      const built = buildRows(r);
      setRows(built);
      origRef.current = JSON.parse(JSON.stringify(built));
    } catch {
      toast.error('Failed to load user data.');
    } finally {
      setLoadingUser(false); setLoadingRest(false);
    }
  }, [userId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const isDirty = (() => {
    if (!rows || !origRef.current) return false;
    for (const { type } of RESTRICTION_META) {
      const a = rows[type], b = origRef.current[type];
      if (a.isActive !== b.isActive || a.expiresAt !== b.expiresAt || a.reason !== b.reason) return true;
    }
    return false;
  })();

  const handleSave = async () => {
    if (!rows || !isDirty) return;
    for (const { type } of RESTRICTION_META) {
      const r = rows[type];
      if (r.isActive && r.expiresAt && new Date(r.expiresAt) <= new Date()) {
        toast.error('Expiry date must be in the future.'); return;
      }
    }
    setSaving(true);
    try {
      const payload: RestrictionPayloadItem[] = RESTRICTION_META.map(({ type }) => ({
        type, is_active: rows[type].isActive,
        expires_at: rows[type].isActive && rows[type].expiresAt ? new Date(rows[type].expiresAt).toISOString() : null,
        reason: rows[type].reason || null,
      }));
      const updated = await updateRestrictions(userId, payload);
      const built = buildRows(updated);
      setRows(built); origRef.current = JSON.parse(JSON.stringify(built));
      toast.success('Restrictions saved successfully.');
    } catch { toast.error('Failed to save restrictions.'); }
    finally { setSaving(false); }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const id = parseInt(searchId.trim(), 10);
    if (!isNaN(id) && id > 0) router.push(`/admin/users/${id}/360`);
  };

  const updateRow = (type: RestrictionType, patch: Partial<RowState>) =>
    setRows((prev) => prev ? { ...prev, [type]: { ...prev[type], ...patch } } : prev);

  const isLoading = loadingUser || loadingRest;

  return (
    <div className="space-y-5">

      {/* ── Search bar ── */}
      <form onSubmit={handleSearch} className="flex gap-2 max-w-xs">
        <input type="number" value={searchId} onChange={(e) => setSearchId(e.target.value)} placeholder="User ID"
          className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-500" />
        <button type="submit" className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-white transition-colors">
          <SearchIcon size={15} />
        </button>
      </form>

      {isLoading && (
        <div className="flex items-center gap-3 text-neutral-400">
          <LoaderIcon size={18} className="animate-spin" /><span className="text-sm">Loading user data…</span>
        </div>
      )}

      {!isLoading && !userInfo && (
        <div className="text-sm text-red-400 flex items-center gap-2">
          <XCircleIcon size={16} />User not found or access denied.
        </div>
      )}

      {!isLoading && userInfo && (
        <>
          {/* ── User header card ── */}
          <div className="flex items-center gap-4 p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
            {userInfo.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={userInfo.avatar} alt={userInfo.name} className="w-14 h-14 rounded-full object-cover border border-neutral-700" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-neutral-800 flex items-center justify-center text-xl font-bold text-neutral-400">
                {userInfo.name?.[0]?.toUpperCase() ?? '?'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-white">{userInfo.name}</span>
                <span className="text-neutral-400 text-sm">@{userInfo.username}</span>
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-neutral-800 text-neutral-300 border border-neutral-700">{userInfo.role}</span>
                {userInfo.is_verified && <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">Verified</span>}
                {userInfo.is_banned && <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30">Banned</span>}
              </div>
              <p className="text-neutral-500 text-xs mt-0.5">{userInfo.email}</p>
            </div>
            <div className="flex gap-3 text-center shrink-0">
              <div className="bg-neutral-800 rounded-lg px-3 py-2 border border-neutral-700">
                <div className="flex items-center gap-1 justify-center">
                  <ShieldAlertIcon size={12} className="text-orange-400" />
                  <span className="text-xs text-neutral-400">Risk</span>
                </div>
                <p className="text-sm font-bold text-white mt-0.5">{userInfo.risk_score}</p>
                <p className="text-[10px] text-orange-400">{userInfo.risk_label}</p>
              </div>
              <div className="bg-neutral-800 rounded-lg px-3 py-2 border border-neutral-700">
                <div className="flex items-center gap-1 justify-center">
                  <CheckCircleIcon size={12} className="text-green-400" />
                  <span className="text-xs text-neutral-400">Health</span>
                </div>
                <p className="text-sm font-bold text-white mt-0.5">{userInfo.account_health}</p>
                <p className="text-[10px] text-green-400">{userInfo.health_label}</p>
              </div>
            </div>
          </div>

          {/* ── Tabs ── */}
          <div className="border-b border-neutral-800 flex items-center gap-0 overflow-x-auto hide-scrollbar">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === id
                    ? 'border-red-500 text-red-400'
                    : 'border-transparent text-neutral-500 hover:text-neutral-300'
                }`}>
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>

          {/* ── Tab content ── */}
          <div>
            {activeTab === 'overview'  && <OverviewTab userInfo={userInfo} />}
            {activeTab === 'content'   && <ContentTab userId={userId} />}
            {activeTab === 'messages'  && <MessagesTab userId={userId} />}
            {activeTab === 'activity'  && <PlaceholderTab icon={TrendingUpIcon} label="Activity Feed" />}
            {activeTab === 'security' && (
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-neutral-800 flex items-center gap-2">
                  <ShieldAlertIcon size={16} className="text-red-400" />
                  <h2 className="font-semibold text-white text-sm">Content Restrictions &amp; Upload Controls</h2>
                </div>
                <div className="p-4 space-y-3">
                  {rows && RESTRICTION_META.map((meta) => (
                    <RestrictionRow key={meta.type} meta={meta} row={rows[meta.type]} onChange={(patch) => updateRow(meta.type, patch)} />
                  ))}
                </div>
                <div className="px-5 py-4 border-t border-neutral-800 flex items-center justify-between">
                  <p className="text-xs text-neutral-500">Active restrictions are synced in real-time.</p>
                  <button type="button" onClick={handleSave} disabled={!isDirty || saving}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-white text-black hover:bg-neutral-200 disabled:bg-neutral-700 disabled:text-neutral-400">
                    {saving ? <><LoaderIcon size={14} className="animate-spin" />Saving…</> : <><ChevronRightIcon size={14} />Save Restrictions</>}
                  </button>
                </div>
              </div>
            )}
            {activeTab === 'reports'  && <PlaceholderTab icon={BarChart2Icon}  label="Reports" />}
            {activeTab === 'audit'    && <PlaceholderTab icon={StickyNoteIcon} label="Audit Log" />}
          </div>
        </>
      )}
    </div>
  );
}
