'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/admin-panel/services/api';
import {
  Search, MessageSquare, Flag, AlertTriangle, VolumeX, Shield,
  Trash2, ExternalLink, Download, Eye, Lock, Ban, CheckCircle2,
  X, Image, Video, Mic, FileText, ArrowLeftRight, Inbox,
  Bell, BellOff, Calendar, Clock, RefreshCw, Info,
  UserX, ShieldOff, BookOpen, Mail, Send, AlertCircle,
} from 'lucide-react';

/* ── Types ──────────────────────────────────────────────────────────────────── */
interface ConvUser {
  id: number; username: string; name: string | null;
  avatar: string | null; is_online: boolean; is_banned: boolean;
}
interface Conversation {
  id: number; status: string; report_status: string | null; risk_level: string | null;
  flagged_at: string | null; shadow_restricted: boolean; dm_restricted: boolean;
  message_approval_required: boolean; links_disabled: boolean; media_restricted: boolean;
  prevent_new_requests: boolean; auto_hide_reported: boolean; history_archived: boolean;
  auto_delete_flagged: string | null; admin_closed_at: string | null; admin_muted_at: string | null;
  restrictions_config: Record<string, string | null> | null;
  admin_note: string | null;
  user_a: ConvUser; user_b: ConvUser;
  last_message: { id: number; body: string | null; message_type: string; sender_id: number; created_at: string } | null;
  unread_count: number; flagged_count: number;
}
interface Message {
  id: number; conversation_id: number; sender_id: number; receiver_id: number;
  body: string | null; message_type: string; r2_url: string | null; thumbnail_url: string | null;
  read_at: string | null; flagged_by_admin: boolean; deleted_for_everyone: boolean;
  created_at: string; sender: { id: number; username: string; avatar: string | null } | null;
}
interface ActivityLog { id: number; action: string; actor_label: string | null; created_at: string; }

/* ── API helpers ────────────────────────────────────────────────────────────── */
const msgApi = {
  conversations: (userId: number, p?: { search?: string; filter?: string }) =>
    api.get('/admin/messages/conversations', { params: { user_id: userId, ...p } }).then(r => r.data),
  messages: (id: number) =>
    api.get(`/admin/messages/conversations/${id}/messages`).then(r => r.data),
  activity: (id: number) =>
    api.get(`/admin/messages/conversations/${id}/activity`).then(r => r.data.data as ActivityLog[]),
  updateSettings: (id: number, s: Record<string, unknown>) =>
    api.post(`/admin/messages/conversations/${id}/settings`, s).then(r => r.data),
  action: (id: number, action: string, extra?: Record<string, unknown>) =>
    api.post(`/admin/messages/conversations/${id}/action`, { action, ...extra }).then(r => r.data),
  flagMessage: (msgId: number) => api.post(`/admin/messages/${msgId}/flag`).then(r => r.data),
  deleteMessage: (msgId: number) => api.delete(`/admin/messages/${msgId}`).then(r => r.data),
  exportChat: (id: number) => api.get(`/admin/messages/conversations/${id}/export`).then(r => r.data),
};

/* ── Small reusable components ──────────────────────────────────────────────── */
function Av({ url, name, size = 8, ring = false, online = false }:
  { url: string | null; name: string | null; size?: number; ring?: boolean; online?: boolean }) {
  return (
    <div className={`relative inline-flex flex-shrink-0 w-${size} h-${size}`}>
      {url
        ? <img src={url} className={`w-${size} h-${size} ${ring ? 'ring-2 ring-white' : ''} rounded-full object-cover`}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        : <div className={`w-${size} h-${size} ${ring ? 'ring-2 ring-white' : ''} rounded-full bg-[#fd4605]/10 flex items-center justify-center text-[#fd4605] font-bold text-xs`}>
            {(name ?? '?')[0].toUpperCase()}
          </div>
      }
      {online && <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 border-2 border-white rounded-full" />}
    </div>
  );
}

function RiskBadge({ risk }: { risk: string | null }) {
  if (!risk) return null;
  const map: Record<string, string> = {
    low: 'bg-green-50 text-green-700 border-green-200',
    medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    high: 'bg-orange-50 text-orange-700 border-orange-200',
    critical: 'bg-red-50 text-red-700 border-red-200',
  };
  return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${map[risk] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>{risk.toUpperCase()}</span>;
}

function SectionHead({ title, icon: Icon }: { title: string; icon?: React.ElementType }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      {Icon && <Icon className="w-3 h-3 text-[#9ca3af]" />}
      <p className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-widest">{title}</p>
    </div>
  );
}

function MsgTypeIcon({ type }: { type: string }) {
  if (type === 'image') return <Image className="w-3 h-3" />;
  if (type === 'video') return <Video className="w-3 h-3" />;
  if (type === 'voice' || type === 'audio') return <Mic className="w-3 h-3" />;
  if (type === 'document') return <FileText className="w-3 h-3" />;
  return null;
}

function fmtTime(dt: string) { return new Date(dt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function fmtDate(dt: string) { return new Date(dt).toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' }); }

interface RUser { id: number; username: string; avatar: string | null; }

/* ── Restriction row: pick user → set duration → save ───────────────────────── */
function RestrictionRow({
  label, icon: Icon, enabled, expiresAt, onEnable, onDisable, onChangeExpiry, disabled, users,
}: {
  label: string; icon: React.ElementType; enabled: boolean; expiresAt: string | null;
  onEnable: (expiresAt: string | null, targetUser: RUser | null) => void;
  onDisable: () => void;
  onChangeExpiry: (v: string | null) => void;
  disabled?: boolean;
  users?: RUser[];
}) {
  const [step, setStep] = useState<'idle' | 'pick-user' | 'pick-time'>('idle');
  const [targetUser, setTargetUser] = useState<RUser | null>(null);
  const [pendingExpiry, setPendingExpiry] = useState('');
  const [showEditPicker, setShowEditPicker] = useState(false);

  const isPending = step !== 'idle';

  const handleToggleClick = () => {
    if (enabled) {
      setShowEditPicker(false);
      onDisable();
    } else {
      setTargetUser(null);
      setPendingExpiry('');
      setStep(users && users.length > 1 ? 'pick-user' : 'pick-time');
    }
  };

  const handlePickUser = (u: RUser) => {
    setTargetUser(u);
    setStep('pick-time');
  };

  const handleApply = () => {
    setStep('idle');
    onEnable(pendingExpiry || null, targetUser);
  };

  const handleCancel = () => {
    setStep('idle');
    setTargetUser(null);
    setPendingExpiry('');
  };

  const borderCls = enabled
    ? 'bg-[#fff5f6] border-[#fecaca] shadow-sm'
    : isPending
    ? 'bg-blue-50 border-blue-300 shadow-sm'
    : 'bg-white border-[#f0f0f0] hover:border-[#ddd]';

  return (
    <div className={`rounded-2xl border transition-all duration-200 overflow-hidden ${borderCls}`}>

      {/* ── Main toggle row ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2.5 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
            enabled ? 'bg-[#fd4605]/12' : isPending ? 'bg-blue-100' : 'bg-[#f3f4f6]'
          }`}>
            <Icon className={`w-3 h-3 transition-colors ${
              enabled ? 'text-[#fd4605]' : isPending ? 'text-blue-500' : 'text-[#9ca3af]'
            }`} />
          </div>
          <span className={`text-[11px] font-semibold truncate transition-colors ${
            enabled ? 'text-[#111827]' : isPending ? 'text-blue-700' : 'text-[#6b7280]'
          }`}>
            {label}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full transition-all ${
            enabled ? 'bg-[#fd4605] text-white'
            : step === 'pick-user' ? 'bg-purple-500 text-white'
            : step === 'pick-time' ? 'bg-blue-500 text-white'
            : 'bg-[#f3f4f6] text-[#bbb]'
          }`}>
            {enabled ? 'ON' : step === 'pick-user' ? 'SELECT' : step === 'pick-time' ? 'SET TIME' : 'OFF'}
          </span>

          {enabled && (
            <button onClick={() => setShowEditPicker(p => !p)} title="Edit expiry"
              className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                showEditPicker ? 'bg-[#fd4605]/10 text-[#fd4605]' : 'text-[#c0c0c0] hover:text-[#fd4605] hover:bg-[#fd4605]/5'
              }`}>
              <Calendar className="w-3 h-3" />
            </button>
          )}

          <button
            onClick={handleToggleClick}
            disabled={disabled || isPending}
            className={`relative inline-flex w-11 h-[22px] rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-40 flex-shrink-0 ${
              enabled ? 'bg-[#fd4605]' : isPending ? 'bg-blue-400' : 'bg-[#d1d5db]'
            }`}
          >
            <span className={`inline-block w-[18px] h-[18px] bg-white rounded-full shadow-md transform transition-transform duration-200 mt-[2px] ${
              enabled || isPending ? 'translate-x-[22px]' : 'translate-x-[2px]'
            }`} />
          </button>
        </div>
      </div>

      {/* ── Step 1: Pick which user ──────────────────────────────────────────── */}
      {step === 'pick-user' && users && (
        <div className="px-3 pb-3 pt-2.5 border-t border-purple-200">
          <p className="text-[9px] font-bold text-purple-600 uppercase tracking-wider mb-2.5 flex items-center gap-1">
            <UserX className="w-2.5 h-2.5" /> Who should this restriction apply to?
          </p>
          <div className="space-y-1.5 mb-2">
            {users.map(u => (
              <button key={u.id} onClick={() => handlePickUser(u)}
                className="w-full flex items-center gap-2.5 bg-white border border-[#e8eaed] hover:border-purple-300 hover:bg-purple-50 rounded-xl px-3 py-2 transition-all group">
                {u.avatar
                  ? <img src={u.avatar} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                  : <div className="w-7 h-7 rounded-full bg-[#fd4605]/10 flex items-center justify-center flex-shrink-0 text-[#fd4605] font-bold text-[10px]">
                      {u.username[0].toUpperCase()}
                    </div>
                }
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-[11px] font-semibold text-[#111827] truncate">@{u.username}</p>
                </div>
                <span className="text-[9px] text-purple-400 group-hover:text-purple-600 font-semibold flex-shrink-0">Select →</span>
              </button>
            ))}
          </div>
          <button onClick={handleCancel}
            className="w-full text-[10px] font-semibold bg-white border border-[#e8eaed] text-[#6b7280] rounded-xl py-1.5 hover:bg-[#f3f4f6] transition-all">
            Cancel
          </button>
        </div>
      )}

      {/* ── Step 2: Set duration ─────────────────────────────────────────────── */}
      {step === 'pick-time' && (
        <div className="px-3 pb-3 pt-2.5 border-t border-blue-200">
          {targetUser && (
            <div className="flex items-center gap-2 mb-2.5 bg-white border border-blue-100 rounded-xl px-2.5 py-1.5">
              {targetUser.avatar
                ? <img src={targetUser.avatar} className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                : <div className="w-5 h-5 rounded-full bg-[#fd4605]/10 flex items-center justify-center flex-shrink-0 text-[#fd4605] font-bold text-[9px]">
                    {targetUser.username[0].toUpperCase()}
                  </div>
              }
              <span className="text-[10px] font-semibold text-[#111827] truncate">@{targetUser.username}</span>
              <button onClick={() => setStep('pick-user')}
                className="ml-auto text-[9px] text-blue-400 hover:text-blue-600 font-medium flex-shrink-0">
                Change
              </button>
            </div>
          )}
          <p className="text-[9px] font-bold text-blue-600 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" /> How long should this restriction last?
          </p>
          <input
            type="datetime-local"
            value={pendingExpiry}
            onChange={e => setPendingExpiry(e.target.value)}
            autoFocus
            className="w-full text-[10px] bg-white border border-blue-200 rounded-xl px-2.5 py-1.5 text-[#111827] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 mb-1.5 transition-all"
          />
          <p className="text-[9px] text-blue-400 mb-2">Leave blank to restrict indefinitely.</p>
          <div className="flex gap-1.5">
            <button onClick={handleApply}
              className="flex-1 text-[10px] font-bold bg-[#fd4605] text-white rounded-xl py-1.5 hover:bg-[#e0264d] active:scale-95 transition-all shadow-sm">
              Turn On
            </button>
            <button onClick={handleCancel}
              className="flex-1 text-[10px] font-semibold bg-white border border-[#e8eaed] text-[#6b7280] rounded-xl py-1.5 hover:bg-[#f3f4f6] active:scale-95 transition-all">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Edit expiry while ON ─────────────────────────────────────────────── */}
      {enabled && showEditPicker && (
        <div className="px-3 pb-3 pt-2 border-t border-[#fde8e8]">
          <p className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider mb-1.5">Active Until</p>
          <div className="flex items-center gap-1.5">
            <input
              type="datetime-local"
              value={expiresAt ?? ''}
              onChange={e => onChangeExpiry(e.target.value || null)}
              className="flex-1 text-[10px] bg-white border border-[#e8eaed] rounded-xl px-2.5 py-1.5 text-[#111827] outline-none focus:border-[#fd4605]/50 min-w-0 transition-all"
            />
            {expiresAt && (
              <button onClick={() => onChangeExpiry(null)}
                className="text-[9px] font-semibold text-white bg-[#9ca3af] hover:bg-[#fd4605] px-2.5 py-1.5 rounded-xl transition-colors flex-shrink-0">
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Expiry summary when ON, picker closed ───────────────────────────── */}
      {enabled && !showEditPicker && (
        <div className="px-3 pb-2 flex items-center gap-1.5 border-t border-[#fde8e8] pt-2">
          <Clock className="w-2.5 h-2.5 text-[#fd4605]/40 flex-shrink-0" />
          {expiresAt
            ? <span className="text-[9px] text-[#fd4605]/70 font-medium">
                Expires {new Date(expiresAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            : <span className="text-[9px] text-[#9ca3af]">Indefinite · tap 🗓 to add expiry</span>
          }
        </div>
      )}
    </div>
  );
}

/* ── Main ───────────────────────────────────────────────────────────────────── */
export default function MessagesTab({ userId }: { userId: number }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'flagged' | 'reported' | 'muted' | 'requests'>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rightTab, setRightTab] = useState<'controls' | 'media' | 'activity'>('controls');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [expiries, setExpiries] = useState<Record<string, string | null>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSelectedId(null); setLightbox(null); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  /* Queries */
  const { data: convData, isLoading: convLoading } = useQuery({
    queryKey: ['admin-convs', userId, search, filter],
    queryFn: () => msgApi.conversations(userId, {
      search: search || undefined,
      filter: filter === 'all' || filter === 'requests' ? undefined : filter,
    }),
    staleTime: 30_000,
  });

  const { data: msgData, isLoading: msgLoading } = useQuery({
    queryKey: ['admin-msgs', selectedId],
    queryFn: () => msgApi.messages(selectedId!),
    enabled: !!selectedId,
    staleTime: 10_000,
  });

  const { data: activityLog } = useQuery({
    queryKey: ['admin-activity', selectedId],
    queryFn: () => msgApi.activity(selectedId!),
    enabled: !!selectedId && rightTab === 'activity',
  });

  /* Sync expiry pickers from server data */
  const loadedConv: Conversation | undefined = convData?.data?.find((c: Conversation) => c.id === selectedId) ?? msgData?.conversation;
  useEffect(() => {
    if (loadedConv?.restrictions_config) setExpiries(loadedConv.restrictions_config as Record<string, string | null>);
    if (loadedConv?.admin_note) setAdminNote(loadedConv.admin_note);
  }, [loadedConv?.id]);

  /* Mutations */
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-convs', userId] });
    qc.invalidateQueries({ queryKey: ['admin-msgs', selectedId] });
  };

  const settingsMut = useMutation({
    mutationFn: (s: Record<string, unknown>) => msgApi.updateSettings(selectedId!, s),
    onSuccess: invalidate,
  });
  const actionMut = useMutation({
    mutationFn: ({ action, extra }: { action: string; extra?: Record<string, unknown> }) =>
      msgApi.action(selectedId!, action, { admin_note: adminNote || undefined, ...extra }),
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ['admin-activity', selectedId] }); },
  });
  const flagMsgMut = useMutation({
    mutationFn: (id: number) => msgApi.flagMessage(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-msgs', selectedId] }),
  });
  const delMsgMut = useMutation({
    mutationFn: (id: number) => msgApi.deleteMessage(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-msgs', selectedId] }),
  });

  let convs: Conversation[] = convData?.data ?? [];
  const pendingCount = convs.filter(c => c.status === 'pending_request').length;
  if (filter === 'requests') convs = convs.filter(c => c.status === 'pending_request');

  const messages: Message[] = msgData?.messages ?? [];
  const mediaMessages = messages.filter(m => ['image', 'video'].includes(m.message_type) && !m.deleted_for_everyone);
  const selectedConv: Conversation | undefined = convs.find(c => c.id === selectedId) ?? msgData?.conversation;

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const otherUser  = (c: Conversation) => c.user_a.id === userId ? c.user_b : c.user_a;
  const selfUser   = (c: Conversation) => c.user_a.id === userId ? c.user_a : c.user_b;

  const doEnableRestriction = (key: string, expiresAt: string | null, targetUser: RUser | null) => {
    const payload: Record<string, unknown> = { [key]: true };
    if (expiresAt) {
      payload.restrictions_config = { [key]: expiresAt };
      setExpiries(prev => ({ ...prev, [key]: expiresAt }));
    }
    if (targetUser) payload.target_user_id = targetUser.id;
    settingsMut.mutate(payload);
  };

  const doDisableRestriction = (key: string) => {
    settingsMut.mutate({ [key]: false });
  };

  const doExport = () => {
    if (!selectedId) return;
    msgApi.exportChat(selectedId).then(d => {
      const a = document.createElement('a');
      a.href = 'data:application/json,' + encodeURIComponent(JSON.stringify(d, null, 2));
      a.download = `conv-${selectedId}.json`;
      a.click();
    });
  };

  const RESTRICTIONS: { key: string; label: string; Icon: React.ElementType }[] = [
    { key: 'shadow_restricted',         label: 'Shadow Restrict',         Icon: Eye },
    { key: 'dm_restricted',             label: 'Restrict DMs',            Icon: Lock },
    { key: 'links_disabled',            label: 'Disable Links',           Icon: ExternalLink },
    { key: 'media_restricted',          label: 'Restrict Media',          Icon: Image },
    { key: 'message_approval_required', label: 'Require Approval',        Icon: CheckCircle2 },
    { key: 'prevent_new_requests',      label: 'Block New DM Requests',   Icon: Ban },
    { key: 'auto_hide_reported',        label: 'Auto-hide Reported',      Icon: ShieldOff },
    { key: 'history_archived',          label: 'Archive History',         Icon: BookOpen },
  ];

  /* ── Render ─────────────────────────────────────────────────────────────── */
  return (
    <>
      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={() => setLightbox(null)}>
          <img src={lightbox} className="max-w-[90vw] max-h-[90vh] rounded-2xl object-contain shadow-2xl" />
          <button onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      <div className="flex rounded-2xl border border-[#e8eaed] overflow-hidden bg-white" style={{ height: 700 }}>

        {/* ── LEFT: conversation list ──────────────────────────────────────── */}
        <div className="w-[268px] flex-shrink-0 border-r border-[#e8eaed] flex flex-col bg-[#fafafa]">
          <div className="px-3 py-3 border-b border-[#e8eaed] bg-white">
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[12px] font-bold text-[#111827]">Conversations</p>
              <button onClick={() => qc.invalidateQueries({ queryKey: ['admin-convs', userId] })}
                className="p-1 text-[#9ca3af] hover:text-[#fd4605] transition-colors rounded-lg hover:bg-[#f3f4f6]">
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#9ca3af]" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users..."
                className="w-full pl-7 pr-3 py-1.5 text-[11px] bg-[#f3f4f6] border border-transparent rounded-lg text-[#111827] placeholder:text-[#9ca3af] outline-none focus:border-[#fd4605]/30 focus:bg-white transition-all" />
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex px-2 pt-2 gap-0.5 pb-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {([
              { id: 'all',      label: 'All' },
              { id: 'requests', label: pendingCount > 0 ? `Requests (${pendingCount})` : 'Requests' },
              { id: 'flagged',  label: 'Flagged' },
              { id: 'reported', label: 'Reported' },
              { id: 'muted',    label: 'Muted' },
            ] as const).map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className={`flex-shrink-0 text-[9px] px-2.5 py-1 rounded-full font-semibold capitalize transition-all whitespace-nowrap ${
                  filter === f.id
                    ? 'bg-[#fd4605] text-white shadow-sm'
                    : 'bg-white text-[#9ca3af] border border-[#e8eaed] hover:text-[#111827] hover:border-gray-300'
                }`}>
                {f.label}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {convLoading && (
              <div className="flex flex-col items-center gap-2 py-10">
                <div className="w-5 h-5 border-2 border-[#fd4605] border-t-transparent rounded-full animate-spin" />
                <p className="text-[10px] text-[#9ca3af]">Loading…</p>
              </div>
            )}
            {!convLoading && convs.length === 0 && (
              <div className="p-6 text-center">
                <Inbox className="w-8 h-8 text-[#e8eaed] mx-auto mb-2" />
                <p className="text-[11px] text-[#9ca3af]">
                  {filter === 'requests' ? 'No message requests' : 'No conversations found'}
                </p>
              </div>
            )}

            {convs.map(conv => {
              const other = otherUser(conv);
              const me    = selfUser(conv);
              const sel   = conv.id === selectedId;
              const isPending = conv.status === 'pending_request';
              return (
                <button key={conv.id} onClick={() => setSelectedId(conv.id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-[#f3f4f6] transition-all ${
                    sel ? 'bg-[#fd4605]/5 border-l-[3px] border-l-[#fd4605]' : 'hover:bg-white'
                  }`}>
                  <div className="flex items-start gap-2.5">
                    {/* Stacked avatars */}
                    <div className="relative flex-shrink-0 w-11 h-8 mt-0.5">
                      <div className="absolute left-0 top-0"><Av url={me.avatar} name={me.name ?? me.username} size={7} ring online={me.is_online} /></div>
                      <div className="absolute left-3.5 top-2"><Av url={other.avatar} name={other.name ?? other.username} size={7} ring online={other.is_online} /></div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className="text-[11px] font-semibold text-[#111827] truncate">@{me.username}</span>
                        <ArrowLeftRight className="w-2.5 h-2.5 text-[#d1d5db] flex-shrink-0" />
                        <span className="text-[11px] text-[#6b7280] truncate">@{other.username}</span>
                      </div>
                      <p className="text-[10px] text-[#9ca3af] truncate">
                        {conv.last_message?.body ?? (conv.last_message ? `[${conv.last_message.message_type}]` : 'No messages')}
                      </p>
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {isPending && <span className="text-[8px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">Request</span>}
                        {conv.flagged_count > 0 && <span className="text-[8px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold">{conv.flagged_count} ⚑</span>}
                        {conv.shadow_restricted && <span className="text-[8px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">Shadow</span>}
                        {conv.admin_muted_at && <span className="text-[8px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">Muted</span>}
                        <RiskBadge risk={conv.risk_level} />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── CENTER: chat ─────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center flex-col gap-4">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#fd4605]/10 to-[#fd4605]/5 flex items-center justify-center">
                <MessageSquare className="w-9 h-9 text-[#fd4605]/30" />
              </div>
              <div className="text-center">
                <p className="text-[14px] font-semibold text-[#111827]">Select a conversation</p>
                <p className="text-[11px] text-[#9ca3af] mt-1">
                  Click any chat · Press <kbd className="bg-[#f3f4f6] border border-[#e8eaed] rounded px-1 text-[10px] font-mono">ESC</kbd> to close
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              {selectedConv && (
                <div className="px-4 py-2.5 border-b border-[#e8eaed] flex items-center justify-between flex-shrink-0 bg-white">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <Av url={selfUser(selectedConv).avatar} name={selfUser(selectedConv).name ?? selfUser(selectedConv).username} size={7} online={selfUser(selectedConv).is_online} />
                      <span className="text-[12px] font-bold text-[#111827]">@{selfUser(selectedConv).username}</span>
                    </div>
                    <ArrowLeftRight className="w-3 h-3 text-[#d1d5db] flex-shrink-0" />
                    <div className="flex items-center gap-1.5">
                      <Av url={otherUser(selectedConv).avatar} name={otherUser(selectedConv).name ?? otherUser(selectedConv).username} size={7} online={otherUser(selectedConv).is_online} />
                      <span className="text-[12px] font-bold text-[#111827]">@{otherUser(selectedConv).username}</span>
                    </div>
                    {selectedConv.risk_level && <RiskBadge risk={selectedConv.risk_level} />}
                    {selectedConv.flagged_count > 0 && (
                      <span className="text-[9px] bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-semibold">
                        {selectedConv.flagged_count} flagged
                      </span>
                    )}
                    {selectedConv.status === 'pending_request' && (
                      <span className="text-[9px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-semibold">Request</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={doExport}
                      className="flex items-center gap-1 text-[10px] text-[#9ca3af] hover:text-[#111827] px-2 py-1.5 rounded-lg hover:bg-[#f8f9fa] transition-colors">
                      <Download className="w-3.5 h-3.5" /> Export
                    </button>
                    <button onClick={() => setSelectedId(null)}
                      className="p-1.5 text-[#9ca3af] hover:text-[#111827] hover:bg-[#f3f4f6] rounded-lg transition-colors" title="Close (ESC)">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Messages area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#fafafa]">
                {/* Request banner */}
                {selectedConv?.status === 'pending_request' && (
                  <div className="mx-auto max-w-md bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 text-center">
                    <p className="text-[12px] font-semibold text-blue-800 mb-0.5">Message Request</p>
                    <p className="text-[10px] text-blue-600">
                      @{otherUser(selectedConv).username} sent a message request to @{selfUser(selectedConv).username}.
                      The recipient hasn't accepted yet.
                    </p>
                  </div>
                )}

                {msgLoading && (
                  <div className="flex justify-center py-10">
                    <div className="w-6 h-6 border-2 border-[#fd4605] border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {!msgLoading && messages.length === 0 && (
                  <div className="text-center py-10">
                    <MessageSquare className="w-8 h-8 text-[#e8eaed] mx-auto mb-2" />
                    <p className="text-[12px] text-[#9ca3af]">No messages in this conversation</p>
                  </div>
                )}

                {messages.map((msg, i) => {
                  const isMine   = msg.sender_id === userId;
                  const senderAv = msg.sender?.avatar ?? (selectedConv ? (isMine ? selfUser(selectedConv).avatar : otherUser(selectedConv).avatar) : null);
                  const senderName = msg.sender?.username ?? (selectedConv ? (isMine ? selfUser(selectedConv).username : otherUser(selectedConv).username) : '?');

                  const prevMsg   = messages[i - 1];
                  const showDate  = !prevMsg || fmtDate(prevMsg.created_at) !== fmtDate(msg.created_at);

                  return (
                    <div key={msg.id}>
                      {showDate && (
                        <div className="flex items-center gap-3 my-2">
                          <div className="flex-1 h-px bg-[#e8eaed]" />
                          <span className="text-[9px] text-[#9ca3af] font-medium">{fmtDate(msg.created_at)}</span>
                          <div className="flex-1 h-px bg-[#e8eaed]" />
                        </div>
                      )}
                      <div className={`flex gap-2 group ${isMine ? 'flex-row-reverse' : ''}`}>
                        <div className="flex-shrink-0 mt-4">
                          <Av url={senderAv} name={senderName} size={7} />
                        </div>
                        <div className={`relative max-w-[62%] flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                          <span className={`text-[9px] text-[#9ca3af] mb-0.5 px-1 ${isMine ? 'text-right' : ''}`}>@{senderName}</span>

                          {/* Image */}
                          {!msg.deleted_for_everyone && msg.message_type === 'image' && msg.r2_url && (
                            <div className="rounded-2xl overflow-hidden cursor-pointer max-w-[180px] shadow-sm" onClick={() => setLightbox(msg.r2_url!)}>
                              <img src={msg.thumbnail_url ?? msg.r2_url} className="w-full object-cover max-h-36" />
                            </div>
                          )}
                          {/* Video */}
                          {!msg.deleted_for_everyone && msg.message_type === 'video' && (
                            <div className={`rounded-2xl flex items-center gap-2 px-3 py-2.5 shadow-sm ${isMine ? 'bg-[#fd4605]/10' : 'bg-white border border-[#e8eaed]'}`}>
                              <Video className="w-4 h-4 text-[#9ca3af]" />
                              <span className="text-[11px] text-[#6b7280]">Video message</span>
                            </div>
                          )}
                          {/* Voice */}
                          {!msg.deleted_for_everyone && (msg.message_type === 'voice' || msg.message_type === 'audio') && (
                            <div className={`rounded-2xl flex items-center gap-2 px-3 py-2 shadow-sm ${isMine ? 'bg-[#fd4605]/10' : 'bg-white border border-[#e8eaed]'}`}>
                              <Mic className="w-3.5 h-3.5 text-[#9ca3af]" />
                              <span className="text-[11px] text-[#6b7280]">Voice message</span>
                            </div>
                          )}
                          {/* Text */}
                          {(msg.deleted_for_everyone || msg.body || msg.message_type === 'text') && (
                            <div className={`text-[11px] px-3 py-2 rounded-2xl leading-relaxed shadow-sm ${
                              msg.deleted_for_everyone
                                ? 'bg-[#f3f4f6] text-[#9ca3af] italic border border-[#e8eaed]'
                                : msg.flagged_by_admin
                                ? 'bg-red-50 border border-red-200 text-[#111827]'
                                : isMine
                                ? 'bg-[#fd4605]/10 text-[#111827]'
                                : 'bg-white text-[#111827] border border-[#e8eaed]'
                            }`}>
                              {msg.deleted_for_everyone ? '🗑 Deleted by admin' : msg.body}
                              {msg.flagged_by_admin && <span className="ml-1.5 text-red-500 text-[9px] font-bold">⚑ Flagged</span>}
                            </div>
                          )}

                          <span className={`text-[9px] text-[#c1c7cd] mt-0.5 px-1 ${isMine ? 'text-right' : ''}`}>{fmtTime(msg.created_at)}</span>

                          {/* Hover actions */}
                          {!msg.deleted_for_everyone && (
                            <div className={`absolute ${isMine ? '-left-[68px]' : '-right-[68px]'} top-5 hidden group-hover:flex items-center gap-0.5`}>
                              <button onClick={() => flagMsgMut.mutate(msg.id)} title="Flag message"
                                className="w-6 h-6 flex items-center justify-center rounded-lg bg-white border border-[#e8eaed] hover:bg-orange-50 hover:border-orange-300 shadow-sm transition-colors">
                                <Flag className="w-3 h-3 text-[#9ca3af]" />
                              </button>
                              <button onClick={() => { if (window.confirm('Delete for everyone?')) delMsgMut.mutate(msg.id); }} title="Delete"
                                className="w-6 h-6 flex items-center justify-center rounded-lg bg-white border border-[#e8eaed] hover:bg-red-50 hover:border-red-300 shadow-sm transition-colors">
                                <Trash2 className="w-3 h-3 text-[#9ca3af]" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {/* Status bar */}
              <div className="px-4 py-1.5 border-t border-[#e8eaed] bg-white flex items-center justify-center gap-2 flex-shrink-0">
                <Eye className="w-3 h-3 text-[#9ca3af]" />
                <p className="text-[9px] text-[#9ca3af]">
                  Admin read-only · Seen status NOT delivered to users · <kbd className="bg-[#f3f4f6] border border-[#e8eaed] rounded px-1 font-mono">ESC</kbd> to close
                </p>
              </div>
            </>
          )}
        </div>

        {/* ── RIGHT: controls / media / activity ──────────────────────────── */}
        <div className="w-[258px] flex-shrink-0 border-l border-[#e8eaed] flex flex-col bg-[#fafafa]">
          <div className="flex border-b border-[#e8eaed] bg-white flex-shrink-0">
            {(['controls', 'media', 'activity'] as const).map(t => (
              <button key={t} onClick={() => setRightTab(t)}
                className={`flex-1 text-[10px] py-2.5 font-bold capitalize transition-colors ${
                  rightTab === t ? 'text-[#fd4605] border-b-2 border-[#fd4605]' : 'text-[#9ca3af] hover:text-[#111827]'
                }`}>
                {t}
              </button>
            ))}
          </div>

          {!selectedId ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2">
              <Shield className="w-8 h-8 text-[#e8eaed]" />
              <p className="text-[11px] text-[#9ca3af]">Select a conversation</p>
            </div>

          ) : rightTab === 'controls' ? (
            <div className="flex-1 overflow-y-auto">
              {selectedConv && (
                <div className="p-3 space-y-4">
                  {/* Participants */}
                  <div>
                    <SectionHead title="Participants" icon={ArrowLeftRight} />
                    <div className="space-y-1.5">
                      {[selfUser(selectedConv), otherUser(selectedConv)].map(u => (
                        <div key={u.id} className="flex items-center gap-2.5 bg-white rounded-xl border border-[#f3f4f6] px-3 py-2">
                          <Av url={u.avatar} name={u.name ?? u.username} size={7} online={u.is_online} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-semibold text-[#111827] truncate">@{u.username}</p>
                            <p className="text-[9px] text-[#9ca3af]">
                              {u.is_online ? '🟢 Online' : '⚫ Offline'}
                              {u.is_banned ? ' · 🚫 Banned' : ''}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Admin note */}
                  <div>
                    <SectionHead title="Internal Note" icon={Info} />
                    <textarea
                      value={adminNote}
                      onChange={e => setAdminNote(e.target.value)}
                      onBlur={() => { if (adminNote !== (selectedConv.admin_note ?? '')) settingsMut.mutate({ admin_note: adminNote }); }}
                      placeholder="Private note for this conversation…"
                      rows={2}
                      className="w-full text-[11px] bg-white border border-[#e8eaed] rounded-xl px-3 py-2 text-[#111827] placeholder:text-[#c1c7cd] outline-none focus:border-[#fd4605]/40 resize-none"
                    />
                  </div>

                  {/* Auto-notify banner */}
                  <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                    <Bell className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-green-800">Auto-Notify Enabled</p>
                      <p className="text-[9px] text-green-600">Users receive in-app + email on every restriction change</p>
                    </div>
                  </div>

                  {/* Quick actions */}
                  <div>
                    <SectionHead title="Quick Actions" icon={Send} />
                    <div className="space-y-1">
                      <button onClick={() => actionMut.mutate({ action: 'flag' })} disabled={actionMut.isPending}
                        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-orange-700 hover:bg-orange-50 rounded-xl transition-colors bg-white border border-[#f3f4f6] disabled:opacity-50">
                        <Flag className="w-3.5 h-3.5" /> Flag for Review
                      </button>
                      <button onClick={() => actionMut.mutate({ action: 'mark_reviewed' })} disabled={actionMut.isPending}
                        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-green-700 hover:bg-green-50 rounded-xl transition-colors bg-white border border-[#f3f4f6] disabled:opacity-50">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Mark Reviewed
                      </button>
                      {selectedConv.admin_muted_at ? (
                        <button onClick={() => actionMut.mutate({ action: 'unmute' })} disabled={actionMut.isPending}
                          className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-green-700 hover:bg-green-50 rounded-xl transition-colors bg-white border border-[#f3f4f6] disabled:opacity-50">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Unmute Conversation
                        </button>
                      ) : (
                        <button onClick={() => actionMut.mutate({ action: 'mute' })} disabled={actionMut.isPending}
                          className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-orange-700 hover:bg-orange-50 rounded-xl transition-colors bg-white border border-[#f3f4f6] disabled:opacity-50">
                          <VolumeX className="w-3.5 h-3.5" /> Mute Conversation
                        </button>
                      )}
                      <button onClick={() => { if (window.confirm('Close this conversation?')) actionMut.mutate({ action: 'close' }); }} disabled={actionMut.isPending}
                        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-red-700 hover:bg-red-50 rounded-xl transition-colors bg-white border border-[#f3f4f6] disabled:opacity-50">
                        <X className="w-3.5 h-3.5" /> Close Conversation
                      </button>
                    </div>
                  </div>

                  {/* Risk level */}
                  <div>
                    <SectionHead title="Risk Level" icon={AlertTriangle} />
                    <div className="flex gap-1">
                      {(['low', 'medium', 'high', 'critical'] as const).map(r => {
                        const active = selectedConv.risk_level === r;
                        const clr = r === 'critical' ? 'bg-red-500 text-white border-red-500'
                          : r === 'high' ? 'bg-orange-400 text-white border-orange-400'
                          : r === 'medium' ? 'bg-yellow-400 text-white border-yellow-400'
                          : 'bg-green-500 text-white border-green-500';
                        return (
                          <button key={r} onClick={() => settingsMut.mutate({ risk_level: r })}
                            className={`flex-1 text-[9px] py-1.5 rounded-lg font-bold capitalize border transition-all ${
                              active ? clr : 'bg-white text-[#9ca3af] border-[#e8eaed] hover:border-gray-300 hover:text-[#111827]'
                            }`}>
                            {r}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Restrictions with date pickers */}
                  <div>
                    <SectionHead title="Restrictions & Duration" icon={Shield} />
                    <div className="space-y-1.5">
                      {RESTRICTIONS.map(({ key, label, Icon }) => (
                        <RestrictionRow
                          key={key}
                          label={label}
                          icon={Icon}
                          enabled={!!(selectedConv as unknown as Record<string, unknown>)[key]}
                          expiresAt={expiries[key] ?? null}
                          users={selectedConv ? [selfUser(selectedConv), otherUser(selectedConv)] : []}
                          onEnable={(expiresAt, targetUser) => doEnableRestriction(key, expiresAt, targetUser)}
                          onDisable={() => doDisableRestriction(key)}
                          onChangeExpiry={v => {
                            const updated = { ...expiries, [key]: v };
                            setExpiries(updated);
                            settingsMut.mutate({ restrictions_config: { [key]: v } });
                          }}
                          disabled={settingsMut.isPending}
                        />
                      ))}
                    </div>
                  </div>

                  {/* User actions */}
                  <div>
                    <SectionHead title="User Actions" icon={UserX} />
                    <div className="space-y-1">
                      <button onClick={() => {
                        const r = window.prompt('Warning reason (sent to user):');
                        if (r) actionMut.mutate({ action: 'warn_user', extra: { reason: r } });
                      }} disabled={actionMut.isPending}
                        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-orange-700 hover:bg-orange-50 rounded-xl transition-colors bg-white border border-[#f3f4f6] disabled:opacity-50">
                        <AlertTriangle className="w-3.5 h-3.5" /> Warn User
                        <Mail className="w-3 h-3 ml-auto opacity-40" />
                      </button>
                      <button onClick={() => {
                        const r = window.prompt('Block from DMs - reason (sent to user):');
                        if (r) actionMut.mutate({ action: 'block_user', extra: { reason: r } });
                      }} disabled={actionMut.isPending}
                        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-red-700 hover:bg-red-50 rounded-xl transition-colors bg-white border border-[#f3f4f6] disabled:opacity-50">
                        <Ban className="w-3.5 h-3.5" /> Block from DMs
                        <Mail className="w-3 h-3 ml-auto opacity-40" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

          ) : rightTab === 'media' ? (
            <div className="flex-1 overflow-y-auto p-3">
              <SectionHead title={`Shared Media (${mediaMessages.length})`} icon={Image} />
              {msgLoading && <p className="text-[11px] text-[#9ca3af] text-center py-4">Loading…</p>}
              {!msgLoading && mediaMessages.length === 0 && (
                <div className="text-center py-8">
                  <Image className="w-8 h-8 text-[#e8eaed] mx-auto mb-2" />
                  <p className="text-[11px] text-[#9ca3af]">No media shared yet</p>
                </div>
              )}
              <div className="grid grid-cols-3 gap-1">
                {mediaMessages.map(msg => (
                  <div key={msg.id} onClick={() => msg.r2_url && setLightbox(msg.r2_url)}
                    className="relative group aspect-square rounded-xl overflow-hidden bg-[#f3f4f6] cursor-pointer">
                    {msg.message_type === 'image' && msg.r2_url
                      ? <img src={msg.thumbnail_url ?? msg.r2_url} className="w-full h-full object-cover" />
                      : <div className="w-full h-full bg-[#1a1a1a] flex items-center justify-center">
                          {msg.thumbnail_url
                            ? <img src={msg.thumbnail_url} className="w-full h-full object-cover opacity-70" />
                            : <Video className="w-5 h-5 text-white/40" />
                          }
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                              <Video className="w-3.5 h-3.5 text-white" />
                            </div>
                          </div>
                        </div>
                    }
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors" />
                    {msg.flagged_by_admin && (
                      <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white" />
                    )}
                    <span className="absolute bottom-1 left-1 text-[8px] text-transparent group-hover:text-white/80 transition-all">
                      {fmtDate(msg.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

          ) : (
            <div className="flex-1 overflow-y-auto p-3">
              <SectionHead title="Audit Log" icon={BookOpen} />
              {(!activityLog || activityLog.length === 0) ? (
                <div className="text-center py-8">
                  <BookOpen className="w-7 h-7 text-[#e8eaed] mx-auto mb-2" />
                  <p className="text-[11px] text-[#9ca3af]">No activity recorded yet</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {activityLog.map((log: ActivityLog) => (
                    <div key={log.id} className="bg-white rounded-xl border border-[#f3f4f6] p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[10px] font-semibold text-[#111827] capitalize leading-relaxed">
                          {log.action.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[9px] text-[#9ca3af] flex-shrink-0 mt-0.5">{fmtDate(log.created_at)}</span>
                      </div>
                      {log.actor_label && <p className="text-[9px] text-[#9ca3af] mt-0.5">by {log.actor_label}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
