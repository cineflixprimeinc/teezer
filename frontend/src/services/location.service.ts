import { api } from "./api";

export type LocationResult = {
  formatted:    string;
  city?:        string | null;
  region?:      string | null;
  country?:     string | null;
  country_code?: string;
  /** Only present after a reverse-geocode call - forward to /location/save. */
  lat?:         number | null;
  lng?:         number | null;
};

export type SavedLocation = {
  local_location?:     string | null;
  city_name?:          string | null;
  region_name?:        string | null;
  country_name?:       string | null;
  country_code?:       string | null;
  location_source?:    "gps" | "ip" | "manual" | "nominatim" | "none";
  location_updated_at?: string | null;
};

export const locationService = {
  /** Full-text search via Nominatim proxy, optionally scoped to one country. */
  async search(q: string, country?: string): Promise<LocationResult[]> {
    const params: Record<string, string> = { q };
    if (country) params.country = country;
    const { data } = await api.get<{ success: boolean; data: LocationResult[] }>(
      "/location/search",
      { params },
    );
    return data.data ?? [];
  },

  /**
   * Send browser GPS coordinates to the backend for reverse-geocoding.
   * The raw coords never leave the server - only the formatted address
   * is returned here, along with lat/lng to forward on the /save call.
   */
  async reverseGeocode(lat: number, lng: number): Promise<LocationResult | null> {
    const { data } = await api.post<{ success: boolean; data: LocationResult }>(
      "/location/reverse-geocode",
      { lat, lng },
    );
    return data.data ?? null;
  },

  /** Persist the chosen location for the authenticated user. */
  async save(payload: LocationResult & { source?: string }): Promise<SavedLocation> {
    const { data } = await api.post<{ success: boolean; data: SavedLocation }>(
      "/location/save",
      {
        local_location: payload.formatted,
        city_name:      payload.city,
        region_name:    payload.region,
        country_name:   payload.country,
        country_code:   payload.country_code,
        lat:            payload.lat,
        lng:            payload.lng,
        source:         payload.source ?? "manual",
      },
    );
    return data.data;
  },

  /** Get the current user's saved location. */
  async me(): Promise<SavedLocation> {
    const { data } = await api.get<{ success: boolean; data: SavedLocation }>("/location/me");
    return data.data;
  },
};
