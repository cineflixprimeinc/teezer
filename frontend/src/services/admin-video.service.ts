import axios from 'axios';

const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1').replace(/\/+$/, '');
const api = axios.create({ baseURL: API, withCredentials: true });

api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('teezer_token') : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface VideoMonetization {
  eligibility_status: string;
  review_status: string;
  reviewed_on: string | null;
  next_review: string | null;
  ad_revenue_sharing: boolean;
  creator_fund_active: boolean;
  tips_gifts_enabled: boolean;
  subscriptions_eligible: boolean;
  brand_partnerships_eligible: boolean;
  shop_product_tagging: boolean;
  paid_promotion_disclosure: string;
  affiliate_links_enabled: boolean;
  brand_deals_allowed: boolean;
  auto_claim_brand_mentions: boolean;
  total_earnings: number;
  rpm: number;
  cpm: number;
  revenue: number;
  next_payout: number;
  payout_date: string | null;
  payout_method: string | null;
  payout_currency: string;
  payout_status: string;
  allowed_regions: string[] | null;
  blocked_regions: string[] | null;
  policy_status: string;
  monetization_notes: string | null;
}

export interface AdminVideoDetail {
  id: number;
  title: string | null;
  caption: string | null;
  category: string | null;
  location: string | null;
  language: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  mime_type: string | null;
  duration: number | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  status: string;
  scheduled_at: string | null;
  allow_comments: boolean;
  allow_replies: boolean;
  allow_duet: boolean;
  allow_stitch: boolean;
  allow_download: boolean;
  allow_sharing: boolean;
  allow_embedding: boolean;
  show_on_profile: boolean;
  age_restriction: string;
  content_label: string | null;
  sensitive_warning: boolean;
  notify_followers: boolean;
  send_push_after_publish: boolean;
  recommendation_eligible: boolean;
  search_indexing: boolean;
  region_allowed: string[] | null;
  region_blocked: string[] | null;
  shadowban_enabled: boolean;
  limited_distribution: boolean;
  limited_reason: string | null;
  review_priority: string;
  moderation_status: string | null;
  copyright_match_status: string | null;
  duplicate_match_status: string | null;
  content_fingerprint: string | null;
  legal_hold: boolean;
  reporting_sensitivity: string;
  archive_status: string;
  auto_archive_after: string;
  captions_file_url: string | null;
  admin_notes: string | null;
  audit_notes: string | null;
  is_flagged: boolean;
  is_pinned: boolean;
  is_ai_generated: boolean;
  content_check_status: string | null;
  content_check_passed: boolean | null;
  content_check_reason: string | null;
  views_count: number;
  likes_count: number;
  comments_count: number;
  saves_count: number;
  shares_count: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  user: { id: number; name: string; username: string; avatar: string | null };
  hashtags: { id: number; name: string }[];
  audioTrack: { id: number; title: string; artist: string } | null;
  monetization: VideoMonetization | null;
}

export interface VideoEditData {
  video: AdminVideoDetail;
  earnings: { total: number; count: number } | null;
  playlists: { id: number; title: string }[];
}

export interface VideoUpdatePayload {
  title?: string | null;
  caption?: string | null;
  category?: string | null;
  location?: string | null;
  language?: string | null;
  hashtags?: string[];
  status?: string;
  allow_comments?: boolean;
  allow_duet?: boolean;
  allow_stitch?: boolean;
  allow_download?: boolean;
  is_ai_generated?: boolean;
  is_flagged?: boolean;
  is_pinned?: boolean;
  moderation_status?: string;
}

export interface SettingsPayload {
  allow_comments?: boolean;
  allow_replies?: boolean;
  allow_duet?: boolean;
  allow_stitch?: boolean;
  allow_download?: boolean;
  allow_sharing?: boolean;
  allow_embedding?: boolean;
  age_restriction?: string;
  content_label?: string | null;
  is_ai_generated?: boolean;
  sensitive_warning?: boolean;
  language?: string;
  show_on_profile?: boolean;
  notify_followers?: boolean;
  send_push_after_publish?: boolean;
}

export interface MonetizationPayload {
  ad_revenue_sharing?: boolean;
  creator_fund_active?: boolean;
  tips_gifts_enabled?: boolean;
  subscriptions_eligible?: boolean;
  brand_partnerships_eligible?: boolean;
  shop_product_tagging?: boolean;
  paid_promotion_disclosure?: string;
  affiliate_links_enabled?: boolean;
  brand_deals_allowed?: boolean;
  auto_claim_brand_mentions?: boolean;
  monetization_notes?: string;
  eligibility_status?: string;
  review_status?: string;
  payout_method?: string;
  payout_currency?: string;
  allowed_regions?: string[] | null;
  blocked_regions?: string[] | null;
}

export interface VisibilityPayload {
  status?: string;
  recommendation_eligible?: boolean;
  search_indexing?: boolean;
  show_on_profile?: boolean;
  region_allowed?: string[] | null;
  region_blocked?: string[] | null;
  shadowban_enabled?: boolean;
  limited_distribution?: boolean;
  limited_reason?: string | null;
  allow_sharing?: boolean;
  allow_download?: boolean;
}

export interface AdvancedPayload {
  moderation_status?: string;
  review_priority?: string;
  shadowban_enabled?: boolean;
  recommendation_eligible?: boolean;
  search_indexing?: boolean;
  legal_hold?: boolean;
  reporting_sensitivity?: string;
  archive_status?: string;
  auto_archive_after?: string;
  admin_notes?: string | null;
  audit_notes?: string | null;
}

/* ── API calls ──────────────────────────────────────────────────────────── */

export async function getAdminVideoEditData(id: number): Promise<VideoEditData> {
  const { data } = await api.get(`/admin/videos/${id}/edit-data`);
  return data.data;
}

export async function getAdminVideo(id: number): Promise<AdminVideoDetail> {
  const { data } = await api.get(`/admin/videos/${id}`);
  return data.data;
}

export async function updateAdminVideo(id: number, payload: VideoUpdatePayload): Promise<AdminVideoDetail> {
  const { data } = await api.put(`/admin/videos/${id}`, payload);
  return data.data;
}

export async function updateVideoSettings(id: number, payload: SettingsPayload): Promise<AdminVideoDetail> {
  const { data } = await api.patch(`/admin/videos/${id}/settings`, payload);
  return data.data;
}

export async function updateVideoMonetization(id: number, payload: MonetizationPayload): Promise<AdminVideoDetail> {
  const { data } = await api.patch(`/admin/videos/${id}/monetization`, payload);
  return data.data;
}

export async function updateVideoVisibility(id: number, payload: VisibilityPayload): Promise<AdminVideoDetail> {
  const { data } = await api.patch(`/admin/videos/${id}/visibility`, payload);
  return data.data;
}

export async function updateVideoAdvanced(id: number, payload: AdvancedPayload): Promise<AdminVideoDetail> {
  const { data } = await api.patch(`/admin/videos/${id}/advanced`, payload);
  return data.data;
}

export async function deleteAdminVideo(id: number, reason?: string): Promise<void> {
  await api.post(`/admin/videos/${id}/remove`, { reason });
}

export async function restoreAdminVideo(id: number): Promise<void> {
  await api.post(`/admin/videos/${id}/restore`);
}

export async function featureAdminVideo(id: number, featured: boolean): Promise<void> {
  await api.post(`/admin/videos/${id}/feature`, { featured });
}

export async function unpublishAdminVideo(id: number): Promise<void> {
  await api.post(`/admin/videos/${id}/unpublish`);
}

export async function runVideoSafetyCheck(id: number): Promise<void> {
  await api.post(`/admin/videos/${id}/run-safety-check`);
}

export async function reprocessVideo(id: number): Promise<void> {
  await api.post(`/admin/videos/${id}/reprocess`);
}
