import { api } from "./api";

/**
 * Platform settings with a declared schema.
 *
 * Distinct from the generic key/value settings endpoint: everything reachable
 * here is constrained server-side to App\Services\PlatformSettings' schema, so
 * a field cannot appear in the panel without a verified consumer in the
 * application. That constraint is the point - the generic editor is how the
 * panel ended up with seventeen feature flags that nothing reads.
 */

export type SettingField = {
  key: string;
  label: string;
  help: string;
  type: "string" | "boolean";
  value: string | boolean;
  default: string | boolean;
  is_default: boolean;
};

const BASE = "/admin/platform-settings";

export const platformSettingsService = {
  async site(): Promise<SettingField[]> {
    const { data } = await api.get(`${BASE}/site`);
    return data.data.fields;
  },

  async updateSite(values: Record<string, string | boolean>): Promise<{
    fields: SettingField[];
    changed: string[];
    message: string;
  }> {
    const { data } = await api.put(`${BASE}/site`, values);
    return { fields: data.data.fields, changed: data.data.changed, message: data.message };
  },

  async resetSite(): Promise<SettingField[]> {
    const { data } = await api.post(`${BASE}/site/reset`, {});
    return data.data.fields;
  },

  /**
   * Drops the resolved-settings cache without changing a value.
   *
   * updateSite() already busts it, so this covers what a save cannot see: a
   * value edited straight in the database, or a stale read on the other box.
   */
  async clearSiteCache(): Promise<SettingField[]> {
    const { data } = await api.post(`${BASE}/site/clear-cache`, {});
    return data.data.fields;
  },
};
