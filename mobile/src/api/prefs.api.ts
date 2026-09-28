import { api } from "./client";

/**
 * Player / content preferences - persisted server-side on the user row
 * (content_preferences + accessibility_preferences JSON columns), so they
 * follow the account across devices. Fetched once and cached locally for
 * instant sheet opens; see store/prefs.store.ts.
 */

export type VideoQuality = "auto" | "360" | "480" | "720" | "1080";
export type ThemePref = "light" | "dark" | "system";

export interface ContentPreferences {
  preferred_language: string;
  preferred_country: string;
  show_local_first: boolean;
  show_trending: boolean;
  sensitive_content_filter: boolean;
  autoplay_videos: boolean;
  data_saver_mode: boolean;
  /** One-shot: true once the user dismisses the first-run Spaces welcome popup. */
  has_seen_spaces_onboarding: boolean;
  auto_scroll: boolean;
  loop_video: boolean;
  playback_speed: number;
  default_quality: VideoQuality;
  theme: ThemePref;
}

/** Full accessibility preference set - same 12 fields as the website's
 *  Accessibility Settings page (GET/PATCH /profile/accessibility). */
export type TextSize = "small" | "medium" | "large" | "xlarge";
export type PointerSize = "default" | "large" | "xlarge";
export type CaptionStyle = "default" | "large_text" | "high_contrast" | "yellow_black";

export interface AccessibilityPreferences {
  larger_text: boolean;
  text_size: TextSize;
  high_contrast: boolean;
  reduce_transparency: boolean;
  reduce_motion: boolean;
  autoplay_videos: boolean;
  pointer_size: PointerSize;
  captions_always_on: boolean;
  caption_style: CaptionStyle;
  audio_descriptions: boolean;
  keyboard_navigation: boolean;
  screen_reader: boolean;
}

/** App Preferences › Appearance (GET/PATCH /profile/appearance). */
export type ThemeMode = "light" | "dark" | "system";
export type AppIcon = "default" | "midnight" | "retro";
export interface AppearancePreferences {
  theme: ThemeMode;
  app_icon: AppIcon;
  bold_text: boolean;
  in_app_browser: boolean;
}

/** App Preferences › Messages (GET/PATCH /profile/messages-preferences). */
export type WhoCanMessage = "everyone" | "friends" | "followers" | "no_one";
export type GroupInvites = "everyone" | "friends" | "no_one";
export interface MessagesPreferences {
  who_can_message: WhoCanMessage;
  group_invites: GroupInvites;
  message_requests: boolean;
  read_receipts: boolean;
  typing_indicators: boolean;
  media_autodownload: boolean;
}

/** App Preferences › Digital Wellbeing (GET/PATCH /profile/wellbeing). */
export interface WellbeingPreferences {
  daily_limit_minutes: number;   // 0 = no limit
  break_reminders: boolean;
  break_interval_minutes: number;
  bedtime_enabled: boolean;
  bedtime_start: string;         // "HH:MM"
  bedtime_end: string;           // "HH:MM"
  restful_notifications: boolean;
}

/** App Preferences › AI Features (GET/PATCH /profile/ai-preferences). */
export interface AiPreferences {
  ai_recommendations: boolean;
  ai_labels: boolean;
  ai_captions: boolean;
  ai_search: boolean;
  ai_reply_suggestions: boolean;
  personalized_ads: boolean;
  data_for_training: boolean;
}

/** Family Control › Child Mode + Content Controls (GET/PATCH /profile/family).
 *  `pin_set` is read-only (whether a parent PIN exists); never sent in a PATCH. */
export type ChildAgeGroup = "under_7" | "8_12" | "13_15" | "16_17";
export interface FamilyPreferences {
  child_mode_enabled: boolean;
  child_age_group: ChildAgeGroup;
  daily_screen_time_minutes: number;
  bedtime_enabled: boolean;
  bedtime_start: string;
  bedtime_end: string;
  break_reminders: boolean;
  safe_search: boolean;
  sensitive_content_filter: boolean;
  mature_content_filter: boolean;
  hide_violence: boolean;
  hide_adult_content: boolean;
  educational_only: boolean;
  pin_set: boolean;
}

/** "Default upload setting" (GET/PATCH /profile/upload-preferences) - the
 *  compose screen's own saved defaults, set once from its dedicated
 *  settings page and applied to every new post afterwards until changed. */
export interface UploadPreferences {
  allow_comments: boolean;
  allow_duet: boolean;
  allow_stitch: boolean;
  allow_download: boolean;
  auto_caption: boolean;
  high_quality_upload: boolean;
  is_ai_generated: boolean;
}

export const prefsApi = {
  content: () =>
    api.get<{ success: boolean; data: ContentPreferences }>("/profile/content-preferences")
      .then((r) => r.data.data),

  updateContent: (patch: Partial<ContentPreferences>) =>
    api.patch<{ success: boolean; data: ContentPreferences }>("/profile/content-preferences", patch)
      .then((r) => r.data.data),

  accessibility: () =>
    api.get<{ success: boolean; data: AccessibilityPreferences }>("/profile/accessibility")
      .then((r) => r.data.data),

  updateAccessibility: (patch: Partial<AccessibilityPreferences>) =>
    api.patch<{ success: boolean; data: AccessibilityPreferences }>("/profile/accessibility", patch)
      .then((r) => r.data.data),

  appearance: () =>
    api.get<{ success: boolean; data: AppearancePreferences }>("/profile/appearance").then((r) => r.data.data),
  updateAppearance: (patch: Partial<AppearancePreferences>) =>
    api.patch<{ success: boolean; data: AppearancePreferences }>("/profile/appearance", patch).then((r) => r.data.data),

  messages: () =>
    api.get<{ success: boolean; data: MessagesPreferences }>("/profile/messages-preferences").then((r) => r.data.data),
  updateMessages: (patch: Partial<MessagesPreferences>) =>
    api.patch<{ success: boolean; data: MessagesPreferences }>("/profile/messages-preferences", patch).then((r) => r.data.data),

  wellbeing: () =>
    api.get<{ success: boolean; data: WellbeingPreferences }>("/profile/wellbeing").then((r) => r.data.data),
  updateWellbeing: (patch: Partial<WellbeingPreferences>) =>
    api.patch<{ success: boolean; data: WellbeingPreferences }>("/profile/wellbeing", patch).then((r) => r.data.data),

  ai: () =>
    api.get<{ success: boolean; data: AiPreferences }>("/profile/ai-preferences").then((r) => r.data.data),
  updateAi: (patch: Partial<AiPreferences>) =>
    api.patch<{ success: boolean; data: AiPreferences }>("/profile/ai-preferences", patch).then((r) => r.data.data),

  family: () =>
    api.get<{ success: boolean; data: FamilyPreferences }>("/profile/family").then((r) => r.data.data),
  updateFamily: (patch: Partial<FamilyPreferences>) =>
    api.patch<{ success: boolean; data: FamilyPreferences }>("/profile/family", patch).then((r) => r.data.data),
  // Set / change the parent PIN. Rejects (422) with { message } if current_pin is wrong.
  setFamilyPin: (pin: string, current_pin?: string) =>
    api.post<{ success: boolean; message: string }>("/profile/family/pin", { pin, current_pin }).then((r) => r.data),
  // Resolves true only when the PIN matches (server returns 422 otherwise).
  verifyFamilyPin: (pin: string) =>
    api.post("/profile/family/pin/verify", { pin }).then(() => true).catch(() => false),

  uploadPreferences: () =>
    api.get<{ success: boolean; data: UploadPreferences }>("/profile/upload-preferences").then((r) => r.data.data),
  updateUploadPreferences: (patch: Partial<UploadPreferences>) =>
    api.patch<{ success: boolean; data: UploadPreferences }>("/profile/upload-preferences", patch).then((r) => r.data.data),
};
