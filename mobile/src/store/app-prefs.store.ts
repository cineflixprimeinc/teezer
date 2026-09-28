import {
  prefsApi,
  type AppearancePreferences,
  type MessagesPreferences,
  type WellbeingPreferences,
  type AiPreferences,
  type FamilyPreferences,
} from "@/api/prefs.api";
import { createPrefStore } from "./pref-store";

/**
 * App Preferences stores - one synced preference group each, all built from the
 * shared createPrefStore factory. DEFAULTS mirror the server *Defaults() methods
 * in ProfileController so hydrate() shows the right values before the first sync.
 */

export const APPEARANCE_DEFAULTS: AppearancePreferences = {
  theme: "system",
  app_icon: "default",
  bold_text: false,
  in_app_browser: true,
};

export const MESSAGES_DEFAULTS: MessagesPreferences = {
  who_can_message: "everyone",
  group_invites: "friends",
  message_requests: true,
  read_receipts: true,
  typing_indicators: true,
  media_autodownload: true,
};

export const WELLBEING_DEFAULTS: WellbeingPreferences = {
  daily_limit_minutes: 0,
  break_reminders: false,
  break_interval_minutes: 30,
  bedtime_enabled: false,
  bedtime_start: "22:00",
  bedtime_end: "07:00",
  restful_notifications: false,
};

export const AI_DEFAULTS: AiPreferences = {
  ai_recommendations: true,
  ai_labels: true,
  ai_captions: true,
  ai_search: true,
  ai_reply_suggestions: true,
  personalized_ads: false,
  data_for_training: false,
};

export const useAppearanceStore = createPrefStore({
  cacheKey: "teezer:appearance",
  defaults: APPEARANCE_DEFAULTS,
  fetch: prefsApi.appearance,
  patch: prefsApi.updateAppearance,
});

export const useMessagesPrefStore = createPrefStore({
  cacheKey: "teezer:messages-prefs",
  defaults: MESSAGES_DEFAULTS,
  fetch: prefsApi.messages,
  patch: prefsApi.updateMessages,
});

export const useWellbeingStore = createPrefStore({
  cacheKey: "teezer:wellbeing",
  defaults: WELLBEING_DEFAULTS,
  fetch: prefsApi.wellbeing,
  patch: prefsApi.updateWellbeing,
});

export const useAiStore = createPrefStore({
  cacheKey: "teezer:ai-prefs",
  defaults: AI_DEFAULTS,
  fetch: prefsApi.ai,
  patch: prefsApi.updateAi,
});

export const FAMILY_DEFAULTS: FamilyPreferences = {
  child_mode_enabled: false,
  child_age_group: "13_15",
  daily_screen_time_minutes: 0,
  bedtime_enabled: false,
  bedtime_start: "21:00",
  bedtime_end: "07:00",
  break_reminders: false,
  safe_search: true,
  sensitive_content_filter: true,
  mature_content_filter: true,
  hide_violence: false,
  hide_adult_content: true,
  educational_only: false,
  pin_set: false,
};

export const useFamilyStore = createPrefStore({
  cacheKey: "teezer:family",
  defaults: FAMILY_DEFAULTS,
  fetch: prefsApi.family,
  patch: prefsApi.updateFamily,
});
