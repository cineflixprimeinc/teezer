'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  adminDecide,
  adminRescan,
  getAdminModerationList,
  getAdminModerationRecord,
  getAdminModerationStats,
} from '@/services/moderation.service';
import {
  AdminDecision,
  ModerationListMeta,
  ModerationRecord,
  ModerationStats,
} from '@/types/moderation';

type Tab = 'pending' | 'approved' | 'rejected';

export default function AdminModerationPanel() {
  const [tab, setTab] = useState<Tab>('pending');
  const [records, setRecords] = useState<ModerationRecord[]>([]);
  const [meta, setMeta] = useState<ModerationListMeta | null>(null);
  const [stats, setStats] = useState<ModerationStats | null>(null);
  const [selected, setSelected] = useState<ModerationRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [decisionReason, setDecisionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      setStats(await getAdminModerationStats());
    } catch {}
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminModerationList(tab, { page, per_page: 20 });
      setRecords(res.data);
      setMeta(res.meta);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [tab, page]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    setPage(1);
    setSelected(null);
  }, [tab]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const openRecord = async (rec: ModerationRecord) => {
    try {
      const full = await getAdminModerationRecord(rec.content_id);
      setSelected(full);
      setDecisionReason('');
    } catch {
      setSelected(rec);
    }
  };

  const handleDecision = async (decision: AdminDecision) => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await adminDecide(selected.content_id, decision, decisionReason || undefined);
      setSelected(null);
      fetchList();
      fetchStats();
    } catch {
    } finally {
      setActionLoading(false);
    }
  };

  const handleRescan = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await adminRescan(selected.content_id);
      setSelected(null);
      fetchList();
    } catch {
    } finally {
      setActionLoading(false);
    }
  };

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'pending', label: 'Pending Review', count: stats?.pending_review },
    { key: 'approved', label: 'Approved', count: stats?.approved },
    { key: 'rejected', label: 'Rejected', count: stats?.rejected },
  ];

  return (
    <div className="flex h-full gap-4">
      {/* Left panel */}
      <div className="flex flex-1 flex-col gap-4 min-w-0">
        {/* Stats bar */}
        {stats && (
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: 'Pending', value: stats.pending_review, color: 'text-orange-400' },
              { label: 'Approved', value: stats.approved, color: 'text-green-400' },
              { label: 'Rejected', value: stats.rejected, color: 'text-red-400' },
              { label: 'Failed', value: stats.failed_scans, color: 'text-yellow-400' },
              { label: 'Scanned', value: stats.total_scanned, color: 'text-blue-400' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-neutral-800/60 p-3 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value.toLocaleString()}</p>
                <p className="text-xs text-neutral-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-neutral-700">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t.key
                  ? 'border-white text-white'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {t.label}
              {t.count !== undefined && (
                <span className="rounded-full bg-neutral-700 px-1.5 py-0.5 text-xs">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto rounded-xl border border-neutral-700/50">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-neutral-400 text-sm">
              Loading…
            </div>
          ) : records.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-neutral-400 text-sm">
              No records
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-700/50 bg-neutral-800/40">
                <tr>
                  {['ID', 'User', 'Type', 'Nudity', 'NSFW', 'Decision', 'Scanned', ''].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-3 py-2.5 text-left font-medium text-neutral-400 text-xs whitespace-nowrap"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-700/30">
                {records.map((rec) => (
                  <tr
                    key={rec.id}
                    className={`cursor-pointer transition-colors hover:bg-neutral-700/20 ${
                      selected?.id === rec.id ? 'bg-neutral-700/30' : ''
                    }`}
                    onClick={() => openRecord(rec)}
                  >
                    <td className="px-3 py-2 font-mono text-neutral-300">{rec.content_id}</td>
                    <td className="px-3 py-2 text-neutral-300">{rec.user_id}</td>
                    <td className="px-3 py-2 text-neutral-400">{rec.content_type}</td>
                    <td className="px-3 py-2">
                      <ScoreBar value={rec.nudity_score} warn={0.65} danger={0.85} />
                    </td>
                    <td className="px-3 py-2">
                      <ScoreBar value={rec.nsfw_score} warn={0.65} danger={0.85} />
                    </td>
                    <td className="px-3 py-2">
                      <DecisionChip decision={rec.decision} />
                    </td>
                    <td className="px-3 py-2 text-neutral-500 text-xs whitespace-nowrap">
                      {rec.scanned_at ? new Date(rec.scanned_at).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-xs text-blue-400 hover:underline">Review</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {meta && meta.last_page > 1 && (
          <div className="flex items-center justify-between text-sm text-neutral-400">
            <span>
              Page {meta.current_page} of {meta.last_page} ({meta.total} total)
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg bg-neutral-800 px-3 py-1 disabled:opacity-40"
              >
                Prev
              </button>
              <button
                disabled={page >= meta.last_page}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg bg-neutral-800 px-3 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right panel - detail view */}
      {selected && (
        <div className="w-96 shrink-0 flex flex-col gap-4 rounded-xl border border-neutral-700/50 bg-neutral-800/40 p-4 overflow-auto">
          <div className="flex items-start justify-between">
            <h3 className="font-semibold text-white">Content #{selected.content_id}</h3>
            <button
              onClick={() => setSelected(null)}
              className="text-neutral-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* Preview */}
          {selected.video?.preview_url && (
            <div className="aspect-video rounded-lg overflow-hidden bg-neutral-900">
              {selected.video.mime_type?.startsWith('video') ? (
                <video
                  src={selected.video.preview_url}
                  controls
                  className="w-full h-full object-cover"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selected.video.preview_url}
                  alt="content preview"
                  className="w-full h-full object-cover"
                />
              )}
            </div>
          )}

          {/* Scores */}
          <div className="grid grid-cols-2 gap-3">
            <ScoreCard label="Nudity Score" value={selected.nudity_score} />
            <ScoreCard label="NSFW Score" value={selected.nsfw_score} />
          </div>

          {/* Detected labels */}
          {selected.detected_labels?.length > 0 && (
            <div>
              <p className="text-xs text-neutral-400 mb-1.5 font-medium">Detected Labels</p>
              <div className="flex flex-wrap gap-1">
                {selected.detected_labels.map((l) => (
                  <span
                    key={l}
                    className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-400"
                  >
                    {l}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Risk timestamp */}
          {selected.highest_risk_timestamp != null && (
            <p className="text-xs text-neutral-400">
              Highest risk at{' '}
              <span className="text-orange-400 font-mono">
                {formatTimestamp(selected.highest_risk_timestamp)}
              </span>
            </p>
          )}

          {/* Meta */}
          <div className="text-xs text-neutral-500 space-y-0.5">
            <p>Frames scanned: {selected.scanned_frames_count}</p>
            <p>Model: {selected.model_name} v{selected.model_version}</p>
            {selected.reason && <p className="text-neutral-400 mt-1 italic">{selected.reason}</p>}
          </div>

          {/* Admin action */}
          <div className="border-t border-neutral-700/50 pt-4 flex flex-col gap-3">
            <label className="text-xs font-medium text-neutral-400">Admin Note (optional)</label>
            <textarea
              value={decisionReason}
              onChange={(e) => setDecisionReason(e.target.value)}
              rows={2}
              className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm text-white placeholder-neutral-500 resize-none focus:outline-none focus:border-neutral-500"
              placeholder="Reason for override…"
            />

            <div className="flex flex-col gap-2">
              <button
                disabled={actionLoading}
                onClick={() => handleDecision('approved')}
                className="w-full rounded-lg bg-green-600 hover:bg-green-500 px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
              >
                Approve
              </button>
              <button
                disabled={actionLoading}
                onClick={() => handleDecision('rejected')}
                className="w-full rounded-lg bg-red-600 hover:bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
              >
                Reject
              </button>
              <button
                disabled={actionLoading}
                onClick={() => handleDecision('removed')}
                className="w-full rounded-lg bg-neutral-700 hover:bg-neutral-600 px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
              >
                Remove Content
              </button>
              <button
                disabled={actionLoading}
                onClick={handleRescan}
                className="w-full rounded-lg border border-neutral-600 px-4 py-2 text-sm font-medium text-neutral-300 hover:text-white transition-colors disabled:opacity-50"
              >
                Re-scan
              </button>
            </div>

            {selected.admin_reviewed_by && (
              <p className="text-xs text-neutral-500 text-center">
                Reviewed by @{selected.admin_reviewed_by}
                {selected.admin_reviewed_at &&
                  ` · ${new Date(selected.admin_reviewed_at).toLocaleDateString()}`}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreBar({
  value,
  warn,
  danger,
}: {
  value: number;
  warn: number;
  danger: number;
}) {
  const pct = Math.round(value * 100);
  const color =
    value >= danger ? 'bg-red-500' : value >= warn ? 'bg-orange-400' : 'bg-green-500';
  return (
    <div className="flex items-center gap-1.5 min-w-[64px]">
      <div className="h-1.5 flex-1 rounded-full bg-neutral-700 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-neutral-400 w-7 text-right">{pct}%</span>
    </div>
  );
}

function ScoreCard({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  const color =
    value >= 0.85 ? 'text-red-400' : value >= 0.65 ? 'text-orange-400' : 'text-green-400';
  return (
    <div className="rounded-lg bg-neutral-900/60 p-3 text-center">
      <p className={`text-2xl font-bold ${color}`}>{pct}%</p>
      <p className="text-xs text-neutral-400 mt-0.5">{label}</p>
    </div>
  );
}

function DecisionChip({ decision }: { decision: string | null }) {
  const map: Record<string, string> = {
    approved: 'bg-green-500/10 text-green-400',
    pending_review: 'bg-orange-500/10 text-orange-400',
    rejected: 'bg-red-500/10 text-red-400',
  };
  const cls = map[decision ?? ''] ?? 'bg-neutral-700 text-neutral-400';
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {decision?.replace('_', ' ') ?? 'unknown'}
    </span>
  );
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
