import { api } from "./api";

/**
 * Settings > Third-Party Integrations - the generic client for
 * IntegrationRegistry / AdminIntegrationController.
 *
 * One schema drives every provider (Backblaze, Firebase, Turnstile, Cloudflare,
 * LiveKit, Centrifugo, ClickHouse, Nominatim, Spotify, MusicBrainz, Wikipedia,
 * ShazamKit...) - a provider added to config/integrations.php on the backend
 * shows up here with no frontend change required. PayPal, Stripe and
 * Sightengine are declared in that catalogue too but are intentionally NOT
 * shown here - they already have their own dedicated settings pages
 * (Payment Settings, Moderation) wired straight to the systems that actually
 * consume them, and listing them twice would just be two places to edit the
 * same key.
 */

export type IntegrationFieldType = "text" | "password" | "url";

export type IntegrationField = {
  label: string;
  type: IntegrationFieldType;
  secret: boolean;
  required: boolean;
  is_set: boolean;
  /** "database" | "env" | "default" - where the effective value is coming from. */
  source: "database" | "env" | "default";
  /** Masked ("••••••••abcd") for secret fields, the real value otherwise. */
  value: string | null;
};

export type Integration = {
  provider: string;
  label: string;
  group: string;
  notes?: string | null;
  docs?: string | null;
  testable: boolean;
  refreshable: boolean;
  enabled: boolean;
  /** enabled AND every required field resolved (database, env, or default). */
  ready: boolean;
  status: "untested" | "connected" | "failed";
  last_connected_at?: string | null;
  last_tested_at?: string | null;
  last_error?: string | null;
  usage?: { date: string; calls: number; errors: number; previous: number } | null;
  fields: Record<string, IntegrationField>;
};

export type IntegrationsResponse = {
  groups: Record<string, string>;
  providers: Integration[];
};

/** Providers already served by their own dedicated settings page. */
export const INTEGRATIONS_HIDDEN = new Set(["paypal", "stripe", "sightengine", "mail"]);

export const integrationsService = {
  list: () =>
    api.get<{ success: boolean; data: IntegrationsResponse }>("/admin/integrations").then((r) => r.data.data),

  /**
   * Save. `fields` carries only the keys the admin actually changed - a blank
   * secret means "leave it alone" server-side (AdminIntegrationController
   * never round-trips a real secret back to the form to be blanked-and-resent).
   */
  update: (provider: string, payload: { enabled?: boolean; fields?: Record<string, string> }) =>
    api.put<{ success: boolean; data: Integration }>(`/admin/integrations/${provider}`, payload).then((r) => r.data.data),

  test: (provider: string) =>
    api.post<{ success: boolean; message: string; data: Integration }>(`/admin/integrations/${provider}/test`).then((r) => r.data),

  /** Drop the stored row - the provider falls back to whatever .env says. */
  reset: (provider: string) =>
    api.delete<{ success: boolean; message: string; data: Integration }>(`/admin/integrations/${provider}`).then((r) => r.data),
};
