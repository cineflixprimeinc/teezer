import axios from 'axios';
import {
  AdminDecision,
  ModerationListMeta,
  ModerationRecord,
  ModerationSettings,
  ModerationStatus,
  ModerationStatusResponse,
  ModerationStats,
  ScannerHealth,
} from '@/types/moderation';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1';

const api = axios.create({
  baseURL: API.replace(/\/+$/, ''),
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('reelsoo_token') : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── User-facing ──────────────────────────────────────────────────────────────

export async function getModerationStatus(
  contentId: number
): Promise<ModerationStatusResponse> {
  const { data } = await api.get(`/media/${contentId}/moderation-status`);
  return data.data;
}

export async function requestRescan(contentId: number): Promise<void> {
  await api.post(`/media/${contentId}/rescan`);
}

export function getModerationUserMessage(status: ModerationStatus): string {
  switch (status) {
    case 'pending':
    case 'scanning':
      return 'Your upload is being checked for safety.';
    case 'pending_review':
      return 'Your upload is under review and will be visible after approval.';
    case 'rejected':
      return 'This upload could not be published because it may violate Teezer safety rules.';
    default:
      return '';
  }
}

// ── Admin ────────────────────────────────────────────────────────────────────

export async function getAdminModerationStats(): Promise<ModerationStats> {
  const { data } = await api.get('/admin/moderation/stats');
  return data.data;
}

export async function getAdminModerationList(
  tab: 'pending' | 'approved' | 'rejected',
  params?: {
    user_id?: number;
    content_type?: string;
    from?: string;
    to?: string;
    min_nsfw_score?: number;
    page?: number;
    per_page?: number;
  }
): Promise<{ data: ModerationRecord[]; meta: ModerationListMeta }> {
  const { data } = await api.get(`/admin/moderation/${tab}`, { params });
  return { data: data.data, meta: data.meta };
}

export async function getAdminModerationRecord(
  contentId: number
): Promise<ModerationRecord> {
  const { data } = await api.get(`/admin/moderation/${contentId}`);
  return data.data;
}

export async function adminDecide(
  contentId: number,
  decision: AdminDecision,
  reason?: string
): Promise<void> {
  await api.post(`/admin/moderation/${contentId}/decision`, { decision, reason });
}

export async function adminRescan(contentId: number): Promise<void> {
  await api.post(`/admin/moderation/${contentId}/rescan`);
}

export async function getAdminModerationSettings(): Promise<ModerationSettings> {
  const { data } = await api.get('/admin/moderation/settings');
  return data.data;
}

export async function updateAdminModerationSettings(
  settings: Partial<ModerationSettings>
): Promise<ModerationSettings> {
  const { data } = await api.post('/admin/moderation/settings', settings);
  return data.data;
}

export async function getScannerHealth(): Promise<ScannerHealth & { reachable: boolean }> {
  const { data } = await api.get('/admin/moderation/scanner-health');
  return data.data ?? data;
}

export async function getModerationLogs(params?: {
  content_id?: number;
  admin_id?: number;
  action_type?: string;
  page?: number;
  per_page?: number;
}) {
  const { data } = await api.get('/admin/moderation/logs', { params });
  return data;
}
