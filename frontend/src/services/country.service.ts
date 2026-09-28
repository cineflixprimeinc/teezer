import { api } from "./api";

export type DetectedCountry = {
  countryCode:     string;
  countryName:     string;
  asnNumber:       number | null;
  ispOrganization: string | null;
  source:          string;
  /** Country-availability fields (App\Services\CountryAvailabilityService) -
   *  UX signals only. The backend re-checks independently at submit time in
   *  register()/login()/completeSocial(), so these can never be the real
   *  security boundary - see that service's own docblock. */
  restrictionsEnabled: boolean;
  signupAllowed:       boolean;
  signupReason:        string | null;
  loginAllowed:        boolean;
  loginReason:         string | null;
  policyVersion:       number;
  /** Admin-configurable UX setting - when false, signup should present the
   *  detected country as fixed instead of an open dropdown. UX only, same
   *  as everything else here - the backend always evaluates the DETECTED
   *  country regardless of what the picker allows. */
  allowManualCountryChange: boolean;
};

export type CountryAvailabilityEntry = { code: string; name: string; enabled: boolean };
export type CountryAvailabilityList = {
  restrictionsEnabled: boolean;
  policyVersion: number;
  countries: CountryAvailabilityEntry[];
};

export type CountryStatus = {
  currentCountryCode:      string | null;
  currentCountryName:      string | null;
  detectedCountryCode:     string | null;
  detectedCountryName:     string | null;
  countryLockedUntil:      string | null;
  remainingLockDays:       number;
  canRequestCountryChange: boolean;
  pendingRequestedCountry: string | null;
  pendingRequestedName:    string | null;
  continuousDetectedDays:  number;
  requiredContinuousDays:  number;
  eligibleAt:              string | null;
  status:                  "none" | "pending" | "eligible" | "approved" | "rejected" | "cancelled";
  message:                 string;
};

export type ResidencyDocumentType =
  | "passport" | "visa" | "residence_permit" | "national_id"
  | "utility_bill" | "bank_statement" | "lease_agreement" | "other";

export type ResidencyDocument = {
  id: number;
  requested_country_code: string;
  requested_country_name: string;
  document_type: ResidencyDocumentType;
  file_name: string | null;
  file_url?: string;
  residing_since: string | null;
  user_note: string | null;
  status: "pending_review" | "approved" | "rejected";
  review_notes: string | null;
  reviewed_at: string | null;
  submitted_at: string | null;
};

export type ResidencyUploadPayload = {
  countryCode:   string;
  documentType:  ResidencyDocumentType;
  file:          File;
  residingSince: string;   // YYYY-MM-DD
  note?:         string;
};

type DetectResponse   = { success: boolean; data: DetectedCountry };
type StatusResponse   = { success: boolean; data: CountryStatus };
type DocsListResponse = { success: boolean; data: ResidencyDocument[] };
type DocsCreateResponse = { success: boolean; message: string; data: ResidencyDocument };

export const countryService = {
  /** Public - used by signup page to pre-fill the country dropdown. */
  async detect(): Promise<DetectedCountry> {
    const { data } = await api.get<DetectResponse>("/detect-country");
    return data.data;
  },

  /** Public - every country's signup availability, for the dropdown (so a
   *  restricted country can be shown visibly-but-disabled instead of
   *  silently hidden - see the "Restricted Country UI" requirement). */
  async availabilityList(): Promise<CountryAvailabilityList> {
    const { data } = await api.get<{ success: boolean; data: CountryAvailabilityList }>("/countries/availability");
    return data.data;
  },

  /** Authed - full lock + verification status for the current user. */
  async status(): Promise<CountryStatus> {
    const { data } = await api.get<StatusResponse>("/user/country-status");
    return data.data;
  },

  /** Authed - one detection ping per day (deduped server-side). */
  async heartbeat(): Promise<CountryStatus> {
    const { data } = await api.post<StatusResponse>("/user/country-heartbeat");
    return data.data;
  },

  /** Authed - start (or refresh) the 60-day continuous verification. */
  async requestChange(countryCode: string): Promise<CountryStatus> {
    const { data } = await api.post<StatusResponse>("/user/request-country-change", {
      country_code: countryCode.toUpperCase(),
    });
    return data.data;
  },

  /** Authed - apply an eligible request, locks new country for 60 more days. */
  async confirmChange(): Promise<CountryStatus> {
    const { data } = await api.post<StatusResponse>("/user/confirm-country-change");
    return data.data;
  },

  /** Authed - list user's residency-proof submissions (newest first). */
  async listResidencyDocuments(): Promise<ResidencyDocument[]> {
    const { data } = await api.get<DocsListResponse>("/user/country-residency-documents");
    return data.data ?? [];
  },

  /** Authed - upload a residency-proof document for manual country change. */
  async submitResidencyDocument(p: ResidencyUploadPayload): Promise<ResidencyDocument> {
    const form = new FormData();
    form.append("country_code",   p.countryCode.toUpperCase());
    form.append("document_type",  p.documentType);
    form.append("document",       p.file);
    form.append("residing_since", p.residingSince);
    if (p.note) form.append("note", p.note);
    const { data } = await api.post<DocsCreateResponse>(
      "/user/country-residency-documents",
      form,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return data.data;
  },
};

/**
 * Fire the once-per-day heartbeat from the browser. Safe to call on every page
 * load - uses localStorage to dedupe so we only hit the server once per UTC
 * calendar day per browser. Silently no-ops if the user isn't logged in.
 */
export async function maybeSendHeartbeat(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!window.localStorage.getItem("reelsoo_token")) return;

  const today = new Date().toISOString().slice(0, 10);
  const sent  = window.localStorage.getItem("reelsoo_country_heartbeat");
  if (sent === today) return;

  try {
    await countryService.heartbeat();
    window.localStorage.setItem("reelsoo_country_heartbeat", today);
  } catch {
    // Never block the UI on a heartbeat failure.
  }
}
