import { api } from "./api";
import { REPORT_CONFIG, type ReportEntityType } from "@/lib/report-config";

export interface SubmitReportPayload {
  reason: string;
  details?: string;
  evidence?: File[];
}

/**
 * One submit function for every reportable thing in the app - the
 * endpoint and payload shape are resolved from REPORT_CONFIG, so
 * ReportModal never needs its own per-entity-type branching beyond
 * picking which config to render.
 */
export const reportService = {
  submit: async (
    entityType: ReportEntityType,
    entityId: number | string,
    payload: SubmitReportPayload,
  ): Promise<{ success: boolean; message?: string }> => {
    const url = REPORT_CONFIG[entityType].endpoint(entityId);

    if (payload.evidence?.length) {
      const form = new FormData();
      form.append("reason", payload.reason);
      if (payload.details) form.append("details", payload.details);
      payload.evidence.forEach((file) => form.append("evidence[]", file));
      const { data } = await api.post(url, form);
      return data;
    }

    const { data } = await api.post(url, {
      reason: payload.reason,
      details: payload.details || undefined,
    });
    return data;
  },
};
