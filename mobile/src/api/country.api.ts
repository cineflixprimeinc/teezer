import { api } from "./client";

/** GET /user/country-status - detected vs selected country + lock/request state. */
export interface CountryStatus {
  currentCountryCode: string | null;
  currentCountryName: string | null;
  detectedCountryCode: string | null;
  detectedCountryName: string | null;
  countryLockedUntil: string | null;
  remainingLockDays: number;
  canRequestCountryChange: boolean;
  pendingRequestedCountry: string | null;
  pendingRequestedName: string | null;
  continuousDetectedDays: number;
  requiredContinuousDays: number;
  status: string; // none | pending | eligible | ...
  message: string;
}

export const countryApi = {
  status: () => api.get<{ success: boolean; data: CountryStatus }>("/user/country-status").then((r) => r.data.data),

  requestChange: (country_code: string) =>
    api
      .post<{ success: boolean; message: string; data: CountryStatus }>("/user/request-country-change", { country_code })
      .then((r) => r.data),

  heartbeat: () => api.post<{ success: boolean; data: CountryStatus }>("/user/country-heartbeat").then((r) => r.data.data),

  /** Multipart residency-document submission for manual country-change review. */
  submitResidencyDocument: (data: {
    country_code: string;
    document_type: string;
    residing_since: string; // YYYY-MM-DD
    note?: string;
    file: { uri: string; name: string; type: string };
  }) => {
    const fd = new FormData();
    fd.append("country_code", data.country_code);
    fd.append("document_type", data.document_type);
    fd.append("residing_since", data.residing_since);
    if (data.note) fd.append("note", data.note);
    // React Native multipart file part.
    fd.append("document", { uri: data.file.uri, name: data.file.name, type: data.file.type } as unknown as Blob);
    return api
      .post<{ success: boolean; message: string; data: { id: number; status: string } }>(
        "/user/country-residency-documents",
        fd,
      )
      .then((r) => r.data);
  },
};
