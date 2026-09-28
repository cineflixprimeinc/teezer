import { api } from "./client";
import { REPORT_CONFIG, type ReportEntityType } from "@/constants/report-config";

/** A picked evidence photo, ready for multipart upload (RN FormData file shape). */
export interface ReportEvidenceFile {
  uri: string;
  name: string;
  type: string;
}

export interface SubmitReportPayload {
  reason: string;
  details?: string;
  evidence?: ReportEvidenceFile[];
}

/**
 * One submit function for every reportable thing in the app - the
 * endpoint and payload shape are resolved from REPORT_CONFIG, mirroring
 * frontend/src/services/report.service.ts on web.
 */
export const reportApi = {
  submit: (
    entityType: ReportEntityType,
    entityId: number | string,
    payload: SubmitReportPayload,
  ): Promise<{ success: boolean; message?: string }> => {
    const url = REPORT_CONFIG[entityType].endpoint(entityId);

    if (payload.evidence?.length) {
      const fd = new FormData();
      fd.append("reason", payload.reason);
      if (payload.details) fd.append("details", payload.details);
      payload.evidence.forEach((file) =>
        // The RN FormData file shape; the client's request interceptor strips
        // its own Content-Type for FormData so the multipart boundary is set
        // (same convention as story.api.ts's create()).
        fd.append("evidence[]", { uri: file.uri, name: file.name, type: file.type } as unknown as Blob),
      );
      return api.post(url, fd).then((r) => r.data);
    }

    return api.post(url, { reason: payload.reason, details: payload.details }).then((r) => r.data);
  },
};
