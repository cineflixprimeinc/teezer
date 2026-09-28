export type ModerationStatus = 'pending' | 'scanning' | 'approved' | 'pending_review' | 'rejected';
export type ScanStatus = 'queued' | 'scanning' | 'completed' | 'failed' | 'not_scanned';
export type AdminDecision = 'approved' | 'rejected' | 'removed';

export interface ModerationStatusResponse {
  content_id: number;
  moderation_status: ModerationStatus;
  scan_status: ScanStatus;
  scanned_at: string | null;
  user_message: string;
}

export interface ModerationRecord {
  id: number;
  content_id: number;
  user_id: number;
  content_type: string;
  scan_status: ScanStatus;
  nudity_detected: boolean;
  nudity_score: number;
  nsfw_score: number;
  detected_labels: string[];
  scanned_frames_count: number;
  highest_risk_timestamp: number | null;
  decision: ModerationStatus | null;
  reason: string | null;
  model_name: string | null;
  model_version: string | null;
  scanned_at: string | null;
  admin_review_status: 'pending' | 'approved' | 'rejected' | null;
  admin_reviewed_by: string | null;
  admin_reviewed_at: string | null;
  created_at: string;
  video?: {
    id: number;
    caption: string | null;
    status: string;
    mime_type: string | null;
    duration: number | null;
    created_at: string;
    preview_url: string | null;
    user: { id: number; username: string };
  };
}

export interface ModerationStats {
  pending_review: number;
  approved: number;
  rejected: number;
  failed_scans: number;
  total_scanned: number;
}

export interface ModerationSettings {
  id: number;
  nsfw_pending_threshold: number;
  nsfw_reject_threshold: number;
  nudity_pending_threshold: number;
  nudity_reject_threshold: number;
  video_default_frame_interval_seconds: number;
  video_default_scan_duration_seconds: number;
  video_full_scan_frame_interval_seconds: number;
  auto_reject_enabled: boolean;
  admin_review_required_for_high_risk: boolean;
  moderation_enabled: boolean;
  updated_at: string;
}

export interface ScannerHealth {
  status: string;
  models_loaded: boolean;
  nudenet_loaded: boolean;
  nsfw_loaded: boolean;
}

export interface ModerationListMeta {
  current_page: number;
  last_page: number;
  total: number;
  per_page: number;
}
