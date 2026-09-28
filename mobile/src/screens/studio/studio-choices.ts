import type { StudioSettings } from "@/store/studio-settings.store";

/**
 * Single-choice settings that now open on their OWN page (StudioSettingChoiceScreen)
 * instead of a bottom-sheet dropdown. Each maps a StudioSettings string field to
 * its title + options (+ optional helper note).
 */

const CURRENCIES = [
  "USD ($)", "EUR (€)", "GBP (£)", "INR (₹)", "NPR (रू)", "AUD ($)", "CAD ($)", "JPY (¥)", "CNY (¥)",
  "SGD ($)", "AED (د.إ)", "SAR (﷼)", "PKR (₨)", "BDT (৳)", "IDR (Rp)", "MYR (RM)", "THB (฿)", "PHP (₱)",
  "KRW (₩)", "BRL (R$)", "MXN ($)", "ZAR (R)", "NGN (₦)", "TRY (₺)", "RUB (₽)", "CHF (Fr)", "SEK (kr)",
  "NOK (kr)", "NZD ($)", "HKD ($)",
];
const LANGS = [
  "English", "Español", "Français", "Deutsch", "Italiano", "Português", "Nederlands", "Polski", "Русский",
  "Українська", "Türkçe", "Svenska", "Ελληνικά", "हिन्दी", "नेपाली", "বাংলা", "தமிழ்", "తెలుగు", "मराठी",
  "ગુજરાતી", "اردو", "العربية", "فارسی", "中文", "日本語", "한국어", "Tiếng Việt", "ไทย", "Bahasa Indonesia", "Filipino",
];
const DASHBOARDS = ["Overview", "Content", "Audience", "Revenue"];
const TIMEZONES = [
  "UTC", "Pacific/Honolulu", "America/Anchorage", "America/Los_Angeles", "America/Denver", "America/Chicago",
  "America/New_York", "America/Sao_Paulo", "Atlantic/Reykjavik", "Europe/London", "Europe/Paris", "Europe/Berlin",
  "Europe/Madrid", "Europe/Rome", "Europe/Istanbul", "Europe/Moscow", "Africa/Cairo", "Africa/Lagos",
  "Africa/Johannesburg", "Asia/Dubai", "Asia/Karachi", "Asia/Kolkata", "Asia/Kathmandu", "Asia/Dhaka",
  "Asia/Bangkok", "Asia/Jakarta", "Asia/Singapore", "Asia/Hong_Kong", "Asia/Shanghai", "Asia/Tokyo",
  "Asia/Seoul", "Australia/Perth", "Australia/Sydney", "Pacific/Auckland",
];
const NUMBER_FORMATS = ["1,234.56", "1.234,56", "1 234.56"];
const BUSINESS_TYPES = ["Individual / Sole Proprietor", "Partnership", "LLC", "Private Limited (Pvt Ltd)", "Corporation", "Non-Profit", "Other"];
const INDUSTRIES = ["Media & Entertainment", "Technology", "Education", "Fashion & Beauty", "Food & Beverage", "Gaming", "Health & Fitness", "Finance", "Travel & Hospitality", "Retail & E-commerce", "Other"];

export type StudioChoiceKey =
  | "minPayout" | "payoutCurrency" | "defaultDashboard"
  | "aiLang" | "studioLang" | "timezone" | "currencyFormat" | "numberFormat"
  | "bizType" | "bizIndustry";

/** Country fields use the searchable, full-country StudioCountryChoiceScreen. */
export type StudioCountryKey = "taxResidency" | "bizCountry";

// Compile-time guarantee that every key is a real StudioSettings string field.
type _AssertKeys = StudioChoiceKey | StudioCountryKey extends keyof StudioSettings ? true : never;
export const _assertKeys: _AssertKeys = true;

export const STUDIO_CHOICES: Record<StudioChoiceKey, { title: string; options: string[]; note?: string }> = {
  /* Options and note are filled in at render time from the platform's real
     payout floor - see payoutThresholdChoices below. They used to be the fixed
     list $100…$2,500 with a note reading "The minimum is $100.", which is a
     figure nothing on the server has ever enforced. */
  minPayout: { title: "Minimum Payout Amount", options: [] },
  payoutCurrency: { title: "Payout Currency", options: CURRENCIES, note: "The currency your payouts are sent in." },
  defaultDashboard: { title: "Default Dashboard", options: DASHBOARDS },
  aiLang: { title: "AI Language", options: LANGS, note: "Language used for AI-generated captions and suggestions." },
  studioLang: { title: "Studio Language", options: LANGS },
  timezone: { title: "Timezone", options: TIMEZONES, note: "Detected from your device - change it if you need a different zone." },
  currencyFormat: { title: "Currency Format", options: CURRENCIES },
  numberFormat: { title: "Number Format", options: NUMBER_FORMATS },
  bizType: { title: "Legal Structure", options: BUSINESS_TYPES, note: "How your business is legally registered." },
  bizIndustry: { title: "Industry", options: INDUSTRIES },
};

/**
 * The Minimum Payout Amount picker, built from the platform's own floor.
 *
 * This is the creator's PERSONAL threshold - the balance at which they want a
 * payout sent - so every option has to sit at or above the floor the server
 * actually enforces. Offering $100 as the lowest choice on a platform with a
 * $50 minimum is not merely wrong copy, it withholds a payout the creator was
 * entitled to ask for.
 *
 * `null` while the floor is still loading, so the caller can show nothing
 * rather than a made-up list.
 */
export function payoutThresholdChoices(
  minWithdrawUsd: number | null,
): { options: string[]; note: string } | null {
  if (minWithdrawUsd === null || minWithdrawUsd <= 0) return null;
  const label = (n: number) => `$${n.toLocaleString("en-US")}`;
  return {
    options: [1, 2, 5, 10, 20].map((m) => label(Math.round(minWithdrawUsd * m))),
    note: `Payouts are sent once your available balance passes this amount. The platform minimum is ${label(minWithdrawUsd)}.`,
  };
}

/** Titles for the searchable country page, keyed by the field it edits. */
export const STUDIO_COUNTRY_TITLES: Record<StudioCountryKey, { title: string; note?: string }> = {
  taxResidency: { title: "Tax Residency", note: "The country you are a tax resident of." },
  bizCountry: { title: "Business Country", note: "The country where your business is registered." },
};
