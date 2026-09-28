import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Teezer Studio settings store.
 *
 * Studio-only creator/business/monetization preferences. There is no
 * `/studio/settings` endpoint yet, so this persists locally (AsyncStorage
 * snapshot) rather than syncing to the server - swap `update` for an optimistic
 * PATCH when the API lands, mirroring app-prefs.store / a11y.store. Kept in a
 * store (not screen state) so the value survives navigating from the Studio
 * Settings menu into a category sub-page and back.
 */

const CACHE_KEY = "teezer:studio-settings";

/** Device timezone (IANA, e.g. "Asia/Kathmandu"), following the user's region. */
function detectTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
}

export interface StudioSettings {
  /** Per-programme switches on the Monetization programme pages. Local until a
   *  /studio/monetization/settings endpoint exists - see the note above. */
  programToggles: Record<string, boolean>;
  // Payments & Earnings (payout accounts live in payment-methods.store)
  autoPayout: boolean;
  minPayout: string;
  payoutCurrency: string;
  // Tax
  taxResidency: string;
  taxId: string;
  // Creator Business
  bizName: string;
  bizReg: string;
  bizAddress: string;
  bizEmail: string;
  bizPhone: string;
  bizType: string;
  bizTaxId: string;
  bizIndustry: string;
  bizWebsite: string;
  bizAddr2: string;
  bizCity: string;
  bizState: string;
  bizPostal: string;
  bizCountry: string;
  bizContactName: string;
  // Monetization
  revAds: boolean;
  revSubs: boolean;
  revGifts: boolean;
  revSponsor: boolean;
  // Music & Copyright
  allowSoundReuse: boolean;
  // AI Studio
  aiAssistant: boolean;
  aiCaptions: boolean;
  aiThumbnails: boolean;
  aiVideoTools: boolean;
  aiLang: string;
  // Analytics
  defaultDashboard: string;
  scheduledReports: boolean;
  // Developer
  devMode: boolean;
  // Localization
  studioLang: string;
  timezone: string;
  currencyFormat: string;
  numberFormat: string;
  // Advanced
  beta: boolean;
  experimental: boolean;
}

export const STUDIO_SETTINGS_DEFAULTS: StudioSettings = {
  programToggles: {},
  autoPayout: true, minPayout: "$100", payoutCurrency: "USD ($)",
  taxResidency: "United States", taxId: "",
  bizName: "", bizReg: "", bizAddress: "", bizEmail: "", bizPhone: "",
  bizType: "", bizTaxId: "", bizIndustry: "", bizWebsite: "",
  bizAddr2: "", bizCity: "", bizState: "", bizPostal: "", bizCountry: "",
  bizContactName: "",
  revAds: true, revSubs: true, revGifts: true, revSponsor: false,
  allowSoundReuse: false,
  aiAssistant: true, aiCaptions: true, aiThumbnails: false, aiVideoTools: false, aiLang: "English",
  defaultDashboard: "Overview", scheduledReports: false,
  devMode: false,
  studioLang: "English", timezone: "", currencyFormat: "USD ($)", numberFormat: "1,234.56",
  beta: false, experimental: false,
};

interface StudioSettingsState {
  prefs: StudioSettings;
  loaded: boolean;
  hydrate: () => Promise<void>;
  update: (patch: Partial<StudioSettings>) => void;
}

export const useStudioSettingsStore = create<StudioSettingsState>((set, get) => ({
  prefs: STUDIO_SETTINGS_DEFAULTS,
  loaded: false,

  hydrate: async () => {
    if (get().loaded) return;
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      const prefs = raw ? { ...STUDIO_SETTINGS_DEFAULTS, ...JSON.parse(raw) } : { ...STUDIO_SETTINGS_DEFAULTS };
      // First run: auto-detect the device timezone (follows the user's country).
      // Language stays English and currency stays USD by default - the user can
      // change any of these afterwards.
      if (!prefs.timezone) prefs.timezone = detectTimezone();
      set({ prefs, loaded: true });
    } catch {
      set({ loaded: true }); // corrupted cache → fall back to defaults
    }
  },

  update: (patch) => {
    const next = { ...get().prefs, ...patch };
    set({ prefs: next });
    void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next)).catch(() => { /* best-effort */ });
  },
}));
