import axios from 'axios';

const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1').replace(/\/+$/, '');

const api = axios.create({ baseURL: API, withCredentials: true });

api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('reelsoo_token') : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Types ───────────────────────────────────────────────────────────────────

export type RestrictionType =
  | 'restrict_uploads'
  | 'post_approval_required'
  | 'block_live_access'
  | 'disable_draft_creation'
  | 'disable_commenting_on_uploads';

export interface RestrictionState {
  is_active:  boolean;
  expires_at: string | null; // ISO 8601
  reason:     string | null;
}

export type RestrictionsMap = Record<RestrictionType, RestrictionState>;

export interface User360Data {
  id:               number;
  name:             string;
  username:         string;
  email:            string;
  avatar:           string | null;
  role:             string;
  is_verified:      boolean;
  is_banned:        boolean;
  risk_score:       number;
  risk_label:       string;
  account_health:   number;
  health_label:     string;
  followers_count:  number;
  following_count:  number;
  videos_count:     number;
  created_at:       string;
  moderation_settings: Record<string, unknown>;
}

export interface RestrictionPayloadItem {
  type:       RestrictionType;
  is_active:  boolean;
  expires_at: string | null;
  reason:     string | null;
}

// ── Content types ───────────────────────────────────────────────────────────

export interface ContentItem {
  id:             number;
  caption:        string | null;
  content_type:   'video' | 'image' | 'image_carousel';
  status:         'published' | 'draft' | 'private' | 'removed';
  visibility:     'public' | 'only_me' | 'private' | 'removed';
  thumbnail_url:  string | null;
  views_count:    number;
  likes_count:    number;
  comments_count: number;
  shares_count:   number;
  duration:       number | null;
  published_at:   string | null;
  created_at:     string;
}

export interface ContentStats {
  total_posts: number;
  videos:      number;
  photos:      number;
  total_views: number;
}

export interface ContentInsights {
  top_post:     { id: number; caption: string | null; thumbnail_url: string | null; views_count: number; likes_count: number } | null;
  top_category: { name: string; count: number } | null;
  last_upload:  string | null;
  moderation_notes_count: number;
}

export interface ContentResponse {
  items:      ContentItem[];
  pagination: { current_page: number; last_page: number; per_page: number; total: number };
  stats:      ContentStats;
  insights:   ContentInsights;
}

export interface ContentQueryParams {
  type?:      'all' | 'video' | 'photo';
  status?:    'all' | 'published' | 'draft' | 'private' | 'reported' | 'removed';
  sort?:      'latest' | 'oldest' | 'views' | 'likes' | 'comments';
  search?:    string;
  page?:      number;
  per_page?:  number;
  date_from?: string;
  date_to?:   string;
}

// ── API calls ───────────────────────────────────────────────────────────────

export async function getUser360(id: number): Promise<User360Data> {
  const { data } = await api.get(`/admin/users/${id}/360`);
  return data.data;
}

export async function getUserContent(id: number, params: ContentQueryParams = {}): Promise<ContentResponse> {
  const { data } = await api.get(`/admin/users/${id}/content`, { params });
  return data.data;
}

export async function getRestrictions(id: number): Promise<RestrictionsMap> {
  const { data } = await api.get(`/admin/users/${id}/restrictions`);
  return data.data;
}

export async function updateRestrictions(
  id: number,
  restrictions: RestrictionPayloadItem[]
): Promise<RestrictionsMap> {
  const { data } = await api.patch(`/admin/users/${id}/restrictions`, { restrictions });
  return data.data;
}
