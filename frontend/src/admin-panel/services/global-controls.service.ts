import { api } from "./api";

/** Mirrors GlobalControlService::forAdmin()'s per-control shape exactly. */
export type GlobalControl = {
  key: string;
  category: string;
  label: string;
  description: string;
  enabled: boolean;
  default: boolean;
  critical: boolean;
  requiresReason: boolean;
  platforms: string[];
  enforcement: string;
  changedReason: string | null;
  changedBy: string | null;
  changedAt: string | null;
  expiresAt: string | null;
};

export type GlobalControlStatus = {
  operational: boolean;
  activeRestrictions: number;
  disabledFeatures: number;
  maintenanceMode: boolean;
  readOnlyMode: boolean;
};

export type GlobalControlActivity = {
  id: number;
  action: string;
  description: string;
  metadata: Record<string, unknown> | null;
  severity: string;
  admin: string;
  createdAt: string;
};

const BASE = "/admin/global-controls";

export const globalControlsService = {
  async list(): Promise<{ controls: GlobalControl[]; categories: Record<string, string>; status: GlobalControlStatus }> {
    const { data } = await api.get(BASE);
    return data.data;
  },

  async update(key: string, enabled: boolean, reason?: string, durationMinutes?: number) {
    const { data } = await api.patch(`${BASE}/${key}`, { enabled, reason, duration: durationMinutes });
    return data.data as { key: string; enabled: boolean; previous: boolean; expiresAt: string | null; propagation: Record<string, string> };
  },

  async bulkCategory(category: string, enabled: boolean, reason?: string) {
    const { data } = await api.post(`${BASE}/category/${category}`, { enabled, reason });
    return data.data as { changed: unknown[]; propagation: Record<string, string> };
  },

  async activity(limit = 30): Promise<GlobalControlActivity[]> {
    const { data } = await api.get(`${BASE}/activity`, { params: { limit } });
    return data.data;
  },

  async stopActiveLiveStreams(reason?: string) {
    const { data } = await api.post(`${BASE}/actions/stop-live-streams`, { reason });
    return data.data as { stopped: number[] };
  },
};
