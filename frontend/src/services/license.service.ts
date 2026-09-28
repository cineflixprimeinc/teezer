import { api } from './api';

/**
 * Client for the marketplace licensing endpoints.
 *
 * Two audiences in one file, deliberately kept visually separate below:
 *
 *   - `activateLicense` is PUBLIC and unauthenticated. It backs
 *     /activate-license, which a buyer uses before they have any account.
 *   - everything under "Admin" requires an admin session AND the
 *     manage_licenses grant. That is enforced server-side by
 *     ApiAdminMiddleware + EnsurePermission; nothing here is a security
 *     control, and this file must never be treated as one.
 *
 * No response type in this file carries a purchase code or a licence key,
 * with exactly two exceptions - the one-time values returned by
 * `activateLicense` and `generatePurchaseCodes`. Both are shown to the user
 * once and never stored anywhere.
 */

/* ── Public activation ──────────────────────────────────────────────────── */

export type ActivationRequest = {
  purchase_code: string;
  domain: string;
  username: string;
};

export type ActivationResult = {
  license_key: string;
  license_id: string;
  domain: string;
  username: string;
  notice: string;
};

export async function activateLicense(payload: ActivationRequest): Promise<ActivationResult> {
  const { data } = await api.post('/license/activate', payload);
  return data.data;
}

/* ── Admin ──────────────────────────────────────────────────────────────── */

export type LicenseStatus = 'active' | 'suspended' | 'revoked' | 'expired';

/** Masked by the API. `purchase_code` and `license_key` are never real values. */
export type License = {
  license_id: string;
  purchase_code: string;
  license_key: string;
  domain: string;
  username: string;
  installation_id: string | null;
  status: LicenseStatus;
  version: string | null;
  activation_limit: number;
  activation_count: number;
  activated_at: string | null;
  installed_at: string | null;
  last_verified_at: string | null;
  token_expires_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  created_at: string | null;
};

export type LicenseStats = {
  total: number;
  active: number;
  suspended: number;
  revoked: number;
  expired: number;
  installed: number;
  codes_available: number;
  quiet_installs: number;
};

export type LicenseActivationRow = {
  installation_id: string;
  domain: string;
  status: string;
  ip_address: string | null;
  version: string | null;
  php_version: string | null;
  server_os: string | null;
  rejection_reason: string | null;
  activated_at: string | null;
  last_seen_at: string | null;
};

export type LicenseAuditRow = {
  action: string;
  actor_type: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  severity: string;
  created_at: string | null;
};

export type PurchaseCodeRow = {
  id: number;
  masked: string;
  batch: string | null;
  marketplace: string | null;
  buyer_reference: string | null;
  status: 'available' | 'activated' | 'disabled';
  activation_limit: number;
  licenses_count: number;
  activated_at: string | null;
  created_at: string | null;
};

export type LicenseListResponse = {
  items: License[];
  meta: { current_page: number; last_page: number; per_page: number; total: number };
  stats: LicenseStats;
};

const ADMIN = '/admin/licenses';

export async function listLicenses(params: {
  q?: string;
  status?: string;
  page?: number;
  per_page?: number;
}): Promise<LicenseListResponse> {
  const { data } = await api.get(ADMIN, { params });
  return data.data;
}

export async function getLicense(licenseId: string): Promise<{
  license: License;
  activations: LicenseActivationRow[];
  audit_logs: LicenseAuditRow[];
}> {
  const { data } = await api.get(`${ADMIN}/${licenseId}`);
  return data.data;
}

export async function suspendLicense(licenseId: string, reason?: string): Promise<License> {
  const { data } = await api.post(`${ADMIN}/${licenseId}/suspend`, { reason });
  return data.data;
}

export async function reactivateLicense(licenseId: string): Promise<License> {
  const { data } = await api.post(`${ADMIN}/${licenseId}/reactivate`, {});
  return data.data;
}

export async function revokeLicense(licenseId: string, reason: string): Promise<License> {
  const { data } = await api.post(`${ADMIN}/${licenseId}/revoke`, { reason });
  return data.data;
}

export async function resetActivation(licenseId: string, reason?: string): Promise<License> {
  const { data } = await api.post(`${ADMIN}/${licenseId}/reset-activation`, { reason });
  return data.data;
}

export async function changeDomain(licenseId: string, domain: string, reason?: string): Promise<License> {
  const { data } = await api.post(`${ADMIN}/${licenseId}/change-domain`, { domain, reason });
  return data.data;
}

export async function listPurchaseCodes(params: {
  status?: string;
  batch?: string;
  page?: number;
}): Promise<{ items: PurchaseCodeRow[]; meta: { current_page: number; last_page: number; total: number } }> {
  const { data } = await api.get(`${ADMIN}/purchase-codes`, { params });
  return data.data;
}

/**
 * Returns the generated codes IN PLAINTEXT, once. The server stores only
 * hashes, so this response is the only copy that will ever exist - the UI
 * says so, and offers a download before anything can navigate away.
 */
export async function generatePurchaseCodes(payload: {
  count: number;
  batch?: string;
  marketplace?: string;
  activation_limit?: number;
  notes?: string;
}): Promise<{ batch: string; codes: string[]; notice: string }> {
  const { data } = await api.post(`${ADMIN}/purchase-codes`, payload);
  return data.data;
}

export async function disablePurchaseCode(id: number): Promise<void> {
  await api.post(`${ADMIN}/purchase-codes/${id}/disable`, {});
}
